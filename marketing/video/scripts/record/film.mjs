// Records the short marketing film clips from DB snapshots into public/clips (mp4 + json each).
//   node film.mjs                 all clips
//   node film.mjs --only clip4    one clip (id prefix, e.g. clip4 or clip4-facture); repeatable
// Snapshots (ch03, ch06, ch07, ch09, seeded) come from run-all.mjs; each clip restores its own snapshot first.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { HERE, clearMailFor } from './lib.mjs'
import { resetApiCache } from './seed.mjs'
import { CLIENT, KARIM } from './data.mjs'

const CLIPS = [
  'clip1-vue-ensemble',
  'clip2-nouvelle-organisation',
  'clip3-tableau-de-bord',
  'clip4-facture',
  'clip5-retards',
  'clip6-relance-paiement',
  'clip7-rapport',
  'clip8-invitation',
  'clip9-modele',
]
const args = process.argv.slice(2)
const only = args.flatMap((a, i) => (a === '--only' ? [args[i + 1]] : []))
const todo = CLIPS.filter((c) => !only.length || only.some((o) => c === o || c.startsWith(o + '-')))
const env = (...a) =>
  execFileSync('bash', [path.join(HERE, '../demo-env.sh'), ...a], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })

const mods = await Promise.all(todo.map((c) => import(`./film/${c}.mjs`)))
// Group by snapshot so each is restored once, in the original order otherwise.
const order = [...mods].sort((a, b) => a.meta.snapshot.localeCompare(b.meta.snapshot))
let current = null
for (const m of order) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`== ${m.meta.id} (snapshot ${m.meta.snapshot}, attempt ${attempt})`)
    env('restore', m.meta.snapshot)
    current = m.meta.snapshot
    resetApiCache()
    for (const a of [KARIM.email, CLIENT.email, 'salma.idrissi@atlas-negoce.ma'])
      await clearMailFor(a)
    try {
      await m.prepare?.()
      const rec = await m.run()
      await rec.finish()
      break
    } catch (e) {
      console.error(`${m.meta.id} failed: ${String(e.message).split('\n')[0]}`)
      if (attempt === 3) process.exitCode = 1
    }
  }
}
console.log(`done: ${todo.length} clip(s) -> public/clips`)
