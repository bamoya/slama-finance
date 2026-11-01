// Chapter 7: partial payment recorded; the client automatically receives the due-date reminder; dashboard updates.
import { openWorkspace } from './common.mjs'
import { mailFor, sleep } from './lib.mjs'
import { setDueReminder } from './between.mjs'
import { CLIENT } from './data.mjs'

export async function run() {
  const rec = await openWorkspace('ch07-paiement-relance', '/invoices')
  const { page } = rec
  rec.delay = 20
  await rec.pause(700, 'Liste des factures')
  await rec.click(
    page.locator('tr', { hasText: 'Coopérative Al Baraka' }).getByText(/^FAC-/),
    'Ouverture de la facture',
    { settle: 900 },
  )
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(700, 'Facture émise : solde à recevoir 49 500 MAD')
  await rec.click(
    page
      .getByRole('link', { name: 'Enregistrer un paiement' })
      .or(page.getByRole('button', { name: 'Enregistrer un paiement' }))
      .first(),
    'Clic sur « Enregistrer un paiement »',
    { settle: 900 },
  )
  await page.waitForSelector('main input[type=number]')
  await rec.type('main input[type=number]', '20000', 'Montant partiel : 20 000 MAD', { fill: true })
  await rec.click(page.locator('main button', { hasText: 'Espèces' }).first(), 'Mode de paiement', {
    settle: 400,
  })
  await rec.click(page.getByRole('option', { name: 'Virement bancaire' }), 'Virement bancaire', {
    settle: 500,
  })
  await rec.click(
    page.getByRole('button', { name: 'Enregistrer le paiement' }),
    'Enregistrement du paiement',
    { settle: 1500 },
  )
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(700, 'Paiement enregistré, en attente de confirmation')
  await rec.click(
    page.getByRole('button', { name: 'Confirmer le paiement' }).first(),
    'Clic sur « Confirmer le paiement »',
    { settle: 900 },
  )
  const dlg = page.locator('[role=dialog] button', { hasText: /Confirmer/ })
  if (await dlg.count())
    await rec.click(dlg.last(), 'Confirmation de l’encaissement', { settle: 1500 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(1000, 'Paiement confirmé : solde restant mis à jour')
  // Demo date is fixed: make the due-date reminder (30 days before) match the invoice due 01-12-2026 (not shown).
  await setDueReminder(30)
  await mailFor(CLIENT.email, { subjectIncludes: 'Échéance', timeout: 60000 })
  await rec.inbox(CLIENT.email, {
    subjectIncludes: 'Échéance',
    label: 'Le client reçoit le rappel automatique d’échéance',
  })
  await rec.pause(2800, 'Rappel automatique : montant restant dû', '#mail')
  await rec.goto(`${(await import('./common.mjs')).WS}/dashboard`, 'Retour au tableau de bord')
  await sleep(1500)
  await rec.pause(2500, 'Tableau de bord mis à jour : facturé, encaissé, solde')
  await rec.scroll(380, 'Graphiques : ventes et encaissements')
  await rec.pause(1500)
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
