import { pathToFileURL } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

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
  'platform_users',
  'organization_profiles',
  'organization_brand_assets',
  'owner_sessions',
  'owner_account_tokens',
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
        [
          'SELECT',
          [
            'permissions',
            'subscription_plans',
            'billing_settings',
            'entitlement_definitions',
            'plan_versions',
            'plan_entitlements',
            'plan_version_prices',
          ],
        ],
        ['SELECT, INSERT', ['organizations']],
        // Former addresses; delete only when an organization takes back its own old slug.
        ['SELECT, INSERT, DELETE', ['organization_slug_history']],
        [
          'SELECT, INSERT',
          [
            'audit_events',
            'actors',
            'owner_subscriptions',
            'subscription_emails',
            'subscription_payments',
            'subscription_overrides',
            'subscription_override_notes',
          ],
        ],
        ['SELECT, INSERT, UPDATE, DELETE', ['subscription_storage']],
        ['SELECT, INSERT, UPDATE', ['platform_admins', 'platform_admin_sessions']],
        // Removed or regenerated by the administrator after reauthentication; expired WebAuthn
        // challenges are pruned in bounded batches when new ones are issued.
        [
          'SELECT, INSERT, UPDATE, DELETE',
          [
            'platform_admin_passkeys',
            'platform_admin_recovery_codes',
            'platform_admin_webauthn_challenges',
          ],
        ],
        // Append-only administrator audit trail.
        ['SELECT, INSERT', ['platform_admin_audit']],
        [
          'SELECT, INSERT, UPDATE',
          [
            'background_jobs',
            'organization_admin_deliveries',
            'staff_invitations',
            'staff_invitation_roles',
            'notification_rules',
          ],
        ],
        [
          'SELECT, INSERT, DELETE',
          ['outbound_message_attachments', 'delivery_invoice_allocations'],
        ],
      ])
        for (const table of tables)
          await tx.unsafe(`GRANT ${privileges} ON TABLE public.${identifier(table)} TO ${role}`)
      await tx.unsafe(
        `GRANT UPDATE (name, slug, locale, updated_at, activated_at, suspended_at, suspension_source) ON public.organizations TO ${role}`,
      )
      // Payment decisions, coverage and billing configuration additionally require the
      // platform_admin transaction context (RLS policies and update guards).
      await tx.unsafe(
        `GRANT UPDATE (cancel_at_period_end, paid_through_at, plan_code, suspended_at, trial_ends_at) ON public.owner_subscriptions TO ${role}`,
      )
      await tx.unsafe(
        `GRANT UPDATE (status, coverage_start, coverage_end, decided_at, decided_by, received_reference, rejection_reason) ON public.subscription_payments TO ${role}`,
      )
      // S5b coverage writers (dual write). Rows are append-only (trigger guards): the runtime inserts,
      // records a supersession or a scheduled-change status, and shifts windows only through the
      // administrator-only SECURITY DEFINER function on resume.
      for (const table of [
        'subscription_periods',
        'subscription_period_notes',
        'subscription_suspensions',
        'subscription_scheduled_changes',
      ])
        await tx.unsafe(`GRANT SELECT, INSERT ON TABLE public.${identifier(table)} TO ${role}`)
      await tx.unsafe(
        `GRANT UPDATE (superseded_at, superseded_by) ON public.subscription_periods TO ${role}`,
      )
      await tx.unsafe(`GRANT UPDATE (status) ON public.subscription_scheduled_changes TO ${role}`)
      await tx.unsafe(
        `GRANT EXECUTE ON FUNCTION public.subscription_periods_shift(uuid, timestamptz, bigint) TO ${role}`,
      )
      // Override history is append-only; revocation fills its fields once (trigger guards).
      await tx.unsafe(`GRANT UPDATE (revoked_at) ON public.subscription_overrides TO ${role}`)
      await tx.unsafe(
        `GRANT UPDATE (revoked_by, revocation_reason) ON public.subscription_override_notes TO ${role}`,
      )
      await tx.unsafe(
        `GRANT UPDATE (tax_rate_basis_points, payment_methods, payment_instructions) ON public.billing_settings TO ${role}`,
      )
    })
    await runtime`SELECT 1 FROM public.users LIMIT 1`
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
