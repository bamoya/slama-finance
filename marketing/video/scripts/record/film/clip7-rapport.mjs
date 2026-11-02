// Clip 7: the monthly report goes out on its schedule (the real scheduled send, not a test), the manager opens the e-mail
// then its PDF attachment and scrolls through the figures and charts.
// Silent preparation: the schedule is made due now in the demo DB so the report worker sends it within seconds.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { openFilmWorkspace } from './common.mjs'
import { clearMailFor, mailFor, mailpit, MAILPIT } from '../lib.mjs'
import { KARIM } from '../data.mjs'

export const meta = { id: 'clip7-rapport', snapshot: 'ch09' }
let attachment = null
export async function prepare() {
  await clearMailFor(KARIM.email)
  execFileSync('docker', [
    'exec',
    'slama-finance-postgres-1',
    'psql',
    '-U',
    'slama',
    '-d',
    'bfinance_demo',
    '-c',
    "update report_schedules set next_run_at = now() - interval '1 minute' where enabled",
  ])
  const end = Date.now() + 90000
  while (!attachment && Date.now() < end) {
    const hits = await mailFor(KARIM.email, { timeout: 90000 })
    for (const m of hits) {
      if (m.Subject.includes('[TEST]')) continue
      const full = await mailpit(`/api/v1/message/${m.ID}`)
      const pdf = (full.Attachments ?? []).find((a) => /pdf/i.test(a.ContentType + a.FileName))
      if (pdf) attachment = { id: m.ID, part: pdf.PartID, name: pdf.FileName }
    }
    if (!attachment) await new Promise((r) => setTimeout(r, 1000))
  }
  if (!attachment) throw new Error('scheduled report mail with PDF not received')
}
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/reports/schedules')
  const { page } = rec
  rec.mv = 0.3
  await rec.pause(1800, 'Rapports planifiés : rapport mensuel', 'tbody tr, table')
  await rec.inbox(KARIM.email, {
    label: 'Le dirigeant reçoit le rapport par e-mail',
    subjectIncludes: '',
  })
  await rec.pause(3000, 'Rapport mensuel reçu par e-mail', '#mail')
  const file = path.join(rec.tmp, 'rapport.pdf')
  const res = await fetch(`${MAILPIT}/api/v1/message/${attachment.id}/part/${attachment.part}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  await rec.pdfViewer(file, {
    title: attachment.name,
    label: 'Ouverture du PDF joint',
    maxPages: 3,
  })
  await rec.pause(1800, 'Rapport PDF : chiffres clés')
  await rec.scroll(560, 'Graphiques et détail', 24)
  await rec.pause(1800)
  await rec.scroll(560, 'Suite du rapport', 24)
  await rec.pause(1200)
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await prepare()
  const rec = await run()
  await rec.finish()
}
