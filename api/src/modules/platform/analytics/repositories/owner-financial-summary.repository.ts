import { and, eq, sql } from 'drizzle-orm'

import { organizations } from '../../../../../db/schema/organizations.js'
import type { Database } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

/** Approved read-only shared-schema exception. Never imports organization repositories. */
export function createOwnerFinancialSummaryRepository(database: () => Database) {
  return {
    async read(ownerId: string, start: string, end: string, organizationId?: string) {
      return database().transaction(
        async (tx) => {
          await tx.execute(
            sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${ownerId},true),set_config('app.organization_id','',true)`,
          )
          const owned = await tx
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(
              and(
                eq(organizations.ownerId, ownerId),
                organizationId ? eq(organizations.id, organizationId) : undefined,
              ),
            )
          if (organizationId && !owned.length)
            throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.')
          const result = []
          for (const organization of owned) {
            await tx.execute(sql`select set_config('app.organization_id',${organization.id},true)`)
            const eligible = sql`with eligible as(select i.* from invoices i join organizations o on o.id=i.organization_id where i.organization_id=${organization.id}::uuid and o.owner_id=${ownerId}::uuid and i.status in ('issued','sent') and i.currency='MAD'), paid as(select p.invoice_id,sum(p.amount) amount from payments p join eligible i on i.id=p.invoice_id where p.organization_id=${organization.id}::uuid and p.status='confirmed' group by p.invoice_id), balances as(select i.*,greatest(0,i.total-coalesce(p.amount,0)) balance from eligible i left join paid p on p.invoice_id=i.id)`
            const [totals] = await tx.execute<{
              revenue: string
              collected: string
              outstanding: string
              overdue: string
            }>(
              sql`${eligible} select coalesce(sum(total) filter(where issue_date between ${start}::date and ${end}::date),0)::numeric(24,2)::text revenue,(select coalesce(sum(p.amount),0)::numeric(24,2)::text from payments p join eligible i on i.id=p.invoice_id where p.organization_id=${organization.id}::uuid and p.status='confirmed' and p.collected_on between ${start}::date and ${end}::date) collected,coalesce(sum(balance),0)::numeric(24,2)::text outstanding,coalesce(sum(balance) filter(where due_date<(current_timestamp at time zone 'Africa/Casablanca')::date),0)::numeric(24,2)::text overdue from balances`,
            )
            const series = await tx.execute<{ date: string; revenue: string; collected: string }>(
              sql`${eligible} select date::text,sum(revenue)::numeric(24,2)::text revenue,sum(collected)::numeric(24,2)::text collected from(select issue_date date,total revenue,0::numeric collected from eligible where issue_date between ${start}::date and ${end}::date union all select p.collected_on,0::numeric,p.amount from payments p join eligible i on i.id=p.invoice_id where p.organization_id=${organization.id}::uuid and p.status='confirmed' and p.collected_on between ${start}::date and ${end}::date) figures group by date order by date`,
            )
            result.push({ ...organization, totals: totals!, series: [...series] })
          }
          return result
        },
        { accessMode: 'read only', isolationLevel: 'repeatable read' },
      )
    },
  }
}
