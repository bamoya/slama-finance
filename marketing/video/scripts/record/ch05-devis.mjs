// Chapter 5: estimate for Coopérative Al Baraka from the existing catalogue, issued and sent by e-mail.
import { openWorkspace } from './common.mjs'
import { sleep, clearMailFor } from './lib.mjs'
import { CLIENT } from './data.mjs'

async function qtyInput(page, combo) {
  const cb = await combo.boundingBox()
  const inputs = page.locator('main input:visible')
  const n = await inputs.count()
  for (let i = 0; i < n; i++) {
    const b = await inputs.nth(i).boundingBox()
    if (
      b &&
      b.x > cb.x + cb.width &&
      b.x < cb.x + cb.width + 60 &&
      Math.abs(b.y + b.height / 2 - (cb.y + cb.height / 2)) < 15
    )
      return inputs.nth(i)
  }
  throw new Error('quantity input not found')
}
const LINES = [
  ['NPK', 40],
  ['blé dur', 25],
]

export async function run() {
  await clearMailFor(CLIENT.email)
  const rec = await openWorkspace('ch05-devis', '/estimates')
  const { page } = rec
  rec.delay = 14
  await rec.pause(1000, 'Liste des devis existants')
  await rec.click(
    page
      .getByRole('link', { name: /Créer un devis|Nouveau devis/ })
      .or(page.getByRole('button', { name: /Créer un devis|Nouveau devis/ }))
      .first(),
    'Clic sur « Créer un devis »',
    { settle: 800 },
  )
  await page.waitForSelector('[aria-label=Client]')
  await rec.click('[aria-label=Client]', 'Choix du client', { settle: 400 })
  await page.keyboard.type('Baraka', { delay: 60 })
  await sleep(500)
  await rec.click(page.locator('[role=option]').first(), 'Coopérative Al Baraka', { settle: 500 })
  await rec.type(
    page.locator('input[placeholder="JJ-MM-AAAA"]').nth(1),
    '01-12-2026',
    'Valable jusqu’au',
    { clear: true },
  )
  for (let i = 0; i < LINES.length; i++) {
    const [q, qty] = LINES[i]
    await rec.click(
      page.getByRole('button', { name: 'Ajouter un produit' }),
      'Ajout d’un produit',
      { settle: 500 },
    )
    const combo = page.locator('[id$="-product"]').nth(i)
    await rec.click(combo, 'Recherche d’un produit du catalogue', { settle: 400 })
    await page.keyboard.type(q, { delay: 70 })
    await sleep(600)
    await rec.click(
      page.locator('[role=option]').first(),
      'Produit sélectionné : prix repris du catalogue',
      { settle: 500 },
    )
    await rec.type(await qtyInput(page, combo), String(qty), 'Quantité', { clear: true })
    await rec.click(page.locator('[id$="-vat"]').nth(i), 'Taux de TVA', { settle: 400 })
    await rec.click(page.getByRole('option', { name: /20/ }).first(), 'TVA 20 %', { settle: 400 })
  }
  await rec.pause(900, 'Lignes du devis complétées')
  await rec.click(
    page.getByRole('button', { name: 'Enregistrer le brouillon' }),
    'Enregistrement du brouillon',
    { settle: 1500 },
  )
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(900, 'Brouillon enregistré : totaux HT, TVA, TTC')
  await rec.click(page.getByRole('button', { name: 'Émettre le devis' }), 'Émission du devis', {
    settle: 1500,
  })
  await rec.pause(700, 'Devis émis avec son numéro')
  await rec.pause(1000, 'Envoi automatique du devis au client (e-mail)')
  await rec.inbox(CLIENT.email, { subjectIncludes: 'devis', label: 'Le client reçoit le devis' })
  await rec.pause(2400, 'E-mail du devis reçu par le client', '#mail')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
