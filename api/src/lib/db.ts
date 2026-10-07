import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../../db/schema/index.js'

export function createDatabase(url: string, poolSize = 10) {
  const client = postgres(url, {
    max: poolSize,
    connect_timeout: 3,
    idle_timeout: 20,
    connection: { statement_timeout: 5000, application_name: 'slama-finance-api' },
  })
  const db = drizzle(client, { schema })
  let probe: Promise<unknown> | undefined
  return {
    db,
    async ready(timeoutMs: number) {
      // Share one in-flight probe to prevent failed probes exhausting the pool.
      probe ??= Promise.resolve(client`select 1`).finally(() => {
        probe = undefined
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          probe,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Database readiness timed out')), timeoutMs)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    },
    close: () => client.end({ timeout: 2 }),
  }
}

export type Database = ReturnType<typeof createDatabase>['db']
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export function inTransaction<T>(db: Database, work: (tx: Transaction) => Promise<T>) {
  return db.transaction(work)
}
