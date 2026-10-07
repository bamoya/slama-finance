import { eq, sql } from 'drizzle-orm'

import { productCategories, products, productVariants } from '../../../../db/schema/catalog.js'
import { companySettings } from '../../../../db/schema/settings.js'
import type { Database } from '../../../lib/db.js'

export type InsightPeriod = {
  currency: string
  dateFrom?: string
  dateTo?: string
}

export type AggregateRow = {
  id: string
  units: string
  weight: string
  revenue: string
  invoiceCount: string
}

export type RecentInvoiceRow = {
  id: string
  number: string
  issueDate: string
  status: 'issued' | 'sent'
  units: string
  weight: string
  revenue: string
}

export function createCatalogInsightsRepository(database: () => Database) {
  const periodWhere = (period: InsightPeriod) => sql`
    i.status in ('issued', 'sent')
    and i.currency = ${period.currency}
    and il.product_id is not null
    and il.product_variant_id is not null
    ${period.dateFrom ? sql`and i.issue_date >= ${period.dateFrom}` : sql``}
    ${period.dateTo ? sql`and i.issue_date <= ${period.dateTo}` : sql``}
  `
  return {
    async catalog() {
      const [categoryRows, productRows, variantRows, settingsRows] = await Promise.all([
        database().select().from(productCategories),
        database().select().from(products),
        database().select().from(productVariants),
        database()
          .select({ currency: companySettings.currency, timezone: companySettings.timezone })
          .from(companySettings)
          .limit(1),
      ])
      return {
        categories: categoryRows,
        products: productRows,
        variants: variantRows,
        companyCurrency: settingsRows[0]?.currency ?? 'MAD',
        companyTimezone: settingsRows[0]?.timezone ?? 'Africa/Casablanca',
      }
    },
    async can(actor: string, permission: string) {
      const rows = await database().execute(sql`
        select 1 from users u
        join user_roles ur on ur.user_id = u.id
        join role_permissions rp on rp.role_id = ur.role_id
        join permissions p on p.id = rp.permission_id
        where u.id = ${actor} and u.disabled_at is null and u.archived_at is null
          and u.must_change_password = false and p.key = ${permission}
        limit 1
      `)
      return rows.length > 0
    },
    async aggregates(group: 'product' | 'variant' | 'category', period: InsightPeriod) {
      const column =
        group === 'product'
          ? sql`il.product_id`
          : group === 'variant'
            ? sql`il.product_variant_id`
            : sql`p.category_id`
      const rows = await database().execute(sql`
        select ${column}::text as id,
          coalesce(sum(il.quantity), 0)::text as units,
          coalesce(sum(il.quantity::numeric * coalesce(il.package_weight_g, 0)), 0)::text as weight,
          coalesce(sum(il.net_amount), 0)::text as revenue,
          count(distinct i.id)::text as "invoiceCount"
        from invoice_lines il
        join invoices i on i.id = il.invoice_id
        join products p on p.id = il.product_id
        where ${periodWhere(period)} and ${column} is not null
        group by ${column}
      `)
      return rows as unknown as AggregateRow[]
    },
    async aggregateForProductIds(ids: string[], period: InsightPeriod) {
      if (!ids.length) return { units: '0', weight: '0', revenue: '0', invoiceCount: '0' }
      const [row] = await database().execute(sql`
        select coalesce(sum(il.quantity), 0)::text as units,
          coalesce(sum(il.quantity::numeric * coalesce(il.package_weight_g, 0)), 0)::text as weight,
          coalesce(sum(il.net_amount), 0)::text as revenue,
          count(distinct i.id)::text as "invoiceCount"
        from invoice_lines il join invoices i on i.id = il.invoice_id
        where ${periodWhere(period)} and il.product_id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `)
      return row as { units: string; weight: string; revenue: string; invoiceCount: string }
    },
    async recentInvoices(productId: string, period: InsightPeriod, limit: number, offset: number) {
      const [count] = await database().execute(sql`
        select count(distinct i.id)::text as total
        from invoice_lines il join invoices i on i.id = il.invoice_id
        where ${periodWhere(period)} and il.product_id = ${productId}
      `)
      const rows = await database().execute(sql`
        select i.id::text as id, i.number, i.issue_date::text as "issueDate", i.status,
          sum(il.quantity)::text as units,
          sum(il.quantity::numeric * coalesce(il.package_weight_g, 0))::text as weight,
          sum(il.net_amount)::text as revenue
        from invoice_lines il join invoices i on i.id = il.invoice_id
        where ${periodWhere(period)} and il.product_id = ${productId}
        group by i.id
        order by i.issue_date desc, i.id desc
        limit ${limit} offset ${offset}
      `)
      return { total: Number(count?.total ?? 0), rows: rows as unknown as RecentInvoiceRow[] }
    },
    async category(id: string) {
      const [row] = await database()
        .select()
        .from(productCategories)
        .where(eq(productCategories.id, id))
      return row
    },
    async product(id: string) {
      const [row] = await database().select().from(products).where(eq(products.id, id))
      return row
    },
  }
}
