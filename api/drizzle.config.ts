import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { defineConfig } from 'drizzle-kit'

if (existsSync('.env')) loadEnvFile('.env')

export default defineConfig({
  dialect: 'postgresql',
  // Explicit source tables; run the CLI through tsx to resolve ESM .js imports.
  schema: [
    './db/schema/auth.ts',
    './db/schema/artifacts.ts',
    './db/schema/catalog.ts',
    './db/schema/clients.ts',
    './db/schema/delivery-notes.ts',
    './db/schema/estimates.ts',
    './db/schema/invoices.ts',
    './db/schema/jobs.ts',
    './db/schema/media.ts',
    './db/schema/notifications.ts',
    './db/schema/payments.ts',
    './db/schema/reporting.ts',
    './db/schema/settings.ts',
  ],
  out: './db/migrations',
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '' },
})
