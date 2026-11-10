// Deployment step after initialize-database.mjs: creates the ADMIN_EMAIL administrator once.
// Existing accounts are never modified. Uses MIGRATION_DATABASE_URL. Never logs credentials.
import { pathToFileURL } from 'node:url'

import { createDatabase } from '../src/lib/db.js'
import { AppError } from '../src/lib/errors.js'
import {
  adminBootstrapConfig,
  createAdminAccounts,
} from '../src/modules/platform/administration/index.js'

export async function bootstrapAdmin(env: Record<string, string | undefined> = process.env) {
  const config = adminBootstrapConfig(env)
  if (!config) return 'skipped' as const
  if (!env.MIGRATION_DATABASE_URL)
    throw new AppError(400, 'CONFIGURATION', 'MIGRATION_DATABASE_URL is required.')
  const { db, close } = createDatabase(env.MIGRATION_DATABASE_URL, 1)
  try {
    const { created } = await createAdminAccounts(() => db).ensure(config)
    return created ? ('created' as const) : ('existing' as const)
  } finally {
    await close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapAdmin()
    .then((outcome) =>
      console.log(
        {
          skipped: 'Administrator bootstrap skipped: ADMIN_EMAIL and ADMIN_PASSWORD are not set.',
          created: 'Administrator bootstrap created the configured administrator.',
          existing: 'Administrator bootstrap left the existing administrator unchanged.',
        }[outcome],
      ),
    )
    .catch((error: unknown) => {
      // Driver errors can carry query parameters (email, hash); only expose known safe messages.
      console.error('Administrator bootstrap failed.', {
        reason:
          error instanceof AppError
            ? error.message
            : 'Check database connection and migration configuration',
      })
      process.exitCode = 1
    })
}
