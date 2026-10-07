import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from '../../../../../db/schema/auth.js'
import type { CreateRole } from '../../../../contracts/generated/identity/rbac.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'

export function createRbacRepository(database: () => Database) {
  return {
    async reportingStaff(
      input: { id?: string; search?: string; limit: number; offset: number },
      tx: Database | Transaction = database(),
    ) {
      const where = and(
        input.id ? eq(users.id, input.id) : undefined,
        input.id
          ? undefined
          : sql`${users.disabledAt} is null and ${users.archivedAt} is null and not ${users.mustChangePassword}`,
        input.search
          ? sql`concat_ws(' ', ${users.firstName}, ${users.lastName}, ${users.email}) ilike ${`%${input.search}%`}`
          : undefined,
      )
      const rows = await tx
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          disabledAt: users.disabledAt,
          archivedAt: users.archivedAt,
          mustChangePassword: users.mustChangePassword,
        })
        .from(users)
        .where(where)
        .orderBy(users.email)
        .limit(input.limit)
        .offset(input.offset)
      const ids = rows.map((row) => row.id)
      const grants = ids.length
        ? await tx
            .select({ userId: userRoles.userId, key: permissions.key })
            .from(userRoles)
            .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
            .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
            .where(inArray(userRoles.userId, ids))
        : []
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .where(where)
      return {
        items: rows.map((row) => ({
          ...row,
          permissionKeys: [
            ...new Set(grants.filter((grant) => grant.userId === row.id).map((grant) => grant.key)),
          ],
        })),
        total: count?.total ?? 0,
      }
    },
    listPermissions: () => database().select().from(permissions).orderBy(permissions.key),
    async listRoles() {
      const rows = await database()
        .select({ role: roles, permissionKey: permissions.key })
        .from(roles)
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .orderBy(roles.name, permissions.key)
      const grouped = new Map<string, typeof roles.$inferSelect & { permissionKeys: string[] }>()
      for (const { role, permissionKey } of rows) {
        const entry = grouped.get(role.id) ?? { ...role, permissionKeys: [] }
        if (permissionKey) entry.permissionKeys.push(permissionKey)
        grouped.set(role.id, entry)
      }
      return [...grouped.values()]
    },
    async permissionsFor(userId: string, tx: Database | Transaction = database()) {
      return tx
        .select({ key: permissions.key })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(userRoles.userId, userId))
    },
    lock: (tx: Transaction) => tx.execute(sql`select pg_advisory_xact_lock(73619001)`),
    async roleUsers(roleId: string, tx: Transaction) {
      const rows = await tx
        .select({ id: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.roleId, roleId))
      return rows.map((row) => row.id)
    },
    async createRole(input: CreateRole, tx: Transaction) {
      const [role] = await tx.insert(roles).values(input).returning()
      return { ...role!, permissionKeys: [] as string[] }
    },
    async lockRole(roleId: string, tx: Transaction) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const [role] = await tx
        .select({ id: roles.id, key: roles.key, isSystem: roles.isSystem })
        .from(roles)
        .where(eq(roles.id, roleId))
        .for('update')
      return role
    },
    async activeActor(userId: string, tx: Transaction) {
      const [user] = await tx
        .select({
          disabledAt: users.disabledAt,
          archivedAt: users.archivedAt,
          mustChangePassword: users.mustChangePassword,
        })
        .from(users)
        .where(eq(users.id, userId))
      return !!user && !user.disabledAt && !user.archivedAt && !user.mustChangePassword
    },
    rolePermissionKeys: (roleId: string, tx: Transaction) =>
      tx
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, roleId)),
    deleteRole: (roleId: string, tx: Transaction) => tx.delete(roles).where(eq(roles.id, roleId)),
    async findPermissionsByKeys(keys: string[], tx: Transaction) {
      if (!keys.length) return []
      return tx
        .select({ id: permissions.id, key: permissions.key })
        .from(permissions)
        .where(inArray(permissions.key, keys))
    },
    async replacePermissions(roleId: string, ids: string[], tx: Transaction) {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
      if (ids.length)
        await tx
          .insert(rolePermissions)
          .values(ids.map((permissionId) => ({ roleId, permissionId })))
    },
  }
}
