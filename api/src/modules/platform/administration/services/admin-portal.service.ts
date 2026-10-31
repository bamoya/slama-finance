import type {
  AdminAuditPage,
  AdminBillingSettings,
  AdminBillingSettingsUpdate,
  AdminOwnerDetail,
  AdminOwnerPage,
  AdminPayment,
  AdminPaymentPage,
} from '../../../../contracts/generated/administration/administration.schemas.js'
import type { OwnerSubscription } from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createAdminRepository } from '../repositories/admin.repository.js'
import type { AuthenticatedAdmin } from './admin-auth.service.js'

const PAGE_SIZE = 20
const AUDIT_PAGE_SIZE = 50

type PaymentRecord = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAdminRepository>['payment']>>
>['payment']
type Decision = (tx: Transaction, before: PaymentRecord, after: PaymentRecord) => Promise<void>

/** Billing operations owned by the subscriptions module, injected by composition. */
export type AdminBillingPort = {
  confirm: (
    id: string,
    decidedBy: string,
    receivedReference?: string,
    onDecided?: Decision,
  ) => Promise<unknown>
  reject: (id: string, decidedBy: string, reason: string, onDecided?: Decision) => Promise<unknown>
  summary: (ownerId: string) => Promise<OwnerSubscription>
}

const iso = (value: Date | null) => value?.toISOString() ?? null
function toAdminPayment(row: { payment: PaymentRecord; ownerEmail: string }): AdminPayment {
  const p = row.payment
  return {
    id: p.id,
    ownerId: p.ownerId,
    ownerEmail: row.ownerEmail,
    planCode: p.planCode as AdminPayment['planCode'],
    cycle: p.cycle,
    kind: p.kind,
    status: p.status,
    method: p.method,
    reference: p.reference,
    amount: {
      currency: p.currency,
      amountHt: p.amountHt,
      taxRateBasisPoints: p.taxRateBasisPoints,
      taxAmount: p.taxAmount,
      amountTtc: p.amountTtc,
    },
    coverageStart: iso(p.coverageStart),
    coverageEnd: iso(p.coverageEnd),
    submittedAt: p.submittedAt.toISOString(),
    decidedAt: iso(p.decidedAt),
    decidedBy: p.decidedBy,
    receivedReference: p.receivedReference,
    rejectionReason: p.rejectionReason,
  }
}
const decisionSnapshot = (p: PaymentRecord) => ({
  status: p.status,
  coverageStart: iso(p.coverageStart),
  coverageEnd: iso(p.coverageEnd),
  decidedBy: p.decidedBy,
  receivedReference: p.receivedReference,
  rejectionReason: p.rejectionReason,
})
const settingsView = (s: {
  currency: string
  taxRateBasisPoints: number | null
  paymentMethods: string[]
  paymentInstructions: string
}): AdminBillingSettings => ({
  currency: s.currency,
  taxRateBasisPoints: s.taxRateBasisPoints,
  paymentMethods: s.paymentMethods,
  paymentInstructions: s.paymentInstructions,
})

