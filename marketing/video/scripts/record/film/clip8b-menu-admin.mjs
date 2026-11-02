// Clip 8b (left side): Karim, administrator, whose sidebar shows every module. Short pass over the menu.
import { openFilmWorkspace } from './common.mjs'

export const meta = { id: 'clip8b-menu-admin', snapshot: 'ch08' }
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/dashboard')
  const { page } = rec
  rec.mv = 0.45
  await rec.pause(600, 'Karim voit tous les modules')
  const links = page.locator('aside a, nav a').filter({ hasText: /\S/ })
  const n = Math.min(await links.count(), 14)
  for (let i = 0; i < n; i += 2) await rec.hover(links.nth(i), 'Menu complet').catch(() => {})
  await rec.pause(2400, 'Menu complet de l’administrateur')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
