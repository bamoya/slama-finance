import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { ESLint } from 'eslint'

const root = path.resolve(import.meta.dirname, '..')
const eslint = new ESLint({ cwd: root })
const invoice = 'src/modules/sales/invoices/services/invoice.service.ts'
const cases = [
  [
    'same-module service collaboration',
    invoice,
    "import '../../estimates/services/estimate.service.js'",
    false,
  ],
  ['own repository', invoice, "import '../repositories/invoice.repository.js'", false],
  ['public external interface', invoice, "import '../../../clients/clients.public.js'", false],
  ['external module entry', invoice, "import '../../../clients/index.js'", false],
  [
    'external internal service',
    invoice,
    "import '../../../clients/services/client.service.js'",
    true,
  ],
  [
    'external repository re-export',
    invoice,
    "export * from '../../../clients/repositories/client.repository.js'",
    true,
  ],
  [
    'dynamic external import',
    invoice,
    "import('../../../clients/services/client.service.js')",
    true,
  ],
  ['computed dynamic import', invoice, 'import(target)', true],
  ['service to controller', invoice, "import '../controllers/invoice.controller.js'", true],
  [
    'controller to repository',
    'src/modules/clients/controllers/client.controller.ts',
    "import '../repositories/client.repository.js'",
    true,
  ],
  [
    'repository to service',
    'src/modules/clients/repositories/client.repository.ts',
    "import '../services/client.service.js'",
    true,
  ],
  ['service to Fastify', invoice, "import 'fastify'", true],
  ['service to tables', invoice, "import '../../../../../db/schema/sales.js'", true],
  [
    'repository to tables',
    'src/modules/clients/repositories/client.repository.ts',
    "import '../../../../db/schema/clients.js'",
    false,
  ],
  ['infrastructure to domain', 'src/lib/example.ts', "import '../modules/clients/index.js'", true],
  ['new unapproved module', 'src/modules/products/index.ts', 'export {}', true],
  ['composition to public entry', 'src/app.ts', "import './modules/sales/index.js'", false],
  [
    'composition to internal file',
    'src/app.ts',
    "import './modules/sales/invoices/services/invoice.service.js'",
    true,
  ],
]
test('module validators cannot define independent Zod contracts', async () => {
  const [result] = await eslint.lintText("import { z } from 'zod'", {
    filePath: path.join(root, 'src/modules/identity/auth/schemas/auth.schemas.ts'),
  })
  assert.equal(
    result.messages.some((message) => message.ruleId === 'no-restricted-imports'),
    true,
  )
})
for (const [name, file, code, invalid] of cases) {
  test(name, async () => {
    const [result] = await eslint.lintText(code, { filePath: path.join(root, file) })
    assert.equal(result.fatalErrorCount, 0)
    assert.equal(
      result.messages.some((message) => message.ruleId === 'architecture/boundaries'),
      invalid,
    )
  })
}
