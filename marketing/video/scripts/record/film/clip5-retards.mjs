// Clip 5: unpaid / overdue invoices list; overdue rows are highlighted (highlight events drawn by the film).
import { openFilmWorkspace } from './common.mjs'
import { sleep } from '../lib.mjs'

export const meta = { id: 'clip5-retards', snapshot: 'ch09' }
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/invoices')
  const { page } = rec
  rec.mv = 0.6
  await rec.pause(700, 'Liste des factures')
  await rec.click(page.locator('button[role=combobox]').nth(5), 'Filtre : retards', { settle: 300 })
  await rec.click(page.getByRole('option', { name: /En retard/ }), 'En retard uniquement', { settle: 900 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(300)
  const rows = page.locator('tbody tr')
  const n = await rows.count()
  const first = await rows.nth(0).boundingBox()
  const last = await rows.nth(n - 1).boundingBox()
  rec.push('highlight', 'Factures en retard de paiement', { x: first.x, y: first.y, width: first.width, height: last.y + last.height - first.y })
  await rec.pause(2600)
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run(); await rec.finish() }
