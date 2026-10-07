import {
  type UpdateProfile,
  UpdateProfileSchema,
} from '../../../../contracts/generated/identity/auth.schemas.js'
import { AppError } from '../../../../lib/errors.js'
import type { createAuthRepository } from '../repositories/auth.repository.js'
import type { createPasswordService } from './password.service.js'
import type { createSessionService } from './session.service.js'

const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
export function createAuthService(
  repository: ReturnType<typeof createAuthRepository>,
  passwords: ReturnType<typeof createPasswordService>,
  sessions: ReturnType<typeof createSessionService>,
) {
  return {
    async updateProfile(token: string | undefined, input: UpdateProfile) {
      const body = UpdateProfileSchema.parse({
        ...input,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email.trim().toLowerCase(),
      })
      const snapshot = await sessions.inspect(token)
      if (!snapshot) throw new AppError(401, 'UNAUTHENTICATED', 'Unauthenticated')
      if (snapshot.purpose !== 'full')
        throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password first')
      if (!(await passwords.verify(body.currentPassword, snapshot.user.passwordHash)))
        throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
      return repository.transaction(async (tx) => {
        await repository.lock(tx)
        const live = await sessions.inspect(token, tx)
        if (
          !live ||
          live.purpose !== 'full' ||
          live.user.passwordHash !== snapshot.user.passwordHash
        )
          throw new AppError(401, 'UNAUTHENTICATED', 'Session is no longer valid')
        const user = await repository.updateProfile(
          live.user.id,
          { firstName: body.firstName, lastName: body.lastName, email: body.email },
          tx,
        )
        return { user, purpose: live.purpose }
      })
    },
    async login(email: string, password: string) {
      const snapshot = await repository.findByEmail(email.toLowerCase())
      if (
        !snapshot ||
        snapshot.disabledAt ||
        snapshot.archivedAt ||
        !(await passwords.verify(password, snapshot.passwordHash))
      )
        throw invalid()
      return repository.transaction(async (tx) => {
        await repository.lock(tx)
        const user = await repository.findById(snapshot.id, tx)
        if (
          !user ||
          user.disabledAt ||
          user.archivedAt ||
          user.passwordHash !== snapshot.passwordHash
        )
          throw invalid()
        const purpose = user.mustChangePassword ? 'password_change' : 'full'
        if (user.mustChangePassword) {
          if (
            !user.temporaryPasswordExpiresAt ||
            user.temporaryPasswordExpiresAt <= new Date() ||
            user.temporaryPasswordConsumedAt
          )
            throw invalid()
          await repository.consumeTemporary(user.id, tx)
        }
        return { user, ...(await sessions.issue(user.id, purpose, tx)) }
      })
    },
    async getSession(token?: string) {
      const result = await sessions.inspect(token)
      if (!result) throw new AppError(401, 'UNAUTHENTICATED', 'Unauthenticated')
      return result
    },
    async changePassword(token: string | undefined, newPassword: string, currentPassword?: string) {
      const snapshot = await sessions.inspect(token)
      if (!snapshot) throw new AppError(401, 'UNAUTHENTICATED', 'Unauthenticated')
      if (
        snapshot.purpose === 'full' &&
        (!currentPassword || !(await passwords.verify(currentPassword, snapshot.user.passwordHash)))
      )
        throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
      if (await passwords.verify(newPassword, snapshot.user.passwordHash))
        throw new AppError(400, 'PASSWORD_REUSED', 'Choose a different password')
      const passwordHash = await passwords.hash(newPassword)
      return repository.transaction(async (tx) => {
        await repository.lock(tx)
        const live = await sessions.inspect(token, tx)
        if (!live || live.user.passwordHash !== snapshot.user.passwordHash)
          throw new AppError(401, 'UNAUTHENTICATED', 'Session is no longer valid')
        const user = await repository.changePassword(live.user.id, passwordHash, tx)
        return { user, ...(await sessions.issue(user.id, 'full', tx)) }
      })
    },
    logout: (token?: string) => sessions.revoke(token),
  }
}
