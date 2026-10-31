import { and, eq, inArray, sql } from 'drizzle-orm'

import { permissions, rolePermissions, roles, userRoles } from '../../../../../../db/schema/auth.js'
import type { CreateRole } from '../../../../../contracts/generated/identity/rbac.schemas.js'
import { actorPermissionKeys } from '../../../../../lib/actor-permissions.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { staffOrganizationScope } from '../../../../../lib/staff-organization-scope.js'

export function createRbacRepository(database: () => Database, organizationId?: string) {
  return {
    async reportingStaff(
      input: { id?: string; search?: string; limit: number; offset: number },
      tx: Database | Transaction = database(),
    ) {
      const scope = organizationId
        ? sql`${organizationId}::uuid`
        : sql`nullif(current_setting('app.organization_id',true),'')::uuid`
      const people = sql`with people as (
        select u.id,u.email,u.first_name as "firstName",u.last_name as "lastName",u.disabled_at as "disabledAt",u.archived_at as "archivedAt",u.must_change_password as "mustChangePassword",
          array(select distinct p.key from user_roles ur join role_permissions rp on rp.role_id=ur.role_id join permissions p on p.id=rp.permission_id where ur.user_id=u.id) as "permissionKeys"
        from users u where u.organization_id=${scope} and u.deleted_at is null
      )`
      const where = sql`where (${input.id ?? null}::uuid is null or id=${input.id ?? null}::uuid)
        and (${input.id ?? null}::uuid is not null or ("disabledAt" is null and "archivedAt" is null and not "mustChangePassword"))
        and (${input.search ?? null}::text is null or concat_ws(' ',"firstName","lastName",email) ilike ${`%${input.search ?? ''}%`})`
      const rows = await tx.execute(
        people.append(
          sql`select * from people ${where} order by email limit ${input.limit} offset ${input.offset}`,
        ),
      )
      // Count the same filtered projection independently (SQL builders are mutable).
      const all = await this.reportingStaffCount(input, tx, scope)
      return {
        items: rows as unknown as {
          id: string
          email: string
          firstName: string | null
          lastName: string | null
          disabledAt: Date | null
          archivedAt: Date | null
          mustChangePassword: boolean
          permissionKeys: string[]
        }[],
        total: all,
      }
    },
    async reportingStaffCount(
      input: { id?: string; search?: string },
      tx: Database | Transaction,
      scope: ReturnType<typeof sql>,
    ) {
      const [r] = await tx.execute(sql`select count(*)::int n from (
        select u.id,u.email,u.first_name,u.last_name,u.disabled_at,u.archived_at,u.must_change_password from users u where u.organization_id=${scope} and u.deleted_at is null
      ) x where (${input.id ?? null}::uuid is null or id=${input.id ?? null}::uuid) and (${input.id ?? null}::uuid is not null or (disabled_at is null and archived_at is null and not must_change_password)) and (${input.search ?? null}::text is null or concat_ws(' ',first_name,last_name,email) ilike ${`%${input.search ?? ''}%`})`)
      return Number(r?.n ?? 0)
    },
    listPermissions: () => database().select().from(permissions).orderBy(permissions.key),
    async listRoles() {
      const rows = await database()
        .select({ role: roles, permissionKey: permissions.key })
        .from(roles)
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(staffOrganizationScope(roles.organizationId, organizationId))
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
      return (await actorPermissionKeys(tx, userId, organizationId)).map((key) => ({ key }))
    },

    lock: (tx: Transaction) => tx.execute(sql`select pg_advisory_xact_lock(73619001)`),
    async roleUsers(roleId: string, tx: Transaction) {
      const rows = await tx
        .select({ id: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.roleId, roleId))
      return rows.map((row) => row.id)
    },
    async roleKeyExists(key: string, tx: Transaction) {
      const [role] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(eq(roles.key, key), staffOrganizationScope(roles.organizationId, organizationId)),
        )
        .limit(1)
      return Boolean(role)
    },
    async createRole(input: CreateRole & { key: string }, tx: Transaction) {
      const [role] = await tx
        .insert(roles)
        .values({ ...input, organizationId })
        .returning()
      return { ...role!, permissionKeys: [] as string[] }
    },
    async lockRole(roleId: string, tx: Transaction) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const [role] = await tx
        .select({ id: roles.id, key: roles.key, isSystem: roles.isSystem })
        .from(roles)
        .where(
          and(eq(roles.id, roleId), staffOrganizationScope(roles.organizationId, organizationId)),
        )
        .for('update')
      return role
    },
    async activeActor(userId: string, tx: Transaction) {
      return (await actorPermissionKeys(tx, userId, organizationId)).length > 0
    },

    rolePermissionKeys: (roleId: string, tx: Transaction) =>
      tx
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, roleId)),
    deleteRole: (roleId: string, tx: Transaction) =>
      tx
        .delete(roles)
        .where(
          and(eq(roles.id, roleId), staffOrganizationScope(roles.organizationId, organizationId)),
        ),
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
