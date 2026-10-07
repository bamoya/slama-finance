import { sql } from 'drizzle-orm'

import type {
  ReportFilters,
  ReportRow,
  ReportSectionKey,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import type { Transaction } from '../../../../lib/db.js'

/** One batched lookup per section, inside the caller's repeatable-read capture. */
export async function enrichReportRows(
  tx: Transaction,
  key: ReportSectionKey,
  rows: ReportRow[],
  filters: ReportFilters,
  captureDate: string,
) {
  const ids = rows
    .map((row) => row.id)
    .filter((id): id is string => !!id && /^[a-f0-9-]{36}$/.test(id))
  if (!ids.length) return rows
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const client = (alias: 'i' | 'e' | 'd') =>
    sql.raw(
      `coalesce(nullif(${alias}.client_snapshot->>'tradeName',''),nullif(${alias}.client_snapshot->>'legalName',''),nullif(concat_ws(' ',${alias}.client_snapshot->>'firstName',${alias}.client_snapshot->>'lastName'),''),'Client')`,
    )
  let details: Record<string, unknown>[] = []
  if (
    ['revenue', 'vat', 'outstanding', 'overdue'].includes(key) ||
    rows[0]?.resource === 'invoices'
  ) {
    details = await tx.execute(
      sql`select i.id::text as id, ${client('i')} as "clientName",i.due_date::text as "dueDate",i.total::text as gross,coalesce(p.paid,0)::text as collected,(i.total-coalesce(p.paid,0))::text as balance from invoices i left join lateral(select sum(amount) as paid from payments where invoice_id=i.id and status='confirmed') p on true where i.id in (${list})`,
    )
  } else if (['collections', 'pending_cheques', 'payment_methods'].includes(key)) {
    details = await tx.execute(
      sql`select m.id::text as id,${client('i')} as "clientName",i.number as "invoiceNumber",m.method,coalesce(m.cheque_number,m.reference) as reference from payments m join invoices i on i.id=m.invoice_id where m.id in (${list})`,
    )
  } else if (key === 'deliveries') {
    details = await tx.execute(
      sql`select d.id::text as id,${client('d')} as "clientName",i.number as "invoiceNumber" from delivery_notes d left join invoices i on i.id=d.invoice_id where d.id in (${list})`,
    )
  } else if (key === 'estimates') {
    details = await tx.execute(
      sql`select e.id::text as id,${client('e')} as "clientName",e.total::text as amount from estimates e where e.id in (${list}) union all select i.id::text as id,${client('i')} as "clientName",i.total::text as amount from invoices i where i.id in (${list})`,
    )
  }
  if (key === 'sales_by_client' && !rows[0]?.resource) {
    details = await tx.execute(
      sql`select i.client_id::text as id,i.currency,coalesce(sum(p.paid),0)::text as collected,sum(i.total-coalesce(p.paid,0))::text as balance from invoices i left join lateral(select sum(amount) as paid from payments where invoice_id=i.id and status='confirmed') p on true where i.client_id in (${list}) and i.status in ('issued','sent') and i.issue_date>=${filters.from}::date and i.issue_date<=${filters.to}::date group by i.client_id,i.currency`,
    )
  }
  const map = new Map(details.map((row) => [`${row.id}:${row.currency ?? ''}`, row]))
  return rows.map((row) => {
    const detail = map.get(
      `${row.id}:${key === 'sales_by_client' && !row.resource ? (row.currency ?? '') : ''}`,
    )
    if (!detail) return row
    if (!['outstanding', 'overdue', 'sales_by_client'].includes(key)) {
      const {
        gross: _gross,
        collected: _collected,
        balance: _balance,
        dueDate: _due,
        ...identity
      } = detail
      return { ...row, ...identity }
    }
    return {
      ...row,
      ...detail,
      ...(['outstanding', 'overdue'].includes(key) && row.date
        ? {
            daysOverdue: Math.max(
              0,
              Math.round((Date.parse(captureDate) - Date.parse(row.date)) / 86400000),
            ),
          }
        : {}),
    }
  })
}
