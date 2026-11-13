import { type SQL, sql } from 'drizzle-orm'

import type {
  ReportFilters,
  ReportSection,
  ReportSectionKey,
} from '../../../../../contracts/generated/reporting/reporting.schemas.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { companyDate } from '../../../../../lib/validation.js'
import { enrichReportRows } from './reporting-details.js'
import { detailPredicate, supportingSource, visualProjection } from './reporting-visuals.js'

type Projection = {
  rows: ReportSection['rows']
  metrics: ReportSection['metrics']
  series: ReportSection['series']
  total: number
  visuals: ReportSection['visuals']
}
const emptyColumns = sql.raw(
  `null::text as net, null::text as vat, null::text as gross, null::text as quantity, null::text as "weightKg", 0::int as "unknownWeightCount"`,
)

/** The relation is reduced in SQL before JSON paging; line/payment relations never multiply one another. */
export function createReportingReadRepository(_database: () => Database) {
  function source(key: ReportSectionKey, f: ReportFilters, captureDate: string): SQL {
    const invoiceWhere = sql`i.status in ('issued','sent') ${f.currency ? sql`and i.currency=${f.currency}` : sql``} ${f.clientId ? sql`and i.client_id=${f.clientId}::uuid` : sql``}`
    const period = sql`i.issue_date >= ${f.from}::date and i.issue_date <= ${f.to}::date`
    const creditPeriod = sql`c.issue_date >= ${f.from}::date and c.issue_date <= ${f.to}::date`
    const lineWhere = sql`${f.productId ? sql`and l.product_id=${f.productId}::uuid` : sql``} ${f.categoryId ? sql`and p.category_id=${f.categoryId}::uuid` : sql``}`
    const invoiceOnly = sql`select i.id::text as id, coalesce(i.number,'') as label, i.currency, i.issue_date::text as date, i.status, i.subtotal::text as net, i.tax_total::text as vat, i.total::text as gross, i.total::text as amount, null::text as quantity, null::text as "weightKg", 0::int as "unknownWeightCount" from invoices i where ${invoiceWhere} and ${period}`
    // Credits are booked in the period of the credit note's OWN issue date (negative rows), never in the credited
    // invoice's period, so a closed period is not restated by a later credit note.
    const creditRows = sql`select c.id::text as id, c.number as label, c.currency, c.issue_date::text as date, 'credit_note' as status, (-c.subtotal)::text as net, (-c.tax_total)::text as vat, (-c.total)::text as gross, (-c.total)::text as amount, null::text as quantity, null::text as "weightKg", 0::int as "unknownWeightCount" from credit_notes c join invoices i on i.id=c.invoice_id where c.status='issued' and ${invoiceWhere} and ${creditPeriod}`
    const invoiceRows = sql`${invoiceOnly} union all ${creditRows}`
    const paymentWhere = sql`${invoiceWhere} and ${key === 'pending_cheques' ? sql`m.status='pending' and m.method='cheque'` : sql`m.status='confirmed' and m.collected_on >= ${f.from}::date and m.collected_on <= ${f.to}::date`}`
    const balances = sql`select i.id::text as id, coalesce(i.number,'') as label, i.currency, i.due_date::text as date, i.status, (i.total-invoice_credited_total(i.id)-coalesce(a.paid,0))::text as amount, ${emptyColumns} from invoices i left join lateral (select sum(amount) as paid from payments where invoice_id=i.id and status='confirmed') a on true where ${invoiceWhere} and i.total-invoice_credited_total(i.id)-coalesce(a.paid,0)>0 ${key === 'overdue' ? sql`and i.due_date < ${captureDate}::date` : sql``}`
    if (key === 'revenue') return invoiceRows
    if (key === 'vat') return invoiceRows
    if (key === 'outstanding' || key === 'overdue') return balances
    if (key === 'collections' || key === 'pending_cheques')
      return sql`select m.id::text as id, m.number as label, m.currency, coalesce(m.collected_on,m.payment_date)::text as date, m.status, m.amount::text as amount, ${emptyColumns} from payments m join invoices i on i.id=m.invoice_id where ${paymentWhere}`
    if (key === 'payment_methods')
      return sql`select m.method::text as id, m.method as label, m.currency, null::text as date, null::text as status, sum(m.amount)::text as amount, ${emptyColumns} from payments m join invoices i on i.id=m.invoice_id where ${paymentWhere} group by m.method,m.currency`
    if (key === 'summary')
      return sql`select null::text as id, 'invoiced' as label, currency, null::text as date, 'invoiced' as status, sum(net::numeric)::text as net, sum(vat::numeric)::text as vat, sum(gross::numeric)::text as gross, null::text as amount, null::text as quantity, null::text as "weightKg", 0::int as "unknownWeightCount" from (${invoiceRows}) revenue group by currency union all select null::text as id, 'collections' as label, m.currency, null::text as date, 'collections' as status, null::text as net,null::text as vat,null::text as gross,sum(m.amount)::text as amount,null::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount" from payments m join invoices i on i.id=m.invoice_id where ${paymentWhere} group by m.currency union all select null::text as id,'outstanding' as label,currency,null::text as date,'outstanding' as status,null::text as net,null::text as vat,null::text as gross,sum(amount::numeric)::text as amount,null::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount" from (${balances}) balance group by currency`
    if (key === 'sales_by_client') {
      const name = (alias: string) =>
        sql.raw(
          `coalesce(nullif(${alias}.client_snapshot->>'tradeName',''),nullif(${alias}.client_snapshot->>'legalName',''),nullif(concat_ws(' ',${alias}.client_snapshot->>'firstName',${alias}.client_snapshot->>'lastName'),''),'Client')`,
        )
      const movements = sql`select i.client_id, i.currency, ${name('i')} as client_name, i.issue_date, i.issued_at, i.id, i.subtotal as net, i.tax_total as vat, i.total as gross, 1 as invoices from invoices i where ${invoiceWhere} and ${period} union all select i.client_id, i.currency, ${name('i')}, c.issue_date, c.issued_at, c.id, -c.subtotal, -c.tax_total, -c.total, 0 from credit_notes c join invoices i on i.id=c.invoice_id where c.status='issued' and ${invoiceWhere} and ${creditPeriod}`
      return sql`select m.client_id::text as id, (array_agg(m.client_name order by m.issue_date desc,m.issued_at desc,m.id desc))[1] as label, m.currency, null::text as date, null::text as status, sum(m.net)::text as net,sum(m.vat)::text as vat,sum(m.gross)::text as gross,sum(m.gross)::text as amount,sum(m.invoices)::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount" from (${movements}) m group by m.client_id,m.currency`
    }
    if (key === 'sales_by_product' || key === 'sales_by_category') {
      const id =
        key === 'sales_by_product'
          ? sql`coalesce(l.product_id::text,'manual')`
          : sql`case when l.product_id is null then 'manual' else coalesce(p.category_id::text,'uncategorized') end`
      const label =
        key === 'sales_by_product'
          ? sql`case when l.product_id is null then 'Manual lines' else coalesce(p.name,l.product_name) end`
          : sql`case when l.product_id is null then 'Manual lines' else coalesce(c.name,'Uncategorized') end`
      return sql`select ${id} as id, ${label} as label, i.currency, null::text as date, null::text as status,sum(l.net_amount)::text as net,sum(l.tax_amount)::text as vat,sum(l.total_amount)::text as gross,sum(l.total_amount)::text as amount,sum(l.quantity)::text as quantity,(sum(l.quantity::numeric*l.package_weight_g)/1000)::text as "weightKg",count(*) filter(where l.package_weight_g is null)::int as "unknownWeightCount" from invoices i join invoice_lines l on l.invoice_id=i.id left join products p on p.id=l.product_id left join product_categories c on c.id=p.category_id where ${invoiceWhere} and ${period} ${lineWhere} group by ${id},${label},i.currency`
    }
    if (key === 'deliveries')
      return sql`select d.id::text as id,coalesce(d.number,'') as label,null::text as currency,d.delivery_date::text as date,d.status,null::text as net,null::text as vat,null::text as gross,null::text as amount,sum(l.quantity)::text as quantity,(sum(l.quantity::numeric*l.package_weight_g)/1000)::text as "weightKg",count(*) filter(where l.package_weight_g is null)::int as "unknownWeightCount" from delivery_notes d join delivery_note_lines l on l.delivery_note_id=d.id left join products p on p.id=l.product_id where d.status in ('delivered') and d.delivery_date >= ${f.from}::date and d.delivery_date <= ${f.to}::date ${f.clientId ? sql`and d.client_id=${f.clientId}::uuid` : sql``} ${lineWhere} group by d.id`
    const estimateWhere = sql`${f.currency ? sql`and e.currency=${f.currency}` : sql``} ${f.clientId ? sql`and e.client_id=${f.clientId}::uuid` : sql``}`
    return sql`select e.id::text as id,coalesce(e.number,'') as label,e.currency,event.happened::text as date,event.kind as status,null::text as net,null::text as vat,null::text as gross,null::text as amount, '1'::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount" from estimates e cross join lateral(values ('issued',e.issued_at),('accepted',e.accepted_at),('rejected',e.rejected_at),('expired',e.expired_at)) event(kind,happened) where event.happened>=${f.start}::timestamptz and event.happened<${f.endExclusive}::timestamptz ${estimateWhere} union all select e.id::text as id,coalesce(e.number,'') as label,e.currency,min(i.issue_date)::text as date,'converted_estimate' as status,null::text as net,null::text as vat,null::text as gross,null::text as amount,'1'::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount" from estimates e join invoices i on i.source_estimate_id=e.id where i.status in ('issued','sent') and i.issue_date>=${f.from}::date and i.issue_date<=${f.to}::date ${estimateWhere} group by e.id union all select i.id::text as id,coalesce(i.number,'') as label,i.currency,i.issue_date::text as date,'converted_invoice' as status,null::text as net,null::text as vat,null::text as gross,null::text as amount,'1'::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount" from invoices i join estimates e on e.id=i.source_estimate_id where i.status in ('issued','sent') and i.issue_date>=${f.from}::date and i.issue_date<=${f.to}::date ${estimateWhere}`
  }
  return {
    async capture(
      filters: ReportFilters,
      tx: Transaction,
      detailLimit?: number,
      captureDate = companyDate(new Date(), filters.timezone),
    ) {
      const sections: ReportSection[] = []
      let remaining = detailLimit
      for (const key of filters.sections) {
        const basis = ['outstanding', 'overdue', 'pending_cheques'].includes(key)
          ? 'capture'
          : key === 'estimates'
            ? 'lifecycle'
            : 'period'
        const order = sql.raw(
          {
            date_asc: 'date asc nulls last,label asc,id asc',
            date_desc: 'date desc nulls last,label asc,id asc',
            amount_asc: 'amount::numeric asc nulls last,label asc,id asc',
            amount_desc: 'amount::numeric desc nulls last,label asc,id asc',
            name_asc: 'label asc,id asc',
          }[filters.sort],
        )
        const metrics =
          key === 'summary'
            ? sql`select jsonb_build_object('key',case when status='invoiced' then 'invoiced_'||metric.key else status end,'currency',currency,'value',sum(metric.value::numeric)::text,'unit','money','timeBasis',case when status='outstanding' then 'capture' else 'period' end) as item from source cross join lateral(values ('net',net),('vat',vat),('gross',gross),('amount',amount)) metric(key,value) where metric.value is not null group by currency,status,metric.key`
            : key === 'estimates'
              ? sql`select jsonb_build_object('key',status||'_count','currency',currency,'value',count(*)::text,'unit','count','timeBasis','lifecycle') as item from source group by currency,status`
              : key === 'deliveries'
                ? sql`select jsonb_build_object('key','delivered_weight_kg','currency',null,'value',coalesce(sum("weightKg"::numeric),0)::text,'unit','kg','timeBasis','period') as item from source union all select jsonb_build_object('key','unknown_weight_count','currency',null,'value',coalesce(sum("unknownWeightCount"),0)::text,'unit','count','timeBasis','period') as item from source`
                : sql`select jsonb_build_object('key',metric.key,'currency',currency,'value',sum(metric.value::numeric)::text,'unit',case when metric.key='weightKg' then 'kg' when metric.key in ('quantity','unknown_weight_count') then 'count' else 'money' end,'timeBasis',${basis}::text) as item from source cross join lateral(values ('net',net),('vat',vat),('gross',gross),('amount',amount),('quantity',quantity),('weightKg',"weightKg"),('unknown_weight_count',case when ${key}::text in ('sales_by_product','sales_by_category') then "unknownWeightCount"::text else null end)) metric(key,value) where metric.value is not null group by currency,metric.key`
        const series =
          key === 'revenue' || key === 'collections'
            ? sql`select jsonb_build_object('date',to_char(bucket_date,'YYYY-MM-DD'),'currency',currency,'key',${key === 'revenue' ? 'gross' : 'amount'}::text,'value',value::text) as item from (select date_trunc(${filters.bucket},date::timestamp) as bucket_date,currency,sum(amount::numeric) as value from source where date is not null group by 1,2) grouped order by bucket_date,currency`
            : sql`select null::jsonb as item where false`
        const rows = await tx.execute(
          sql`with source as (${source(key, filters, captureDate)}), metric_items as (${metrics}), series_items as (${series}), visual_items as (${visualProjection(key, filters, captureDate)}), details as (${supportingSource(key, filters, detailLimit !== undefined) ?? sql`select * from source where ${detailPredicate(key, filters, captureDate)}`}), page as (select * from details order by ${order} limit ${remaining ?? filters.limit} offset ${detailLimit ? 0 : filters.offset}) select (select coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) from page) as rows,(select coalesce(jsonb_agg(item order by item->>'currency',item->>'key',item->>'date'),'[]'::jsonb) from metric_items) as metrics,(select coalesce(jsonb_agg(item order by item->>'currency',item->>'key',item->>'date'),'[]'::jsonb) from series_items) as series,(select coalesce(jsonb_agg(item order by item->>'group',item->>'currency',item->>'key'),'[]'::jsonb) from visual_items) as visuals,(select count(*)::int from details) as total`,
        )
        const projection = rows[0] as unknown as Projection
        projection.rows = await enrichReportRows(tx, key, projection.rows, filters, captureDate)
        if (remaining !== undefined) remaining = Math.max(0, remaining - projection.rows.length)
        if (key === 'estimates')
          projection.rows = projection.rows.map((row) => ({
            ...row,
            date:
              row.date && row.date.length > 10
                ? companyDate(new Date(row.date), filters.timezone)
                : row.date,
          }))
        sections.push({
          key,
          timeBasis: basis,
          ...projection,
          rows:
            filters.detailSection && filters.detailSection !== key && !detailLimit
              ? []
              : projection.rows,
          limit: detailLimit ?? filters.limit,
          offset: detailLimit ? 0 : filters.offset,
          coverage:
            key === 'estimates'
              ? 'Expiry coverage begins when recorded expiry transitions are enabled; validity-end dates are not historical expiry events.'
              : null,
        })
      }
      return {
        sections,
        currencies: [
          ...new Set(
            sections.flatMap((section) =>
              section.metrics
                .map((metric) => metric.currency)
                .filter((currency): currency is string => currency !== null),
            ),
          ),
        ].sort(),
      }
    },
  }
}
