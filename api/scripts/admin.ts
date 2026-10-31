// SaaS administrator bootstrap (no HTTP management surface in v1). Uses MIGRATION_DATABASE_URL.
// pnpm admin:create --email <email> --name <name>   (password: ADMIN_PASSWORD env, piped stdin or prompt)
// pnpm admin:disable --email <email>
// pnpm admin:reset-2fa --email <email>
import { existsSync } from 'node:fs'
import { loadEnvFile, stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { createDatabase } from '../src/lib/db.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD
  if (!stdin.isTTY) {
    let data = ''
    for await (const chunk of stdin) data += chunk
    return data.replace(/\r?\n$/, '')
  }
  const prompt = (question: string) =>
    new Promise<string>((resolve) => {
      const rl = createInterface({ input: stdin, output: stdout, terminal: true })
      // Suppress echo: only the prompt is written, never the typed characters.
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput
      ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
        if (s.startsWith(question)) write.call(rl, question)
      }
      rl.question(question, (answer) => {
        rl.close()
        stdout.write('\n')
        resolve(answer)
      })
    })
  const first = await prompt('Password: ')
  if (first !== (await prompt('Confirm password: '))) throw new Error('Passwords do not match.')
  return first
}

if (existsSync('.env')) loadEnvFile('.env')
const url = process.env.MIGRATION_DATABASE_URL
if (!url) throw new Error('MIGRATION_DATABASE_URL is required for administrator management.')
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { email: { type: 'string' }, name: { type: 'string' } },
})
const [action] = positionals
if (!values.email || !['create', 'disable', 'reset-2fa'].includes(action ?? ''))
  throw new Error(
    'Usage: <create --email <e> --name <n> | disable --email <e> | reset-2fa --email <e>>',
  )
if (action === 'create' && !values.name?.trim()) throw new Error('--name is required.')
const password = action === 'create' ? await readPassword() : ''
const { db, close } = createDatabase(url, 1)
try {
  const accounts = createAdminAccounts(() => db)
  const result =
    action === 'create'
      ? await accounts.create({ email: values.email, name: values.name!, password })
      : action === 'disable'
        ? await accounts.disable(values.email)
        : await accounts.reset2fa(values.email)
  console.log(JSON.stringify(result, null, 2))
} finally {
  await close()
}
