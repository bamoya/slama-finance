import { and, asc, count, desc, eq, ilike, sql } from 'drizzle-orm'

import { roles, userRoles, users } from '../../../../../../db/schema/auth.js'
import { organizations } from '../../../../../../db/schema/organizations.js'
import {
  staffInvitationRoles,
  staffInvitations,
} from '../../../../../../db/schema/staff-invitations.js'
import type { ListStaffInvitationsQuery } from '../../../../../contracts/generated/identity/staff-invitations.schemas.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import {
  queueSql,
  queueTime,
  withQueueSql,
  type WithQueueTime,
} from '../../../../../lib/queue-time.js'

export function createInvitationRepository(database: () => Database) {
  const org = sql`nullif(current_setting('app.organization_id',true),'')::uuid`
  const scope = () => eq(staffInvitations.organizationId, org)
  const run = <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work)
  const find = async (tx: Transaction, id: string, lock = false) => {
    const query = tx
      .select()
      .from(staffInvitations)
      .where(and(scope(), eq(staffInvitations.id, id)))
    return (await (lock ? query.for('update') : query))[0]
  }
  const selectedRoles = (tx: Transaction, id: string) =>
    tx
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        requestedId: staffInvitationRoles.id,
      })
      .from(staffInvitationRoles)
      .leftJoin(
        roles,
        and(eq(roles.id, staffInvitationRoles.roleId), eq(roles.organizationId, org)),
      )
      .where(
        and(
          eq(staffInvitationRoles.organizationId, org),
          eq(staffInvitationRoles.invitationId, id),
        ),
      )
  return {
    run,
    find,
    selectedRoles,
    lock: (tx: Transaction) => tx.execute(sql`select pg_advisory_xact_lock(73619001)`),
    organization: async (tx: Transaction) =>
      (await tx.select().from(organizations).where(eq(organizations.id, org)))[0],
    userByEmail: async (tx: Transaction, email: string) =>
      (
        await tx
          .select()
          .from(users)
          .where(and(eq(users.organizationId, org), eq(users.email, email)))
      )[0],
    inviter: async (tx: Transaction, id: string) =>
      (
        await tx
          .select()
          .from(users)
          .where(and(eq(users.organizationId, org), eq(users.id, id)))
      )[0],
    administrator: async (tx: Transaction) =>
      (
        await tx
          .select({ id: users.id })
          .from(users)
          .innerJoin(
            userRoles,
            and(eq(userRoles.userId, users.id), eq(userRoles.organizationId, org)),
          )
          .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.organizationId, org)))
          .where(
            and(
              eq(users.organizationId, org),
              eq(roles.key, 'admin'),
              sql`${users.deletedAt} is null and ${users.archivedAt} is null and ${users.disabledAt} is null`,
            ),
          )
          .limit(1)
      )[0],
    adminRole: async (tx: Transaction) =>
      (
        await tx
          .select()
          .from(roles)
          .where(and(eq(roles.organizationId, org), eq(roles.key, 'admin')))
      )[0],
    async list(tx: Transaction, query: ListStaffInvitationsQuery) {
      const expired = sql`${staffInvitations.status}='pending' and ${staffInvitations.expiresAt}<=now()`
      const where = and(
        scope(),
        query.q
          ? ilike(staffInvitations.email, `%${query.q.replace(/[\\%_]/g, '\\$&')}%`)
          : undefined,
        query.status === 'all'
          ? undefined
          : query.status === 'expired'
            ? expired
            : query.status === 'pending'
              ? sql`${staffInvitations.status}='pending' and (${staffInvitations.expiresAt} is null or ${staffInvitations.expiresAt}>now())`
              : eq(staffInvitations.status, query.status),
      )
      const [totals] = await tx.select({ total: count() }).from(staffInvitations).where(where)
      const column = {
        email: staffInvitations.email,
        createdAt: staffInvitations.createdAt,
        expiresAt: staffInvitations.expiresAt,
      }[query.sort]
      const items = await tx
        .select()
        .from(staffInvitations)
        .where(where)
        .orderBy(query.direction === 'asc' ? asc(column) : desc(column), asc(staffInvitations.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
      return { items, total: totals!.total, page: query.page, pageSize: query.pageSize }
    },
    async insert(
      tx: Transaction,
      input: { email: string; language: 'fr' | 'en'; invitedBy: string; roleIds: string[] },
    ) {
      const [row] = await tx
        .insert(staffInvitations)
        .values({ email: input.email, language: input.language, invitedBy: input.invitedBy })
        .returning()
      if (input.roleIds.length)
        await tx
          .insert(staffInvitationRoles)
          .values(input.roleIds.map((roleId) => ({ invitationId: row!.id, roleId })))
      return row!
    },
    async update(
      tx: Transaction,
      id: string,
      // Queue fields (availableAt, leaseExpiresAt) may be QueueTime: written with the database clock.
      values: WithQueueTime<Partial<typeof staffInvitations.$inferInsert>>,
    ) {
      return (
        await tx
          .update(staffInvitations)
          .set({ ...withQueueSql(values), updatedAt: new Date() })
          .where(and(scope(), eq(staffInvitations.id, id)))
          .returning()
      )[0]!
    },
    async requeue(tx: Transaction, id: string) {
      return (
        await tx
          .update(staffInvitations)
          .set({
            tokenHash: null,
            expiresAt: null,
            deliveryState: 'queued',
            attempts: 0,
            availableAt: sql`now()`,
            leaseId: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(and(scope(), eq(staffInvitations.id, id)))
          .returning()
      )[0]!
    },
    token: async (tx: Transaction, hash: string) =>
      (
        await tx
          .select()
          .from(staffInvitations)
          .where(and(scope(), eq(staffInvitations.tokenHash, hash)))
          .for('update')
      )[0],
    async claim(tx: Transaction) {
      return (
        await tx
          .select()
          .from(staffInvitations)
          .where(
            and(
              scope(),
              eq(staffInvitations.status, 'pending'),
              sql`(${staffInvitations.deliveryState}='queued' and ${staffInvitations.availableAt}<=now()) or (${staffInvitations.deliveryState}='sending' and ${staffInvitations.leaseExpiresAt}<now())`,
            ),
          )
          .orderBy(asc(staffInvitations.createdAt))
          .limit(1)
          .for('update', { skipLocked: true })
      )[0]
    },
    async finish(id: string, leaseId: string, success: boolean, attempts: number) {
      await database()
        .update(staffInvitations)
        .set({
          deliveryState: success ? 'sent' : attempts >= 5 ? 'failed' : 'queued',
          availableAt: queueSql(queueTime(undefined, 60000)),
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            scope(),
            eq(staffInvitations.id, id),
            eq(staffInvitations.leaseId, leaseId),
            eq(staffInvitations.deliveryState, 'sending'),
            eq(staffInvitations.status, 'pending'),
          ),
        )
    },
    async accept(
      tx: Transaction,
      invitation: typeof staffInvitations.$inferSelect,
      input: { firstName: string; lastName: string; passwordHash: string },
      roleIds: string[],
    ) {
      const [user] = await tx
        .insert(users)
        .values({
          email: invitation.email,
          ...input,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          emailVerifiedAt: new Date(),
        })
        .returning()
      if (roleIds.length)
        await tx.insert(userRoles).values(
          roleIds.map((roleId) => ({
            userId: user!.id,
            roleId,
            assignedByActorId: invitation.invitedBy,
          })),
        )
      await tx
        .update(staffInvitations)
        .set({
          status: 'accepted',
          acceptedUserId: user!.id,
          acceptedAt: new Date(),
          deliveryState: 'cancelled',
          leaseId: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(and(scope(), eq(staffInvitations.id, invitation.id)))
      return user!
    },
  }
}
