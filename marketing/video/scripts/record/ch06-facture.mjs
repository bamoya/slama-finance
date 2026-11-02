// Chapter 6: accepted estimate becomes an invoice; the final PDF is downloaded and shown.
import path from 'node:path'
import { openWorkspace } from './common.mjs'
import { sleep } from './lib.mjs'
import { daysFromToday, frDate } from './data.mjs'

export async function run() {
  const rec = await openWorkspace('ch06-facture', '/estimates')
  const { page } = rec
  await rec.pause(800, 'Liste des devis : devis Coopérative Al Baraka')
  await rec.click(
    page.locator('tr', { hasText: 'Coopérative Al Baraka' }).getByText(/^DEV-/),
    'Ouverture du devis',
    { settle: 900 },
  )
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.click(
    page.getByRole('button', { name: 'Marquer comme accepté' }),
    'Devis marqué comme accepté',
    { settle: 1200 },
  )
  await rec.click(
    page.getByRole('link', { name: 'Créer une facture' }),
    'Clic sur « Créer une facture »',
    { settle: 900 },
  )
  await rec.pause(700, 'Facture créée à partir du devis')
  await rec.type(
    page.locator('input[placeholder="JJ-MM-AAAA"]').first(),
    frDate(daysFromToday(30)),
    'Date d’échéance',
    { fill: true },
  )
  await rec.click(
    page.getByRole('button', { name: 'Créer un brouillon de facture' }),
    'Création du brouillon de facture',
    { settle: 1500 },
  )
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(1000, 'Brouillon de facture : lignes reprises du devis')
  await rec.click(
    page.getByRole('button', { name: /Émettre la facture/ }),
    'Émission de la facture',
    { settle: 1800 },
  )
  await rec.pause(900, 'Facture émise avec son numéro')
  const dl = page.waitForEvent('download', { timeout: 25000 })
  await rec.click(
    page.getByRole('button', { name: 'Télécharger le PDF' }),
    'Téléchargement du PDF',
    { settle: 300 },
  )
  const file = path.join(rec.tmp, 'facture.pdf')
  await (await dl).saveAs(file)
  await rec.pdfViewer(file, {
    title: 'Facture Coopérative Al Baraka.pdf',
    label: 'Ouverture du PDF de la facture',
  })
  await rec.pause(3500, 'PDF de la facture : modèle de marque, lignes, TVA, RIB')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
