// Silent between-chapter housekeeping through the real API (never shown in a recording).
import { staffApi } from './seed.mjs'
import { KARIM, ORG } from './data.mjs'
export async function setDefaultTemplate(name = 'Atlas Négoce — Vert') {
  const w = await staffApi(ORG.slug, KARIM.email)
  const t = (await w.get('/api/v1/document-templates')).find?.((x) => x.name === name) ?? (await w.get('/api/v1/document-templates')).items.find((x) => x.name === name)
  const cs = await w.get('/api/v1/company-settings')
  const keep = Object.fromEntries(['legalName','tradeName','legalForm','shareCapital','addressLine1','addressLine2','city','postalCode','countryCode','ice','taxIdentifier','registrationNumber','registrationCity','professionalTaxNumber','email','phone','logoAssetId','currency','locale','timezone','paymentDueDays','estimateValidDays','defaultBankAccountId','defaultVatRate'].filter((k) => k in cs).map((k) => [k, cs[k]]))
  await w.patch('/api/v1/company-settings', { ...keep, defaultTemplateId: t.id, expectedVersion: cs.version })
  console.log('default template ->', t.name)
}
if (import.meta.url === `file://${process.argv[1]}`) await setDefaultTemplate()

/** Enable the automatic e-mail rules with the company sender (done silently before ch05). */
export async function enableNotifications() {
  const w = await staffApi(ORG.slug, KARIM.email)
  const rules = (await w.get('/api/v1/notification-rules')).items
  for (const r of rules) {
    const body = { expectedVersion: r.version, enabled: true, offsetDays: r.offsetDays, repeatEveryDays: r.repeatEveryDays, senderName: 'Atlas Négoce SARL', senderEmail: 'factures@atlas-negoce.ma', locale: r.locale, subjectTemplate: r.subjectTemplate, bodyTemplate: r.bodyTemplate, bodyFormat: r.bodyFormat }
    if (r.englishSubjectTemplate) { body.englishSubjectTemplate = r.englishSubjectTemplate; body.englishBodyTemplate = r.englishBodyTemplate }
    await w.patch(`/api/v1/notification-rules/${r.id}`, body).catch((e) => console.warn(r.eventKey, e.message.slice(0, 200)))
  }
  console.log('rules', rules.map((r) => `${r.eventKey}(${r.offsetDays},${r.repeatEveryDays})`).join(' '))
}

/** Make the due-date reminder fire for invoices due in `daysBefore` days (the demo date is fixed). */
export async function setDueReminder(daysBefore = 30) {
  const w = await staffApi(ORG.slug, KARIM.email)
  const r = (await w.get('/api/v1/notification-rules')).items.find((x) => x.eventKey === 'invoice_due_reminder')
  await w.patch(`/api/v1/notification-rules/${r.id}`, { expectedVersion: r.version, enabled: true, offsetDays: -daysBefore, repeatEveryDays: null, senderName: 'Atlas Négoce SARL', senderEmail: 'factures@atlas-negoce.ma', locale: r.locale, subjectTemplate: r.subjectTemplate, bodyTemplate: r.bodyTemplate, bodyFormat: r.bodyFormat, ...(r.englishSubjectTemplate ? { englishSubjectTemplate: r.englishSubjectTemplate, englishBodyTemplate: r.englishBodyTemplate } : {}) })
}

/** Monthly report schedule (created silently; ch09 shows it and its e-mail). */
export async function createMonthlySchedule() {
  const w = await staffApi(ORG.slug, KARIM.email)
  const rec = (await w.get('/api/v1/report-schedules/eligible-recipients')).items.filter((r) => r.eligible)
  const s = await w.post('/api/v1/report-schedules', { output: 'pdf', language: 'fr', name: 'Rapport mensuel de gestion', frequency: 'monthly', weekday: null, monthDay: 1, localTime: '08:00', timezone: 'Africa/Casablanca', period: 'previous_month', includedSections: ['summary', 'revenue', 'collections', 'outstanding', 'overdue', 'sales_by_client'], recipientIds: rec.map((r) => r.id), enabled: true })
  console.log('schedule', s.id)
  return s
}

/** Switch the due-date reminder off (used by clips that must show only the invoice e-mail). */
export async function disableDueReminder() {
  const w = await staffApi(ORG.slug, KARIM.email)
  const r = (await w.get('/api/v1/notification-rules')).items.find((x) => x.eventKey === 'invoice_due_reminder')
  await w.patch(`/api/v1/notification-rules/${r.id}`, { expectedVersion: r.version, enabled: false, offsetDays: r.offsetDays, repeatEveryDays: r.repeatEveryDays, senderName: 'Atlas Négoce SARL', senderEmail: 'factures@atlas-negoce.ma', locale: r.locale, subjectTemplate: r.subjectTemplate, bodyTemplate: r.bodyTemplate, bodyFormat: r.bodyFormat, ...(r.englishSubjectTemplate ? { englishSubjectTemplate: r.englishSubjectTemplate, englishBodyTemplate: r.englishBodyTemplate } : {}) })
}
