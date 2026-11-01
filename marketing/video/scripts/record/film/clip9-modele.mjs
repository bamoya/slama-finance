// Clip 9: customise a document template: accent colour + logo with the live preview.
import path from 'node:path'
import { openFilmWorkspace } from './common.mjs'
import { HERE, sleep } from '../lib.mjs'

export const meta = { id: 'clip9-modele', snapshot: 'ch03' }
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/settings/invoice-appearance/new')
  const { page } = rec
  rec.delay = 22
  rec.mv = 0.5
  await page.waitForSelector('#name')
  await rec.pause(500, 'Nouveau modèle de document')
  await rec.type('#name', 'Atlas Négoce — Vert', 'Nom du modèle')
  await rec.click(page.locator('button', { hasText: /^Moderne/ }), 'Mise en page « Moderne »', { settle: 600 })
  const swatch = page.locator('#accentColor')
  await rec.pointAt(swatch)
  rec.push('click', 'Couleur de marque', await swatch.boundingBox())
  await swatch.evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '#1f5c4a'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
  await sleep(900)
  await rec.click(page.locator('button', { hasText: 'Téléverser logo' }), 'Téléverser le logo', { settle: 200 })
  await page.setInputFiles('input[type=file] >> nth=0', path.resolve(HERE, '../assets/atlas-logo.png'))
  await sleep(1500)
  await rec.moveTo(1150, 330)
  await rec.scroll(-1600, 'Aperçu en direct : logo et couleur du modèle', 20)
  await rec.moveTo(760, 70)
  await rec.pause(2400, 'Aperçu en direct : logo et couleur du modèle')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run(); await rec.finish() }
