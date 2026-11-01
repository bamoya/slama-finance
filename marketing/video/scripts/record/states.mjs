import { OUT } from './lib.mjs'
import { stateFor, staffApi, ownerApi } from './seed.mjs'
import { KARIM, ORG } from './data.mjs'
export async function makeStates() {
  const w = await staffApi(ORG.slug, KARIM.email)
  stateFor(w, `${OUT}/raw/ws.state.json`)
  const o = await ownerApi()
  stateFor(o, `${OUT}/raw/owner.state.json`)
}
if (import.meta.url === `file://${process.argv[1]}`) await makeStates()
