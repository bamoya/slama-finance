import type {
  AdminOwnerDetail,
  AdminOwnerPage,
  ListAdminOwnersQuery,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import { AppError } from '../../../../../lib/errors.js'
import { organizationState } from '../../../../../lib/organization-view.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type { createAdminPaymentRepository } from '../../payments/repositories/admin-payment.repository.js'
import type { AdminBillingPort } from '../../payments/services/admin-billing.port.js'
import { toAdminPayment } from '../../payments/services/admin-payment-view.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { createAdminCustomerRepository } from '../repositories/admin-customer.repository.js'

const PAGE_SIZE = 20
const iso = (value: Date | null) => value?.toISOString() ?? null
const invitationPending = (owner: { invitedAt: Date | null; emailVerifiedAt: Date | null }) =>
  Boolean(owner.invitedAt && !owner.emailVerifiedAt)

/** Customers are the account owners; the public contract still names them "owners". */
export function createAdminCustomersService(
  repo: ReturnType<typeof createAdminCustomerRepository>,
  payments: ReturnType<typeof createAdminPaymentRepository>,
  audit: AdminAuditService,
  withAdmin: AdminTransaction,
  billing: Pick<AdminBillingPort, 'summary'>,
  clock: () => Date = () => new Date(),
) {
  return {
    async list(query: ListAdminOwnersQuery): Promise<AdminOwnerPage> {
      const page = query.page
      const { rows, total } = await withAdmin((tx) =>
        repo.owners(query.search, query.status, page, PAGE_SIZE, clock(), tx),
      )
      const items = await Promise.all(
        rows.map(async ({ owner, organizationCount }) => {
          const s = await billing.summary(owner.id)
          return {
            id: owner.id,
            email: owner.email,
            firstName: owner.firstName,
            lastName: owner.lastName,
            createdAt: owner.createdAt.toISOString(),
            disabledAt: iso(owner.disabledAt),
            subscriptionStatus: s.status,
            planCode: s.planCode,
            paidThroughAt: s.paidThroughAt,
            organizationCount: Number(organizationCount),
            blockedAt: iso(owner.blockedAt),
            deletionDueAt: iso(owner.deletionDueAt),
            invitationPending: invitationPending(owner),
          }
        }),
      )
      return { items, page, pageSize: PAGE_SIZE, total }
    },
    /** Administrator view: includes internal restriction reasons from the audit trail. */
    async detail(id: string): Promise<AdminOwnerDetail> {
      const found = await withAdmin(async (tx) => {
        const owner = await repo.owner(id, tx)
        if (!owner) return null
        const [organizations, ownerPayments, blockReason, deletionReason] = await Promise.all([
          repo.ownerOrganizations(id, tx),
          payments.forOwner(id, tx),
          owner.blockedAt ? audit.reason('customer.block', 'platform_user', id, tx) : null,
          owner.deletionRequestedAt
            ? audit.reason('customer.delete', 'platform_user', id, tx)
            : null,
        ])
        const suspensionReasons = await Promise.all(
          organizations.map((o) =>
            o.suspendedAt ? audit.reason('organization.suspend', 'organization', o.id, tx) : null,
          ),
        )
        return {
          owner,
          organizations,
          payments: ownerPayments,
          blockReason,
          deletionReason,
          suspensionReasons,
        }
      })
      if (!found) throw new AppError(404, 'NOT_FOUND', 'Owner not found.')
      const { owner, organizations, payments: ownerPayments } = found
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
        restriction: {
          blockedAt: iso(owner.blockedAt),
          blockReason: found.blockReason,
          deletionRequestedAt: iso(owner.deletionRequestedAt),
          deletionDueAt: iso(owner.deletionDueAt),
          deletionReason: found.deletionReason,
        },
        invitationPending: invitationPending(owner),
        organizations: organizations.map((o, index) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          createdAt: o.createdAt.toISOString(),
          activatedAt: iso(o.activatedAt),
          state: organizationState(o),
          suspendedAt: iso(o.suspendedAt),
          suspensionReason: found.suspensionReasons[index] ?? null,
        })),
        subscription: await billing.summary(id),
        payments: ownerPayments.map(toAdminPayment),
      }
    },
  }
}