export function createAdminPortalService(
  repo: ReturnType<typeof createAdminRepository>,
  billing: AdminBillingPort,
) {
  async function payment(id: string) {
    const row = await repo.admin((tx) => repo.payment(id, tx))
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Payment not found.')
    return toAdminPayment(row)
  }
  const audited =
    (admin: AuthenticatedAdmin, action: string): Decision =>
    (tx, before, after) =>
      repo.audit(
        {
          adminId: admin.id,
          actor: admin.email,
          action,
          targetType: 'subscription_payment',
          targetId: after.id,
          before: decisionSnapshot(before),
          after: decisionSnapshot(after),
        },
        tx,
      )

  return {
    async payments(
      status: AdminPayment['status'] | undefined,
      page: number,
    ): Promise<AdminPaymentPage> {
      const { rows, total } = await repo.admin((tx) => repo.payments(status, page, PAGE_SIZE, tx))
      return { items: rows.map(toAdminPayment), page, pageSize: PAGE_SIZE, total }
    },
    /** Idempotent: an already-confirmed payment returns unchanged with no new audit row. */
    async confirm(admin: AuthenticatedAdmin, id: string, receivedReference?: string) {
      await billing.confirm(
        id,
        admin.email,
        receivedReference?.trim() || undefined,
        audited(admin, 'payment.confirm'),
      )
      return payment(id)
    },
    async reject(admin: AuthenticatedAdmin, id: string, reason: string) {
      await billing.reject(id, admin.email, reason, audited(admin, 'payment.reject'))
      return payment(id)
    },
    async owners(search: string | undefined, page: number): Promise<AdminOwnerPage> {
      const { rows, total } = await repo.admin((tx) => repo.owners(search, page, PAGE_SIZE, tx))
      const items = await Promise.all(
        rows.map(async ({ owner, organizationCount }) => {
          const s = await billing.summary(owner.id)
          const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ')
          return {
            id: owner.id,
            email: owner.email,
            name: name || null,
            createdAt: owner.createdAt.toISOString(),
            disabledAt: iso(owner.disabledAt),
            subscriptionStatus: s.status,
            planCode: s.planCode,
            paidThroughAt: s.paidThroughAt,
            organizationCount: Number(organizationCount),
          }
        }),
      )
      return { items, page, pageSize: PAGE_SIZE, total }
    },
    async owner(id: string): Promise<AdminOwnerDetail> {
      const found = await repo.admin(async (tx) => {
        const owner = await repo.owner(id, tx)
        if (!owner) return null
        const [organizations, payments] = await Promise.all([
          repo.ownerOrganizations(id, tx),
          repo.ownerPayments(id, tx),
        ])
        return { owner, organizations, payments }
      })
      if (!found) throw new AppError(404, 'NOT_FOUND', 'Owner not found.')
      const { owner, organizations, payments } = found
      return {
        owner: {
          id: owner.id,
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
          locale: owner.locale,
          emailVerifiedAt: iso(owner.emailVerifiedAt),
          disabledAt: iso(owner.disabledAt),
          createdAt: owner.createdAt.toISOString(),
        },
        organizations: organizations.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          createdAt: o.createdAt.toISOString(),
          activatedAt: iso(o.activatedAt),
        })),
        subscription: await billing.summary(id),
        payments: payments.map(toAdminPayment),
      }
    },
    settings: async () => settingsView(await repo.admin((tx) => repo.settings(tx))),
    updateSettings: (admin: AuthenticatedAdmin, input: AdminBillingSettingsUpdate) =>
      repo.admin(async (tx) => {
        const before = settingsView(await repo.settings(tx, true))
        const after = settingsView(
          await repo.updateSettings(
            {
              taxRateBasisPoints: input.taxRateBasisPoints,
              paymentMethods: input.paymentMethods,
              paymentInstructions: input.paymentInstructions.trim(),
            },
            tx,
          ),
        )
        if (JSON.stringify(before) !== JSON.stringify(after))
          await repo.audit(
            {
              adminId: admin.id,
              actor: admin.email,
              action: 'billing_settings.update',
              targetType: 'billing_settings',
              targetId: '1',
              before,
              after,
            },
            tx,
          )
        return after
      }),
    async audit(page: number): Promise<AdminAuditPage> {
      const { rows, total } = await repo.admin((tx) => repo.auditPage(page, AUDIT_PAGE_SIZE, tx))
      return {
        items: rows.map((r) => ({
          id: r.id,
          adminId: r.adminId,
          actor: r.actor,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          before: (r.before as Record<string, unknown> | null) ?? null,
          after: (r.after as Record<string, unknown> | null) ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        page,
        pageSize: AUDIT_PAGE_SIZE,
        total,
      }
    },
  }
}
