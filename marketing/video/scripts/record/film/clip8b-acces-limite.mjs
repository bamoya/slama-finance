// Clip 8b: Salma (role "Comptable", invited in clip 8 / ch08) logs in for real on the organization host, sees her reduced
// menu, then opens the settings page by URL and the app shows its real access-denied state.
// Silent preparation: the invitation sent in ch08 is re-sent and accepted through the API (what the invitee's link does).
import { HOSTS, mailFor, sleep, openSession } from '../lib.mjs'
import { CLIPS_OUT, WS } from './common.mjs'
import { staffApi } from '../seed.mjs'
import { KARIM, ORG, SALMA } from '../data.mjs'

export const meta = { id: 'clip8b-acces-limite', snapshot: 'ch08' }
export async function prepare() {
  const w = await staffApi(ORG.slug, KARIM.email)
  const list = (await w.get('/api/v1/staff/invitations')).items ?? []
  const inv = list.find((i) => i.email === SALMA.email && i.status === 'pending')
  if (!inv) throw new Error('pending invitation for Salma not found: ' + JSON.stringify(list))
  await w.post(`/api/v1/staff/invitations/${inv.id}/resend`, {})
  const mails = await mailFor(SALMA.email, { timeout: 30000 })
  const full = await (await fetch(`http://localhost:8025/api/v1/message/${mails[0].ID}`)).json()
  const token = /token=([A-Za-z0-9_-]{43})/.exec(full.Text + (full.HTML ?? ''))?.[1]
  if (!token) throw new Error('invitation token not found in mail')
  const anon = new (await import('../lib.mjs')).Api(`${ORG.slug}.localhost:5174`)
  await anon.post('/api/v1/organization-auth/invitations/accept', {
    token,
    firstName: SALMA.firstName,
    lastName: SALMA.lastName,
    password: SALMA.password,
  })
}
export async function run() {
  const rec = await openSession(meta.id, { outDir: CLIPS_OUT, webm: false })
  const { page } = rec
  rec.delay = 14
  rec.mv = 0.5
  await page.goto(`${HOSTS.org(ORG.slug)}/login`)
  await page.waitForSelector('input[name=email]')
  await sleep(900)
  await rec.start()
  await rec.type('input[name=email]', SALMA.email, 'Saisie de l’e-mail de Salma')
  await rec.type('input[name=password]', SALMA.password, 'Saisie du mot de passe', { delay: 8 })
  await rec.click('button[type=submit]', 'Clic sur « Se connecter »', { settle: 0 })
  await rec.cut(async () => {
    await page.waitForURL(/workspace/, { timeout: 20000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page
      .getByText(/Chargement/)
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => {})
    await sleep(800)
  })
  await rec.pause(3200, 'Le menu de Salma : uniquement ses modules')
  // opens the settings page by its URL: the app answers with its access-denied state
  await rec.cut(async () => {
    await page.goto(`${WS}/settings`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await sleep(900)
  })
  await rec.pause(3200, 'Accès aux paramètres refusé')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await prepare()
  const rec = await run()
  await rec.finish()
}
