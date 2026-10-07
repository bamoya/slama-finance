import type { CreateRole } from '../../../../contracts/generated/identity/rbac.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createSessionService } from '../../auth/services/session.service.js'
import type { createRbacRepository } from '../repositories/rbac.repository.js'

export function createRbacService(
  database: () => Database,
  repository: ReturnType<typeof createRbacRepository>,
  sessions: ReturnType<typeof createSessionService>,
  onAuthorizationChange?: (tx: Transaction, userIds: string[]) => Promise<void>,
) {
  const recipient = (
    row: Awaited<ReturnType<typeof repository.reportingStaff>>['items'][number],
  ) => {
    const required = ['reports.read']
    const reasons = [
      ...(row.disabledAt || row.archivedAt || row.mustChangePassword ? ['INACTIVE_STAFF'] : []),
      ...(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.email) ? ['INVALID_EMAIL'] : []),
      ...required
        .filter((key) => !row.permissionKeys.includes(key))
        .map((key) => `MISSING_PERMISSION:${key}`),
    ]
    return {
      id: row.id,
      name: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email,
      email: row.email,
      eligible: reasons.length === 0,
      reasons,
    }
  }
  return {
    async grants(userId: string, tx?: Transaction) {
      const result = await repository.reportingStaff({ id: userId, limit: 1, offset: 0 }, tx)
      const row = result.items[0]
      return row && !row.disabledAt && !row.archivedAt && !row.mustChangePassword
        ? row.permissionKeys
        : []
    },
    async reportingRecipient(userId: string, _sections: string[], tx?: Transaction) {
      const result = await repository.reportingStaff({ id: userId, limit: 1, offset: 0 }, tx)
      return result.items[0] ? recipient(result.items[0]) : null
    },
    async reportingRecipients(
      input: { sections: string[]; search?: string; limit: number; offset: number },
      tx?: Transaction,
    ) {
      const result = await repository.reportingStaff(input, tx)
      return {
        ...result,
        items: result.items.map((row) => recipient(row)),
        limit: input.limit,
        offset: input.offset,
      }
    },
    permissionKeys: async (userId: string) => [
      ...new Set((await repository.permissionsFor(userId)).map((item) => item.key)),
    ],
    listPermissions: repository.listPermissions,
    listRoles: repository.listRoles,
    createRole: (input: CreateRole, actorId: string) =>
      database().transaction(async (tx) => {
        await repository.lock(tx)
        const keys = (await repository.permissionsFor(actorId, tx)).map((item) => item.key)
        if (!(await repository.activeActor(actorId, tx)) || !keys.includes('roles.create'))
          throw new AppError(403, 'FORBIDDEN', 'Forbidden')
        return repository.createRole(input, tx)
      }),
    deleteRole: (roleId: string, actorId: string) =>
      database().transaction(async (tx) => {
        const role = await repository.lockRole(roleId, tx)
        if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found')
        if (role.isSystem || role.key === 'admin')
          throw new AppError(409, 'PROTECTED_ROLE', 'System roles cannot be deleted')
        const actorKeys = new Set(
          (await repository.permissionsFor(actorId, tx)).map((item) => item.key),
        )
        const targetKeys = await repository.rolePermissionKeys(roleId, tx)
        if (
          !(await repository.activeActor(actorId, tx)) ||
          !actorKeys.has('roles.delete') ||
          targetKeys.some((item) => !actorKeys.has(item.key))
        )
          throw new AppError(
            403,
            'FORBIDDEN',
            'Cannot delete a role with permissions you do not hold',
          )
        // Existing FK cascades delete assignment rows only; users remain intact.
        const affected = await repository.roleUsers(roleId, tx)
        await repository.deleteRole(roleId, tx)
        await onAuthorizationChange?.(tx, affected)
      }),
    async authorize(token: string | undefined, permission: string) {
      const user = await sessions.resolve(token)
      if (!user) return null
      const permissions = await repository.permissionsFor(user.id)
      return permissions.some((item) => item.key === permission) ? { userId: user.id } : null
    },
    replacePermissions: (roleId: string, keys: string[], actorId: string) =>
      database().transaction(async (tx) => {
        const role = await repository.lockRole(roleId, tx)
        if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found')
        if (role.isSystem || role.key === 'admin')
          throw new AppError(409, 'PROTECTED_ROLE', 'Administrator permissions cannot be changed')
        const uniqueKeys = [...new Set(keys)]
        const selected = await repository.findPermissionsByKeys(uniqueKeys, tx)
        const known = new Set(selected.map((permission) => permission.key))
        const unknown = uniqueKeys.filter((key) => !known.has(key))
        if (unknown.length)
          throw new AppError(400, 'VALIDATION_ERROR', 'Unknown permission keys', {
            permissionKeys: unknown.map((key) => `Unknown permission: ${key}`),
          })
        const actorKeys = new Set(
          (await repository.permissionsFor(actorId, tx)).map((permission) => permission.key),
        )
        const currentKeys = await repository.rolePermissionKeys(roleId, tx)
        if (
          !(await repository.activeActor(actorId, tx)) ||
          !actorKeys.has('roles.update') ||
          uniqueKeys.some((key) => !actorKeys.has(key)) ||
          currentKeys.some((item) => !actorKeys.has(item.key))
        )
          throw new AppError(403, 'FORBIDDEN', 'Cannot grant permissions you do not hold')
        await repository.replacePermissions(
          roleId,
          selected.map((permission) => permission.id),
          tx,
        )
        await onAuthorizationChange?.(tx, await repository.roleUsers(roleId, tx))
      }),
  }
}
