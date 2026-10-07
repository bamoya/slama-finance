import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import {
  passwordResetTokens,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
  userSettings,
} from '../../../../../db/schema/auth.js'
import type {
  CreateStaff,
  ListStaffQuery as StaffQuery,
  UpdateStaff as StaffUpdate,
} from '../../../../contracts/generated/identity/staff.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'

export function createStaffRepository(database: () => Database) {
  return {
    async lock(tx: Transaction) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
    },
    async find(id: string, tx: Database | Transaction = database()) {
      const [user] = await tx.select().from(users).where(eq(users.id, id))
      return user
    },
    async list(query: StaffQuery) {
      const filter = and(
        query.roleId
          ? inArray(
              users.id,
              database()
                .select({ userId: userRoles.userId })
                .from(userRoles)
                .where(eq(userRoles.roleId, query.roleId)),
            )
          : undefined,
        query.status === 'current'
          ? isNull(users.archivedAt)
          : query.status === 'archived'
            ? isNotNull(users.archivedAt)
            : undefined,
        query.q
          ? or(
              ilike(users.email, `%${query.q}%`),
              ilike(users.firstName, `%${query.q}%`),
              ilike(users.lastName, `%${query.q}%`),
            )
          : undefined,
      )
      const order = query.direction === 'asc' ? asc : desc
      const items = await database()
        .select()
        .from(users)
        .where(filter)
        .orderBy(order(users[query.sort]), order(users.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
      const [result] = await database().select({ total: count() }).from(users).where(filter)
      return { items, total: result!.total, page: query.page, pageSize: query.pageSize }
    },
    async rolesFor(id: string, tx: Database | Transaction = database()) {
      return tx
        .select({ id: roles.id, key: roles.key, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, id))
    },
    async grants(id: string, tx: Database | Transaction = database()) {
      const rows = await tx
        .selectDistinct({ key: permissions.key })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(userRoles.userId, id))
      return rows.map((row) => row.key).sort()
    },
    async selectedRoles(ids: string[], tx: Transaction) {
      return ids.length ? tx.select().from(roles).where(inArray(roles.id, ids)) : []
    },
    async selectedGrants(ids: string[], tx: Transaction) {
      return ids.length
        ? tx
            .selectDistinct({ key: permissions.key })
            .from(rolePermissions)
            .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
            .where(inArray(rolePermissions.roleId, ids))
        : []
    },
    async activeAdmins(tx: Transaction) {
      return tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(roles.key, 'admin'),
            isNull(users.disabledAt),
            isNull(users.archivedAt),
            eq(users.mustChangePassword, false),
          ),
        )
    },
    async replaceRoles(id: string, ids: string[], actorId: string, tx: Transaction) {
      await tx.delete(userRoles).where(eq(userRoles.userId, id))
      if (ids.length)
        await tx
          .insert(userRoles)
          .values(ids.map((roleId) => ({ userId: id, roleId, assignedByUserId: actorId })))
    },
    async update(
      id: string,
      values: StaffUpdate & { disabledAt?: Date | null; archivedAt?: Date },
      tx: Transaction,
    ) {
      const [user] = await tx
        .update(users)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning()
      return user!
    },
    async revokeSessions(id: string, tx: Transaction) {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id))
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.userId, id))
    },
    async create(
      input: Omit<CreateStaff, 'roleIds'> & {
        passwordHash: string
        temporaryPasswordExpiresAt: Date
      },
      tx: Transaction,
    ) {
      const [user] = await tx.insert(users).values(input).returning()
      await tx.insert(userSettings).values({ userId: user!.id })
      return user!
    },
    async setTemporary(id: string, passwordHash: string, expiresAt: Date, tx: Transaction) {
      await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: expiresAt,
          temporaryPasswordConsumedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
    },
  }
}
