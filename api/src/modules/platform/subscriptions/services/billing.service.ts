import type {
  BillingCatalog,
  SubscriptionPayment,
  SubscriptionPaymentSubmission,
  SubscriptionQuote,
  SubscriptionQuoteRequest,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createBillingRepository, PaymentRow } from '../repositories/billing.repository.js'
import type { CoverageReads } from '../repositories/coverage-lifecycle.repository.js'
import type { createSubscriptionRepository } from '../repositories/subscription.repository.js'
import { addCycle, billingDay, zonedDayStart } from './billing-calendar.service.js'
import { type Coverage, GRACE_MS, money, prorate, resolveCoverage } from './coverage.js'
import { resolvePeriods } from './period-resolver.service.js'

const DAY_MS = 86_400_000
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

export function toPayment(row: PaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    planCode: row.planCode as SubscriptionPayment['planCode'],
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
  }
}

/** Runs inside the decision transaction only when the payment actually changed state. */
export type DecisionHook = (tx: Transaction, before: PaymentRow, after: PaymentRow) => Promise<void>

export function createBillingService(
  repo: ReturnType<typeof createBillingRepository>,
  subscriptions: ReturnType<typeof createSubscriptionRepository>,
  clock = () => new Date(),
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
) {
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
  async function state(ownerId: string, tx: Transaction, now = clock(), from = reads) {
    const row = (await subscriptions.subscription(ownerId, tx))?.owner_subscriptions ?? null
    if (from === 'periods') {
      const periods = await subscriptions.periodState(ownerId, tx)
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
    const coverage: Coverage[] = [...(await repo.coverage(ownerId, tx))]
      .map((p) => ({
        planCode: p.planCode,
        cycle: p.cycle,
        start: p.coverageStart!,
        end: p.coverageEnd!,
        graceless: p.graceless,
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
    if (!coverage.length && row && row.planCode !== 'trial' && row.paidThroughAt)
      coverage.push({
        planCode: row.planCode,
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

  async function quote(
    ownerId: string,
    input: SubscriptionQuoteRequest,
    tx: Transaction,
    now = clock(),
  ): Promise<SubscriptionQuote> {
    const [settings, plan, s] = await Promise.all([
      repo.settings(tx),
      repo.plan(input.planCode, tx),
      state(ownerId, tx, now),
    ])
    if (!plan || plan.code === 'trial')
      throw new AppError(400, 'INVALID_PLAN', 'Choose a paid plan.')
    if (!s.row) throw new AppError(409, 'SUBSCRIPTION_NOT_STARTED', 'Create an organization first.')
    if (s.status === 'suspended') throw suspended()
    const price = input.cycle === 'annual' ? plan.annualHt : plan.monthlyHt
    const amount = (ht: number) => money(ht, settings.taxRateBasisPoints, settings.currency)
    const current = s.current
    if (current) {
      const active = await repo.plan(current.planCode, tx)
      if (active && plan.rank > active.rank && current.cycle === input.cycle) {
        const old = input.cycle === 'annual' ? active.annualHt : active.monthlyHt
        return {
          ...input,
          kind: 'upgrade',
          amount: amount(prorate(price - old, current, now)),
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
    return {
      ...input,
      kind: continues ? 'renewal' : 'activation',
      amount: amount(price),
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
      const at = clock()
      await repo.setSuspended(ownerId, at, tx)
      if (periodWrites) await repo.openSuspension(ownerId, at, tx)
    },
    async resume(ownerId: string, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const s = await state(ownerId, tx)
      const since = s.row?.suspendedAt
      if (!since)
        throw new AppError(409, 'SUBSCRIPTION_NOT_SUSPENDED', 'This subscription is not suspended.')
      const now = clock()
      const shift = Math.max(0, now.getTime() - since.getTime())
      // Legacy rows still shift (the legacy resolver reads payment coverage until S5c); periods,
      // scheduled changes and the suspension row move through the controlled DB function.
      await repo.shiftCoverage(ownerId, since, shift, tx)
      if (periodWrites) await repo.shiftPeriods(ownerId, since, shift, tx)
      await repo.setSuspended(ownerId, null, tx)
    },
    async changePlan(ownerId: string, planCode: string, actor: AdminActor, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const now = clock()
      const [s, plan] = await Promise.all([state(ownerId, tx, now), repo.plan(planCode, tx)])
      if (!plan || plan.code === 'trial')
        throw new AppError(400, 'INVALID_PLAN', 'Choose a paid plan.')
      if (s.status === 'suspended') throw suspended()
      if (!s.current)
        throw new AppError(409, 'NO_PAID_PERIOD', 'There is no current paid period to change.')
      if (s.current.planCode === plan.code)
        throw new AppError(409, 'SAME_PLAN', 'The subscription already uses this plan.')
      const active = await repo.plan(s.current.planCode, tx)
      await complimentary(
        ownerId,
        {
          planCode: plan.code,
          cycle: s.current.cycle ?? 'monthly',
          kind: active && plan.rank > active.rank ? 'upgrade' : 'activation',
          start: now,
          end: s.current.end,
        },
        actor,
        now,
        tx,
      )
      await repo.extendPaidThrough(ownerId, s.current.end, plan.code, tx)
    },
    async extend(ownerId: string, days: number, actor: AdminActor, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const now = clock()
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
        { planCode: last.planCode, cycle: last.cycle ?? 'monthly', kind: 'renewal', start, end },
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
      const now = clock()
      const [s, plan, settings] = await Promise.all([
        state(ownerId, tx, now),
        repo.plan(input.planCode, tx),
        repo.settings(tx),
      ])
      if (!plan || plan.code === 'trial')
        throw new AppError(400, 'INVALID_PLAN', 'Choose a paid plan.')
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
      const settlement = input.settlement
      if (settlement.kind === 'complimentary') {
        await complimentary(
          ownerId,
          {
            planCode: plan.code,
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
        await repo.extendPaidThrough(ownerId, end, start <= now ? plan.code : null, tx)
        return
      }
      if (!settings.paymentMethods.includes(settlement.method))
        throw new AppError(400, 'INVALID_PAYMENT_METHOD', 'This payment method is not accepted.')
      const price = input.cycle === 'annual' ? plan.annualHt : plan.monthlyHt
      const payment = await repo.submit(
        {
          ownerId,
          planCode: plan.code,
          cycle: input.cycle,
          kind: 'activation',
          status: 'confirmed',
          method: settlement.method,
          reference: settlement.reference,
          receivedReference: settlement.reference,
          ...money(price, settings.taxRateBasisPoints, settings.currency),
          coverageStart: start,
          coverageEnd: end,
          submittedAt: now,
          decidedAt: now,
          decidedBy: actor.email,
        },
        tx,
      )
      await repo.applyCoverage(
        ownerId,
        { paidThroughAt: end, ...(start <= now ? { planCode: plan.code } : {}) },
        tx,
      )
      if (!periodWrites) return
      const period = await repo.insertPeriod(
        {
          ownerId,
          kind: 'paid',
          planCode: plan.code,
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
      const now = clock()
      const plan = await repo.plan(grant.planCode, tx)
      if (!plan || plan.code === 'trial')
        throw new AppError(400, 'INVALID_PLAN', 'Choose a paid plan.')
      if (grant.start.getTime() > now.getTime() || grant.end.getTime() <= now.getTime())
        throw new AppError(
          400,
          'INVALID_COVERAGE',
          'Coverage must have started and must end in the future.',
        )
      await repo.createPaid(ownerId, plan.code, grant.end, now, tx)
      await complimentary(
        ownerId,
        {
          planCode: plan.code,
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

  return {
    administration,
    async catalog(ownerId: string): Promise<BillingCatalog> {
      return subscriptions.owner(ownerId, async (tx) => {
        const [settings, plans] = await Promise.all([repo.settings(tx), repo.paidPlans(tx)])
        return {
          currency: settings.currency,
          taxRateBasisPoints: settings.taxRateBasisPoints,
          paymentMethods: settings.paymentMethods,
          paymentInstructions: settings.paymentInstructions,
          plans: plans.map((p) => ({
            code: p.code as BillingCatalog['plans'][number]['code'],
            name: p.name,
            monthlyHt: p.monthlyHt,
            annualHt: p.annualHt,
            entitlements: p.entitlements,
          })),
        }
      })
    },
    state,
    quote: (ownerId: string, input: SubscriptionQuoteRequest) =>
      subscriptions.owner(ownerId, (tx) => quote(ownerId, input, tx)),
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
        const q = await quote(ownerId, input, tx)
        return toPayment(
          await repo.submit(
            {
              ownerId,
              planCode: q.planCode,
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
     * Administrator confirmation of actual receipt. Idempotent: confirming twice returns the
     * existing coverage. Coverage dates are fixed now, not at submission.
     */
    confirm: (
      id: string,
      decidedBy: string,
      receivedReference?: string,
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
        const now = clock(),
          s = await state(payment.ownerId, tx, now)
        let start = now,
          end: Date
        if (payment.kind === 'upgrade') {
          if (!s.current)
            throw new AppError(409, 'UPGRADE_STALE', 'The upgraded period is no longer active.')
          end = s.current.end
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
            receivedReference: receivedReference ?? null,
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
        const row = await repo.decide(
          id,
          { status: 'rejected', decidedAt: clock(), decidedBy, rejectionReason },
          tx,
        )
        if (!row)
          throw new AppError(409, 'PAYMENT_CONFIRMED', 'A confirmed payment cannot be rejected.')
        await onDecided?.(tx, payment, row)
        return toPayment(row)
      }),
  }
}
