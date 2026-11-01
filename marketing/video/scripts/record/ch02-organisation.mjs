// Chapter 2: onboarding wizard creates "Atlas Négoce SARL" (address atlas-negoce), logo, details, trial starts.
import { HOSTS, OUT, openSession, sleep } from './lib.mjs'
import { COMPANY, ORG } from './data.mjs'
import path from 'node:path'
import { HERE } from './lib.mjs'

export async function run() {
  const rec = await openSession('ch02-organisation', { storageState: `${OUT}/raw/ch01.state.json` })
  const { page } = rec
  rec.delay = 16
  await page.goto(`${HOSTS.owner}/`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(1000)
  await rec.start()
  await rec.pause(900, 'Espace propriétaire vide')
  await rec.click(
    page
      .getByRole('link', { name: /Nouvelle organisation/ })
      .or(page.getByRole('button', { name: /Nouvelle organisation/ }))
      .first(),
    'Clic sur « Nouvelle organisation »',
    { settle: 500 },
  )
  await page.waitForSelector('#organization-address')
  const name = page.locator('main input').first()
  await rec.type(name, ORG.name, 'Saisie du nom de l’organisation')
  await rec.pause(700, 'L’adresse se formate automatiquement', '#organization-address')
  await rec.type('#organization-address', ORG.slug, 'Adresse personnalisée : atlas-negoce', {
    clear: true,
  })
  await page
    .getByText(/adresse est disponible/i)
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {})
  await rec.pause(800, 'Adresse disponible ✓', page.getByText(/adresse est disponible/i).first())
  await rec.type(
    'main input >> nth=2',
    'Négoce de fournitures agricoles',
    'Activité professionnelle',
  )
  await rec.click(page.getByRole('button', { name: /Continuer/ }), 'Continuer', { settle: 500 })
  // step 2 company identity
  const inputs = page.locator('main input[type=text], main input[type=email]')
  const f = (i) => inputs.nth(i)
  await rec.type(f(0), COMPANY.legalName, 'Raison sociale')
  await rec.type(f(1), COMPANY.email, 'E-mail de contact')
  await rec.type(f(3), COMPANY.address, 'Adresse')
  await rec.type(f(4), COMPANY.city, 'Ville')
  await rec.type(f(5), COMPANY.ice, 'ICE')
  await rec.click(page.getByRole('button', { name: /Continuer/ }), 'Continuer', { settle: 500 })
  // step 3 brand: logo upload
  await rec.pointAt(page.getByText('Importer une image').first())
  rec.push(
    'click',
    'Import du logo',
    await page.getByText('Importer une image').first().boundingBox(),
  )
  await page.setInputFiles(
    'input[type=file] >> nth=0',
    path.resolve(HERE, '../assets/atlas-logo.png'),
  )
  await sleep(1800)
  await rec.pause(900, 'Logo ajouté, aperçu du document mis à jour')
  await rec.click(page.getByRole('button', { name: /Continuer/ }), 'Continuer', { settle: 500 })
  // step 4 defaults
  await rec.pause(800, 'Valeurs par défaut des documents')
  await rec.click(page.getByRole('button', { name: /Continuer/ }), 'Continuer', { settle: 500 })
  // step 5 team
  await rec.click(page.getByRole('button', { name: /Continuer/ }), 'Continuer (équipe)', {
    settle: 500,
  })
  // step 6 review
  await rec.pause(900, 'Vérification avant création')
  await rec.click(
    page.getByRole('button', { name: /Créer mon organisation/ }),
    'Clic sur « Créer mon organisation »',
    { settle: 1500 },
  )
  await page.waitForLoadState('networkidle').catch(() => {})
  await rec.pause(2200, 'Organisation créée, essai gratuit démarré')
  await rec.context.storageState({ path: `${OUT}/raw/ch02.state.json` })
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
