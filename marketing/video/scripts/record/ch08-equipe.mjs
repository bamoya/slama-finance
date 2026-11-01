// Chapter 8: create the "Comptable" role (permission matrix) and invite Salma Idrissi with it.
import { openWorkspace, WS } from './common.mjs'
import { sleep } from './lib.mjs'

const PERMS = ['Clients — Consulter', 'Factures — Consulter', 'Paiements — Consulter', 'Rapports — Consulter']

export async function run() {
  const rec = await openWorkspace('ch08-equipe', '/settings/staff')
  const { page } = rec
  page.setDefaultTimeout(8000)
  process.on('exit', () => {})
  rec.delay = 18
  await rec.pause(900, 'Équipe actuelle : Karim et Nadia')
  await rec.click(page.getByRole('link', { name: 'Rôles et permissions' }), 'Ouverture de « Rôles et permissions »', { settle: 900 })
  await rec.click(page.getByRole('link', { name: /Créer un rôle/ }).or(page.getByRole('button', { name: /Créer un rôle/ })).first(), 'Clic sur « Créer un rôle »', { settle: 800 })
  await page.waitForSelector('#name')
  await rec.type('#name', 'Comptable', 'Nom du rôle')
  await rec.type('#description', 'Suivi des factures et encaissements', 'Description du rôle')
  await rec.click(page.getByRole('button', { name: 'Créer un rôle' }), 'Création du rôle', { settle: 1500 })
  await page.waitForSelector('text=0 sélectionnés')
  await rec.pause(800, 'Matrice des permissions par module')
  for (const name of PERMS) await rec.click(page.locator(`[aria-label="${name}"]`), `Permission : ${name}`, { settle: 250 })
  await rec.pause(700, '4 permissions sélectionnées')
  await rec.click(page.getByRole('button', { name: 'Enregistrer les permissions' }), 'Enregistrement des permissions', { settle: 700 })
  await rec.click(page.getByRole('button', { name: 'Confirmer' }), 'Confirmation', { settle: 1300 })
  await rec.pause(900, 'Rôle « Comptable » enregistré')
  await rec.goto(`${WS}/settings/staff/invitations/new`, 'Invitation d’un nouveau membre')
  await page.waitForSelector('#invite-email')
  await rec.type('#invite-email', 'salma.idrissi@atlas-negoce.ma', 'E-mail de Salma Idrissi')
  await rec.click(page.getByText('Comptable', { exact: true }), 'Attribution du rôle « Comptable »', { settle: 600 })
  await rec.pause(700, 'Rôle attribué : permissions héritées')
  await rec.click(page.getByRole('button', { name: /Envoyer l’invitation/ }), 'Envoi de l’invitation', { settle: 1800 })
  await rec.pause(1200, 'Invitation envoyée')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run().catch(async (e) => { console.error(e.message.split('\n')[0]); process.exit(1) }); await rec.finish() }
