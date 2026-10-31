import type {
  AdminBillingSettings,
  AdminBillingSettingsUpdate,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createBillingSettingsRepository } from '../repositories/billing-settings.repository.js'

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

export function createBillingSettingsService(
  repo: ReturnType<typeof createBillingSettingsRepository>,
  audit: AdminAuditService,
  withAdmin: AdminTransaction,
) {
  return {
    get: async () => settingsView(await withAdmin((tx) => repo.settings(tx))),
    update: (admin: AuthenticatedAdmin, input: AdminBillingSettingsUpdate) =>
      withAdmin(async (tx) => {
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
          await audit.record(
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
  }
}
