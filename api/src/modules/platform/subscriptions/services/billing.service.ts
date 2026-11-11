import type {
  BillingCatalog,
  BillingCustomer,
  BillingInvoicePage,
  SubscriptionPayment,
  SubscriptionPaymentSubmission,
  SubscriptionQuote,
  SubscriptionQuoteRequest,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createBillingRepository, PaymentRow } from '../repositories/billing.repository.js'
import type { InvoiceRecord } from '../repositories/billing-documents.repository.js'
import { createBillingDocumentsRepository } from '../repositories/billing-documents.repository.js'
import { createCatalogRepository } from '../repositories/catalog.repository.js'
import type { CoverageReads } from '../repositories/coverage-lifecycle.repository.js'
import type { createSubscriptionRepository } from '../repositories/subscription.repository.js'
import { addCycle, billingDay, zonedDayStart } from './billing-calendar.service.js'
import { createBillingDocuments, toInvoice } from './billing-documents.service.js'
import { publicCustomer } from './billing-identity.service.js'
import { createCatalogReader, type VersionTerms } from './catalog-values.service.js'
import { type Coverage, GRACE_MS, money, prorate, resolveCoverage } from './coverage.js'
import { resolvePeriods } from './period-resolver.service.js'

const DAY_MS = 86_400_000
const INVOICE_PAGE_SIZE = 20
const suspended = () =>
  new AppError(409, 'SUBSCRIPTION_SUSPENDED', 'This subscription is suspended.')

/** Administrator performing a lifecycle action; the reason becomes the period note. */
export type AdminActor = { adminId: string; email: string; reason: string }

export type AdminGrant = {
  planCode: string
  cycle: 'monthly' | 'annual'
  start: Date
  end: Date
}

/** Trial conversion over explicit calendar days of the billing timezone (endsOn exclusive). */
export type AdminActivation = {
  planCode: string
  cycle: 'monthly' | 'annual'
  startsOn: string
  endsOn: string
  settlement: { kind: 'complimentary' } | { kind: 'payment'; method: string; reference: string }
}

const MAX_ACTIVATION_DAYS = 3 * 366
const paid = (planCode: string) => {
  if (planCode === 'trial') throw new AppError(400, 'INVALID_PLAN', 'Choose a paid plan.')
}
const priceOf = (terms: VersionTerms, cycle: 'monthly' | 'annual') => terms.prices![cycle]

export function toPayment(row: PaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    planCode: row.planCode as SubscriptionPayment['planCode'],
    planVersionNumber: row.planVersionNumber,
    cycle: row.cycle,
    kind: row.kind,
    status: row.status,
    method: row.method,
    reference: row.reference,
    amount: {
      currency: row.currency,
      amountHt: row.amountHt,
      taxRateBasisPoints: row.taxRateBasisPoints,
      taxAmount: row.taxAmount,
      amountTtc: row.amountTtc,
    },
    coverageStart: row.coverageStart?.toISOString() ?? null,
    coverageEnd: row.coverageEnd?.toISOString() ?? null,
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    quoteExpiresAt: row.quoteExpiresAt?.toISOString() ?? null,
    receivedTtc: row.receivedTtc,
    invoiceNumber: row.invoiceNumber,
    customer: row.customer && publicCustomer(row.customer),
  }
}

/**
 * Runs inside the decision transaction only when something was recorded: a state change, or a
 * partial receipt (`receipt` set, status still submitted).
 */
export type DecisionHook = (
  tx: Transaction,
  before: PaymentRow,
  after: PaymentRow,
  receipt?: { amountTtc: number; reference: string; receivedAt: string },
  /** Set when a rejection credited an invoice holding received funds. */
  creditNote?: { number: string; amountTtc: number; refundDueTtc: number },
) => Promise<void>

/** Verified receipt details supplied by the administrator; every field has a default. */
export type ReceivedFunds = { reference?: string; amountTtc?: number; receivedAt?: Date }

export { toInvoice }

