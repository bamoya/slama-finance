import * as generated from '../../../../api/generated/identity/identity'
import {
  type ChangePassword,
  type Login,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type Session,
  SessionSchema,
  type UpdateProfile,
} from '../../../../api/generated/schemas/identity/auth.schemas'
import { ApiError } from '../../../../lib/api-error'
export type {
  User as AuthUser,
  Session,
} from '../../../../api/generated/schemas/identity/auth.schemas'
export async function login(data: Login) {
  return SessionSchema.parse(await generated.login(data))
}
export async function getSession(signal?: AbortSignal): Promise<Session | null> {
  try {
    return SessionSchema.parse(await generated.getSession(undefined, signal))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
export const logout = () => generated.logout()
export async function updateProfile(data: UpdateProfile) {
  return SessionSchema.parse(await generated.updateProfile(data))
}
export async function changePassword(data: ChangePassword) {
  return SessionSchema.parse(await generated.changePassword(data))
}
export const requestPasswordReset = (data: PasswordResetRequest) =>
  generated.requestPasswordReset(data)
export const confirmPasswordReset = (data: PasswordResetConfirm) =>
  generated.confirmPasswordReset(data)
