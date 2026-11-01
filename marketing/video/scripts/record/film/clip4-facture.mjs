// Clip 4: quick invoice (client + 2 lines, 20 % VAT), issued and sent, then the client's inbox frame.
import { openFilmWorkspace } from './common.mjs'
import { clearMailFor, sleep } from '../lib.mjs'
import { CLIENT } from '../data.mjs'

export const meta = { id: 'clip4-facture', snapshot: 'ch09' }
async function qtyInput(page, combo) {
  const cb = await combo.boundingBox()
  const inputs = page.locator('main input:visible')
  const n = await inputs.count()
  for (let i = 0; i < n; i++) {
    const b = await inputs.nth(i).boundingBox()
    if (b && b.x > cb.x + cb.width && b.x < cb.x + cb.width + 60 && Math.abs(b.y + b.height / 2 - (cb.y + cb.height / 2)) < 15) return inputs.nth(i)
  }
  throw new Error('quantity input not found')
}
const LINES = [['NPK', 20]]

export async function prepare() {
  await (await import('../between.mjs')).disableDueReminder()
}
export async function run() {
  await clearMailFor(CLIENT.email)
  const rec = await openFilmWorkspace(meta.id, '/invoices/new')
  const { page } = rec
  rec.delay = 10
  rec.mv = 0.35
  await page.waitForSelector('[aria-label=Client]')
  await rec.pause(300, 'Nouvelle facture')
  await rec.click('[aria-label=Client]', 'Choix du client', { settle: 250 })
  await page.keyboard.type('Baraka', { delay: 40 })
  await sleep(400)
  await rec.click(page.locator('[role=option]').first(), 'Coopérative Al Baraka', { settle: 300 })
  for (let i = 0; i < LINES.length; i++) {
    const [q, qty] = LINES[i]
    await rec.click(page.getByRole('button', { name: 'Ajouter un produit' }), 'Ajout d’un produit', { settle: 300 })
    const combo = page.locator('[id$="-product"]').nth(i)
    await rec.click(combo, 'Recherche d’un produit du catalogue', { settle: 250 })
    await page.keyboard.type(q, { delay: 45 })
    await sleep(450)
    await rec.click(page.locator('[role=option]').first(), 'Produit sélectionné : prix repris du catalogue', { settle: 300 })
    await rec.type(await qtyInput(page, combo), String(qty), 'Quantité', { clear: true })
    await rec.click(page.locator('[id$="-vat"]').nth(i), 'Taux de TVA', { settle: 250 })
    await rec.click(page.getByRole('option', { name: /20/ }).first(), 'TVA 20 %', { settle: 250 })
  }
  await rec.pause(500, 'Totaux HT, TVA, TTC')
  await rec.click(page.getByRole('button', { name: /Enregistrer le brouillon|Créer un brouillon/ }), 'Enregistrement du brouillon', { settle: 1200 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.click(page.getByRole('button', { name: /Émettre la facture/ }), 'Émission de la facture', { settle: 1200 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.click(page.getByRole('button', { name: 'Envoyer un e-mail' }), 'Envoi de la facture par e-mail', { settle: 700 })
  await rec.click(page.locator('[role=dialog] button', { hasText: 'Envoyer un e-mail' }), 'Confirmation de l’envoi', { settle: 1200 })
  await rec.inbox(CLIENT.email, { subjectIncludes: '', label: 'Le client reçoit la facture' })
  await rec.pause(2200, 'E-mail de la facture reçu par le client', '#mail')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run(); await rec.finish() }
