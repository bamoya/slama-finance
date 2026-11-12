import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
if (!process.argv.includes('--fresh') || process.env.NODE_ENV === 'production')
  throw Error('Use --fresh only for the undeployed SaaS baseline.')
const root = fileURLToPath(new URL('../', import.meta.url)),
  out = await mkdtemp(path.join(tmpdir(), 'bamoya-baseline-'))
try {
  const run = spawnSync(
    'pnpm',
    [
      'exec',
      'tsx',
      'node_modules/drizzle-kit/bin.cjs',
      'generate',
      '--schema',
      './db/schema/index.ts',
      '--dialect',
      'postgresql',
      '--out',
      out,
      '--name',
      'initial_schema',
    ],
    { cwd: root, stdio: 'inherit' },
  )
  if (run.status !== 0) throw Error('Schema generation failed')
  const snapshot = JSON.parse(await readFile(path.join(out, 'meta/0000_snapshot.json'), 'utf8'))
  const tables = Object.values(snapshot.tables),
    tenant = new Map(tables.filter((t) => t.policies.tenant_isolation).map((t) => [t.name, t]))
  const separator = '\n--> statement-breakpoint\n'
  const parts = (await readFile(path.join(out, '0000_initial_schema.sql'), 'utf8')).split(
    '--> statement-breakpoint',
  )
  const indexes = parts.filter((p) => /^\s*CREATE (UNIQUE )?INDEX/.test(p)),
    rest = parts.filter((p) => !indexes.includes(p))
  rest.splice(
    rest.findIndex((p) => p.includes('ADD CONSTRAINT')),
    0,
    ...indexes,
  )
  let sql = rest.join(separator)
  // S5 tables keep RLS enabled but not forced: their SECURITY DEFINER owner functions must see all rows.
  const ownerVisible = new Set([
    'subscription_override_notes',
    'subscription_overrides',
    'subscription_period_notes',
    'subscription_periods',
    'subscription_scheduled_changes',
    'subscription_suspensions',
  ])
  for (const table of tables.filter((t) => t.isRLSEnabled && !ownerVisible.has(t.name)))
    sql += separator + `ALTER TABLE "${table.name}" FORCE ROW LEVEL SECURITY;`
  const refs = [],
    keys = new Map()
  for (const t of tenant.values())
    for (const fk of Object.values(t.foreignKeys))
      if (tenant.has(fk.tableTo) && !fk.columnsFrom.includes('organization_id')) {
        refs.push(fk)
        keys.set(fk.tableTo + fk.columnsTo.join(','), fk)
      }
  const quoted = (cols) => cols.map((c) => '"' + c + '"').join(',')
  const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16)
  for (const [key, fk] of keys)
    sql +=
      separator +
      `CREATE UNIQUE INDEX "tenant_key_${hash(key)}" ON "${fk.tableTo}" (${quoted(['organization_id', ...fk.columnsTo])});`
  for (const fk of refs)
    sql +=
      separator +
      `-- Tenant relationship: ${fk.name}\nALTER TABLE "${fk.tableFrom}" ADD CONSTRAINT "tenant_fk_${hash(fk.name)}" FOREIGN KEY (${quoted(['organization_id', ...fk.columnsFrom])}) REFERENCES "public"."${fk.tableTo}" (${quoted(['organization_id', ...fk.columnsTo])}) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;`
  for (const file of [
    'reference/permissions.sql',
    'reference/plans.sql',
    'integrity/domain-triggers.sql',
    'integrity/actors.sql',
    'integrity/organization-defaults.sql',
    'integrity/platform-administration.sql',
    'integrity/subscription-catalog.sql',
    'reference/subscription-catalog.sql',
    'integrity/subscription-overrides.sql',
    'integrity/subscription-periods.sql',
    'integrity/billing-documents.sql',
    'integrity/sales-documents.sql',
  ])
    sql += separator + (await readFile(path.join(root, 'db', file), 'utf8'))
  for (const table of tenant.values()) {
    const actorColumns = Object.values(table.foreignKeys)
      .filter((f) => f.tableTo === 'actors')
      .flatMap((f) => f.columnsFrom)
    if (actorColumns.length)
      sql +=
        separator +
        `CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "${table.name}" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization(${actorColumns.map((c) => "'" + c + "'").join(',')});`
  }
  const target = path.join(root, 'db/migrations')
  for (const name of await readdir(target))
    if (name.endsWith('.sql') || name === 'meta')
      await rm(path.join(target, name), { recursive: true, force: true })
  await writeFile(
    path.join(target, '0000_initial_schema.sql'),
    '-- B-Finance: fresh SaaS schema; no demo accounts or business data.\n' + sql + '\n',
  )
  await cp(path.join(out, 'meta'), path.join(target, 'meta'), { recursive: true })
} finally {
  await rm(out, { recursive: true, force: true })
}
