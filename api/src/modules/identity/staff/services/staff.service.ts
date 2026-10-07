import { randomBytes } from 'node:crypto'

import {
  type CreateStaff,
  CreateStaffSchema,
  type ListStaffQuery as StaffQuery,
  type UpdateStaff as StaffUpdate,
  UpdateStaffSchema,
} from '../../../../contracts/generated/identity/staff.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createPasswordService } from '../../auth/services/password.service.js'
import type { createStaffRepository } from '../repositories/staff.repository.js'

export function createStaffService(
  database: () => Database,
  repository: ReturnType<typeof createStaffRepository>,
  passwords: ReturnType<typeof createPasswordService>,
  onAuthorizationChange?: (tx: Transaction, userIds: string[]) => Promise<void>,
) {
  async function find(id: string, tx?: Transaction) {
    const user = await repository.find(id, tx)
    if (!user) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff account not found')
    return user
  }
  async function actor(actorId: string, tx: Transaction, permission: string) {
    const user = await find(actorId, tx)
    const grants = await repository.grants(actorId, tx)
    if (
      user.disabledAt ||
      user.archivedAt ||
      user.mustChangePassword ||
      !grants.includes(permission)
    )
      throw new AppError(403, 'FORBIDDEN', 'Forbidden')
    return {
      grants,
      admin: (await repository.rolesFor(actorId, tx)).some((role) => role.key === 'admin'),
    }
  }
  async function validateRoles(ids: string[], actorId: string, tx: Transaction) {
    const authority = await actor(actorId, tx, 'roles.update')
    const selected = await repository.selectedRoles(ids, tx)
    if (selected.length !== ids.length)
      throw new AppError(400, 'VALIDATION_ERROR', 'Unknown roles', {
        roleIds: ['One or more roles do not exist'],
      })
    if (!authority.admin) {
      const grants = await repository.selectedGrants(ids, tx)
      if (
        selected.some((role) => role.key === 'admin') ||
        grants.some((grant) => !authority.grants.includes(grant.key))
      )
        throw new AppError(403, 'FORBIDDEN', 'Cannot assign permissions you do not hold')
    }
    return selected
  }
  async function mutable(id: string, actorId: string, tx: Transaction, permission: string) {
    const authority = await actor(actorId, tx, permission)
    const user = await find(id, tx)
    if (user.archivedAt)
      throw new AppError(409, 'STAFF_ARCHIVED', 'Archived accounts cannot be changed')
    const isAdmin = (await repository.rolesFor(id, tx)).some((role) => role.key === 'admin')
    if (
      !authority.admin &&
      (await repository.grants(id, tx)).some((key) => !authority.grants.includes(key))
    )
      throw new AppError(
        403,
        'FORBIDDEN',
        'Cannot modify an account with privileges you do not hold',
      )
    if (isAdmin && !authority.admin)
      throw new AppError(403, 'FORBIDDEN', 'Only administrators can change administrator accounts')
    return { user, isAdmin }
  }
  async function preserveAdmin(id: string, tx: Transaction) {
    const admins = await repository.activeAdmins(tx)
    if (admins.length === 1 && admins[0]!.id === id)
      throw new AppError(409, 'LAST_ADMIN', 'At least one active administrator must remain')
  }
  return {
    list: (query: StaffQuery) => repository.list(query),
    async detail(id: string) {
      return {
        user: await find(id),
        roles: await repository.rolesFor(id),
        permissionKeys: await repository.grants(id),
      }
    },
    async create(input: CreateStaff, actorId: string) {
      input = CreateStaffSchema.parse({
        ...input,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
      })
      const temporaryPassword = randomBytes(24).toString('base64url')
      const passwordHash = await passwords.hash(temporaryPassword)
      const temporaryPasswordExpiresAt = new Date(Date.now() + 24 * 60 * 60_000)
      return database().transaction(async (tx) => {
        await repository.lock(tx)
        await actor(actorId, tx, 'staff.create')
        const ids = [...new Set(input.roleIds)]
        if (ids.length) await validateRoles(ids, actorId, tx)
        const user = await repository.create(
          {
            email: input.email.toLowerCase(),
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
            temporaryPasswordExpiresAt,
          },
          tx,
        )
        await repository.replaceRoles(user.id, ids, actorId, tx)
        return { user, temporaryPassword, temporaryPasswordExpiresAt }
      })
    },
    async reissueTemporary(id: string, actorId: string) {
      const temporaryPassword = randomBytes(24).toString('base64url')
      const passwordHash = await passwords.hash(temporaryPassword)
      const temporaryPasswordExpiresAt = new Date(Date.now() + 24 * 60 * 60_000)
      return database().transaction(async (tx) => {
        await repository.lock(tx)
        await mutable(id, actorId, tx, 'staff.update')
        await preserveAdmin(id, tx)
        await repository.setTemporary(id, passwordHash, temporaryPasswordExpiresAt, tx)
        await repository.revokeSessions(id, tx)
        await onAuthorizationChange?.(tx, [id])
        return { temporaryPassword, temporaryPasswordExpiresAt }
      })
    },
    update: (id: string, input: StaffUpdate, actorId: string) =>
      database().transaction(async (tx) => {
        await repository.lock(tx)
        await mutable(id, actorId, tx, 'staff.update')
        const result = await repository.update(
          id,
          UpdateStaffSchema.parse({
            ...input,
            ...(input.email ? { email: input.email.toLowerCase() } : {}),
            ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
            ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
          }),
          tx,
        )
        if (input.email) await onAuthorizationChange?.(tx, [id])
        return result
      }),
    replaceRoles: (id: string, roleIds: string[], actorId: string) =>
      database().transaction(async (tx) => {
        await repository.lock(tx)
        await mutable(id, actorId, tx, 'staff.update')
        const ids = [...new Set(roleIds)]
        const selected = await validateRoles(ids, actorId, tx)
        if (!selected.some((role) => role.key === 'admin')) await preserveAdmin(id, tx)
        await repository.replaceRoles(id, ids, actorId, tx)
        await onAuthorizationChange?.(tx, [id])
      }),
    setStatus: (id: string, action: 'disable' | 'enable' | 'archive', actorId: string) =>
      database().transaction(async (tx) => {
        await repository.lock(tx)
        const { user } = await mutable(id, actorId, tx, 'staff.update')
        if (action !== 'enable') await preserveAdmin(id, tx)
        const now = new Date()
        const result = await repository.update(
          id,
          action === 'archive'
            ? { archivedAt: now, disabledAt: user.disabledAt ?? now }
            : { disabledAt: action === 'disable' ? now : null },
          tx,
        )
        if (action !== 'enable') await repository.revokeSessions(id, tx)
        await onAuthorizationChange?.(tx, [id])
        return result
      }),
  }
}
