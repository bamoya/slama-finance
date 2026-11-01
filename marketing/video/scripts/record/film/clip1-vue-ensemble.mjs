// Clip 1: owner logs in on app.<domain> and sees the consolidated overview of both organizations.
import { HOSTS, openSession, sleep } from '../lib.mjs'
import { KARIM } from '../data.mjs'
import { CLIPS_OUT, pickRange } from './common.mjs'

export const meta = { id: 'clip1-vue-ensemble', snapshot: 'ch09' }
export async function run() {
  const rec = await openSession(meta.id, { outDir: CLIPS_OUT, webm: false })
  const { page } = rec
  rec.delay = 12
  rec.mv = 0.45
  await page.goto(`${HOSTS.owner}/login`)
  await page.waitForSelector('input[name=email]')
  await sleep(900)
  await rec.start()
  await rec.type('input[name=email]', KARIM.email, 'Saisie de l’adresse e-mail')
  await rec.type('input[name=password]', KARIM.password, 'Saisie du mot de passe', { delay: 8 })
  await rec.click('button[type=submit]', 'Clic sur « Se connecter »', { settle: 0 })
  await rec.cut(async () => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.getByText('Toutes vos organisations').first().waitFor()
    await page
      .getByText(/Chargement/)
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => {})
    await sleep(600)
  })
  await rec.pause(300, 'Espace propriétaire : toutes les organisations')
  await pickRange(rec, page.getByText(/\d\d-\d\d-\d{4} – \d\d-\d\d-\d{4}/).first(), {
    back: 2,
    start: '2026-09-01',
    end: '2026-10-31',
  })
  await rec.pause(1800, 'Vue consolidée des deux organisations', 'main h1')
  await rec.scroll(380, 'Détail par organisation')
  await rec.pause(1200)
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
