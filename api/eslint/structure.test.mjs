import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { API_LAYERS, checkModules, listFiles, STRUCTURE_EXCEPTIONS } from './structure.js'

const modulesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules')
const paths = (violations) => violations.map((v) => v.path)

test('the real module tree has no violations beyond the listed exceptions', () => {
  assert.deepEqual(checkModules(listFiles(modulesRoot)), [])
})
test('every exception still points at an existing path', () => {
  for (const { path: p, reason } of STRUCTURE_EXCEPTIONS) {
    assert.ok(fs.existsSync(path.join(modulesRoot, p)), `stale exception: ${p}`)
    assert.match(reason, /legacy, pending refactor/)
  }
})
test('well-structured modules pass', () => {
  const good = [
    'organization/identity/index.ts',
    'organization/identity/staff/controllers/staff.controller.ts',
    'organization/identity/staff/routes/staff.routes.ts',
    'organization/identity/staff/services/staff.service.ts',
    'organization/identity/staff/repositories/staff.repository.ts',
    'organization/identity/staff/mappers/staff.mapper.ts',
    'organization/identity/staff/types/staff.types.ts',
    'organization/identity/staff/services/staff.service.test.ts',
  ]
  assert.deepEqual(checkModules(good, []), [])
  assert.deepEqual(API_LAYERS, [
    'controllers',
    'routes',
    'services',
    'repositories',
    'mappers',
    'types',
  ])
})
test('banned catch-all names are rejected', () => {
  const bad = [
    'organization/x/services/utils.ts',
    'organization/x/helpers/a.ts',
    'organization/x/services/common-rules.ts',
    'organization/x/services/job-manager.service.ts',
    'platform/x/services/admin-portal.service.ts',
    'platform/x/services/admin-table.ts',
  ]
  const flagged = paths(checkModules(bad, []))
  for (const file of bad)
    assert.ok(
      flagged.some((p) => file === p || file.startsWith(`${p}/`)),
      `not rejected: ${file}`,
    )
})
test('only API layer folders are allowed beside each other', () => {
  assert.deepEqual(paths(checkModules(['organization/x/components/a.ts'], [])), [
    'organization/x/components',
  ])
  const mixed = [
    'organization/x/services/a.ts',
    'organization/x/routes/r.ts',
    'organization/x/notifications/services/b.ts',
  ]
  assert.deepEqual(paths(checkModules(mixed, [])), ['organization/x/notifications'])
})
test('exceptions suppress only their own subtree', () => {
  const files = [
    'platform/administration/services/admin-portal.service.ts',
    'platform/other/services/admin-portal.service.ts',
  ]
  const exceptions = [{ path: 'platform/administration', reason: 'legacy, pending refactor' }]
  assert.deepEqual(paths(checkModules(files, exceptions)), [
    'platform/other/services/admin-portal.service.ts',
  ])
})
