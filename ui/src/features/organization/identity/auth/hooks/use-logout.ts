import { organizationStaffLogout } from '../../../../../api/generated/identity/identity'
import { useLogout as useGeneratedLogout } from '../../../../../api/generated/identity/identity'
import { useWorkspace } from '../../workspace/workspace-state'
import { logout } from '../api/auth-client'
import { useAuthTransition } from './use-session'

export function useLogout() {
  const transition = useAuthTransition()
  const workspace = useWorkspace()
  return useGeneratedLogout({
    mutation: {
      mutationFn: async () => {
        if (workspace) {
          await organizationStaffLogout()
          window.location.assign('/login')
          return
        }
        await logout()
      },
      onSuccess: () => (workspace ? undefined : transition(null)),
    },
  })
}
