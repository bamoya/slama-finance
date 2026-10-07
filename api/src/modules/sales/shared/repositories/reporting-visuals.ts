import { type SQL, sql } from 'drizzle-orm'

import type {
  ReportFilters,
  ReportSectionKey,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'

/** All projections use the complete source CTE, never its paginated detail rows. */
export function visualProjection(
  key: ReportSectionKey,
  f: ReportFilters,
  captureDate: string,
): SQL {
  const point = (group: string, expression: SQL, value: SQL, unit = 'money', label = expression) =>
    sql`jsonb_build_object('group',${group}::text,'key',${expression},'label',${label},'currency',currency,'value',(${value})::text,'unit',${unit}::text)`
  if (key === 'outstanding' || key === 'overdue') {
    const bucket = sql`case when date::date >= ${captureDate}::date then 'current' when ${captureDate}::date-date::date <=30 then '1_30' when ${captureDate}::date-date::date <=60 then '31_60' else '61_plus' end`
    return sql`select ${point('aging', sql`age_bucket`, sql`sum(amount::numeric)`)} as item from (select *,${bucket} as age_bucket from source) aged group by currency,age_bucket`
  }
  if (key === 'payment_methods')
    return sql`select ${point('methods', sql`id`, sql`amount::numeric`, 'money', sql`label`)} as item from source`
  if (['sales_by_client', 'sales_by_product', 'sales_by_category'].includes(key)) {
    const salesValue = key === 'sales_by_category' ? sql`net::numeric` : sql`amount::numeric`
    const ranking = sql`select ${point('ranking', sql`case when (rank<=10 or id in ('manual','uncategorized')) then id else 'other' end`, sql`sum(${salesValue})`, 'money', sql`case when (rank<=10 or id in ('manual','uncategorized')) then label else 'Other' end`)} as item from (select *,row_number() over(partition by currency order by ${salesValue} desc,id) as rank from source) ranked group by currency,case when (rank<=10 or id in ('manual','uncategorized')) then id else 'other' end,case when (rank<=10 or id in ('manual','uncategorized')) then label else 'Other' end`
    if (key === 'sales_by_product') {
      const variants = sql`select coalesce(l.product_variant_id::text,'manual') as id,case when l.product_variant_id is null then 'Manual lines' else (array_agg(l.product_name order by i.issue_date desc,i.id desc))[1] || case when max(l.package_weight_g) is null then '' else ' · '||max(l.package_weight_g)::text||' g' end end as label,i.currency,sum(l.quantity) as units from invoice_lines l join invoices i on i.id=l.invoice_id left join products p on p.id=l.product_id where i.status in ('issued','sent') and i.issue_date>=${f.from}::date and i.issue_date<=${f.to}::date ${f.currency ? sql`and i.currency=${f.currency}` : sql``} ${f.clientId ? sql`and i.client_id=${f.clientId}::uuid` : sql``} ${f.productId ? sql`and l.product_id=${f.productId}::uuid` : sql``} ${f.categoryId ? sql`and p.category_id=${f.categoryId}::uuid` : sql``} group by l.product_variant_id,i.currency`
      return sql`${ranking} union all select ${point('variants', sql`case when (rank<=10 or id in ('manual','uncategorized')) then id else 'other' end`, sql`sum(units)`, 'count', sql`case when (rank<=10 or id in ('manual','uncategorized')) then label else 'Other' end`)} as item from (select *,row_number() over(partition by currency order by units desc,id) as rank from (${variants}) variants) ranked group by currency,case when (rank<=10 or id in ('manual','uncategorized')) then id else 'other' end,case when (rank<=10 or id in ('manual','uncategorized')) then label else 'Other' end`
    }
    if (key !== 'sales_by_client') return ranking
    return sql`${ranking} union all select ${point('buyer_type', sql`kind`, sql`count(*)`, 'count')} as item from (select s.currency,case when exists(select 1 from invoices historical where historical.client_id=s.id::uuid and historical.status in ('issued','sent') and historical.issue_date<${f.from}::date) then 'repeat' else 'first' end as kind from source s) buyers group by currency,kind`
  }
  if (key === 'estimates') {
    const cohort = sql`select e.*,exists(select 1 from invoices i where i.source_estimate_id=e.id and i.status in ('issued','sent')) as invoiced from estimates e where e.issued_at>=${f.start}::timestamptz and e.issued_at<${f.endExclusive}::timestamptz ${f.currency ? sql`and e.currency=${f.currency}` : sql``} ${f.clientId ? sql`and e.client_id=${f.clientId}::uuid` : sql``}`
    return sql`select ${point('cohort', sql`milestone`, sql`count(*)`, 'count')} as item from (${cohort}) cohort cross join lateral(values ('issued',true),('accepted',accepted_at is not null),('invoiced',invoiced)) milestones(milestone,included) where included group by currency,milestone union all select ${point('outcome', sql`status`, sql`count(*)`, 'count')} as item from (${cohort}) cohort group by currency,status`
  }
  if (key === 'deliveries')
    return sql`select ${point('delivery_status', sql`status`, sql`count(*)`, 'count')} as item from source group by currency,status union all select ${point('delivery_billing', sql`case when d.invoice_id is null then 'unlinked' else 'linked' end`, sql`count(*)`, 'count')} as item from source s join delivery_notes d on d.id=s.id::uuid where d.status in ('delivered','acknowledged') group by currency,case when d.invoice_id is null then 'unlinked' else 'linked' end`
  return sql`select null::jsonb as item where false`
}

/** Selected charts resolve to their actual supporting documents, not grouped summary rows. */
export function supportingSource(
  key: ReportSectionKey,
  f: ReportFilters,
  exporting = false,
): SQL | undefined {
  if (exporting && key === 'sales_by_product' && !(f.segment && f.detailSection === key)) {
    const product = sql`coalesce(l.product_id::text,'manual')`
    const name = sql`coalesce(p.name,l.product_name)`
    return sql`select ${product} as id,concat(${name},' · ',coalesce(l.package_weight_g::text || ' g','—')) as label,i.currency,null::text as date,null::text as status,sum(l.net_amount)::text as net,sum(l.tax_amount)::text as vat,sum(l.total_amount)::text as gross,sum(l.total_amount)::text as amount,sum(l.quantity)::text as quantity,(sum(l.quantity::numeric*l.package_weight_g)/1000)::text as "weightKg",count(*) filter(where l.package_weight_g is null)::int as "unknownWeightCount" from invoices i join invoice_lines l on l.invoice_id=i.id left join products p on p.id=l.product_id where i.status in ('issued','sent') and i.issue_date>=${f.from}::date and i.issue_date<=${f.to}::date ${f.currency ? sql`and i.currency=${f.currency}` : sql``} ${f.clientId ? sql`and i.client_id=${f.clientId}::uuid` : sql``} ${f.productId ? sql`and l.product_id=${f.productId}::uuid` : sql``} ${f.categoryId ? sql`and p.category_id=${f.categoryId}::uuid` : sql``} group by ${product},${name},l.product_variant_id,l.package_weight_g,i.currency`
  }
  if ((!f.segment || key !== f.detailSection) && !(exporting && key === 'payment_methods'))
    return undefined
  if (key === 'sales_by_product' || key === 'sales_by_category') {
    const selected =
      key === 'sales_by_product'
        ? f.segment === 'manual'
          ? sql`l.product_id is null`
          : sql`l.product_id=${f.segment}::uuid`
        : f.segment === 'manual'
          ? sql`l.product_id is null`
          : f.segment === 'uncategorized'
            ? sql`l.product_id is not null and p.category_id is null`
            : sql`p.category_id=${f.segment}::uuid`
    return sql`select i.id::text as id,i.number as label,i.currency,i.issue_date::text as date,i.status,sum(l.net_amount)::text as net,sum(l.tax_amount)::text as vat,sum(l.total_amount)::text as gross,sum(l.total_amount)::text as amount,sum(l.quantity)::text as quantity,(sum(l.quantity::numeric*l.package_weight_g)/1000)::text as "weightKg",count(*) filter(where l.package_weight_g is null)::int as "unknownWeightCount",'invoices'::text as resource from invoices i join invoice_lines l on l.invoice_id=i.id left join products p on p.id=l.product_id where i.status in ('issued','sent') and i.issue_date>=${f.from}::date and i.issue_date<=${f.to}::date and ${selected} ${f.currency ? sql`and i.currency=${f.currency}` : sql``} ${f.clientId ? sql`and i.client_id=${f.clientId}::uuid` : sql``} ${f.productId ? sql`and l.product_id=${f.productId}::uuid` : sql``} ${f.categoryId ? sql`and p.category_id=${f.categoryId}::uuid` : sql``} group by i.id`
  }
  if (key === 'estimates' && /^(cohort|outcome):/.test(f.segment ?? '')) {
    const [group, value] = f.segment!.split(':')
    const predicate =
      value === 'awaiting'
        ? sql`e.status in ('issued','sent')`
        : group === 'outcome'
          ? sql`e.status=${value}`
          : value === 'accepted'
            ? sql`e.accepted_at is not null`
            : value === 'invoiced'
              ? sql`exists(select 1 from invoices i where i.source_estimate_id=e.id and i.status in ('issued','sent'))`
              : sql`true`
    return sql`select e.id::text as id,e.number as label,e.currency,e.issue_date::text as date,e.status,e.subtotal::text as net,e.tax_total::text as vat,e.total::text as gross,e.total::text as amount,null::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount",'estimates'::text as resource from estimates e where e.issued_at>=${f.start}::timestamptz and e.issued_at<${f.endExclusive}::timestamptz and ${predicate} ${f.currency ? sql`and e.currency=${f.currency}` : sql``} ${f.clientId ? sql`and e.client_id=${f.clientId}::uuid` : sql``}`
  }
  if (key === 'payment_methods')
    return sql`select m.id::text as id,m.number as label,m.currency,m.collected_on::text as date,m.status,null::text as net,null::text as vat,null::text as gross,m.amount::text as amount,null::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount",'payments'::text as resource from payments m join invoices i on i.id=m.invoice_id where i.status in ('issued','sent') and m.status='confirmed' ${f.segment && key === f.detailSection ? sql`and m.method=${f.segment}` : sql``} and m.collected_on>=${f.from}::date and m.collected_on<=${f.to}::date ${f.currency ? sql`and m.currency=${f.currency}` : sql``} ${f.clientId ? sql`and i.client_id=${f.clientId}::uuid` : sql``}`
  if (key === 'sales_by_client')
    return sql`select i.id::text as id,i.number as label,i.currency,i.issue_date::text as date,i.status,i.subtotal::text as net,i.tax_total::text as vat,i.total::text as gross,i.total::text as amount,null::text as quantity,null::text as "weightKg",0::int as "unknownWeightCount",'invoices'::text as resource from invoices i where i.status in ('issued','sent') and i.client_id=${f.segment}::uuid and i.issue_date>=${f.from}::date and i.issue_date<=${f.to}::date ${f.currency ? sql`and i.currency=${f.currency}` : sql``} ${f.clientId ? sql`and i.client_id=${f.clientId}::uuid` : sql``}`
  if (key === 'deliveries' && f.segment?.startsWith('billing:'))
    return sql`select source.* from source join delivery_notes d on d.id=source.id::uuid where d.status in ('delivered','acknowledged') and ${f.segment === 'billing:linked' ? sql`d.invoice_id is not null` : sql`d.invoice_id is null`}`
  return undefined
}

export function detailPredicate(key: ReportSectionKey, f: ReportFilters, captureDate: string): SQL {
  if (!f.segment || key !== f.detailSection) return sql`true`
  if (key === 'outstanding' || key === 'overdue') {
    const age = sql`${captureDate}::date-date::date`
    if (f.segment === 'current') return sql`${age}<=0`
    if (f.segment === '1_30') return sql`${age} between 1 and 30`
    if (f.segment === '31_60') return sql`${age} between 31 and 60`
    return sql`${age}>60`
  }
  return ['estimates', 'deliveries'].includes(key) ? sql`status=${f.segment}` : sql`id=${f.segment}`
}
