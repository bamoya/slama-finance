// Clip 7: monthly report e-mail received, then the report chart in the app.
import { openFilmWorkspace, pickRange, WS } from './common.mjs'
import { clearMailFor, mailFor } from '../lib.mjs'
import { KARIM } from '../data.mjs'

export const meta = { id: 'clip7-rapport', snapshot: 'ch09' }
export async function prepare() { await clearMailFor(KARIM.email) }
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/reports/schedules')
  const { page } = rec
  rec.mv = 0.3
  await rec.pause(400, 'Rapports planifiés : rapport mensuel', 'tbody tr, table')
  await rec.click(page.getByRole('button', { name: 'Envoyer un e-mail de test' }).or(page.locator('button[aria-label*="test"]')).first(), 'Envoi du rapport par e-mail', { settle: 700 })
  if (await page.locator('[role=dialog]').count()) await rec.click(page.locator('[role=dialog] button').last(), 'Confirmation de l’envoi', { settle: 900 })
  await rec.cut(async () => { await mailFor(KARIM.email, { subjectIncludes: '', timeout: 60000 }) })
  await rec.inbox(KARIM.email, { label: 'Le dirigeant reçoit le rapport par e-mail' })
  await rec.pause(1900, 'Rapport mensuel reçu par e-mail', '#mail')
  await rec.goto(`${WS}/reports`, 'Rapports')
  await pickRange(rec, page.getByText(/\d\d-\d\d-\d{4} – \d\d-\d\d-\d{4}/).first(), { back: 2, start: '2026-09-01', end: '2026-10-31' })
  await rec.pause(2000, 'Rapports de gestion : évolution des ventes')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { await prepare(); const rec = await run(); await rec.finish() }
