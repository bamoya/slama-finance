import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { createPasswordService } from '../src/lib/password.js'

const run = promisify(execFile)
const apiDir = fileURLToPath(new URL('..', import.meta.url))
const password = 'release-path-password-2026'

/** Every supported release seam: its compose files (merged in order) and whether it provisions the runtime role. */
const targets = [
  { name: 'dokploy', files: ['docker-compose.dokploy.yml'], runtime: true },
  { name: 'production', files: ['docker-compose.production.yml'], runtime: false },
  {
    name: 'lightsail',
    files: ['docker-compose.production.yml', 'docker-compose.lightsail-dev.yml'],
    runtime: false,
  },
  { name: 'coolify', files: ['docker-compose.coolify-dev.yml'], runtime: false },
] as const

type Service = { command?: string[]; environment?: Record<string, string> | string[] }

async function migrateService(files: readonly string[]) {
  let merged: { command?: string[]; environment: string[] } = { environment: [] }
  const api: string[] = []
  for (const file of files) {
    const doc = parse(
      await readFile(new URL(`../../infra/compose/${file}`, import.meta.url), 'utf8'),
    ) as { services: Record<string, Service> }
    const names = (environment: Service['environment']) =>
      Array.isArray(environment)
        ? environment.map((entry) => entry.split('=')[0]!)
        : Object.keys(environment ?? {})
    api.push(...names(doc.services.api?.environment))
    const migrate = doc.services.migrate!
    merged = {
      command: migrate.command ?? merged.command,
      environment: [...merged.environment, ...names(migrate.environment)],
    }
  }
  return { ...merged, apiEnvironment: api }
}

function testServer() {
  const value = process.env.TEST_DATABASE_URL
  if (!value) throw new Error('TEST_DATABASE_URL is required')
  const url = new URL(value)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Dedicated local test database required')
  return url
}

/** Runs the service command exactly as compose would, from the release image's working directory. */
async function execute(command: string[], env: Record<string, string>) {
  try {
    const { stdout, stderr } = await run(command[0]!, command.slice(1), {
      cwd: apiDir,
      env: { PATH: process.env.PATH!, HOME: process.env.HOME!, NODE_ENV: 'production', ...env },
      timeout: 60_000,
    })
    return { code: 0, output: stdout + stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? 1, output: (failure.stdout ?? '') + (failure.stderr ?? '') }
  }
}

describe.each(targets)('$name release migrate step', (target) => {
  it('migrates, then creates the configured administrator once; failures stop the job', async () => {
    const service = await migrateService(target.files)
    expect(service.command?.slice(0, 2)).toEqual(['sh', '-c'])
    expect(service.command![2]).toMatch(/ && node --import tsx scripts\/bootstrap-admin\.ts$/)
    expect(service.environment).toEqual(
      expect.arrayContaining([
        'MIGRATION_DATABASE_URL',
        'ADMIN_EMAIL',
        'ADMIN_PASSWORD',
        'ADMIN_NAME',
      ]),
    )
    // Bootstrap credentials stay in the one-shot privileged job, never the API runtime.
    expect(service.apiEnvironment).not.toContain('ADMIN_PASSWORD')
    expect(service.apiEnvironment).not.toContain('MIGRATION_DATABASE_URL')

    const url = testServer()
    const suffix = randomUUID().replaceAll('-', '')
    const database = `release_${target.name}_${suffix}`
    const role = `release_role_${suffix}`
    const server = postgres(url.toString(), { max: 1, onnotice: () => {} })
    let owner: postgres.Sql | undefined
    try {
      await server.unsafe(`CREATE DATABASE "${database}"`)
      url.pathname = `/${database}`
      const ownerUrl = url.toString()
      url.username = role
      url.password = 'release_runtime_password'
      const base: Record<string, string> = { MIGRATION_DATABASE_URL: ownerUrl }
      if (target.runtime) base.DATABASE_URL = url.toString()
      const env = { ...base, ADMIN_EMAIL: 'Release@Example.TEST', ADMIN_PASSWORD: password }

      // A failing migration stops the job before the bootstrap runs.
      const broken = new URL(ownerUrl)
      broken.pathname = `/missing_${suffix}`
      const stopped = await execute(service.command!, {
        ...env,
        MIGRATION_DATABASE_URL: broken.toString(),
        ...(target.runtime ? { DATABASE_URL: broken.toString() } : {}),
      })
      expect(stopped.code).not.toBe(0)
      expect(stopped.output).not.toContain('Administrator bootstrap')

      // Fresh database: the bootstrap only succeeds because migrations ran first.
      const first = await execute(service.command!, env)
      expect(first.code, first.output).toBe(0)
      expect(first.output).toContain(
        'Administrator bootstrap created the configured administrator.',
      )
      expect(first.output).not.toContain(password)
      owner = postgres(ownerUrl, { max: 1, onnotice: () => {} })
      const admins = await owner`select * from platform_admins`
      expect(admins).toHaveLength(1)
      expect(admins[0]!.email).toBe('release@example.test')
      expect(await createPasswordService().verify(password, admins[0]!.password_hash)).toBe(true)

      // Rerun with a different password: unchanged.
      const again = await execute(service.command!, {
        ...env,
        ADMIN_PASSWORD: 'another-password-2027',
      })
      expect(again.code, again.output).toBe(0)
      expect(again.output).toContain('left the existing administrator unchanged')
      expect(await owner`select * from platform_admins`).toEqual(admins)

      // Unset credentials skip; a partial pair fails the job after migrating.
      expect((await execute(service.command!, base)).code).toBe(0)
      const partial = await execute(service.command!, { ...base, ADMIN_EMAIL: 'x@example.test' })
      expect(partial.code).not.toBe(0)
      expect(partial.output).toContain('Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither.')
      expect(
        await owner`select count(*)::int n from platform_admin_audit where action like 'admin.%'`,
      ).toEqual([{ n: 1 }])
    } finally {
      await owner?.end({ timeout: 2 })
      await server.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      await server.unsafe(`DROP ROLE IF EXISTS "${role}"`)
      await server.end({ timeout: 2 })
    }
  }, 120_000)
})
