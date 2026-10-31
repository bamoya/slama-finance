import type { QueryClient } from '@tanstack/react-query'

const ownerQuery = (query: { queryKey: readonly unknown[] }) =>
  typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/v1/owner')
/** Clear the previous owner's portal data without changing independent staff authentication. */
export async function clearOwnerQueries(client: QueryClient) {
  await client.cancelQueries({ predicate: ownerQuery })
  client.removeQueries({ predicate: ownerQuery })
}
