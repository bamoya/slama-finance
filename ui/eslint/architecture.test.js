import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { Linter } from 'eslint'
import architecture from './architecture.js'

const linter = new Linter()
const verify = (code, file = 'src/features/settings/company.js') =>
  linter.verify(
    code,
    [{ plugins: { architecture }, rules: { 'architecture/boundaries': 'error' } }],
    { filename: path.resolve(file) },
  )
test('subfeatures can communicate inside their own module', () => {
  assert.equal(verify("import { value } from './shared/internal'").length, 0)
})
test('cross-module access requires the public entry point', () => {
  assert.equal(verify("import { useSession } from '../identity'").length, 0)
  assert.equal(
    verify("import { useSession } from '../identity/auth/hooks/use-session'")[0]?.messageId,
    'public',
  )
})
test('dynamic imports and re-exports cannot bypass boundaries', () => {
  assert.equal(verify("import('../identity/auth/hooks/use-session')")[0]?.messageId, 'public')
  assert.equal(verify("export * from '../identity/auth/hooks/use-session'")[0]?.messageId, 'public')
})
test('features may only consume their own generated API module', () => {
  assert.equal(verify("import { call } from '../../api/generated/settings/settings'").length, 0)
  assert.equal(
    verify("import { call } from '../../api/generated/identity/identity'")[0]?.messageId,
    'generated',
  )
})
test('reports owns reporting operations and dashboard consumes its public API', () => {
  assert.equal(
    verify(
      "import { call } from '../../api/generated/reporting/reporting'",
      'src/features/reports/page.js',
    ).length,
    0,
  )
  assert.equal(
    verify(
      "import { call } from '../../api/generated/reporting/reporting'",
      'src/features/dashboard/page.js',
    )[0]?.messageId,
    'generated',
  )
  assert.equal(
    verify("import { useDashboard } from '../reports/index'", 'src/features/dashboard/page.js')
      .length,
    0,
  )
})
test('generated schema imports follow the same reporting ownership', () => {
  assert.equal(
    verify(
      "import { Schema } from '../../api/generated/schemas/reporting/reporting.schemas'",
      'src/features/reports/page.js',
    ).length,
    0,
  )
  assert.equal(
    verify(
      "import { Schema } from '../../api/generated/schemas/reporting/reporting.schemas'",
      'src/features/dashboard/page.js',
    )[0]?.messageId,
    'generated',
  )
})
test('notifications consumes settings policies through its public API', () => {
  assert.equal(
    verify(
      "import { call } from '../../api/generated/settings/settings'",
      'src/features/notifications/page.js',
    )[0]?.messageId,
    'generated',
  )
  assert.equal(
    verify(
      "import { useNotificationRules } from '../settings/index'",
      'src/features/notifications/page.js',
    ).length,
    0,
  )
})
