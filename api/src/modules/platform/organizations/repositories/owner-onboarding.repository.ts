import { and, eq, sql } from 'drizzle-orm'

import { organizationProfiles } from '../../../../../db/schema/organization-profiles.js'
import { organizations, platformUsers } from '../../../../../db/schema/organizations.js'
import type { OwnerOnboardingConfiguration } from '../../../../contracts/generated/identity/owner-onboarding.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { withOwnerTransaction } from '../../../../lib/owner-context.js'

export function createOwnerOnboardingRepository(database: () => Database) {
  const read = async (tx: Transaction, ownerId: string, id: string) => {
    const [row] = await tx
      .select({ organization: organizations, profile: organizationProfiles })
      .from(organizations)
      .innerJoin(organizationProfiles, eq(organizationProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.id, id), eq(organizations.ownerId, ownerId)))
    if (!row) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.')
    const [old] = await tx.execute(sql`select current_setting('app.organization_id',true) value`)
    await tx.execute(sql`select set_config('app.organization_id',${id},true)`)
    const [counts] = await tx.execute(
      sql`select count(*)::int value from users where organization_id=${id}::uuid and archived_at is null and deleted_at is null`,
    )
    await tx.execute(sql`select set_config('app.organization_id',${String(old?.value ?? '')},true)`)
    return { ...row, staffCount: Number(counts?.value ?? 0) }
  }
  return {
    get: (ownerId: string, id: string) =>
      withOwnerTransaction(database(), ownerId, (tx) => read(tx, ownerId, id)),
    create(
      ownerId: string,
      id: string,
      slug: string,
      configuration: OwnerOnboardingConfiguration,
      admit?: (tx: Transaction) => Promise<unknown>,
      provision?: (tx: Transaction) => Promise<string>,
    ) {
      return withOwnerTransaction(database(), ownerId, async (tx) => {
        await tx
          .select({ id: platformUsers.id })
          .from(platformUsers)
          .where(eq(platformUsers.id, ownerId))
          .for('update')
        const [existing] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, id))
        if (existing) return read(tx, ownerId, id)
        await admit?.(tx)
        const inserted = await tx
          .insert(organizations)
          .values({
            id,
            ownerId,
            name: configuration.name,
            slug,
            locale: configuration.defaults.language,
          })
          .onConflictDoNothing({ target: organizations.id })
          .returning({ id: organizations.id })
        if (inserted.length)
          await tx
            .insert(organizationProfiles)
            .values({ organizationId: id, configuration, currentStep: 2 })
        if (inserted.length && provision) {
          await tx.execute(sql`select set_config('app.organization_id',${id},true)`)
          await provision(tx)
          await tx.execute(sql`select set_config('app.organization_id','',true)`)
        }
        return read(tx, ownerId, id)
      })
    },
    save(
      ownerId: string,
      id: string,
      expectedVersion: number,
      configuration: OwnerOnboardingConfiguration,
      currentStep: number,
      complete = false,
      activate?: (tx: Transaction) => Promise<void>,
    ) {
      return withOwnerTransaction(database(), ownerId, async (tx) => {
        const row = await read(tx, ownerId, id)
        if (
          complete &&
          row.organization.activatedAt &&
          row.profile.completedAt &&
          (row.profile.version === expectedVersion || row.profile.version === expectedVersion + 1)
        )
          return row
        if (
          row.organization.activatedAt ||
          row.organization.suspendedAt ||
          row.organization.pausedAt ||
          row.organization.deletionRequestedAt
        )
          throw new AppError(
            409,
            'ONBOARDING_UNAVAILABLE',
            'Organization setup cannot be changed in its current state.',
          )
        // Completion is idempotent for the version returned by the successful request.
        if (
          complete &&
          !activate &&
          row.profile.completedAt &&
          row.profile.version === expectedVersion + 1
        )
          return row
        if (row.profile.completedAt && !complete)
          throw new AppError(
            409,
            'ONBOARDING_COMPLETED',
            'Organization setup has already been completed.',
          )
        const changed = await tx
          .update(organizationProfiles)
          .set({
            configuration,
            currentStep,
            completedAt: complete ? new Date() : null,
            version: sql`${organizationProfiles.version}+1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(organizationProfiles.organizationId, id),
              eq(organizationProfiles.version, expectedVersion),
            ),
          )
          .returning()
        if (!changed.length)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'This setup was changed in another tab. Reload the saved version before continuing.',
          )
        if (complete && activate) {
          await tx.execute(sql`select set_config('app.organization_id',${id},true)`)
          await activate(tx)
          await tx.execute(sql`select set_config('app.organization_id','',true)`)
        }
        await tx
          .update(organizations)
          .set({
            activatedAt: complete && activate ? new Date() : undefined,
            name: configuration.name,
            locale: configuration.defaults.language,
            updatedAt: new Date(),
          })
          .where(and(eq(organizations.id, id), eq(organizations.ownerId, ownerId)))
        return read(tx, ownerId, id)
      })
    },
  }
}
