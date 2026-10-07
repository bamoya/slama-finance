import type { Permission, Role } from '../../../../contracts/generated/identity/rbac.schemas.js'

type StoredDates<T> = Omit<T, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date }
export function toRole(role: StoredDates<Role>): Role {
  return {
    permissionKeys: role.permissionKeys,
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  }
}
export function toPermission(permission: StoredDates<Permission>): Permission {
  return {
    id: permission.id,
    key: permission.key,
    description: permission.description,
    createdAt: permission.createdAt.toISOString(),
    updatedAt: permission.updatedAt.toISOString(),
  }
}
