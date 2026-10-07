import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as tables from '../../db/schema/index.js'

export const testUserId = '11111111-1111-4111-8111-111111111111'
export async function isolatedDatabase(
  beforeMigration?: (name: string, client: ReturnType<typeof postgres>) => Promise<void>,
) {
  const value = process.env.TEST_DATABASE_URL
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required for integration tests (use the dedicated test container).',
    )
  const url = new URL(value)
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/\w+_test$/.test(url.pathname)
  )
    throw new Error('Integration tests require a localhost database with a name ending in _test.')
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `foundation_test_${suffix}`
  const role = `foundation_app_${suffix}`
  const admin = postgres(value, { max: 1, onnotice: () => {} })
  const client = postgres(value, {
    max: 4,
    connection: { search_path: `${schema},pg_catalog` },
    onnotice: () => {},
  })
  const cleanup = async () => {
    // Only identifiers created by this fixture may be targeted by cascading cleanup.
    if (
      !/^foundation_test_[a-f0-9]{32}$/.test(schema) ||
      !/^foundation_app_[a-f0-9]{32}$/.test(role)
    )
      throw new Error('Unsafe fixture cleanup')
    await client.end({ timeout: 2 })
    try {
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await admin.unsafe(`DROP ROLE IF EXISTS "${role}"`)
    } finally {
      await admin.end({ timeout: 2 })
    }
  }
  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`)
    await admin.unsafe(`CREATE ROLE "${role}" NOLOGIN`)
    const migrationDir = new URL('../../db/migrations/', import.meta.url)
    for (const name of (await readdir(migrationDir))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const baseline = await readFile(new URL(name, migrationDir), 'utf8')
      await beforeMigration?.(name, client)
      // gen_random_uuid is native in supported PostgreSQL; do not mutate cluster extensions.
      await client.unsafe(
        baseline
          .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '')
          .replaceAll('"public".', `"${schema}".`),
      )
    }
    await client`INSERT INTO users (id, email, password_hash, first_name, last_name, must_change_password) VALUES (${testUserId}, 'operator@example.test', 'fixture-not-a-login-hash', 'Test', 'Operator', false)`
    await admin.unsafe(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`)
    await admin.unsafe(`GRANT SELECT, INSERT, UPDATE ON "${schema}".users TO "${role}"`)
    await admin.unsafe(`GRANT SELECT, INSERT ON "${schema}".audit_events TO "${role}"`)
    return { db: drizzle(client, { schema: tables }), client, role, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
