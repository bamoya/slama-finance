// Clip 6: automatic reminder lands in the client's inbox, payment is recorded, dashboard updated.
import { openFilmBlank, WS } from './common.mjs'
import { mailFor, clearMailFor, sleep } from '../lib.mjs'
import { setDueReminder } from '../between.mjs'
import { CLIENT, KARIM, ORG } from '../data.mjs'
import { staffApi } from '../seed.mjs'
import { randomUUID } from 'node:crypto'

export const meta = { id: 'clip6-relance-paiement', snapshot: 'ch06' }
const prepared = {}
export async function prepare() {
  await clearMailFor(CLIENT.email)
  // a first partial payment (silent, through the API) is what makes the reminder fire with the remaining balance
  const w = await staffApi(ORG.slug, KARIM.email)
  const inv = (await w.get('/api/v1/invoices?search=Baraka')).items.find((i) => i.dueDate === '2026-12-01')
  prepared.invoiceId = inv.id
  const bank = (await w.get('/api/v1/bank-accounts')).items?.[0]
  await w.post('/api/v1/payments', { operationId: randomUUID(), invoiceId: inv.id, amount: '20000.00', currency: 'MAD', method: 'bank_transfer', status: 'confirmed', paymentDate: '2026-11-01', collectedOn: '2026-11-01', bankAccountId: bank?.id ?? null, reference: 'VIR-ACOMPTE', chequeBank: null, chequeNumber: null })
  await setDueReminder(30) // demo date is fixed: make the reminder fire for the invoice due 01-12-2026 (not shown)
  await mailFor(CLIENT.email, { subjectIncludes: 'Échéance', timeout: 90000 })
}
export async function run() {
  const rec = await openFilmBlank(meta.id)
  const { page } = rec
  rec.delay = 20
  rec.mv = 0.35
  await rec.inbox(CLIENT.email, { subjectIncludes: 'Échéance', label: 'Le client reçoit le rappel automatique' })
  await rec.pause(3200, 'Rappel automatique : montant restant dû', '#mail')
  await rec.goto(`${WS}/invoices/${prepared.invoiceId}`, 'Facture du client', { ready: page.getByText('Solde de la facture').first() })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.click(page.getByRole('link', { name: 'Enregistrer un paiement' }).or(page.getByRole('button', { name: 'Enregistrer un paiement' })).first(), 'Enregistrer un paiement', { settle: 0 })
  // never show the loading state: cut until the payment form is fully loaded
  await rec.cut(async () => {
    await page.waitForSelector('main input[type=number]')
    await page.getByText('Chargement').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await sleep(400)
  })
  await rec.type('main input[type=number]', '10780', 'Solde restant à payer', { fill: true })
  await rec.click(page.getByRole('button', { name: 'Enregistrer le paiement' }), 'Enregistrement du paiement', { settle: 1000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  const confirm = page.getByRole('button', { name: 'Confirmer le paiement' }).first()
  if (await confirm.count()) {
    await rec.click(confirm, 'Confirmer le paiement', { settle: 500 })
    const dlg = page.locator('[role=dialog] button', { hasText: /Confirmer/ })
    if (await dlg.count()) await rec.click(dlg.last(), 'Confirmation de l’encaissement', { settle: 900 })
  }
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(1500, 'Facture réglée')
  await rec.goto(`${WS}/dashboard`, 'Tableau de bord mis à jour', { ready: page.getByText('Situation de vos créances').first() })
  await rec.pause(2600, 'Tableau de bord : encaissé et solde mis à jour')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { await prepare(); const rec = await run(); await rec.finish() }
