import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import ts from 'typescript'
import { z } from 'zod'

import { compileSchema, generateContracts } from './generate-contracts.mjs'

test('unsupported validation keywords fail closed', () => {
  assert.throws(
    () => compileSchema({ type: 'string', contentEncoding: 'base64' }),
    /Unsupported schema keyword/,
  )
  assert.throws(
    () => compileSchema({ type: 'string', format: 'custom' }),
    /Unsupported string format/,
  )
  assert.throws(
    () => compileSchema({ allOf: [{ type: 'string' }, { type: 'number' }] }),
    /Unsupported schema keyword/,
  )
})
test('nullable referenced objects use a validated anyOf union without dropping constraints', () => {
  const schema = Function(
    'z',
    `return ${compileSchema({
      anyOf: [
        {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    })}`,
  )(z)
  assert.equal(schema.parse(null), null)
  assert.throws(() => schema.parse({ id: 'invalid' }))
  assert.throws(() => schema.parse({}))
  assert.throws(() => compileSchema({ anyOf: [{ type: 'null' }] }), /at least two/)
  assert.throws(
    () => compileSchema({ anyOf: [{ type: 'string' }, { type: 'null' }], maxLength: 2 }),
    /sibling/,
  )
})
test('query booleans accept HTTP strings but reject other values', () => {
  const schema = Function('z', `return ${compileSchema({ type: 'boolean' }, { query: true })}`)(z)
  assert.equal(schema.parse('true'), true)
  assert.equal(schema.parse('false'), false)
  assert.equal(schema.parse(true), true)
  assert.throws(() => schema.parse('yes'))
  assert.throws(() => schema.parse('1'))
})
test('nullable enums refine the combined type rather than incompatible individual branches', () => {
  const code = compileSchema({ type: ['string', 'null'], enum: ['READY', null] })
  const schema = Function('z', ts.transpile(`return ${code}`))(z)
  assert.equal(schema.parse(null), null)
  assert.equal(schema.parse('READY'), 'READY')
  assert.throws(() => schema.parse('OTHER'))
  assert.equal((code.match(/\.refine/g) ?? []).length, 1)
})
test('generation is deterministic and UI symlink resolves the same contracts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'slama-contracts-'))
  try {
    const api = path.join(directory, 'api')
    const ui = path.join(directory, 'ui')
    await generateContracts({ output: api })
    const before = await readFile(path.join(api, 'identity/auth.schemas.ts'), 'utf8')
    await generateContracts({ output: api })
    assert.equal(await readFile(path.join(api, 'identity/auth.schemas.ts'), 'utf8'), before)
    await generateContracts({
      input: path.resolve(import.meta.dirname, '../../ui/openapi/openapi.yaml'),
      output: ui,
    })
    for (const file of [
      'identity/auth.schemas.ts',
      'identity/staff.schemas.ts',
      'identity/rbac.schemas.ts',
      'shared/errors.schemas.ts',
    ])
      assert.equal(
        await readFile(path.join(api, file), 'utf8'),
        await readFile(path.join(ui, file), 'utf8'),
      )
  } finally {
    // Only this test's freshly allocated temporary directory is removed.
    await rm(directory, { recursive: true, force: true })
  }
})
