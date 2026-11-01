// Chapter 1: Karim Benali creates his owner account, verifies the e-mail, signs in.
import fs from 'node:fs'
import { HOSTS, clearMailFor, openSession, sleep, OUT } from './lib.mjs'
import { KARIM } from './data.mjs'

export async function run() {
  await clearMailFor(KARIM.email)
  const rec = await openSession('ch01-inscription')
  const { page } = rec
  await page.goto(`${HOSTS.owner}/register`)
  await page.waitForSelector('input[name=firstName]')
  await sleep(1200)
  rec.start()
  await rec.pause(800, 'Page de création de compte propriétaire')
  await rec.type('input[name=firstName]', KARIM.firstName, 'Saisie du prénom')
  await rec.type('input[name=lastName]', KARIM.lastName, 'Saisie du nom')
  await rec.type('input[name=email]', KARIM.email, 'Saisie de l’adresse e-mail')
  await rec.type('input[name=password]', KARIM.password, 'Saisie du mot de passe', { delay: 28 })
  await rec.type('input[name=confirmation]', KARIM.password, 'Confirmation du mot de passe', {
    delay: 40,
  })
  await rec.click('button[type=submit]', 'Clic sur « Créer un compte »', { settle: 1200 })
  await rec.pause(1500, 'Message : vérifiez votre boîte e-mail')
  await rec.inbox(KARIM.email, {
    subjectIncludes: '',
    label: 'Réception de l’e-mail de vérification',
  })
  await rec.pause(1500, 'E-mail de vérification reçu', '#mail')
  const link = page.frameLocator('#mail').locator('a').first()
  await rec.click(link, 'Clic sur le lien de vérification', { settle: 800 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(1200, 'Page de confirmation de l’adresse e-mail')
  await rec.click(page.getByRole('button', { name: 'Vérifier l’adresse e-mail' }), 'Clic sur « Vérifier l’adresse e-mail »', { settle: 1500 })
  await rec.pause(1200, 'Adresse e-mail vérifiée')
  await rec.click(page.getByRole('link', { name: 'Connexion propriétaire' }), 'Clic sur « Connexion propriétaire »', { settle: 900 })
  await rec.type('input[name=email]', KARIM.email, 'Saisie de l’adresse e-mail')
  await rec.type('input[name=password]', KARIM.password, 'Saisie du mot de passe', { delay: 28 })
  await rec.click('button[type=submit]', 'Clic sur « Se connecter »', { settle: 1200 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(1800, 'Espace propriétaire : connexion réussie')
  await page.screenshot({ path: '/private/tmp/claude-503/demo/ch01-verified.png' })
  fs.mkdirSync(`${OUT}/raw`, { recursive: true })
  await rec.context.storageState({ path: `${OUT}/raw/ch01.state.json` })
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
