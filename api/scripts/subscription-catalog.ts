// Operator tool: selling pointer of each plan (no HTTP endpoint; migration role only, audited by the
// database trigger). Publication never moves it and never repins existing coverage.
// Usage: pnpm subscription:catalog list | select <plan> <version> --by <operator> | withdraw <plan> --by <operator>
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { parseArgs } from 'node:util'

import { sql } from 'drizzle-orm'

import { createDatabase } from '../src/lib/db.js'

if (existsSync('.env')) loadEnvFile('.env')
const url = process.env.MIGRATION_DATABASE_URL
if (!url) throw new Error('MIGRATION_DATABASE_URL is required for catalog administration.')
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { by: { type: 'string' } },
})
const [action, plan, version] = positionals
const by = values.by?.trim()
const { db, close } = createDatabase(url, 1)
try {
  if (action === 'list') {
    const rows = await db.execute(
      sql`select p.code plan, s.plan_version_id is null withdrawn, v.version_number selling,
        (select string_agg(x.version_number::text||':'||x.status,', ' order by x.version_number)
           from plan_versions x where x.plan_code=p.code) versions, s.changed_at, s.changed_by
        from subscription_plans p left join plan_selling s on s.plan_code=p.code
        left join plan_versions v on v.id=s.plan_version_id order by p.rank`,
    )
    console.table(rows)
  } else if (action === 'select' && plan && /^[1-9]\d*$/.test(version ?? '') && by) {
    const [row] = await db.execute(
      sql`update plan_selling set plan_version_id=(select id from plan_versions where plan_code=${plan}
        and version_number=${Number(version)}), changed_by=${by} where plan_code=${plan} returning plan_code`,
    )
    if (!row) throw new Error(`Unknown plan ${plan}.`)
    console.log(`Selling ${plan} version ${version}.`)
  } else if (action === 'withdraw' && plan && !version && by) {
    const [row] = await db.execute(
      sql`update plan_selling set plan_version_id=null, changed_by=${by} where plan_code=${plan} returning plan_code`,
    )
    if (!row) throw new Error(`Unknown plan ${plan}.`)
    console.log(`Withdrew ${plan} from sale; existing coverage keeps its version.`)
  } else {
    throw new Error(
      'Usage: list | select <plan> <version> --by <operator> | withdraw <plan> --by <operator>',
    )
  }
} finally {
  await close()
}
