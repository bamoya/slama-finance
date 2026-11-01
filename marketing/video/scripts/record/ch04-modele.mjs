// Chapter 4: customise a document template (layout, logo, brand colour, footer) with the live preview.
import path from 'node:path'
import { openWorkspace } from './common.mjs'
import { HERE, sleep } from './lib.mjs'
import { COMPANY } from './data.mjs'

export async function run() {
  const rec = await openWorkspace('ch04-modele', '/settings/invoice-appearance')
  const { page } = rec
  await rec.pause(1000, 'Modèles de documents')
  await rec.click(page.getByRole('link', { name: 'Créer un modèle' }), 'Clic sur « Créer un modèle »', { settle: 900 })
  await page.waitForSelector('#name')
  rec.delay = 28
  await rec.type('#name', 'Atlas Négoce — Vert', 'Nom du modèle')
  await rec.click(page.locator('button', { hasText: /^Moderne/ }), 'Choix de la mise en page « Moderne »', { settle: 1000 })
  // brand colour: native colour input is driven programmatically, cursor shows the target
  const swatch = page.locator('#accentColor')
  await rec.pointAt(swatch)
  rec.push('click', 'Choix de la couleur de marque', await swatch.boundingBox())
  await swatch.evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '#1f5c4a'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
  await sleep(1100)
  const upload = page.locator('button', { hasText: 'Téléverser logo' })
  await rec.click(upload, 'Clic sur « Téléverser logo »', { settle: 200 })
  await page.setInputFiles('input[type=file] >> nth=0', path.resolve(HERE, '../assets/atlas-logo.png'))
  await sleep(1800)
  await rec.pause(1000, 'Logo ajouté : aperçu en direct', page.getByText('Aperçu du document').first())
  await rec.type('#footerText', `${COMPANY.legalName} · ICE ${COMPANY.ice} · ${COMPANY.bankName} RIB ${COMPANY.rib}`, 'Pied de page : coordonnées bancaires', { delay: 12 })
  await rec.pause(1200, 'Aperçu final de la facture')
  await rec.click(page.locator('main button', { hasText: /^Devis$/ }), 'Aperçu du devis', { settle: 1200 })
  await rec.click(page.locator('button[type=submit]'), 'Enregistrement du modèle', { settle: 1500 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(1800, 'Modèle enregistré')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run(); await rec.finish() }
