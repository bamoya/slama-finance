import { HOSTS, OUT, openSession, sleep } from './lib.mjs'
import { ORG } from './data.mjs'
export const WS = HOSTS.org(ORG.slug) + '/workspace'
/** Open a recorded session on the workspace (Karim signed in) at `path`; timeline starts when ready. */
export async function openWorkspace(chapter, path, { state = 'ws' } = {}) {
  const rec = await openSession(chapter, { storageState: `${OUT}/raw/${state}.state.json` })
  await rec.page.goto(WS + path)
  await rec.page.waitForLoadState('networkidle').catch(() => {})
  await sleep(1200)
  await rec.start()
  return rec
}
export const run = async (fn) => {
  const rec = await fn()
  await rec.finish()
}
