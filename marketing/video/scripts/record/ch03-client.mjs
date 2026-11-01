// Chapter 3: clients list is already populated; create ONE client "Coopérative Al Baraka".
import { openWorkspace, WS } from './common.mjs'
import { CLIENT } from './data.mjs'

export async function run() {
  const rec = await openWorkspace('ch03-client', '/clients')
  const { page } = rec
  await rec.pause(1500, 'Liste des clients déjà renseignée', 'table, main')
  await rec.click(page.getByRole('link', { name: /Ajouter un client|Nouveau client/ }).or(page.getByRole('button', { name: /Ajouter un client|Nouveau client/ })).first(), 'Clic sur « Ajouter un client »', { settle: 800 })
  await page.waitForSelector('main input')
  rec.delay = 22
  const inputs = page.locator('main input:not([type=checkbox])')
  await rec.type(inputs.nth(0), CLIENT.legalName, 'Raison sociale')
  await rec.type(inputs.nth(2), CLIENT.contactName, 'Personne à contacter')
  await rec.type(inputs.nth(3), CLIENT.ice, 'ICE (15 chiffres)')
  await rec.type(inputs.nth(8), CLIENT.address, 'Adresse de facturation')
  await rec.type(inputs.nth(10), CLIENT.city, 'Ville')
  await rec.type(page.locator('main input[type=email]'), CLIENT.email, 'Adresse e-mail')
  await rec.type(page.locator('main input[type=tel]'), CLIENT.phone, 'Téléphone')
  await rec.pause(700, 'Formulaire complété')
  await rec.click(page.getByRole('button', { name: /Créer un client/ }), 'Clic sur « Créer un client »', { settle: 1200 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(2200, 'Client créé')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) { const rec = await run(); await rec.finish() }
