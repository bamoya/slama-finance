import type {
  AdminOwnerDetail,
  AdminOwnerPage,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import { AppError } from '../../../../../lib/errors.js'
import type { createAdminPaymentRepository } from '../../payments/repositories/admin-payment.repository.js'
import type { AdminBillingPort } from '../../payments/services/admin-billing.port.js'
import { toAdminPayment } from '../../payments/services/admin-payment-view.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { createAdminCustomerRepository } from '../repositories/admin-customer.repository.js'

const PAGE_SIZE = 20
const iso = (value: Date | null) => value?.toISOString() ?? null

/** Customers are the account owners; the public contract still names them "owners". */
export function createAdminCustomersService(
  repo: ReturnType<typeof createAdminCustomerRepository>,
  payments: ReturnType<typeof createAdminPaymentRepository>,
  withAdmin: AdminTransaction,
  billing: Pick<AdminBillingPort, 'summary'>,
) {
  return {
    async list(search: string | undefined, page: number): Promise<AdminOwnerPage> {
      const { rows, total } = await withAdmin((tx) => repo.owners(search, page, PAGE_SIZE, tx))
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
    async detail(id: string): Promise<AdminOwnerDetail> {
      const found = await withAdmin(async (tx) => {
        const owner = await repo.owner(id, tx)
        if (!owner) return null
        const [organizations, ownerPayments] = await Promise.all([
          repo.ownerOrganizations(id, tx),
          payments.forOwner(id, tx),
        ])
        return { owner, organizations, payments: ownerPayments }
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
        organizations: organizations.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          createdAt: o.createdAt.toISOString(),
          activatedAt: iso(o.activatedAt),
        })),
        subscription: await billing.summary(id),
        payments: ownerPayments.map(toAdminPayment),
      }
    },
  }
}
