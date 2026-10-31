import { organizationStaffLogout } from '../../../../../api/generated/identity/identity'
import { useLogout as useGeneratedLogout } from '../../../../../api/generated/identity/identity'
import { documentWorkspace } from '../../../../../api/workspace-scope'
import { logout } from '../api/auth-client'
import { useAuthTransition } from './use-session'

export function useLogout() {
  const transition = useAuthTransition()
  return useGeneratedLogout({
    mutation: {
      mutationFn: async () => {
        if (documentWorkspace) {
          await organizationStaffLogout(documentWorkspace.organizationId)
          window.location.assign(`/organizations/${documentWorkspace.organizationId}/login`)
          return
        }
        await logout()
      },
      onSuccess: () => (documentWorkspace ? undefined : transition(null)),
    },
  })
}
