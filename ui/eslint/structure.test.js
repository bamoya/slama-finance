import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkFeatures, listFiles, STRUCTURE_EXCEPTIONS, UI_LAYERS } from './structure.js'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const featuresRoot = path.join(src, 'features')
const paths = (violations) => violations.map((v) => v.path)

test('the real feature tree has no violations beyond the listed exceptions', () => {
  assert.deepEqual(checkFeatures(listFiles(featuresRoot)), [])
})
test('every exception still points at an existing path', () => {
  for (const { path: p, reason } of STRUCTURE_EXCEPTIONS) {
    assert.ok(fs.existsSync(path.join(featuresRoot, p)), `stale exception: ${p}`)
    assert.match(reason, /legacy, pending refactor/)
  }
})
test('well-structured domains pass', () => {
  const good = [
    'organization/identity/index.ts',
    'organization/identity/staff/pages/staff-page.tsx',
    'organization/identity/staff/components/staff-form.test.tsx',
    'organization/identity/auth/hooks/use-session.ts',
    'organization/identity/auth/api/auth-client.ts',
    'organization/identity/auth/components/forms/login-form.tsx',
    'platform/marketing/styles/marketing.css',
  ]
  assert.deepEqual(checkFeatures(good, []), [])
})
test('banned catch-all names are rejected', () => {
  const bad = [
    'organization/x/utils/format.ts',
    'organization/x/components/helpers.ts',
    'organization/x/components/common-fields.tsx',
    'organization/x/components/misc.tsx',
    'organization/x/hooks/use-stuff.ts',
    'organization/x/hooks/session-manager.ts',
    'organization/x/components/admin-table.tsx',
    'organization/x/components/admin-layout.test.tsx',
    'platform/x/services/admin-portal.service.ts',
  ]
  const flagged = paths(checkFeatures(bad, []))
  for (const file of bad)
    assert.ok(
      flagged.some((p) => file === p || file.startsWith(`${p}/`)),
      `not rejected: ${file}`,
    )
  assert.deepEqual(checkFeatures(['platform/x/components/customers-table.tsx'], []), [])
})
test('layer folders are limited to the allowed set', () => {
  assert.deepEqual(UI_LAYERS, ['pages', 'components', 'hooks', 'api', 'styles'])
  assert.deepEqual(paths(checkFeatures(['organization/x/data/rows.ts'], [])), [
    'organization/x/data',
  ])
  assert.deepEqual(paths(checkFeatures(['organization/x/y/lib/a.ts'], [])), [
    'organization/x/y/lib',
  ])
})
test('a feature cannot mix layer folders with domain folders', () => {
  const mixed = [
    'organization/sales/invoices/pages/b.tsx',
    'organization/sales/estimates/pages/c.tsx',
    'organization/sales/components/a.tsx',
  ]
  assert.deepEqual(paths(checkFeatures(mixed, [])), ['organization/sales/components'])
  const manyLayers = [
    'organization/x/pages/a.tsx',
    'organization/x/hooks/b.ts',
    'organization/x/orders/pages/c.tsx',
  ]
  assert.deepEqual(paths(checkFeatures(manyLayers, [])), ['organization/x/orders'])
})
test('exceptions suppress only their own subtree', () => {
  const files = ['platform/administration/utils/a.ts', 'platform/other/utils/a.ts']
  const exceptions = [{ path: 'platform/administration', reason: 'legacy, pending refactor' }]
  assert.deepEqual(paths(checkFeatures(files, exceptions)), ['platform/other/utils'])
})
