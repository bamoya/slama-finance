import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { clientSnapshot } from './client-snapshot.js'

type Client = Parameters<typeof clientSnapshot>[0]
/** A null link is allowed only when an existing, preserved identity is supplied. */
export async function documentClient(
  id: string | null,
  tx: Transaction,
  load: (id: string, tx: Transaction) => Promise<Client>,
  retained?: unknown,
) {
  if (id) return { id, snapshot: clientSnapshot(await load(id, tx)) }
  if (
    !retained ||
    typeof retained !== 'object' ||
    !('type' in retained) ||
    !(['legalName', 'firstName', 'lastName'] as const).some(
      (key) =>
        key in retained &&
        typeof (retained as Record<string, unknown>)[key] === 'string' &&
        String((retained as Record<string, unknown>)[key]).trim(),
    )
  )
    throw new AppError(
      400,
      'CLIENT_REQUIRED',
      'Select an active client or keep the saved identity of this detached draft.',
    )
  return { id: null, snapshot: retained }
}
