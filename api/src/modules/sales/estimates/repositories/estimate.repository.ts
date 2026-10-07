import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../../db/schema/auth.js'
import { products, productVariants } from '../../../../../db/schema/catalog.js'
import { clients } from '../../../../../db/schema/clients.js'
import { estimateLines, estimates } from '../../../../../db/schema/estimates.js'
import {
  auditEvents,
  companySettings,
  documentTemplates,
} from '../../../../../db/schema/settings.js'
import type { ListEstimatesQuery } from '../../../../contracts/generated/sales/estimates.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

export type EstimateRow = typeof estimates.$inferSelect
export type EstimateLineRow = typeof estimateLines.$inferSelect
type ListFilters = Omit<ListEstimatesQuery, 'page' | 'pageSize'>
const clientNameSql = sql<string>`coalesce(${clients.legalName}, concat_ws(' ', ${clients.firstName}, ${clients.lastName}))`

export function createEstimateRepository(database: () => Database) {
  return {
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async authorize(tx: Transaction, actor: string, permission: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const [row] = await tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
          and(
            eq(users.id, actor),
            isNull(users.disabledAt),
            isNull(users.archivedAt),
            eq(users.mustChangePassword, false),
            eq(permissions.key, permission),
          ),
        )
        .limit(1)
      if (!row) throw new AppError(403, 'FORBIDDEN', 'Your permissions have changed.')
    },
    async one(id: string, tx: Database | Transaction = database(), lock = false) {
      const query = tx.select().from(estimates).where(eq(estimates.id, id))
      const [row] = lock ? await query.for('update') : await query
      if (!row) throw new AppError(404, 'ESTIMATE_NOT_FOUND', 'Estimate not found.')
      return row
    },
    lines(id: string, tx: Database | Transaction = database()) {
      return tx
        .select()
        .from(estimateLines)
        .where(eq(estimateLines.estimateId, id))
        .orderBy(estimateLines.position)
    },
    async revision(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(estimates).where(eq(estimates.revisionOfId, id))
      return row ?? null
    },
    async clientDisplayName(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select({ name: clientNameSql }).from(clients).where(eq(clients.id, id))
      return row?.name ?? ''
    },
    async client(id: string, tx: Transaction) {
      const [row] = await tx.select().from(clients).where(eq(clients.id, id))
      if (!row || row.archivedAt)
        throw new AppError(400, 'INVALID_CLIENT', 'Select an active client.')
      return row
    },
    async company(tx: Transaction) {
      const [row] = await tx.select().from(companySettings).where(eq(companySettings.id, 1))
      if (!row?.legalName || !row.addressLine1 || !row.city)
        throw new AppError(
          409,
          'COMPANY_INCOMPLETE',
          'Complete company identity before creating documents.',
        )
      return row
    },
    async template(id: string | null, tx: Transaction) {
      if (!id) return null
      const [row] = await tx.select().from(documentTemplates).where(eq(documentTemplates.id, id))
      if (!row || row.archivedAt)
        throw new AppError(400, 'INVALID_TEMPLATE', 'Select an active template.')
      return row
    },
    async variant(id: string, tx: Transaction) {
      const [row] = await tx
        .select({ variant: productVariants, product: products })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(productVariants.id, id))
      if (!row || row.variant.archivedAt || row.product.archivedAt)
        throw new AppError(400, 'INVALID_VARIANT', 'Select an active product variant.')
      return row
    },
    insert(data: typeof estimates.$inferInsert, tx: Transaction) {
      return tx
        .insert(estimates)
        .values(data)
        .returning()
        .then((rows) => rows[0]!)
    },
    update(
      id: string,
      data: Partial<typeof estimates.$inferInsert>,
      tx: Transaction,
      printable = false,
    ) {
      return tx
        .update(estimates)
        .set({
          ...data,
          version: sql`${estimates.version} + 1`,
          ...(printable ? { contentVersion: sql`${estimates.contentVersion} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(estimates.id, id))
        .returning()
        .then((rows) => rows[0]!)
    },
    async replaceLines(id: string, lines: (typeof estimateLines.$inferInsert)[], tx: Transaction) {
      await tx.delete(estimateLines).where(eq(estimateLines.estimateId, id))
      if (lines.length) await tx.insert(estimateLines).values(lines)
    },
    delete(id: string, tx: Transaction) {
      return tx.delete(estimates).where(eq(estimates.id, id))
    },
    async list(filters: ListFilters) {
      const term = filters.search?.trim().replace(/[\\%_]/g, '\\$&')
      const where = and(
        filters.status === 'all' ? undefined : eq(estimates.status, filters.status),
        filters.clientId ? eq(estimates.clientId, filters.clientId) : undefined,
        term
          ? or(
              ilike(estimates.number, `%${term}%`),
              ilike(clientNameSql, `%${term}%`),
              ilike(clients.tradeName, `%${term}%`),
              ilike(clients.ice, `%${term}%`),
              ilike(clients.taxIdentifier, `%${term}%`),
              ilike(clients.registrationNumber, `%${term}%`),
            )
          : undefined,
        filters.dateFrom ? gte(estimates.issueDate, filters.dateFrom) : undefined,
        filters.dateTo ? lte(estimates.issueDate, filters.dateTo) : undefined,
        filters.amountMin ? gte(estimates.total, filters.amountMin) : undefined,
        filters.amountMax ? lte(estimates.total, filters.amountMax) : undefined,
      )
      const sortColumns = {
        createdAt: estimates.createdAt,
        issueDate: estimates.issueDate,
        validUntil: estimates.validUntil,
        number: estimates.number,
        clientName: clientNameSql,
        total: estimates.total,
      }
      const sort = sortColumns[filters.sortBy ?? 'createdAt']
      const direction = filters.sortOrder === 'asc' ? asc : desc
      const [items, count] = await Promise.all([
        database()
          .select()
          .from(estimates)
          .innerJoin(clients, eq(estimates.clientId, clients.id))
          .where(where)
          .orderBy(direction(sort), direction(estimates.id))
          .limit(filters.limit)
          .offset(filters.offset)
          .then((rows) => rows.map((row) => row.estimates)),
        database()
          .select({ total: sql<number>`count(*)::int` })
          .from(estimates)
          .innerJoin(clients, eq(estimates.clientId, clients.id))
          .where(where),
      ])
      return { items, total: count[0]?.total ?? 0 }
    },
    audit(
      tx: Transaction,
      actor: string,
      action: string,
      id: string,
      before: unknown,
      after: unknown,
    ) {
      return tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        action,
        entityTable: 'estimates',
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
