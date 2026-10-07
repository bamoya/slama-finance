import * as generated from '../../../../api/generated/identity/identity'
import { privateMutation } from '../../shared/private-mutation'
import * as auth from '../api/auth-client'

/** Auth workflows keep their validated session result and signed-out semantics. */
export function useAuthActions() {
  const login = generated.useLogin({
    mutation: { gcTime: 0, mutationFn: ({ data }) => auth.login(data) },
  })
  const profile = generated.useUpdateProfile({
    mutation: { gcTime: 0, mutationFn: ({ data }) => auth.updateProfile(data) },
  })
  const password = generated.useChangePassword({
    mutation: { gcTime: 0, mutationFn: ({ data }) => auth.changePassword(data) },
  })
  const reset = generated.useConfirmPasswordReset({
    mutation: { gcTime: 0, mutationFn: ({ data }) => auth.confirmPasswordReset(data) },
  })
  const request = generated.useRequestPasswordReset({
    mutation: { gcTime: 0, mutationFn: ({ data }) => auth.requestPasswordReset(data) },
  })
  return {
    login: (data: Parameters<typeof auth.login>[0]) =>
      privateMutation(() => login.mutateAsync({ data }), login.reset),
    updateProfile: (data: Parameters<typeof auth.updateProfile>[0]) =>
      privateMutation(() => profile.mutateAsync({ data }), profile.reset),
    changePassword: (data: Parameters<typeof auth.changePassword>[0]) =>
      privateMutation(() => password.mutateAsync({ data }), password.reset),
    confirmPasswordReset: (data: Parameters<typeof auth.confirmPasswordReset>[0]) =>
      privateMutation(() => reset.mutateAsync({ data }), reset.reset),
    requestPasswordReset: (data: Parameters<typeof auth.requestPasswordReset>[0]) =>
      privateMutation(() => request.mutateAsync({ data }), request.reset),
  }
}
