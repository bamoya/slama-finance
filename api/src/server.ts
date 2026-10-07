import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { buildApp } from './app.js'

if (existsSync('.env')) loadEnvFile('.env')
const app = await buildApp()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1
    })
  })
}
await app.listen({ host: app.environment.HOST, port: app.environment.PORT })
