// Run after ch02 (DB snapshot "ch02"): seeds history, second org, team, and writes browser sessions.
import { seed } from './seed.mjs'
import { seedExport } from './seed-export.mjs'
import { seedTeam } from './seed-team.mjs'
import { makeStates } from './states.mjs'
await seed(); await seedExport(); await seedTeam(); await makeStates()
