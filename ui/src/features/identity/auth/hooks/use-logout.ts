import { useLogout as useGeneratedLogout } from '../../../../api/generated/identity/identity'
import { logout } from '../api/auth-client'
import { useAuthTransition } from './use-session'

export function useLogout() {
  const transition = useAuthTransition()
  return useGeneratedLogout({ mutation: { mutationFn: logout, onSuccess: () => transition(null) } })
}
