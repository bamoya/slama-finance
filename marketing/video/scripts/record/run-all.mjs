// Full pipeline: fresh demo DB -> ch01..ch09 with DB snapshots between chapters.
//   node run-all.mjs                 everything
//   node run-all.mjs --only ch05     re-record one chapter from the previous chapter's snapshot
//   node run-all.mjs --from ch05     re-record ch05..ch09 from the previous snapshot
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { HERE, clearMailFor } from './lib.mjs'
import { CLIENT, KARIM } from './data.mjs'

const env = (...a) => execFileSync('bash', [path.join(HERE, '../demo-env.sh'), ...a], { stdio: ['ignore', 'ignore', 'inherit'] })
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null

const CHAPTERS = ['ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09']
const FILE = { ch01: 'ch01-inscription', ch02: 'ch02-organisation', ch03: 'ch03-client', ch04: 'ch04-modele', ch05: 'ch05-devis', ch06: 'ch06-facture', ch07: 'ch07-paiement-relance', ch08: 'ch08-equipe', ch09: 'ch09-rapports' }
const PREV = { ch03: 'seeded', ch04: 'ch03', ch05: 'ch04', ch06: 'ch05', ch07: 'ch06', ch08: 'ch07', ch09: 'ch08', ch02: 'ch01' }

async function chapter(id) {
  const m = await import(`./${FILE[id]}.mjs`)
  const rec = await m.run()
  await rec.finish()
}
async function after(id) {
  if (id === 'ch01') env('snapshot', 'ch01')
  if (id === 'ch02') {
    env('snapshot', 'ch02')
    await import('./seed-all.mjs')
    env('snapshot', 'seeded')
  }
  if (id === 'ch04') {
    const b = await import('./between.mjs')
    await b.setDefaultTemplate(); await b.enableNotifications()
  }
  if (id === 'ch08') await (await import('./between.mjs')).createMonthlySchedule()
  if (!['ch01', 'ch02'].includes(id)) env('snapshot', id)
}

const todo = only ? [only] : CHAPTERS.slice(from ? CHAPTERS.indexOf(from) : 0)
if (todo[0] === 'ch01') env('fresh')
else env('restore', PREV[todo[0]])
for (const a of [KARIM.email, CLIENT.email, 'salma.idrissi@atlas-negoce.ma', 'nadia.chraibi@atlas-negoce.ma']) await clearMailFor(a)
for (const id of todo) {
  console.log('==', id)
  await chapter(id)
  await after(id)
}
