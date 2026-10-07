import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import postgres from 'postgres'

if (existsSync('.env')) loadEnvFile('.env')

const runtimeUrl = process.env.DATABASE_URL
const migrationUrl = process.env.MIGRATION_DATABASE_URL
if (!runtimeUrl || !migrationUrl)
  throw new Error('Both DATABASE_URL and MIGRATION_DATABASE_URL are required.')

const runtime = new URL(runtimeUrl)
const migration = new URL(migrationUrl)
if (
  runtime.hostname !== migration.hostname ||
  runtime.port !== migration.port ||
  runtime.pathname !== migration.pathname
)
  throw new Error('Runtime and migration URLs must target the same database.')

const runtimeRole = decodeURIComponent(runtime.username)
if (
  !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(runtimeRole) ||
  runtimeRole === decodeURIComponent(migration.username)
)
  throw new Error('Expected a distinct, simple runtime database role.')

const grants = [
  ['SELECT', ['audit_events']],
  ['SELECT, INSERT, UPDATE', ['document_artifacts']],
  ['SELECT, INSERT, UPDATE', ['background_jobs']],
  [
    'SELECT, INSERT, UPDATE',
    ['notification_rules', 'outbound_messages', 'notification_dispatches', 'report_runs'],
  ],
  ['SELECT, INSERT, DELETE', ['outbound_message_attachments']],
  [
    'SELECT, INSERT, UPDATE, DELETE',
    ['client_notification_preferences', 'report_schedules', 'report_schedule_recipients'],
  ],
  [
    'SELECT, INSERT, UPDATE, DELETE',
    [
      'payments',
      'estimates',
      'estimate_lines',
      'invoices',
      'invoice_lines',
      'delivery_notes',
      'delivery_note_lines',
    ],
  ],
  ['SELECT, INSERT, DELETE', ['delivery_invoice_allocations']],
] as const

const owner = postgres(migrationUrl, { max: 1 })
try {
  await owner.begin(async (tx) => {
    for (const [privileges, tables] of grants) {
      for (const table of tables) {
        // Privileges/table names are fixed above; role is strictly validated.
        await tx.unsafe(`GRANT ${privileges} ON TABLE public.${table} TO "${runtimeRole}"`)
      }
    }
  })
  process.stdout.write(
    `Granted sales runtime access on ${grants.reduce((total, [, tables]) => total + tables.length, 0)} tables to ${runtimeRole}.\n`,
  )
} finally {
  await owner.end()
}