export function createBillingService(
  repo: ReturnType<typeof createBillingRepository>,
  subscriptions: ReturnType<typeof createSubscriptionRepository>,
  /**
   * Injected test clock. Production leaves it undefined: writers then read the database transaction
   * clock, the same instant the access resolver uses, so coverage they write is resolved coherently.
   */
  injectedClock?: () => Date,
  /**
   * Throws 503 (TIMEZONE_DATA_MISMATCH/UNCHECKED) when calendar boundaries cannot be computed
   * reliably. Only operations that compute a calendar boundary (addCycle) call it; fixed-duration
   * shifts and extensions do not.
   */
  writable: () => void = () => {},
  /**
   * S5b dual write (SUBSCRIPTION_PERIOD_WRITES). When false only the legacy rows are written, exactly
   * as before S5b; the reconciliation can append the missed periods later.
   */
  periodWrites = true,
  /**
   * S5c read authority (SUBSCRIPTION_COVERAGE_READS). `periods` resolves every decision from
   * subscription_periods (no grace after complimentary coverage) and requires period writes.
   */
  reads: CoverageReads = 'legacy',
  /** Published version terms (pins and the selling pointer); never the plan JSON or price columns. */
  catalog = createCatalogReader(createCatalogRepository()),
  /** S6 quotes, receipts, invoices, allocations and credit notes. */
  documents = createBillingDocuments(createBillingDocumentsRepository()),
) {
  /** One authoritative instant per transaction, shared with the access resolver. */
  const clock = (tx: Transaction) =>
    injectedClock ? Promise.resolve(injectedClock()) : subscriptions.now(tx)
  if (reads === 'periods' && !periodWrites)
    throw new Error('Period coverage reads require SUBSCRIPTION_PERIOD_WRITES=on')
  // Administration supplies its step-up transaction; operator callers retain the standalone path.
  const inAdminTransaction = <T>(
    tx: Transaction | undefined,
    work: (tx: Transaction) => Promise<T>,
  ) => (tx ? work(tx) : repo.admin(work))

  /**
   * Coverage state from the selected authority. `graceless` says whether a lapse ends access at the
   * paid-through instant (cancellation; with period reads also complimentary coverage).
   */
  async function state(
    ownerId: string,
    tx: Transaction,
    at?: Date,
    from = reads,
    /** Snapshot already read by the access resolver. Every input comes from this one statement. */
    snapshot?: Awaited<ReturnType<typeof subscriptions.periodState>>,
  ) {
    const now = at ?? (await clock(tx))
    const periods = snapshot ?? (await subscriptions.periodState(ownerId, tx))
    const row = periods.subscription
    if (from === 'periods') {
      // Fail closed: a started subscription needs its trial period, and periods need a subscription.
      // Never fall back to the legacy resolver (and its complimentary grace) for one owner.
      if (row ? !periods.periods.some((p) => p.kind === 'trial') : periods.periods.length)
        throw new AppError(
          503,
          'SUBSCRIPTION_PERIODS_INCONSISTENT',
          'Subscription coverage is temporarily unavailable. Please try again later.',
        )
      const coverage: Coverage[] = periods.periods
        .filter((p) => p.kind !== 'trial')
        .map((p) => ({
          planCode: p.planCode,
          planVersionId: p.planVersionId,
          cycle: p.cycle,
          start: p.startsAt,
          end: p.supersededAt ?? p.endsAt,
        }))
        .filter((c) => c.end.getTime() > c.start.getTime())
      const last = periods.periods
        .filter((p) => p.kind !== 'trial')
        .reduce<(typeof periods.periods)[number] | null>((a, b) => {
          const end = (p: typeof b) => (p.supersededAt ?? p.endsAt).getTime()
          return !a || end(b) > end(a) || (end(b) === end(a) && b.startsAt >= a.startsAt) ? b : a
        }, null)
      const cancelAtPeriodEnd = periods.scheduled.some(
        (c) => c.kind === 'cancel' && c.status === 'scheduled',
      )
      return {
        row,
        coverage,
        cancelAtPeriodEnd,
        graceless: cancelAtPeriodEnd || last?.kind === 'complimentary',
        lastKind: last?.kind ?? null,
        ...resolvePeriods(periods, now),
      }
    }
    const coverage: Coverage[] = periods.legacyCoverage
      .map((p) => ({
        planCode: p.planCode,
        planVersionId: p.planVersionId,
        cycle: p.cycle,
        start: p.coverageStart!,
        end: p.coverageEnd!,
        graceless: p.graceless,
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
    if (!coverage.length && row && row.planCode !== 'trial' && row.paidThroughAt)
      // Legacy paid-through marker: no pin, so any version-dependent decision fails closed.
      coverage.push({
        planCode: row.planCode,
        planVersionId: null,
        cycle: null,
        start: row.trialStartedAt,
        end: row.paidThroughAt,
      })
    const cancelAtPeriodEnd = row?.cancelAtPeriodEnd ?? false
    const last = coverage.reduce<Coverage | null>(
      (a, b) => (!a || b.end.getTime() >= a.end.getTime() ? b : a),
      null,
    )
    return {
      row,
      coverage,
      cancelAtPeriodEnd,
      graceless: cancelAtPeriodEnd || Boolean(last?.graceless),
      lastKind: null,
      ...resolveCoverage(row, coverage, now),
    }
  }

  /** Pin of a coverage period; the legacy paid-through marker has none and is never inferred. */
  const pinOf = (c: { planVersionId?: string | null }, tx: Transaction) => {
    if (!c.planVersionId)
      throw new AppError(
        503,
        'SUBSCRIPTION_PERIODS_INCONSISTENT',
        'Subscription coverage is temporarily unavailable. Please try again later.',
      )
    return catalog.pinned(c.planVersionId, tx)
  }
  /**
   * Notified version transition that applies to a same-plan renewal starting at `start`: scheduled,
   * same plan, start at or after its effective instant and at least 30 days after the notice.
   */
  async function eligibleTransition(
    ownerId: string,
    planCode: string,
    start: Date,
    tx: Transaction,
  ) {
    const t = await repo.versionTransition(ownerId, tx)
    return t &&
      t.targetPlanCode === planCode &&
      t.targetPlanVersionId &&
      t.noticeSentAt &&
      start.getTime() >= t.effectiveAt.getTime() &&
      start.getTime() >= t.noticeSentAt.getTime() + 30 * DAY_MS
      ? t
      : null
  }

  async function quote(
    ownerId: string,
    input: SubscriptionQuoteRequest,
    tx: Transaction,
    at?: Date,
  ): Promise<SubscriptionQuote & { planVersionId: string }> {
    paid(input.planCode)
    const now = at ?? (await clock(tx))
    const [settings, s] = await Promise.all([repo.settings(tx), state(ownerId, tx, now)])
    if (!s.row) throw new AppError(409, 'SUBSCRIPTION_NOT_STARTED', 'Create an organization first.')
    if (s.status === 'suspended') throw suspended()
    const amount = (ht: number) => money(ht, settings.taxRateBasisPoints, settings.currency)
    const current = s.current
    if (current) {
      // Another plan: ranks compare the running pin with the selling target (withdrawn is 409).
      // The same plan never needs the selling pointer, so withdrawal leaves its renewal open.
      const target =
        current.planCode === input.planCode ? null : await catalog.selling(input.planCode, tx)
      const active = target && (await pinOf(current, tx))
      if (target && active && target.rank > active.rank && current.cycle === input.cycle) {
        // Unused share of the running period at its pinned price, against the selling price.
        const old = priceOf(active, input.cycle)
        return {
          ...input,
          planVersionId: target.versionId,
          planVersionNumber: target.versionNumber,
          kind: 'upgrade',
          amount: amount(prorate(priceOf(target, input.cycle) - old, current, now)),
          coverageStart: now.toISOString(),
          coverageEnd: current.end.toISOString(),
        }
      }
      if (s.coverage.some((c) => c.start.getTime() > now.getTime()))
        throw new AppError(409, 'RENEWAL_EXISTS', 'The next period is already paid.')
    }
    // Paying during grace continues coverage without a gap; otherwise coverage starts now.
    const continues =
      s.paidThroughAt && (s.status === 'active' || s.status === 'past_due') ? s.paidThroughAt : null
    const start = continues ?? now
    // A same-plan renewal (either cycle) keeps the latest coverage's pin unless an eligible notified
    // transition moves it; any other plan, and every activation, takes the selling version.
    const last = s.coverage.reduce<(typeof s.coverage)[number] | null>(
      (a, b) => (!a || b.end.getTime() >= a.end.getTime() ? b : a),
      null,
    )
    let terms: VersionTerms
    if (continues && last?.planCode === input.planCode) {
      const transition = await eligibleTransition(ownerId, input.planCode, start, tx)
      terms = transition
        ? await catalog.pinned(transition.targetPlanVersionId!, tx)
        : await pinOf(last, tx)
    } else terms = await catalog.selling(input.planCode, tx)
    return {
      ...input,
      planVersionId: terms.versionId,
      planVersionNumber: terms.versionNumber,
      kind: continues ? 'renewal' : 'activation',
      amount: amount(priceOf(terms, input.cycle)),
      coverageStart: start.toISOString(),
      coverageEnd: addCycle(start, input.cycle).toISOString(),
    }
  }

  /**
   * Administrator lifecycle operations. They run inside the caller's platform_admin transaction so
   * the change, the 2FA step and the audit row commit together.
   */
  /** Keeps a scheduled cancellation on the current paid-through after coverage changes. */
  async function realignCancel(ownerId: string, tx: Transaction) {
    const cancel = await repo.scheduledCancel(ownerId, tx)
    const end = await repo.periodsEnd(ownerId, tx)
    if (!cancel || !end || cancel.effectiveAt.getTime() === end.getTime()) return
    await repo.endScheduledChange(cancel.id, 'superseded', tx)
    await repo.scheduleCancel(
      ownerId,
      end,
      cancel.createdBy === 'admin'
        ? { type: 'admin', adminId: cancel.actorAdminId! }
        : { type: 'owner', ownerId: cancel.actorOwnerId ?? ownerId },
      tx,
    )
  }
  /**
   * Administrator coverage: the legacy zero-value adjustment payment (unchanged) and, with period
   * writes on, its complimentary period linked by payment_id (the shape the reconciliation expects),
   * replacing the rest of the period running at its start, with the administrator's note.
   */
  async function complimentary(
    ownerId: string,
    values: {
      planCode: string
      planVersionId: string
      cycle: 'monthly' | 'annual'
      kind: 'activation' | 'renewal' | 'upgrade'
      start: Date
      end: Date
      graceless?: boolean
    },
    actor: AdminActor,
    now: Date,
    tx: Transaction,
  ) {
    const settings = await repo.settings(tx)
    const payment = await repo.adjustment(
      { ownerId, ...values, decidedBy: actor.email, currency: settings.currency, now },
      tx,
    )
    if (!periodWrites) return
    const id = await repo.insertPeriod(
      {
        ownerId,
        kind: 'complimentary',
        planCode: values.planCode,
        planVersionId: values.planVersionId,
        cycle: values.cycle,
        start: values.start,
        end: values.end,
        paymentId: payment.id,
        note: { reason: actor.reason, adminId: actor.adminId },
      },
      tx,
    )
    await repo.supersedeAt(ownerId, values.start, id!, tx)
    await realignCancel(ownerId, tx)
  }

  const administration = {
    state,
    async suspend(ownerId: string, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const s = await state(ownerId, tx)
      if (!s.row) throw new AppError(409, 'SUBSCRIPTION_NOT_STARTED', 'The trial has not started.')
      if (s.status === 'suspended') throw suspended()
      const at = await clock(tx)
      await repo.setSuspended(ownerId, at, tx)
      if (periodWrites) await repo.openSuspension(ownerId, at, tx)
    },
    async resume(ownerId: string, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const s = await state(ownerId, tx)
      const since = s.row?.suspendedAt
      if (!since)
        throw new AppError(409, 'SUBSCRIPTION_NOT_SUSPENDED', 'This subscription is not suspended.')
      const now = await clock(tx)
      const shift = Math.max(0, now.getTime() - since.getTime())
      // Legacy rows still shift (the legacy resolver reads payment coverage until S5c); periods,
      // scheduled changes and the suspension row move through the controlled DB function.
      await repo.shiftCoverage(ownerId, since, shift, tx)
      if (periodWrites) await repo.shiftPeriods(ownerId, since, shift, tx)
      await repo.setSuspended(ownerId, null, tx)
    },
    async changePlan(ownerId: string, planCode: string, actor: AdminActor, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const now = await clock(tx)
      paid(planCode)
      const s = await state(ownerId, tx, now)
      if (s.status === 'suspended') throw suspended()
      if (!s.current)
        throw new AppError(409, 'NO_PAID_PERIOD', 'There is no current paid period to change.')
      if (s.current.planCode === planCode)
        throw new AppError(409, 'SAME_PLAN', 'The subscription already uses this plan.')
      const plan = await catalog.selling(planCode, tx)
      const active = await pinOf(s.current, tx)
      await complimentary(
        ownerId,
        {
          planCode: plan.planCode,
          planVersionId: plan.versionId,
          cycle: s.current.cycle ?? 'monthly',
          kind: plan.rank > active.rank ? 'upgrade' : 'activation',
          start: now,
          end: s.current.end,
        },
        actor,
        now,
        tx,
      )
      await repo.extendPaidThrough(ownerId, s.current.end, plan.planCode, tx)
    },
    async extend(ownerId: string, days: number, actor: AdminActor, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const now = await clock(tx)
      const s = await state(ownerId, tx, now)
      if (!s.row) throw new AppError(409, 'SUBSCRIPTION_NOT_STARTED', 'The trial has not started.')
      if (s.status === 'suspended') throw suspended()
      const add = days * DAY_MS
      if (!s.paidThroughAt) {
        const from = Math.max(s.row.trialEndsAt.getTime(), now.getTime())
        await repo.setTrialEnd(ownerId, new Date(from + add), tx)
        return
      }
      const last = s.coverage.reduce((a, b) => (b.end.getTime() >= a.end.getTime() ? b : a))
      const start = s.status === 'active' || s.status === 'past_due' ? s.paidThroughAt : now
      const end = new Date(start.getTime() + add)
      await complimentary(
        ownerId,
        {
          planCode: last.planCode,
          // Continues the latest period on its own pin (never the selling version).
          planVersionId: (await pinOf(last, tx)).versionId,
          cycle: last.cycle ?? 'monthly',
          kind: 'renewal',
          start,
          end,
        },
        actor,
        now,
        tx,
      )
      await repo.extendPaidThrough(ownerId, end, start <= now ? last.planCode : null, tx)
    },
    /**
     * Converts a trial (running, or ended without any coverage) into a paid plan. A confirmed payment
     * snapshots the plan/cycle price and current tax and creates a paid period; complimentary access
     * reuses the administrator adjustment (no grace after it). The trial end is never moved, so a
     * start after the trial leaves the gap without access.
     */
    async activate(ownerId: string, input: AdminActivation, actor: AdminActor, tx: Transaction) {
      writable()
      await subscriptions.lock(ownerId, tx)
      const now = await clock(tx)
      paid(input.planCode)
      const [s, settings] = await Promise.all([state(ownerId, tx, now), repo.settings(tx)])
      if (!s.row) throw new AppError(409, 'SUBSCRIPTION_NOT_STARTED', 'The trial has not started.')
      if (s.status === 'suspended') throw suspended()
      if (s.coverage.length || (s.status !== 'trial' && s.status !== 'expired'))
        throw new AppError(
          409,
          'SUBSCRIPTION_NOT_TRIAL',
          'Only a trial subscription can be activated; use Change plan for paid subscriptions.',
        )
      const today = billingDay(now)
      const invalid = () =>
        new AppError(
          400,
          'COVERAGE_INVALID',
          'Coverage must start today or later and end after its start, within three years.',
        )
      if (input.startsOn < today || input.endsOn <= input.startsOn) throw invalid()
      const start = input.startsOn === today ? now : zonedDayStart(input.startsOn)
      const end = zonedDayStart(input.endsOn)
      if (
        end.getTime() <= start.getTime() ||
        end.getTime() - start.getTime() > MAX_ACTIVATION_DAYS * DAY_MS
      )
        throw invalid()
      const plan = await catalog.selling(input.planCode, tx)
      const settlement = input.settlement
      if (settlement.kind === 'complimentary') {
        await complimentary(
          ownerId,
          {
            planCode: plan.planCode,
            planVersionId: plan.versionId,
            cycle: input.cycle,
            kind: 'activation',
            start,
            end,
            graceless: true,
          },
          actor,
          now,
          tx,
        )
        await repo.extendPaidThrough(ownerId, end, start <= now ? plan.planCode : null, tx)
        return
      }
      if (!settings.paymentMethods.includes(settlement.method))
        throw new AppError(400, 'INVALID_PAYMENT_METHOD', 'This payment method is not accepted.')
      const amount = money(
        priceOf(plan, input.cycle),
        settings.taxRateBasisPoints,
        settings.currency,
      )
      // Same document chain as an owner payment: quote, confirmed submission, receipt and invoice.
      const quote = await documents.quote(
        {
          ownerId,
          planCode: plan.planCode,
          planVersionId: plan.versionId,
          cycle: input.cycle,
          kind: 'activation',
          amount,
          customer: await documents.customer(ownerId, tx),
        },
        now,
        tx,
      )
      const payment = await repo.submit(
        {
          ownerId,
          planCode: plan.planCode,
          planVersionId: plan.versionId,
          quoteId: quote.id,
          cycle: input.cycle,
          kind: 'activation',
          status: 'confirmed',
          method: settlement.method,
          reference: settlement.reference,
          receivedReference: settlement.reference,
          ...amount,
          coverageStart: start,
          coverageEnd: end,
          submittedAt: now,
          decidedAt: now,
          decidedBy: actor.email,
        },
        tx,
      )
      if (amount.amountTtc > 0)
        await documents.receive(
          payment,
          { reference: settlement.reference, referenceGiven: true, recordedBy: actor.email },
          now,
          tx,
        )
      await repo.applyCoverage(
        ownerId,
        { paidThroughAt: end, ...(start <= now ? { planCode: plan.planCode } : {}) },
        tx,
      )
      if (!periodWrites) return
      const period = await repo.insertPeriod(
        {
          ownerId,
          kind: 'paid',
          planCode: plan.planCode,
          planVersionId: plan.versionId,
          cycle: input.cycle,
          start,
          end,
          paymentId: payment.id,
        },
        tx,
      )
      if (period) await repo.supersedeAt(ownerId, start, period, tx)
    },
    /** Paid subscription granted when an administrator creates the account. */
    async grant(ownerId: string, grant: AdminGrant, actor: AdminActor, tx: Transaction) {
      writable()
      const now = await clock(tx)
      paid(grant.planCode)
      const plan = await catalog.selling(grant.planCode, tx)
      if (grant.start.getTime() > now.getTime() || grant.end.getTime() <= now.getTime())
        throw new AppError(
          400,
          'INVALID_COVERAGE',
          'Coverage must have started and must end in the future.',
        )
      await repo.createPaid(ownerId, plan.planCode, grant.end, now, tx)
      await complimentary(
        ownerId,
        {
          planCode: plan.planCode,
          planVersionId: plan.versionId,
          cycle: grant.cycle,
          kind: 'activation',
          start: grant.start,
          end: grant.end,
        },
        actor,
        now,
        tx,
      )
    },
  }

  async function billingCatalog(ownerId: string, tx: Transaction): Promise<BillingCatalog> {
    const [settings, plans, customer] = await Promise.all([
      repo.settings(tx),
      catalog.sellingPaid(tx),
      documents.customer(ownerId, tx),
    ])
    return {
      customer,
      currency: settings.currency,
      taxRateBasisPoints: settings.taxRateBasisPoints,
      paymentMethods: settings.paymentMethods,
      paymentInstructions: settings.paymentInstructions,
      plans: plans.map((p) => ({
        code: p.planCode as BillingCatalog['plans'][number]['code'],
        versionNumber: p.versionNumber,
        name: p.name,
        monthlyHt: p.prices!.monthly,
        annualHt: p.prices!.annual,
        entitlements: p.entitlements,
      })),
    }
  }

  return {
    administration,
    catalog: (ownerId: string) => subscriptions.owner(ownerId, (tx) => billingCatalog(ownerId, tx)),
    /** Saves the identity prefilled at checkout; quotes and issued invoices keep their snapshot. */
    saveCustomer: (ownerId: string, input: BillingCustomer) =>
      subscriptions.owner(ownerId, async (tx) => {
        await documents.saveCustomer(ownerId, input, tx)
        return billingCatalog(ownerId, tx)
      }),
    state,
    quote: (ownerId: string, input: SubscriptionQuoteRequest) =>
      subscriptions.owner(ownerId, async (tx): Promise<SubscriptionQuote> => {
        const { planVersionId: _, ...q } = await quote(ownerId, input, tx)
        return q
      }),
    payments: (ownerId: string) =>
      subscriptions.owner(ownerId, async (tx) => ({
        data: (await repo.payments(ownerId, tx)).map(toPayment),
      })),
    submit: (ownerId: string, input: SubscriptionPaymentSubmission) =>
      subscriptions.owner(ownerId, async (tx) => {
        writable()
        await subscriptions.lock(ownerId, tx)
        const settings = await repo.settings(tx)
        if (!settings.paymentMethods.includes(input.method))
          throw new AppError(400, 'INVALID_PAYMENT_METHOD', 'This payment method is not accepted.')
        if ((await repo.payments(ownerId, tx)).some((p) => p.status === 'submitted'))
          throw new AppError(409, 'PAYMENT_PENDING', 'A payment is already awaiting verification.')
        const now = await clock(tx)
        const q = await quote(ownerId, input, tx, now)
        // The identity given at checkout becomes the saved profile; the quote snapshots it.
        const customer = input.customer
          ? await documents.saveCustomer(ownerId, input.customer, tx)
          : await documents.customer(ownerId, tx)
        // The immutable offer this declaration accepts (S6); the payment repeats its snapshot.
        const offer = await documents.quote(
          {
            ownerId,
            planCode: q.planCode,
            planVersionId: q.planVersionId,
            cycle: q.cycle,
            kind: q.kind,
            amount: q.amount,
            customer,
          },
          now,
          tx,
        )
        return toPayment(
          await repo.submit(
            {
              ownerId,
              planCode: q.planCode,
              // The quoted version; confirmation keeps it even if the selling version moves meanwhile.
              planVersionId: q.planVersionId,
              quoteId: offer.id,
              submittedAt: now,
              cycle: q.cycle,
              kind: q.kind,
              method: input.method,
              reference: input.reference.trim(),
              ...q.amount,
            },
            tx,
          ),
        )
      }),
    setCancellation: (ownerId: string, cancel: boolean) =>
      subscriptions.owner(ownerId, async (tx) => {
        await subscriptions.lock(ownerId, tx)
        const s = await state(ownerId, tx)
        if (cancel && s.status !== 'active')
          throw new AppError(
            409,
            'NOT_CANCELLABLE',
            'Only an active paid subscription can be cancelled.',
          )
        await repo.setCancellation(ownerId, cancel, tx)
        // Typed owner actor; the legacy flag above stays in sync until S5c.
        if (!periodWrites) return
        const scheduled = await repo.scheduledCancel(ownerId, tx)
        if (cancel && !scheduled && s.paidThroughAt)
          await repo.scheduleCancel(ownerId, s.paidThroughAt, { type: 'owner', ownerId }, tx)
        if (!cancel && scheduled) await repo.endScheduledChange(scheduled.id, 'cancelled', tx)
      }),
    /**
     * Administrator verification of actual receipt (S6). Records one receipt and allocates it to the
     * payment's invoice (issued at the first receipt); coverage is granted, once, when the
     * allocations reach the amount due. Funds received after the quote expired are refused.
     * Idempotent: a confirmed payment or an already-recorded receipt reference returns unchanged.
     * Coverage dates are fixed at full settlement, not at submission.
     */
    confirm: (
      id: string,
      decidedBy: string,
      received?: ReceivedFunds,
      onDecided?: DecisionHook,
      transaction?: Transaction,
    ) =>
      inAdminTransaction(transaction, async (tx) => {
        writable()
        const found = await repo.payment(id, tx)
        if (!found) throw new AppError(404, 'NOT_FOUND', 'Payment not found.')
        await subscriptions.lock(found.ownerId, tx)
        const payment = (await repo.payment(id, tx))!
        if (payment.status === 'confirmed') return toPayment(payment)
        if (payment.status === 'rejected')
          throw new AppError(409, 'PAYMENT_REJECTED', 'This payment was rejected.')
        const now = await clock(tx)
        // Lifecycle preconditions come before any receipt, so no instalment is recorded for a
        // payment that could no longer be settled.
        const s = await state(payment.ownerId, tx, now)
        if (payment.kind === 'upgrade' && !s.current)
          throw new AppError(409, 'UPGRADE_STALE', 'The upgraded period is no longer active.')
        // A zero amount (fully prorated upgrade) has nothing to receive or invoice.
        if (payment.amountTtc > 0) {
          const reference = received?.reference ?? payment.reference
          const receivedAt = received?.receivedAt ?? now
          const outcome = await documents.receive(
            payment,
            {
              reference,
              referenceGiven: received?.reference !== undefined,
              amountTtc: received?.amountTtc,
              receivedAt,
              recordedBy: decidedBy,
            },
            now,
            tx,
          )
          if (outcome === 'duplicate') return toPayment(payment)
          if (outcome === 'partial') {
            const after = (await repo.payment(id, tx))!
            await onDecided?.(tx, payment, after, {
              amountTtc: after.receivedTtc - payment.receivedTtc,
              reference,
              receivedAt: receivedAt.toISOString(),
            })
            return toPayment(after)
          }
        }
        let start = now,
          end: Date
        if (payment.kind === 'upgrade') {
          end = s.current!.end
        } else {
          // Continuation within the paid grace only; none after a cancellation or (period reads)
          // complimentary coverage, so a lapsed free grant never backdates a payment.
          const continues =
            s.paidThroughAt &&
            now.getTime() < s.paidThroughAt.getTime() + (s.graceless ? 0 : GRACE_MS)
          if (continues) start = s.paidThroughAt!
          end = addCycle(start, payment.cycle)
        }
        const confirmed = await repo.decide(
          id,
          {
            status: 'confirmed',
            coverageStart: start,
            coverageEnd: end,
            decidedAt: now,
            decidedBy,
            receivedReference: received?.reference ?? null,
          },
          tx,
        )
        await repo.applyCoverage(
          payment.ownerId,
          { paidThroughAt: end, ...(start <= now ? { planCode: payment.planCode } : {}) },
          tx,
        )
        // Paid period in the same transaction, idempotent on the payment. An upgrade replaces the
        // rest of the running period; a renewal is adjacent. Confirmation clears a cancellation.
        if (periodWrites) {
          const period = await repo.insertPeriod(
            {
              ownerId: payment.ownerId,
              kind: 'paid',
              planCode: payment.planCode,
              planVersionId: payment.planVersionId,
              cycle: payment.cycle,
              start,
              end,
              paymentId: payment.id,
            },
            tx,
          )
          if (period) await repo.supersedeAt(payment.ownerId, start, period, tx)
          const cancel = await repo.scheduledCancel(payment.ownerId, tx)
          if (cancel) await repo.endScheduledChange(cancel.id, 'cancelled', tx)
        }
        // The renewal that carries a notified transition's target applies it, atomically.
        const transition =
          payment.kind === 'renewal'
            ? await eligibleTransition(payment.ownerId, payment.planCode, start, tx)
            : null
        if (transition && transition.targetPlanVersionId === payment.planVersionId)
          await repo.applyScheduledChange(transition.id, tx)
        await onDecided?.(tx, payment, confirmed!)
        return toPayment(confirmed!)
      }),
    /** Idempotent; the reason is stored and shown to the owner. */
    reject: (
      id: string,
      decidedBy: string,
      reason: string,
      onDecided?: DecisionHook,
      transaction?: Transaction,
    ) =>
      inAdminTransaction(transaction, async (tx) => {
        const rejectionReason = reason.trim()
        if (!rejectionReason)
          throw new AppError(400, 'REJECTION_REASON_REQUIRED', 'Give a reason for the rejection.')
        const found = await repo.payment(id, tx)
        if (!found) throw new AppError(404, 'NOT_FOUND', 'Payment not found.')
        await subscriptions.lock(found.ownerId, tx)
        const payment = (await repo.payment(id, tx))!
        if (payment.status === 'rejected') return toPayment(payment)
        const now = await clock(tx)
        const row = await repo.decide(
          id,
          { status: 'rejected', decidedAt: now, decidedBy, rejectionReason },
          tx,
        )
        if (!row)
          throw new AppError(409, 'PAYMENT_CONFIRMED', 'A confirmed payment cannot be rejected.')
        // Funds already received (partial instalments): the invoice is fully credited in the same
        // transaction, so it ends refund_due by exactly the received amount. Coverage is unchanged
        // and the owner can submit again.
        let credit: { number: string; amountTtc: number; refundDueTtc: number } | undefined
        if (payment.receivedTtc > 0) {
          const note = await documents.creditRemainder(
            payment.id,
            rejectionReason,
            decidedBy,
            now,
            tx,
          )
          credit = {
            number: note.number,
            amountTtc: note.amountTtc,
            refundDueTtc: payment.receivedTtc,
          }
        }
        await onDecided?.(tx, payment, row, undefined, credit)
        return toPayment(row)
      }),
    /** Owner's issued invoices and credit notes, newest first. */
    invoices: (ownerId: string, page: number) =>
      subscriptions.owner(ownerId, async (tx): Promise<BillingInvoicePage> => {
        const { rows, total } = await documents.invoices(
          { ownerId, page, pageSize: INVOICE_PAGE_SIZE },
          tx,
        )
        return { items: rows.map(toInvoice), page, pageSize: INVOICE_PAGE_SIZE, total }
      }),
    /** One of the owner's documents (RLS limits the read to the owner), for its PDF. */
    ownerInvoice: (ownerId: string, invoiceId: string) =>
      subscriptions.owner(ownerId, async (tx) => {
        const invoice = await documents.invoice(invoiceId, tx)
        if (!invoice || invoice.ownerId !== ownerId)
          throw new AppError(404, 'NOT_FOUND', 'Invoice not found.')
        return invoice
      }),
    adminInvoice: (invoiceId: string, transaction?: Transaction) =>
      inAdminTransaction(transaction, async (tx) => {
        const invoice = await documents.invoice(invoiceId, tx)
        if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found.')
        return invoice
      }),
    /** Administrator listing (optionally one owner), newest first. */
    adminInvoices: (
      filter: { ownerId?: string; page: number; pageSize: number },
      transaction?: Transaction,
    ) => inAdminTransaction(transaction, (tx) => documents.invoices(filter, tx)),
    /**
     * Explicit correction (S6): a credit note linked to an invoice whose payment is decided. Never
     * changes coverage. Serialized with confirmations by the owner lock.
     */
    creditNote: (
      invoiceId: string,
      input: { amountHt: number; reason: string },
      issuedBy: string,
      onIssued?: (tx: Transaction, note: InvoiceRecord) => Promise<void>,
      transaction?: Transaction,
    ) =>
      inAdminTransaction(transaction, async (tx) => {
        const invoice = await documents.invoice(invoiceId, tx)
        if (!invoice || invoice.kind !== 'invoice')
          throw new AppError(404, 'NOT_FOUND', 'Invoice not found.')
        await subscriptions.lock(invoice.ownerId, tx)
        const payment = (await repo.payment(invoice.paymentId!, tx))!
        if (payment.status === 'submitted')
          throw new AppError(
            409,
            'PAYMENT_PENDING',
            'Confirm or reject the payment before correcting its invoice.',
          )
        const note = await documents.creditNote(
          invoiceId,
          { ...input, by: issuedBy },
          await clock(tx),
          tx,
        )
        const record = (await documents.invoice(note.id, tx))!
        await onIssued?.(tx, record)
        return record
      }),
  }
}
