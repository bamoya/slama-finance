// Shared helpers for the short marketing film clips (recorded from DB snapshots, no sign-up).
import path from 'node:path'
import { HOSTS, HERE, OUT, openSession, sleep } from '../lib.mjs'
import { ORG, demoPeriod } from '../data.mjs'

export const CLIPS_OUT = path.resolve(HERE, '../../public/clips')
export const WS = HOSTS.org(ORG.slug) + '/workspace'
const base = { outDir: CLIPS_OUT, webm: false }

/** Open the Atlas Négoce workspace (Karim signed in) at `p`; the timeline starts once the page is ready. */
export async function openFilmWorkspace(clip, p) {
  const rec = await openSession(clip, { ...base, storageState: `${OUT}/raw/ws.state.json` })
  await rec.page.goto(WS + p)
  await rec.page.waitForLoadState('networkidle').catch(() => {})
  await sleep(1000)
  await rec.start()
  return rec
}
/** Owner space (app.localhost). `signedIn:false` opens a clean browser for the login clip. */
export async function openFilmOwner(clip, p = '/', { signedIn = true } = {}) {
  const rec = await openSession(clip, {
    ...base,
    storageState: signedIn ? `${OUT}/raw/owner.state.json` : undefined,
  })
  await rec.page.goto(HOSTS.owner + p)
  await rec.page.waitForLoadState('networkidle').catch(() => {})
  await sleep(1000)
  await rec.start()
  return rec
}
/**
 * Pick the scenario period (DEMO_PERIOD in data.mjs, the 3 months ending today) in the shared range picker.
 * The picker has no presets: go back `monthsBack` months, click the first day, come forward, click today.
 */
export async function pickRange(rec, field) {
  const { page } = rec
  const { start, monthsBack } = demoPeriod()
  await rec.click(field, 'Choix de la période', { settle: 200 })
  const nav = page.locator('nav.rdp-nav button')
  for (let i = 0; i < monthsBack; i++)
    await rec.click(nav.first(), 'Mois précédent', { settle: 60 })
  await rec.click(
    page.locator(`[data-day="${start}"] button, button[data-day="${start}"]`).first(),
    'Début de période',
    { settle: 80 },
  )
  for (let i = 0; i < monthsBack; i++) await rec.click(nav.last(), 'Mois suivant', { settle: 60 })
  // the picker opens on today..today: clicking an earlier first day already gives start..today (clicking today again would reset it)
  await rec.click(page.getByRole('button', { name: 'Appliquer' }), 'Appliquer la période', {
    settle: 0,
  })
  // never show loading states: cut until the new period is fully rendered
  await rec.cut(async () => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page
      .getByText(/Chargement/)
      .first()
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => {})
    await sleep(700)
  })
}

/** Open a recorded session on a blank page (the timeline starts at once); used by clips that begin on the inbox frame. */
export async function openFilmBlank(clip, { signedIn = true } = {}) {
  const rec = await openSession(clip, {
    ...base,
    storageState: signedIn ? `${OUT}/raw/ws.state.json` : undefined,
  })
  await rec.start()
  return rec
}

/** Throws unless the picker label shows the scenario period (guards against a silently wrong range). */
export async function assertPeriod(rec) {
  const { start, end } = demoPeriod()
  const fr = (d) => d.split('-').reverse().join('-')
  await rec.page
    .getByText(new RegExp(`${fr(start)} – \\d\\d-\\d\\d-\\d{4}`))
    .first()
    .waitFor({ timeout: 8000 })
    .catch(async (e) => {
      const labels = await rec.page.getByText(/\d\d-\d\d-\d{4} – \d\d-\d\d-\d{4}/).allTextContents()
      await rec.page.screenshot({ path: '/tmp/period-fail.png' })
      throw new Error(
        `period label is ${JSON.stringify(labels)}, expected ${fr(start)} – ${fr(end)}: ${e.message}`,
      )
    })
}
