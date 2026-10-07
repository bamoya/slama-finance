import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../db/schema/auth.js'
import { clients } from '../../../../db/schema/clients.js'
import { auditEvents, companySettings } from '../../../../db/schema/settings.js'
import type { ListClientsQuery } from '../../../contracts/generated/clients/clients.schemas.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { companyDate } from '../../../lib/validation.js'

type ClientFields = Omit<
  typeof clients.$inferInsert,
  | 'id'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
  | 'createdByUserId'
  | 'updatedByUserId'
  | 'archivedAt'
>
type Filters = Omit<ListClientsQuery, 'page' | 'pageSize' | 'q'> & { q: string }
const displayNameSql = sql<string>`coalesce(${clients.legalName}, concat_ws(' ', ${clients.firstName}, ${clients.lastName}))`
const financeSql = (kind: 'invoiced' | 'outstanding') =>
  kind === 'invoiced'
    ? sql<number>`coalesce((select sum(i.total) from invoices i where i.client_id = clients.id and i.status in ('issued','sent') and i.currency = (select currency from company_settings where id = 1)),0)`
    : sql<number>`coalesce((select sum(greatest(i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id and p.status = 'confirmed'),0),0)) from invoices i where i.client_id = clients.id and i.status in ('issued','sent') and i.currency = (select currency from company_settings where id = 1)),0)`
const lastActivitySql = sql<Date | null>`(select max(activity_at) from (select max(e.created_at) as activity_at from estimates e where e.client_id = clients.id union all select max(d.created_at) from delivery_notes d where d.client_id = clients.id union all select max(i.created_at) from invoices i where i.client_id = clients.id union all select max(p.created_at) from payments p join invoices i on p.invoice_id = i.id where i.client_id = clients.id) activities)`

