import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm'

import {
  platformAdminAudit,
  platformAdmins,
  platformAdminSessions,
} from '../../../../../db/schema/administration.js'
import { organizations, platformUsers } from '../../../../../db/schema/organizations.js'
import { billingSettings, subscriptionPayments } from '../../../../../db/schema/subscriptions.js'
import type { Database, Transaction } from '../../../../lib/db.js'

export type AdminRow = typeof platformAdmins.$inferSelect
export type AuditInput = Omit<typeof platformAdminAudit.$inferInsert, 'id' | 'createdAt'>
type PaymentStatus = (typeof subscriptionPayments.$inferSelect)['status']

const paymentColumns = { payment: subscriptionPayments, ownerEmail: platformUsers.email }
const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export function createAdminRepository(database: () => Database) {
  return {
    /** Every administration query runs in the platform_admin RLS context, never owner/staff. */
    admin: <T>(work: (tx: Transaction) => Promise<T>) =>
      database().transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.actor_type','platform_admin',true),set_config('app.owner_id','',true),set_config('app.organization_id','',true)`,
        )
        return work(tx)
      }),
    async byEmail(email: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.email, email))
        .for('update')
      return row
    },
    async byId(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.id, id))
        .for('update')
      return row
    },
    async create(values: typeof platformAdmins.$inferInsert, tx: Transaction) {
      const [row] = await tx
        .insert(platformAdmins)
        .values(values)
        .onConflictDoNothing({ target: platformAdmins.email })
        .returning()
      return row
    },
    async updateAdmin(
      id: string,
      values: Partial<typeof platformAdmins.$inferInsert>,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(platformAdmins)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(platformAdmins.id, id))
        .returning()
      return row
    },
    /** Atomically accepts a TOTP step only if it is newer than the last accepted one. */
    async acceptStep(id: string, step: number, now: Date, tx: Transaction) {
      const [row] = await tx
        .update(platformAdmins)
        .set({
          totpLastStep: step,
          totpEnrolledAt: sql`coalesce(${platformAdmins.totpEnrolledAt}, ${now.toISOString()}::timestamptz)`,
          updatedAt: now,
        })
        .where(
          and(
            eq(platformAdmins.id, id),
            isNull(platformAdmins.disabledAt),
            isNotNull(platformAdmins.totpSecret),
            or(isNull(platformAdmins.totpLastStep), sql`${platformAdmins.totpLastStep} < ${step}`),
          ),
        )
        .returning()
      return row
    },
    async insertSession(values: typeof platformAdminSessions.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(platformAdminSessions).values(values).returning()
      return row!
    },
    async session(tokenHash: string, tx: Transaction) {
      const [row] = await tx
        .select({ session: platformAdminSessions, admin: platformAdmins })
        .from(platformAdminSessions)
        .innerJoin(platformAdmins, eq(platformAdmins.id, platformAdminSessions.adminId))
        .where(
          and(
            eq(platformAdminSessions.tokenHash, tokenHash),
            isNull(platformAdminSessions.revokedAt),
          ),
        )
        .for('update', { of: platformAdminSessions })
      return row
    },
    async updateSession(
      id: string,
      values: Partial<typeof platformAdminSessions.$inferInsert>,
      tx: Transaction,
    ) {
      await tx.update(platformAdminSessions).set(values).where(eq(platformAdminSessions.id, id))
    },
    revokeAll: (adminId: string, now: Date, tx: Transaction) =>
      tx
        .update(platformAdminSessions)
        .set({ revokedAt: now })
        .where(
          and(eq(platformAdminSessions.adminId, adminId), isNull(platformAdminSessions.revokedAt)),
        ),
    async audit(entry: AuditInput, tx: Transaction) {
      await tx.insert(platformAdminAudit).values(entry)
    },
    async auditPage(page: number, pageSize: number, tx: Transaction) {
      const [rows, [total]] = await Promise.all([
        tx
          .select()
          .from(platformAdminAudit)
          .orderBy(desc(platformAdminAudit.createdAt), desc(platformAdminAudit.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ n: count() }).from(platformAdminAudit),
      ])
      return { rows, total: total?.n ?? 0 }
    },
    async payments(
      status: PaymentStatus | undefined,
      page: number,
      pageSize: number,
      tx: Transaction,
    ) {
      const where = status ? eq(subscriptionPayments.status, status) : undefined
      const [rows, [total]] = await Promise.all([
        tx
          .select(paymentColumns)
          .from(subscriptionPayments)
          .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
          .where(where)
          .orderBy(
            status === 'submitted'
              ? asc(subscriptionPayments.submittedAt)
              : desc(subscriptionPayments.submittedAt),
            asc(subscriptionPayments.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ n: count() }).from(subscriptionPayments).where(where),
      ])
      return { rows, total: total?.n ?? 0 }
    },
    async payment(id: string, tx: Transaction) {
      const [row] = await tx
        .select(paymentColumns)
        .from(subscriptionPayments)
        .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
        .where(eq(subscriptionPayments.id, id))
      return row
    },
    ownerPayments: (ownerId: string, tx: Transaction) =>
      tx
        .select(paymentColumns)
        .from(subscriptionPayments)
        .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
        .where(eq(subscriptionPayments.ownerId, ownerId))
        .orderBy(desc(subscriptionPayments.submittedAt)),
    async owners(search: string | undefined, page: number, pageSize: number, tx: Transaction) {
      const term = search?.trim()
      const where = term
        ? or(
            ilike(platformUsers.email, like(term)),
            ilike(
              sql`concat_ws(' ',${platformUsers.firstName},${platformUsers.lastName})`,
              like(term),
            ),
          )
        : undefined
      const organizationCount = sql<number>`(select count(*)::int from organizations o where o.owner_id=platform_users.id)`
      const [rows, [total]] = await Promise.all([
        tx
          .select({ owner: platformUsers, organizationCount })
          .from(platformUsers)
          .where(where)
          .orderBy(desc(platformUsers.createdAt), asc(platformUsers.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ n: count() }).from(platformUsers).where(where),
      ])
      return { rows, total: total?.n ?? 0 }
    },
    async owner(id: string, tx: Transaction) {
      const [row] = await tx.select().from(platformUsers).where(eq(platformUsers.id, id))
      return row
    },
    ownerOrganizations: (ownerId: string, tx: Transaction) =>
      tx
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          createdAt: organizations.createdAt,
          activatedAt: organizations.activatedAt,
        })
        .from(organizations)
        .where(eq(organizations.ownerId, ownerId))
        .orderBy(asc(organizations.createdAt)),
    async settings(tx: Transaction, lock = false) {
      const query = tx.select().from(billingSettings).where(eq(billingSettings.id, 1))
      const [row] = lock ? await query.for('update') : await query
      return row!
    },
    async updateSettings(
      values: Pick<
        typeof billingSettings.$inferInsert,
        'taxRateBasisPoints' | 'paymentMethods' | 'paymentInstructions'
      >,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(billingSettings)
        .set(values)
        .where(eq(billingSettings.id, 1))
        .returning()
      return row!
    },
  }
}
