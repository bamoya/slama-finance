// Clip 3: organization dashboard (atlas-negoce): slow pan over KPIs and charts.
import { openFilmWorkspace, pickRange } from './common.mjs'

export const meta = { id: 'clip3-tableau-de-bord', snapshot: 'ch09' }
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/dashboard')
  const { page } = rec
  rec.mv = 0.45
  await page.getByText('Facturé').first().waitFor()
  await rec.pause(300, 'Tableau de bord de l’organisation')
  await pickRange(rec, page.getByText(/\d\d-\d\d-\d{4} – \d\d-\d\d-\d{4}/).first(), { back: 2, start: '2026-09-01', end: '2026-10-31' })
  await rec.pause(1500, 'Indicateurs : facturé, encaissé, solde, retards', '[class*=grid] >> nth=0')
  await rec.scroll(360, 'Graphiques : ventes et encaissements', 36)
  await rec.pause(1500)
  await rec.scroll(380, 'Créances et devis', 36)
  await rec.pause(1200)
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run(); await rec.finish() }