export function createClientRepository(database: () => Database) {
  return {
    async financialCurrency() {
      const result = await database().execute(
        sql`select currency from company_settings where id = 1`,
      )
      return (result[0]?.currency as string | undefined) ?? 'MAD'
    },
    async hasPermission(actor: string, permission: string) {
      const [row] = await database()
        .select({ id: permissions.id })
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
      return Boolean(row)
    },
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async authorize(tx: Transaction, actor: string, permission: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const [grant] = await tx
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
      if (!grant) throw new AppError(403, 'FORBIDDEN', 'Your permissions have changed.')
    },
    async list(filters: Filters) {
      const [company] = await database()
        .select({ timezone: companySettings.timezone })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      const todaySql = sql`${companyDate(new Date(), company?.timezone)}::date`
      const term = filters.q.replace(/[\\%_]/g, '\\$&')
      const where = and(
        filters.type === 'all' ? undefined : eq(clients.type, filters.type),
        filters.status === 'active'
          ? isNull(clients.archivedAt)
          : filters.status === 'archived'
            ? isNotNull(clients.archivedAt)
            : undefined,
        filters.city
          ? ilike(clients.city, `%${filters.city.trim().replace(/[\\%_]/g, '\\$&')}%`)
          : undefined,
        filters.balanceMin
          ? sql`${financeSql('outstanding')} >= ${filters.balanceMin}::numeric`
          : undefined,
        filters.balanceMax
          ? sql`${financeSql('outstanding')} <= ${filters.balanceMax}::numeric`
          : undefined,
        filters.overdueOnly
          ? sql`exists (select 1 from invoices i where i.client_id = clients.id and i.status in ('issued','sent') and i.currency = (select currency from company_settings where id = 1) and i.due_date < ${todaySql} and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id and p.status = 'confirmed'),0))`
          : undefined,
        filters.lastActivityFrom
          ? sql`${lastActivitySql} >= ${filters.lastActivityFrom}::date`
          : undefined,
        filters.lastActivityTo
          ? sql`${lastActivitySql} < (${filters.lastActivityTo}::date + interval '1 day')`
          : undefined,
        term
          ? or(
              ilike(clients.firstName, `%${term}%`),
              ilike(clients.lastName, `%${term}%`),
              ilike(clients.legalName, `%${term}%`),
              ilike(clients.tradeName, `%${term}%`),
              ilike(clients.contactName, `%${term}%`),
              ilike(clients.ice, `%${term}%`),
              ilike(clients.taxIdentifier, `%${term}%`),
              ilike(clients.registrationNumber, `%${term}%`),
              ilike(clients.professionalTaxNumber, `%${term}%`),
              ilike(clients.email, `%${term}%`),
            )
          : undefined,
      )
      const sortColumns = {
        displayName: displayNameSql,
        createdAt: clients.createdAt,
        invoiced: financeSql('invoiced'),
        outstanding: financeSql('outstanding'),
        lastActivity: lastActivitySql,
      }
      const sort = sortColumns[filters.sortBy ?? 'displayName']
      const direction = filters.sortOrder === 'desc' ? desc : asc
      const [items, count] = await Promise.all([
        database()
          .select()
          .from(clients)
          .where(where)
          .orderBy(direction(sort), direction(clients.id))
          .limit(filters.limit)
          .offset(filters.offset),
        database()
          .select({ total: sql<number>`count(*)::int` })
          .from(clients)
          .where(where),
      ])
      return { items, total: count[0]?.total ?? 0, limit: filters.limit, offset: filters.offset }
    },
    async financialSummaries(clientIds: string[]) {
      if (!clientIds.length)
        return new Map<
          string,
          {
            currencies: {
              currency: string
              invoicedAmount: string
              receivedAmount: string
              outstandingAmount: string
              overdueAmount: string
            }[]
          }
        >()
      const [company] = await database()
        .select({ timezone: companySettings.timezone })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      const todaySql = sql`${companyDate(new Date(), company?.timezone)}::date`
      const result = await database().execute(sql`
        select i.client_id as "clientId", i.currency,
          sum(i.total)::text as "invoicedAmount",
          sum(coalesce(p.paid,0))::text as "receivedAmount",
          sum(greatest(i.total-coalesce(p.paid,0),0))::text as "outstandingAmount",
          sum(case when i.due_date < ${todaySql} then greatest(i.total-coalesce(p.paid,0),0) else 0 end)::text as "overdueAmount"
        from invoices i
        left join lateral (select sum(amount) paid from payments where invoice_id = i.id and status = 'confirmed') p on true
        where i.client_id in (${sql.join(
          clientIds.map((id) => sql`${id}`),
          sql`, `,
        )}) and i.status in ('issued','sent')
        group by i.client_id, i.currency order by i.currency
      `)
      type CurrencySummary = {
        currency: string
        invoicedAmount: string
        receivedAmount: string
        outstandingAmount: string
        overdueAmount: string
      }
      const summaries = new Map<string, { currencies: CurrencySummary[] }>()
      for (const id of clientIds) summaries.set(id, { currencies: [] })
      for (const { clientId, ...amounts } of result as unknown as ({
        clientId: string
      } & CurrencySummary)[])
        summaries.get(clientId)?.currencies.push(amounts)
      return summaries
    },
    async lastActivityDates(clientIds: string[]) {
      const dates = new Map<string, string | null>()
      if (!clientIds.length) return dates
      const rows = await database()
        .select({ id: clients.id, date: lastActivitySql })
        .from(clients)
        .where(
          sql`${clients.id} in (${sql.join(
            clientIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
      for (const row of rows) dates.set(row.id, row.date ? new Date(row.date).toISOString() : null)
      return dates
    },
    async recentActivity(
      clientId: string,
      permissions: {
        estimates: boolean
        deliveries: boolean
        invoices: boolean
        payments: boolean
      },
    ) {
      const queries = []
      if (permissions.estimates)
        queries.push(
          sql`select id, 'estimate' as type, number, status, created_at as date, total::text as amount, currency from estimates where client_id = ${clientId}`,
        )
      if (permissions.deliveries)
        queries.push(
          sql`select id, 'delivery_note' as type, number, status, created_at as date, null::text as amount, null::text as currency from delivery_notes where client_id = ${clientId}`,
        )
      if (permissions.invoices)
        queries.push(
          sql`select id, 'invoice' as type, number, status, created_at as date, total::text as amount, currency from invoices where client_id = ${clientId}`,
        )
      if (permissions.payments && permissions.invoices)
        queries.push(
          sql`select p.id, 'payment' as type, p.number, p.status, p.created_at as date, p.amount::text as amount, i.currency from payments p join invoices i on p.invoice_id = i.id where i.client_id = ${clientId}`,
        )
      if (!queries.length) return []
      const result = await database().execute(
        sql`select * from (${sql.join(queries, sql` union all `)}) activity order by date desc, id desc limit 10`,
      )
      return result as unknown as {
        id: string
        type: 'estimate' | 'delivery_note' | 'invoice' | 'payment'
        number: string | null
        status: string
        date: Date
        amount: string | null
        currency: string | null
      }[]
    },
    async one(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(clients).where(eq(clients.id, id))
      if (!row) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found.')
      return row
    },
    async insert(data: ClientFields, actor: string, tx: Transaction) {
      const [row] = await tx
        .insert(clients)
        .values({ ...data, createdByUserId: actor, updatedByUserId: actor })
        .returning()
      return row!
    },
    async update(
      id: string,
      data: ClientFields | { archivedAt: Date | null },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(clients)
        .set({
          ...data,
          version: sql`${clients.version} + 1`,
          updatedAt: new Date(),
          updatedByUserId: actor,
        })
        .where(eq(clients.id, id))
        .returning()
      return row!
    },
    delete: (id: string, tx: Transaction) => tx.delete(clients).where(eq(clients.id, id)),
    audit(
      tx: Transaction,
      actor: string,
      id: string,
      action: string,
      before: { type: string; version: number; archivedAt: Date | null } | null,
      after: { type: string; version: number; archivedAt: Date | null },
    ) {
      return tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        entityTable: 'clients',
        entityKey: { id },
        action,
        beforeValues: before
          ? { type: before.type, version: before.version, archived: !!before.archivedAt }
          : null,
        afterValues: { type: after.type, version: after.version, archived: !!after.archivedAt },
      })
    },
  }
}
