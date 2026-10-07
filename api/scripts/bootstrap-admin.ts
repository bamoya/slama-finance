import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import postgres from 'postgres'

import { PasswordResetRequestSchema } from '../src/contracts/generated/identity/auth.schemas.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'

if (existsSync('.env')) loadEnvFile('.env')
const email = PasswordResetRequestSchema.parse({ email: process.argv[2]?.toLowerCase() }).email
const connection = process.env.MIGRATION_DATABASE_URL
if (!connection) throw new Error('MIGRATION_DATABASE_URL is required')
const target = new URL(connection)
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/slama_finance'
)
  throw new Error('This bootstrap command is restricted to the local slama_finance database')

const sql = postgres(connection, { max: 1, onnotice: () => {} })
try {
  const password = randomBytes(24).toString('base64url')
  const passwordHash = await createPasswordService().hash(password)
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73619001)`
    if ((await tx`SELECT id FROM users LIMIT 1`).length)
      throw new Error('Bootstrap refused: users already exist; no account was changed')
    const [role] = await tx`SELECT id FROM roles WHERE key = 'admin' AND is_system = true`
    if (!role) throw new Error('Administrator role missing; run migrations first')
    const [user] =
      await tx`INSERT INTO users (email, password_hash, first_name, last_name, must_change_password, password_changed_at)
      VALUES (${email}, ${passwordHash}, 'Slama', 'Administrator', false, now()) RETURNING id`
    await tx`INSERT INTO user_settings (user_id) VALUES (${user!.id})`
    await tx`INSERT INTO user_roles (user_id, role_id) VALUES (${user!.id}, ${role.id})`
  })
  // Local interactive bootstrap only; never emitted by the server or stored in a file.
  // eslint-disable-next-line no-console -- Explicit one-time credential handoff to the operator.
  console.log(`Administrator created: ${email}\nPassword (save now): ${password}`)
} catch (error) {
  // eslint-disable-next-line no-console -- CLI failure, not an HTTP/server log.
  console.error(error instanceof Error ? error.message : 'Bootstrap failed')
  process.exitCode = 1
} finally {
  await sql.end()
}
