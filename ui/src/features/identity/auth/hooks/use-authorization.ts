import { canAccessRoute, hasPermission } from '../permissions'
import { useSession } from './use-session'

/** Fail closed for missing/expired sessions and restricted onboarding sessions. */
export function useAuthorization() {
  const session = useSession()
  const available = session.data?.purpose === 'full' && !session.isError
  const keys = available ? (session.data?.permissionKeys ?? []) : []
  const can = (permission: string) => available && hasPermission(keys, permission)
  const canAll = (permissions: readonly string[]) => available && permissions.every(can)
  const canRoute = (path: string) => available && canAccessRoute(keys, path)
  return { can, canAll, canRoute }
}
