// Operator tool until the SaaS administration portal (task 12) exists.
// Usage: pnpm subscription:payment <confirm|reject|list> [paymentId] --by <operator>
//   [--received <bank ref>] (confirm) | --reason <shown to the owner> (reject, required)
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { parseArgs } from 'node:util'

import { sql } from 'drizzle-orm'

import { createDatabase } from '../src/lib/db.js'
import { createSubscriptionsModule } from '../src/modules/platform/subscriptions/index.js'

if (existsSync('.env')) loadEnvFile('.env')
const url = process.env.MIGRATION_DATABASE_URL
if (!url) throw new Error('MIGRATION_DATABASE_URL is required for payment administration.')
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    by: { type: 'string' },
    received: { type: 'string' },
    reason: { type: 'string' },
  },
})
const [action, id] = positionals
const { db, close } = createDatabase(url, 1)
try {
  const admin = createSubscriptionsModule(() => db).administration
  if (action === 'list') {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_type','platform_admin',true)`)
      return tx.execute(
        sql`select p.id,u.email,p.plan_code,p.cycle,p.kind,p.method,p.reference,p.amount_ttc,p.submitted_at from subscription_payments p join platform_users u on u.id=p.owner_id where p.status='submitted' order by p.submitted_at`,
      )
    })
    console.table(rows)
  } else if (
    id &&
    values.by &&
    (action === 'confirm' || (action === 'reject' && values.reason?.trim()))
  ) {
    const result =
      action === 'confirm'
        ? await admin.confirm(id, values.by, values.received)
        : await admin.reject(id, values.by, values.reason!)
    console.log(JSON.stringify(result, null, 2))
  } else {
    throw new Error(
      'Usage: confirm <paymentId> --by <operator> [--received <ref>] | reject <paymentId> --by <operator> --reason <text> | list',
    )
  }
} finally {
  await close()
}
