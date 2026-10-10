import { pathToFileURL } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { seedCatalog } from './seed-catalog.mjs'

export function configuration(env) {
  if (!env.DATABASE_URL || !env.MIGRATION_DATABASE_URL)
    throw new Error('Both runtime and migration database URLs are required')
  const runtime = new URL(env.DATABASE_URL)
  const owner = new URL(env.MIGRATION_DATABASE_URL)
  if (
    !['postgres:', 'postgresql:'].includes(runtime.protocol) ||
    !['postgres:', 'postgresql:'].includes(owner.protocol) ||
    runtime.hostname !== owner.hostname ||
    (runtime.port || '5432') !== (owner.port || '5432') ||
    runtime.pathname !== owner.pathname
  )
    throw new Error('Database URLs must target the same PostgreSQL database')
  const role = decodeURIComponent(runtime.username)
  const password = decodeURIComponent(runtime.password)
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/.test(role) ||
    role.startsWith('pg_') ||
    role === decodeURIComponent(owner.username)
  )
    throw new Error('A distinct, simple runtime role is required')
  if (!password) throw new Error('Runtime password is required')
  return { role, password, database: decodeURIComponent(owner.pathname.slice(1)) }
}

// Explicit allowlist: new tables require a reviewed grant, never automatic ALL privileges.
export const writableTables = [
  'password_reset_tokens',
  'role_permissions',
  'roles',
  'sessions',
  'user_roles',
  'user_settings',
  'users',
  'bank_accounts',
  'company_settings',
  'document_templates',
  'media_assets',
  'product_categories',
  'product_variants',
  'products',
  'clients',
  'payments',
  'estimates',
  'estimate_lines',
  'invoices',
  'invoice_lines',
  'delivery_notes',
  'delivery_note_lines',
  'client_notification_preferences',
  'report_schedules',
  'report_schedule_recipients',
  'document_artifacts',
  'outbound_messages',
  'notification_dispatches',
  'report_runs',
]
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"'
const literal = (value) => "'" + value.replaceAll("'", "''") + "'"

const safeFailureMessages = new Set([
  'Both runtime and migration database URLs are required',
  'Database URLs must target the same PostgreSQL database',
  'A distinct, simple runtime role is required',
  'Runtime password is required',
  'Existing runtime role has elevated privileges; refusing initialization',
  'Runtime role must not inherit roles or own databases',
  'Valid bootstrap email and password are required',
  'Administrator role missing; run migrations first',
  'Demo seed requires an existing administrator',
  'Demo seed requires active starter catalogue variants',
])

export async function initializeDatabase(env = process.env) {
  const config = configuration(env)
  const owner = postgres(env.MIGRATION_DATABASE_URL, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 10,
    idle_timeout: 0,
    max_lifetime: 0,
  })
  const runtime = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {}, connect_timeout: 10 })
  const connection = owner
  try {
    // A dedicated single-connection client (no idle/lifetime recycling) holds this
    // session lock through migrations and provisioning; no parallel queries use it.
    await connection`SELECT pg_advisory_lock(1936482669, 1)`
    const roles =
      await connection`SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = ${config.role}`
    if (roles.some((role) => Object.values(role).some(Boolean)))
      throw new Error('Existing runtime role has elevated privileges; refusing initialization')
    const memberships =
      await connection`SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = ${config.role}`
    const ownership =
      await connection`SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE r.rolname = ${config.role}`
    if (memberships.length || ownership.length)
      throw new Error('Runtime role must not inherit roles or own databases')
    // Validate existing credentials before changing schema; never silently rotate passwords.
    if (roles.length) await runtime`SELECT 1`
    await migrate(drizzle(connection), {
      migrationsFolder: new URL('../db/migrations/', import.meta.url).pathname,
    })
    await connection.begin(async (tx) => {
      await tx`SET LOCAL standard_conforming_strings = on`
      if (!roles.length)
        await tx.unsafe(
          `CREATE ROLE ${identifier(config.role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(config.password)}`,
        )
      const role = identifier(config.role)
      await tx.unsafe(`GRANT CONNECT ON DATABASE ${identifier(config.database)} TO ${role}`)
      await tx.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`)
      await tx.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`)
      for (const table of writableTables)
        await tx.unsafe(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${identifier(table)} TO ${role}`,
        )
      for (const [privileges, tables] of [
        ['SELECT', ['permissions']],
        ['SELECT, INSERT', ['audit_events']],
        ['SELECT, INSERT, UPDATE', ['background_jobs', 'notification_rules']],
        [
          'SELECT, INSERT, DELETE',
          ['outbound_message_attachments', 'delivery_invoice_allocations'],
        ],
      ])
        for (const table of tables)
          await tx.unsafe(`GRANT ${privileges} ON TABLE public.${identifier(table)} TO ${role}`)
    })
    await runtime`SELECT 1 FROM public.users LIMIT 1`
    if (env.BOOTSTRAP_ADMIN_EMAIL || env.BOOTSTRAP_ADMIN_PASSWORD) {
      const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
      const password = env.BOOTSTRAP_ADMIN_PASSWORD
      await connection.begin(async (tx) => {
        // Bootstrap only an empty installation. Never reset or elevate existing accounts.
        if ((await tx`SELECT id FROM public.users LIMIT 1`).length) return
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password)
          throw new Error('Valid bootstrap email and password are required')
        const [role] =
          await tx`SELECT id FROM public.roles WHERE key = 'admin' AND is_system = true`
        if (!role) throw new Error('Administrator role missing; run migrations first')
        const { createPasswordService } =
          await import('../dist/src/modules/identity/auth/services/password.service.js')
        const hash = await createPasswordService().hash(password)
        const [user] = await tx`INSERT INTO public.users
          (email, password_hash, first_name, last_name, must_change_password, temporary_password_expires_at)
          VALUES (${email}, ${hash}, 'Yassin', 'Bassim', true, now() + interval '7 days') RETURNING id`
        await tx`INSERT INTO public.user_settings (user_id) VALUES (${user.id})`
        await tx`INSERT INTO public.user_roles (user_id, role_id) VALUES (${user.id}, ${role.id})`
        await tx`INSERT INTO public.role_permissions (role_id, permission_id)
          SELECT ${role.id}, id FROM public.permissions ON CONFLICT DO NOTHING`
      })
    }
    // Business seed is deliberately opt-in, and journaled separately from schema migrations.
    if (env.SEED_CATALOG === 'true') await seedCatalog(connection)
    if (env.SEED_DEMO === 'true') {
      const { seedDemo } = await import('./seed-demo.mjs')
      await seedDemo(connection)
    }
  } finally {
    if (connection) {
      await connection`SELECT pg_advisory_unlock(1936482669, 1)`.catch(() => {})
    }
    await Promise.all([owner.end({ timeout: 5 }), runtime.end({ timeout: 5 })])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  initializeDatabase()
    .then(() => {
      console.log('Database migrations and runtime access initialized successfully.')
      console.log('Seed configuration:', {
        catalog: process.env.SEED_CATALOG === 'true',
        demo: process.env.SEED_DEMO === 'true',
      })
    })
    .catch((error) => {
      // Never log SQL/URLs/passwords from driver errors, especially CREATE ROLE queries.
      console.error('Database initialization failed.', {
        code: error.code || 'INITIALIZATION_FAILED',
        reason: safeFailureMessages.has(error.message)
          ? error.message
          : 'Check database connection, URL encoding, and migration configuration',
      })
      process.exitCode = 1
    })
}
