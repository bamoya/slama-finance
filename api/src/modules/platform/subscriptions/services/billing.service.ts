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
import type { createSubscriptionRepository } from '../repositories/subscription.repository.js'
import { type Coverage, GRACE_MS, money, prorate, resolveCoverage } from './coverage.js'

const DAY_MS = 86_400_000
const suspended = () =>
  new AppError(409, 'SUBSCRIPTION_SUSPENDED', 'This subscription is suspended.')

export type AdminGrant = {
  planCode: string
  cycle: 'monthly' | 'annual'
  start: Date
  end: Date
}

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
) {
  /** Confirmed coverage, falling back to a legacy paid-through marker without payment rows. */
  async function state(ownerId: string, tx: Transaction, now = clock()) {
    const row = (await subscriptions.subscription(ownerId, tx))?.owner_subscriptions ?? null
    const coverage: Coverage[] = (await repo.coverage(ownerId, tx)).map((p) => ({
      planCode: p.planCode,
      cycle: p.cycle,
      start: p.coverageStart!,
      end: p.coverageEnd!,
    }))
    if (!coverage.length && row && row.planCode !== 'trial' && row.paidThroughAt)
      coverage.push({
        planCode: row.planCode,
        cycle: null,
        start: row.trialStartedAt,
        end: row.paidThroughAt,
      })
    return { row, coverage, ...resolveCoverage(row, coverage, now) }
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
      coverageEnd: (await repo.addCycle(start, input.cycle, tx)).toISOString(),
    }
  }

  /**
   * Administrator lifecycle operations. They run inside the caller's platform_admin transaction so
   * the change, the 2FA step and the audit row commit together.
   */
  const administration = {
    state,
    async suspend(ownerId: string, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const s = await state(ownerId, tx)
      if (!s.row) throw new AppError(409, 'SUBSCRIPTION_NOT_STARTED', 'The trial has not started.')
      if (s.status === 'suspended') throw suspended()
      await repo.setSuspended(ownerId, clock(), tx)
    },
    async resume(ownerId: string, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const s = await state(ownerId, tx)
      const since = s.row?.suspendedAt
      if (!since)
        throw new AppError(409, 'SUBSCRIPTION_NOT_SUSPENDED', 'This subscription is not suspended.')
      const now = clock()
      await repo.shiftCoverage(ownerId, since, Math.max(0, now.getTime() - since.getTime()), tx)
      await repo.setSuspended(ownerId, null, tx)
    },
    async changePlan(ownerId: string, planCode: string, decidedBy: string, tx: Transaction) {
      await subscriptions.lock(ownerId, tx)
      const now = clock()
      const [s, plan, settings] = await Promise.all([
        state(ownerId, tx, now),
        repo.plan(planCode, tx),
        repo.settings(tx),
      ])
      if (!plan || plan.code === 'trial')
        throw new AppError(400, 'INVALID_PLAN', 'Choose a paid plan.')
      if (s.status === 'suspended') throw suspended()
      if (!s.current)
        throw new AppError(409, 'NO_PAID_PERIOD', 'There is no current paid period to change.')
      if (s.current.planCode === plan.code)
        throw new AppError(409, 'SAME_PLAN', 'The subscription already uses this plan.')
      const active = await repo.plan(s.current.planCode, tx)
      await repo.adjustment(
        {
          ownerId,
          planCode: plan.code,
          cycle: s.current.cycle ?? 'monthly',
          kind: active && plan.rank > active.rank ? 'upgrade' : 'activation',
          start: now,
          end: s.current.end,
          decidedBy,
          currency: settings.currency,
          now,
        },
        tx,
      )
      await repo.extendPaidThrough(ownerId, s.current.end, plan.code, tx)
    },
    async extend(ownerId: string, days: number, decidedBy: string, tx: Transaction) {
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
      const settings = await repo.settings(tx)
      await repo.adjustment(
        {
          ownerId,
          planCode: last.planCode,
          cycle: last.cycle ?? 'monthly',
          kind: 'renewal',
          start,
          end,
          decidedBy,
          currency: settings.currency,
          now,
        },
        tx,
      )
      await repo.extendPaidThrough(ownerId, end, start <= now ? last.planCode : null, tx)
    },
    /** Paid subscription granted when an administrator creates the account. */
    async grant(ownerId: string, grant: AdminGrant, decidedBy: string, tx: Transaction) {
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
      const settings = await repo.settings(tx)
      await repo.createPaid(ownerId, plan.code, grant.end, now, tx)
      await repo.adjustment(
        {
          ownerId,
          planCode: plan.code,
          cycle: grant.cycle,
          kind: 'activation',
          start: grant.start,
          end: grant.end,
          decidedBy,
          currency: settings.currency,
          now,
        },
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
    ) =>
      repo.admin(async (tx) => {
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
          const continues =
            s.paidThroughAt &&
            !(s.row?.cancelAtPeriodEnd && now >= s.paidThroughAt) &&
            now.getTime() < s.paidThroughAt.getTime() + GRACE_MS
          if (continues) start = s.paidThroughAt!
          end = await repo.addCycle(start, payment.cycle, tx)
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
        await onDecided?.(tx, payment, confirmed!)
        return toPayment(confirmed!)
      }),
    /** Idempotent; the reason is stored and shown to the owner. */
    reject: (id: string, decidedBy: string, reason: string, onDecided?: DecisionHook) =>
      repo.admin(async (tx) => {
        const rejectionReason = reason.trim()
        if (!rejectionReason)
          throw new AppError(400, 'REJECTION_REASON_REQUIRED', 'Give a reason for the rejection.')
        const payment = await repo.payment(id, tx)
        if (!payment) throw new AppError(404, 'NOT_FOUND', 'Payment not found.')
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
