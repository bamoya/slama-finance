import { AsyncLocalStorage } from 'node:async_hooks'

import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './db.js'

const tenant = new AsyncLocalStorage<string>()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const currentOrganizationId = () => tenant.getStore()

/** Internal execution scope. HTTP authentication and permission checks remain mandatory. */
export function inTenantScope<T>(organizationId: string, work: () => T): T {
  if (!uuid.test(organizationId)) throw new Error('Invalid organization scope')
  return tenant.run(organizationId.toLowerCase(), work)
}

/**
 * Keep existing repository transactions and commit boundaries. A query outside an explicit
 * transaction gets its own short transaction, never a session-wide pooled SET or a transaction
 * held across PDF rendering, storage uploads or email-provider calls.
 */
export function tenantDatabase(
  database: Database,
  organizationId = currentOrganizationId(),
): Database {
  if (!organizationId) return database
  if (!uuid.test(organizationId)) throw new Error('Invalid organization scope')
  organizationId = organizationId.toLowerCase()
  const transaction = <T>(
    work: (tx: Transaction) => Promise<T>,
    options?: Parameters<Database['transaction']>[1],
  ) =>
    database.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`)
      return work(tx)
    }, options)
  type Call = { name: PropertyKey; args: unknown[] }
  const invoke = (target: object, name: PropertyKey, args: unknown[]) =>
    Reflect.apply(Reflect.get(target, name) as (...args: unknown[]) => unknown, target, args)
  const replay = (tx: Transaction, calls: Call[]) => {
    let value: unknown = tx
    for (const call of calls) value = invoke(value as object, call.name, call.args)
    return value
  }
  const query = (builder: object, calls: Call[]): unknown =>
    new Proxy(builder, {
      get(target, name) {
        if (name === 'then' || name === 'catch' || name === 'finally') {
          return (...args: unknown[]) => {
            const execution = transaction(async (tx) => replay(tx, calls))
            return invoke(execution, name, args)
          }
        }
        if (name === 'prepare')
          throw new Error('Prepared queries require an explicit tenant transaction')
        const value: unknown = Reflect.get(target, name)
        if (typeof value !== 'function') return value
        if (name === 'execute')
          return (...args: unknown[]) =>
            transaction(async (tx) => invoke(replay(tx, calls) as object, name, args))
        return (...args: unknown[]) => {
          const next = invoke(target, name, args)
          // SQL expressions/subqueries are structural objects, not executable queries.
          if (next && typeof next === 'object' && 'then' in next)
            return query(next, [...calls, { name, args }])
          return next
        }
      },
    })
  return new Proxy(database, {
    get(target, name) {
      if (name === 'transaction') return transaction
      if (name === 'query')
        throw new Error('Relational queries require an explicit tenant transaction')
      const value: unknown = Reflect.get(target, name)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const result = invoke(target, name, args)
        if (
          result &&
          typeof result === 'object' &&
          ([
            'select',
            'selectDistinct',
            'selectDistinctOn',
            'insert',
            'update',
            'delete',
            'execute',
          ].includes(String(name)) ||
            'then' in result ||
            'execute' in result)
        )
          return query(result, [{ name, args }])
        return result
      }
    },
  })
}
