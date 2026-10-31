import { createHash, randomBytes, randomUUID } from 'node:crypto'

import type {
  AcceptStaffInvitationInput,
  CreateStaffInvitation,
  ListStaffInvitationsQuery,
  StaffInvitation,
} from '../../../../../contracts/generated/identity/staff-invitations.schemas.js'
import type { OrganizationInvitationDelivery } from '../../../../../integrations/contracts.js'
import { requireActorPermission } from '../../../../../lib/actor-permissions.js'
import type { Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import { createPasswordService } from '../../../../../lib/password.js'
import type { SubscriptionsPublicApi } from '../../../../platform/subscriptions/index.js'
import type { createStaffRepository } from '../../staff/repositories/staff.repository.js'
import type { createInvitationRepository } from '../repositories/invitation.repository.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function createInvitationService(
  repo: ReturnType<typeof createInvitationRepository>,
  staff: ReturnType<typeof createStaffRepository>,
  options: {
    subscriptions?: SubscriptionsPublicApi
    delivery?: OrganizationInvitationDelivery
    /** Organization site origin (<slug>.<platform domain>) for staff links. */
    origin?: (organizationId: string) => Promise<string | undefined>
  },
) {
  const passwords = createPasswordService()
  async function available(tx: Transaction) {
    const org = await repo.organization(tx)
    if (!org?.activatedAt || org.pausedAt || org.suspendedAt || org.deletionRequestedAt)
      throw new AppError(403, 'ORGANIZATION_SUSPENDED', 'This organization is unavailable.')
    await options.subscriptions?.assertAccess(tx)
    return org
  }
  async function authority(tx: Transaction, actor: string | null, ids: string[]) {
    if (!actor) throw new AppError(403, 'FORBIDDEN', 'The inviting administrator is unavailable.')
    await requireActorPermission(tx, actor, 'staff.create')
    if (!ids.length) return
    await requireActorPermission(tx, actor, 'roles.update')
    const selected = await staff.selectedRoles(ids, tx)
    if (selected.length !== ids.length)
      throw new AppError(403, 'FORBIDDEN', 'An invitation role is no longer available.')
    const admin = (await staff.rolesFor(actor, tx)).some((r) => r.key === 'admin')
    if (!admin) {
      const grants = await staff.grants(actor, tx)
      if (
        selected.some((r) => r.key === 'admin') ||
        (await staff.selectedGrants(ids, tx)).some((p) => !grants.includes(p.key))
      )
        throw new AppError(403, 'FORBIDDEN', 'Cannot assign permissions you do not hold.')
    }
  }
  function toInvitation(
    row: NonNullable<Awaited<ReturnType<typeof repo.find>>>,
    roles: StaffInvitation['roles'],
  ) {
    return {
      id: row.id,
      email: row.email,
      status:
        row.status === 'pending' && row.expiresAt && row.expiresAt <= new Date()
          ? 'expired'
          : row.status,
      roles,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      delivery: {
        state: row.deliveryState,
        attempts: row.attempts,
        updatedAt: row.updatedAt.toISOString(),
      },
    }
  }
  async function mapped(tx: Transaction, row: NonNullable<Awaited<ReturnType<typeof repo.find>>>) {
    const selected = await repo.selectedRoles(tx, row.id)
    return toInvitation(
      row,
      selected.flatMap((r) =>
        r.id && r.key && r.name ? [{ id: r.id, key: r.key, name: r.name }] : [],
      ),
    )
  }
  async function roles(tx: Transaction, id: string) {
    const rows = await repo.selectedRoles(tx, id)
    if (rows.some((r) => !r.id))
      throw new AppError(403, 'FORBIDDEN', 'An invitation role is no longer available.')
    return rows.map((r) => r.id!)
  }
  async function token(tx: Transaction, value: string) {
    await repo.lock(tx)
    const row = await repo.token(tx, hash(value))
    if (!row)
      throw new AppError(400, 'INVALID_INVITATION_TOKEN', 'This invitation link is invalid.')
    if (row.status === 'accepted')
      throw new AppError(
        410,
        'INVITATION_ALREADY_USED',
        'This invitation has already been accepted.',
      )
    if (row.status === 'revoked')
      throw new AppError(410, 'INVITATION_REVOKED', 'This invitation was revoked.')
    if (!row.expiresAt || row.expiresAt <= new Date())
      throw new AppError(410, 'INVITATION_EXPIRED', 'This invitation has expired.')
    return row
  }
  function transport() {
    if (!options.delivery || !options.origin)
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Invitation email delivery is unavailable.')
  }
  async function insert(
    tx: Transaction,
    input: CreateStaffInvitation,
    actor: string,
    trusted = false,
  ) {
    await available(tx)
    const ids = [...new Set(input.roleIds)]
    if (!trusted) await authority(tx, actor, ids)
    const email = input.email.trim().toLowerCase()
    if (await repo.userByEmail(tx, email))
      throw new AppError(
        409,
        'DUPLICATE_RECORD',
        'An account already uses this email in this organization.',
      )
    try {
      return await repo.insert(tx, {
        email,
        language: input.language,
        invitedBy: actor,
        roleIds: ids,
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AppError(409, 'DUPLICATE_RECORD', 'This email already has a pending invitation.')
      throw error
    }
  }
  return {
    async list(query: ListStaffInvitationsQuery) {
      return repo.run(async (tx) => {
        const result = await repo.list(tx, query)
        return { ...result, items: await Promise.all(result.items.map((r) => mapped(tx, r))) }
      })
    },
    create(input: CreateStaffInvitation, actor: string) {
      transport()
      return repo.run(async (tx) => mapped(tx, await insert(tx, input, actor)))
    },
    async resend(id: string, actor: string) {
      transport()
      return repo.run(async (tx) => {
        await requireActorPermission(tx, actor, 'staff.update')
        await available(tx)
        const row = await repo.find(tx, id, true)
        if (!row) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.')
        if (row.status !== 'pending')
          throw new AppError(409, 'INVITATION_CONFLICT', 'This invitation cannot be resent.')
        await authority(tx, row.invitedBy, await roles(tx, id))
        if (Date.now() - row.updatedAt.getTime() < 60000)
          throw new AppError(429, 'RATE_LIMITED', 'Wait one minute before resending.')
        return mapped(tx, await repo.requeue(tx, id))
      })
    },
    revoke(id: string, actor: string) {
      return repo.run(async (tx) => {
        await requireActorPermission(tx, actor, 'staff.update')
        const row = await repo.find(tx, id, true)
        if (!row) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.')
        if (row.status === 'accepted')
          throw new AppError(
            409,
            'INVITATION_CONFLICT',
            'This invitation has already been accepted.',
          )
        return mapped(
          tx,
          row.status === 'revoked'
            ? row
            : await repo.update(tx, id, {
                status: 'revoked',
                revokedAt: new Date(),
                deliveryState: 'cancelled',
                leaseId: null,
                leaseExpiresAt: null,
              }),
        )
      })
    },
    inspect(value: string) {
      return repo.run(async (tx) => {
        const row = await token(tx, value),
          org = await available(tx)
        return {
          organizationName: org.name,
          email: row.email,
          expiresAt: row.expiresAt!.toISOString(),
        }
      })
    },
    async accept(input: AcceptStaffInvitationInput) {
      const firstName = input.firstName.trim(),
        lastName = input.lastName.trim()
      if (!firstName || !lastName)
        throw new AppError(400, 'VALIDATION_ERROR', 'First and last names are required.')
      const passwordHash = await passwords.hash(input.password)
      return repo.run(async (tx) => {
        const row = await token(tx, input.token),
          org = await available(tx),
          ids = await roles(tx, row.id)
        await authority(tx, row.invitedBy, ids)
        await options.subscriptions?.admitStaff(tx)
        if (await repo.userByEmail(tx, row.email))
          throw new AppError(
            409,
            'DUPLICATE_RECORD',
            'An account already uses this email in this organization.',
          )
        await repo.accept(tx, row, { firstName, lastName, passwordHash }, ids)
        return {
          organizationId: org.id,
          email: row.email,
          message: 'Sign in to your organization.',
        }
      })
    },
    // Trusted setup boundary: called only inside the owning platform's activation transaction.
    async provision(
      tx: Transaction,
      inputs: { email: string; role: 'administrator' | 'staff' }[],
      language: 'fr' | 'en',
    ) {
      if (!inputs.length) return
      const admin = await repo.administrator(tx),
        role = await repo.adminRole(tx)
      if (!admin || !role)
        throw new AppError(409, 'PROVISIONING_FAILED', 'Organization administrator is unavailable.')
      for (const input of inputs) {
        // Activation is not committed yet; use the internal repository, never an owner session on staff routes.
        const email = input.email.trim().toLowerCase()
        if (await repo.userByEmail(tx, email))
          throw new AppError(
            409,
            'DUPLICATE_RECORD',
            'An organization account already uses this email.',
          )
        await repo.insert(tx, {
          email,
          language,
          invitedBy: admin.id,
          roleIds: input.role === 'administrator' ? [role.id] : [],
        })
      }
    },
    async runOne() {
      if (!options.delivery || !options.origin) return
      const rawToken = randomBytes(32).toString('base64url'),
        leaseId = randomUUID()
      const job = await repo.run(async (tx) => {
        await repo.lock(tx)
        const row = await repo.claim(tx)
        if (!row) return null
        if (row.attempts >= 5) {
          await repo.update(tx, row.id, { deliveryState: 'failed', leaseExpiresAt: null })
          return null
        }
        const org = await available(tx)
        // A startup administrator must first replace their temporary password before granting staff access.
        try {
          await authority(tx, row.invitedBy, await roles(tx, row.id))
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== 'FORBIDDEN') throw error
          const inviter = row.invitedBy ? await repo.inviter(tx, row.invitedBy) : null
          const waitingForPassword =
            inviter?.mustChangePassword &&
            !inviter.disabledAt &&
            !inviter.archivedAt &&
            !inviter.deletedAt
          await repo.update(
            tx,
            row.id,
            waitingForPassword
              ? { availableAt: new Date(Date.now() + 60000) }
              : { deliveryState: 'failed', leaseId: null, leaseExpiresAt: null },
          )
          return null
        }
        const expiresAt = new Date(Date.now() + 48 * 3600000)
        const updated = await repo.update(tx, row.id, {
          tokenHash: hash(rawToken),
          expiresAt,
          deliveryState: 'sending',
          attempts: row.attempts + 1,
          leaseId,
          leaseExpiresAt: new Date(Date.now() + 120000),
        })
        return { ...updated, organizationName: org.name }
      })
      if (!job) return
      const origin = await options.origin(job.organizationId)
      if (!origin) return
      const url = new URL('/accept-invitation', origin)
      url.hash = new URLSearchParams({ token: rawToken }).toString()
      try {
        await options.delivery.send({
          to: job.email,
          organizationName: job.organizationName,
          url: url.toString(),
          language: job.language,
          expiresAt: job.expiresAt!,
          idempotencyKey: `staff-invitation:${job.id}:${leaseId}`,
        })
        await repo.finish(job.id, leaseId, true, job.attempts)
      } catch {
        await repo.finish(job.id, leaseId, false, job.attempts)
      }
    },
  }
}
