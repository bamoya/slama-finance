import { eq } from 'drizzle-orm'

import { clients } from '../../../../../db/schema/clients.js'
import { companySettings } from '../../../../../db/schema/settings.js'
import type { Database } from '../../../../lib/db.js'

/** Render-only identity refresh; never mutate issued business snapshots. */
export function createFreshDocumentParties(database: () => Database) {
  return async (clientId: string | null, issuer: unknown, client: unknown) =>
    database().transaction(async (tx) => {
      const [company] = await tx.select().from(companySettings).where(eq(companySettings.id, 1))
      const [currentClient] = clientId
        ? await tx.select().from(clients).where(eq(clients.id, clientId))
        : []
      return {
        issuerSnapshot: company
          ? { ...company, locale: (issuer as { locale?: string } | null)?.locale ?? company.locale }
          : issuer,
        clientSnapshot: currentClient ?? client,
      }
    })
}
