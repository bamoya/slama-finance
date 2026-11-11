import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import { roles, sessions, userRoles, users } from '../../../../../../db/schema/auth.js'
import { organizationAdminDeliveries } from '../../../../../../db/schema/organization-provisioning.js'
import { organizations } from '../../../../../../db/schema/organizations.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import { queueSql, queueTime } from '../../../../../lib/queue-time.js'

export function createAdminProvisioningRepository(database: () => Database) {
  return {
    async provision(
      tx: Transaction,
      input: {
        email: string
        firstName: string | null
        lastName: string | null
        passwordHash: string
      },
    ) {
      const [role] = await tx
        .select()
        .from(roles)
        .where(
          and(
            eq(roles.key, 'admin'),
            eq(
              roles.organizationId,
              sql`nullif(current_setting('app.organization_id',true),'')::uuid`,
            ),
          ),
        )
      if (!role)
        throw new AppError(
          409,
          'PROVISIONING_FAILED',
          'Organization administrator role is unavailable.',
        )
      const [user] = await tx
        .insert(users)
        .values({ ...input, mustChangePassword: true })
        .returning()
      await tx.insert(userRoles).values({ userId: user!.id, roleId: role.id })
      await tx.insert(organizationAdminDeliveries).values({ userId: user!.id })
      return user!.id
    },
    async claim(passwordHash: string) {
      return database().transaction(async (tx) => {
        const [job] = await tx
          .select()
          .from(organizationAdminDeliveries)
          .where(
            and(
              eq(
                organizationAdminDeliveries.organizationId,
                sql`nullif(current_setting('app.organization_id',true),'')::uuid`,
              ),
              sql`(${organizationAdminDeliveries.status}='pending' and ${organizationAdminDeliveries.availableAt}<=now()) or (${organizationAdminDeliveries.status}='sending' and ${organizationAdminDeliveries.leaseExpiresAt}<now())`,
            ),
          )
          .for('update', { skipLocked: true })
          .limit(1)
        if (!job) return null
        if (job.attempts >= 5) {
          await tx
            .update(organizationAdminDeliveries)
            .set({ status: 'failed', lastErrorCode: 'ADMIN_EMAIL_FAILED' })
            .where(eq(organizationAdminDeliveries.organizationId, job.organizationId))
          return null
        }
        const [organization] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, job.organizationId))
        if (
          !organization?.activatedAt ||
          organization.pausedAt ||
          organization.suspendedAt ||
          organization.deletionRequestedAt
        )
          return null
        const [user] = await tx.select().from(users).where(eq(users.id, job.userId)).for('update')
        if (
          !user ||
          user.disabledAt ||
          user.archivedAt ||
          user.deletedAt ||
          !user.mustChangePassword ||
          user.temporaryPasswordConsumedAt
        ) {
          await tx
            .update(organizationAdminDeliveries)
            .set({ status: 'skipped' })
            .where(eq(organizationAdminDeliveries.organizationId, job.organizationId))
          return null
        }
        const leaseId = randomUUID(),
          expiresAt = new Date(Date.now() + 86400000)
        await tx
          .update(users)
          .set({
            passwordHash,
            temporaryPasswordExpiresAt: expiresAt,
            temporaryPasswordConsumedAt: null,
          })
          .where(eq(users.id, user.id))
        await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, user.id))
        await tx
          .update(organizationAdminDeliveries)
          .set({
            status: 'sending',
            attempts: job.attempts + 1,
            leaseId,
            // Database clock, like the claim comparison (no host/database skew).
            leaseExpiresAt: queueSql(queueTime(undefined, 120000)),
          })
          .where(eq(organizationAdminDeliveries.organizationId, job.organizationId))
        return {
          organizationId: job.organizationId,
          userId: user.id,
          to: user.email,
          organizationName: organization.name,
          language: organization.locale,
          expiresAt,
          leaseId,
        }
      })
    },
    finish: (job: { organizationId: string; leaseId: string }, success: boolean) =>
      database()
        .update(organizationAdminDeliveries)
        .set(
          success
            ? { status: 'sent', sentAt: sql`now()`, lastErrorCode: null, leaseExpiresAt: null }
            : {
                status: 'pending',
                availableAt: queueSql(queueTime(undefined, 60000)),
                lastErrorCode: 'ADMIN_EMAIL_FAILED',
                leaseExpiresAt: null,
              },
        )
        .where(
          and(
            eq(organizationAdminDeliveries.organizationId, job.organizationId),
            eq(organizationAdminDeliveries.leaseId, job.leaseId),
            eq(organizationAdminDeliveries.status, 'sending'),
          ),
        ),
  }
}
