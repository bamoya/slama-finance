import { randomBytes } from 'node:crypto'

import type { OrganizationAdminDelivery } from '../../../../../integrations/contracts.js'
import type { Transaction } from '../../../../../lib/db.js'
import { createPasswordService } from '../../../../../lib/password.js'
import type { createAdminProvisioningRepository } from '../repositories/admin-provisioning.repository.js'

export function createAdminProvisioningService(
  repo: ReturnType<typeof createAdminProvisioningRepository>,
  delivery?: OrganizationAdminDelivery,
  /** Organization site origin (<slug>.<platform domain>) for the sign-in link. */
  origin?: (organizationId: string) => Promise<string | undefined>,
) {
  const passwords = createPasswordService()
  return {
    async provision(
      tx: Transaction,
      input: { email: string; firstName: string | null; lastName: string | null },
    ) {
      // No usable initial credential exists until the delivery worker runs after activation.
      return repo.provision(tx, {
        ...input,
        email: input.email.trim().toLowerCase(),
        passwordHash: await passwords.hash(randomBytes(32).toString('base64url')),
      })
    },
    async runOne() {
      if (!delivery || !origin) return
      const temporaryPassword = randomBytes(24).toString('base64url'),
        job = await repo.claim(await passwords.hash(temporaryPassword))
      if (!job) return
      try {
        const site = await origin(job.organizationId)
        if (!site) throw new Error('Organization address unavailable')
        await delivery.send({
          ...job,
          temporaryPassword,
          loginUrl: new URL('/login', site).toString(),
          idempotencyKey: `organization-admin:${job.organizationId}:${job.leaseId}`,
        })
        await repo.finish(job, true)
      } catch {
        await repo.finish(job, false)
      }
    },
  }
}
