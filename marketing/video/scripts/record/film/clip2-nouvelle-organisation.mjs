// Clip 2: owner adds a third organization: typing the name forms the address; the rest of the wizard is cut.
import { openFilmOwner } from './common.mjs'
import { sleep } from '../lib.mjs'
import { COMPANY } from '../data.mjs'

export const NEW_ORG = { name: 'Atlas Négoce Agadir', activity: 'Négoce de fournitures agricoles' }
export const meta = { id: 'clip2-nouvelle-organisation', snapshot: 'seeded' }
export async function run() {
  const rec = await openFilmOwner(meta.id, '/')
  const { page } = rec
  rec.delay = 30
  rec.mv = 0.6
  await rec.pause(500, 'Espace propriétaire')
  await rec.click(
    page
      .getByRole('link', { name: /Nouvelle organisation/ })
      .or(page.getByRole('button', { name: /Nouvelle organisation/ }))
      .first(),
    'Clic sur « Nouvelle organisation »',
    { settle: 400 },
  )
  await page.waitForSelector('#organization-address')
  await rec.type(
    page.locator('main input').first(),
    NEW_ORG.name,
    'Saisie du nom de l’organisation',
  )
  await page
    .getByText(/adresse est disponible/i)
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {})
  await rec.pause(1700, 'L’adresse se forme automatiquement', '#organization-address')
  // the rest of the wizard is removed from the clip
  await rec.cut(async () => {
    await page.locator('main input >> nth=2').fill(NEW_ORG.activity)
    await page.getByRole('button', { name: /Continuer/ }).click()
    const inputs = page.locator('main input[type=text], main input[type=email]')
    await inputs.nth(0).fill(`${NEW_ORG.name} SARL`)
    await inputs.nth(1).fill('agadir@atlas-negoce.ma')
    await inputs.nth(3).fill(COMPANY.address)
    await inputs.nth(4).fill('Agadir')
    await inputs.nth(5).fill('002154873000066')
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: /Continuer/ }).click()
      await sleep(400)
    }
    await page.getByRole('button', { name: /Créer mon organisation/ }).click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await sleep(1500)
  })
  await rec.pause(2200, 'Organisation créée, essai gratuit démarré')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
