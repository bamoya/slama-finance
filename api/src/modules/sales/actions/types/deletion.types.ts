import type { EntityDeletionImpact } from '../../../../contracts/generated/shared/impact.schemas.js'
import type { Transaction } from '../../../../lib/db.js'

export interface SalesCatalogDeletionApi {
  preview(
    tx: Transaction,
    productIds: string[],
    actor: string,
  ): Promise<{
    fingerprint: string
    groups: EntityDeletionImpact['groups']
    requiredPermissions: string[]
  }>
  detach(tx: Transaction, productIds: string[], actor: string, fingerprint: string): Promise<void>
}
export interface SalesSettingsDeletionApi {
  preview(
    tx: Transaction,
    resource: 'bank_accounts' | 'templates',
    ids: string[],
    actor: string,
  ): Promise<{
    fingerprint: string
    groups: EntityDeletionImpact['groups']
    requiredPermissions: string[]
  }>
  detach(
    tx: Transaction,
    resource: 'bank_accounts' | 'templates',
    ids: string[],
    actor: string,
    fingerprint: string,
  ): Promise<void>
}
export interface SalesClientDeletionApi {
  preview(
    tx: Transaction,
    clientIds: string[],
    cascade: boolean,
    actor: string,
  ): Promise<{ fingerprint: string; impact: Omit<EntityDeletionImpact, 'token' | 'expiresAt'> }>
  apply(
    tx: Transaction,
    clientIds: string[],
    cascade: boolean,
    actor: string,
    fingerprint: string,
  ): Promise<{ objectKey: string; byteSize: number }[]>
  cleanup(files: { objectKey: string; byteSize: number }[]): Promise<unknown>
}
