import type {
  ReportAnalysis,
  ReportSchedule,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { frenchReportLabel } from './report-labels.js'
import { reportLabel } from './visual-pdf.service.js'

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
/** Business composition stays here. The notification worker only delivers this ready-made payload. */
export function composeReportEmail(
  snapshot: ReportAnalysis,
  name: string,
  link: string,
  language: ReportSchedule['language'] = 'fr',
  output?: ReportSchedule['output'],
) {
  const fr = language === 'fr'
  const label = fr ? frenchReportLabel : reportLabel
  const subject = fr ? 'Votre rapport financier programmé' : 'Your scheduled financial report'
  const intro = fr ? 'Votre synthèse financière est prête.' : 'Your financial summary is ready.'
  const formats = output === 'both' ? 'PDF + Excel' : output === 'excel' ? 'Excel' : 'PDF'
  const attachment = fr
    ? `Pièces jointes : ${formats}. Elles contiennent les graphiques et les données figées de cette période. Connectez-vous pour consulter le rapport complet.`
    : `Attachments: ${formats}. They contain the charts and frozen data for this period. Sign in to view the full report.`
  const action = fr ? 'Consulter le rapport' : 'View the report'
  const warning = fr
    ? 'Confidentiel : informations financières de votre entreprise. Les copies enregistrées ou transférées ne peuvent pas être révoquées.'
    : 'Confidential: company financial information. Saved or forwarded copies cannot be revoked.'
  const date = (value: string) =>
    new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`))
  const period = `${date(snapshot.filters.from)} - ${date(snapshot.filters.to)}`
  const captured = `${fr ? 'Données figées au' : 'Captured at'} ${new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: snapshot.filters.timezone }).format(new Date(snapshot.capturedAt))} · ${snapshot.filters.timezone}`
  const figures = snapshot.sections
    .flatMap((section) =>
      section.metrics
        .filter((metric) =>
          [
            'gross',
            'amount',
            'invoiced_gross',
            'collections',
            'outstanding',
            'issued_count',
            'delivered_weight_kg',
          ].includes(metric.key),
        )
        .map((metric) => ({
          label: `${label(section.key)} · ${label(metric.key)}`,
          value: `${new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB', { minimumFractionDigits: metric.unit === 'money' ? 2 : 0, maximumFractionDigits: metric.unit === 'money' ? 2 : 3 }).format(Number(metric.value))}${metric.unit === 'money' && metric.currency ? ` ${metric.currency}` : metric.unit === 'kg' ? ' kg' : metric.currency ? ` (${metric.currency})` : ''}`,
          basis:
            metric.timeBasis === 'capture'
              ? fr
                ? 'À la date de capture'
                : 'At capture'
              : fr
                ? 'Période sélectionnée'
                : 'Selected period',
        })),
    )
    .slice(0, 6)
  const text = [
    snapshot.companyName,
    name,
    intro,
    period,
    captured,
    ...figures.map((item) => `${item.label}: ${item.value} (${item.basis})`),
    attachment,
    `${action}: ${link}`,
    warning,
  ].join('\n\n')
  const rows = figures
    .map(
      (item) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#52615b;font-size:13px">${escape(item.label)}<br><span style="font-size:11px;color:#66756e">${escape(item.basis)}</span></td><td align="right" style="padding:12px 0 12px 16px;border-bottom:1px solid #e5e7eb;color:#26322e;font-weight:bold;font-size:16px">${escape(item.value)}</td></tr>`,
    )
    .join('')
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;padding:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#26322e"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb"><tr><td style="padding:28px 24px;border-top:4px solid #a87828"><p style="margin:0 0 20px;font-size:13px;font-weight:bold;color:#8a611d">${escape(snapshot.companyName)}</p><h1 style="margin:0 0 10px;font-size:24px;line-height:1.3">${escape(name)}</h1><p style="margin:0 0 20px;line-height:1.6;font-size:15px">${escape(intro)}</p><p style="margin:0;padding:14px;background:#f3f5f4;border-radius:8px;font-size:14px;font-weight:bold">${escape(period)}</p><p style="margin:10px 0 16px;font-size:11px;line-height:1.5;color:#66756e">${escape(captured)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table><p style="margin:24px 0;font-size:14px;line-height:1.7">${escape(attachment)}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#8a611d" style="border-radius:6px"><a href="${escape(link)}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">${escape(action)}</a></td></tr></table><p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.6;color:#66756e">${escape(warning)}</p></td></tr></table><p style="font-size:11px;color:#66756e">Slama Finance</p></td></tr></table></body></html>`
  return { subject, text, html }
}
