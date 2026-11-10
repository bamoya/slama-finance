import { randomBytes } from 'node:crypto'

import type {
  AdminOwnerCreate,
  AdminOwnerDetail,
  AdminPlanActivation,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { OwnerAccountDelivery } from '../../../../../integrations/contracts.js'
import type { Transaction } from '../../../../../lib/db.js'
import { AppError, databaseCode } from '../../../../../lib/errors.js'
import { normalizeSlug, slugProblem } from '../../../../../lib/platform-sites.js'
import { hashToken as hash } from '../../../../../lib/token-hash.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type { AdminLifecyclePort } from '../../payments/services/admin-billing.port.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createCustomerLifecycleRepository } from '../repositories/customer-lifecycle.repository.js'

const DAY_MS = 86_400_000
export const DELETION_GRACE_DAYS = 30
export const INVITATION_HOURS = 72
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null
const notFound = () => new AppError(404, 'NOT_FOUND', 'Owner not found.')
const conflict = (code: string, message: string) => new AppError(409, code, message)

type Reasoned = { reason: string }

/**
 * Administrator restrictions, deletion scheduling, subscription adjustments and account creation.
 * Every action is audited with its reason in the same transaction. Restrictions are independent
 * of billing: confirming a payment never clears them.
 */
export function createCustomerLifecycleService(options: {
  repo: ReturnType<typeof createCustomerLifecycleRepository>
  audit: AdminAuditService
  withAdmin: AdminTransaction
  billing: AdminLifecyclePort
  detail: (ownerId: string) => Promise<AdminOwnerDetail>
  delivery?: OwnerAccountDelivery
  portalOrigin?: string
  clock?: () => Date
}) {
  const { repo, audit, withAdmin, billing, detail } = options
  const clock = options.clock ?? (() => new Date())

  const restriction = (o: {
    blockedAt: Date | null
    deletionRequestedAt: Date | null
    deletionDueAt: Date | null
  }) => ({
    blockedAt: iso(o.blockedAt),
    deletionRequestedAt: iso(o.deletionRequestedAt),
    deletionDueAt: iso(o.deletionDueAt),
  })
  async function subscriptionSnapshot(ownerId: string, tx: Transaction) {
    const s = await billing.state(ownerId, tx)
    return {
      status: s.status,
      planCode: s.planCode,
      paidThroughAt: iso(s.paidThroughAt),
      trialEndsAt: iso(s.row?.trialEndsAt),
      suspendedAt: iso(s.row?.suspendedAt),
    }
  }
  async function revokeEverything(ownerId: string, now: Date, tx: Transaction) {
    await repo.revokeOwnerSessions(ownerId, now, tx)
    for (const id of await repo.organizationIds(ownerId, tx))
      await repo.revokeOrganizationSessions(id, now, tx)
  }
  const record = (
    admin: AuthenticatedAdmin,
    action: string,
    targetType: string,
    targetId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    tx: Transaction,
  ) =>
    audit.record(
      { adminId: admin.id, actor: admin.email, action, targetType, targetId, before, after },
      tx,
    )

  /** Owner-level change under the authorized session; returns the refreshed customer detail. */
  async function onOwner(
    admin: AuthenticatedAdmin,
    ownerId: string,
    work: (
      owner: NonNullable<Awaited<ReturnType<typeof repo.owner>>>,
      tx: Transaction,
    ) => Promise<void>,
  ) {
    await withAdmin(async (tx) => {
      const owner = await repo.owner(ownerId, tx)
      if (!owner) throw notFound()
      await work(owner, tx)
    })
    return detail(ownerId)
  }

  /** Subscription change audited with lifecycle snapshots before and after. */
  const onSubscription = (
    admin: AuthenticatedAdmin,
    ownerId: string,
    action: string,
    extra: Record<string, unknown>,
    work: (tx: Transaction) => Promise<void>,
  ) =>
    onOwner(admin, ownerId, async (_owner, tx) => {
      const before = await subscriptionSnapshot(ownerId, tx)
      await work(tx)
      const after = await subscriptionSnapshot(ownerId, tx)
      await record(admin, action, 'owner_subscription', ownerId, before, { ...after, ...extra }, tx)
    })

  function invitationLink() {
    if (!options.delivery || !options.portalOrigin)
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Owner account email is not configured.')
    const token = randomBytes(32).toString('base64url')
    const url = new URL('/auth/accept-invitation', options.portalOrigin)
    url.hash = new URLSearchParams({ token }).toString()
    return {
      token,
      tokenHash: hash(token),
      url: url.toString(),
      expiresAt: new Date(clock().getTime() + INVITATION_HOURS * 3_600_000),
    }
  }
  async function sendInvitation(
    owner: { email: string; locale: 'fr' | 'en' },
    link: ReturnType<typeof invitationLink>,
  ) {
    try {
      await options.delivery!.send({
        to: owner.email,
        url: link.url,
        purpose: 'invitation',
        expiresAt: link.expiresAt,
        language: owner.locale,
      })
    } catch {
      await withAdmin((tx) => repo.invalidateInvitation(link.tokenHash, tx))
      throw new AppError(
        502,
        'INVITATION_DELIVERY_FAILED',
        'The invitation email could not be sent. Try resending it.',
      )
    }
  }

  return {
    block: (admin: AuthenticatedAdmin, ownerId: string, input: Reasoned) =>
      onOwner(admin, ownerId, async (owner, tx) => {
        if (owner.blockedAt) throw conflict('ALREADY_BLOCKED', 'This customer is already blocked.')
        const now = clock()
        await repo.updateOwner(ownerId, { blockedAt: now }, tx)
        await revokeEverything(ownerId, now, tx)
        await record(
          admin,
          'customer.block',
          'platform_user',
          ownerId,
          restriction(owner),
          {
            ...restriction({ ...owner, blockedAt: now }),
            reason: input.reason,
          },
          tx,
        )
      }),
    unblock: (admin: AuthenticatedAdmin, ownerId: string, input: Reasoned) =>
      onOwner(admin, ownerId, async (owner, tx) => {
        if (!owner.blockedAt) throw conflict('NOT_BLOCKED', 'This customer is not blocked.')
        await repo.updateOwner(ownerId, { blockedAt: null }, tx)
        await record(
          admin,
          'customer.unblock',
          'platform_user',
          ownerId,
          restriction(owner),
          {
            ...restriction({ ...owner, blockedAt: null }),
            reason: input.reason,
          },
          tx,
        )
      }),
    /** Blocks everything now; the permanent purge is a separate, not yet automated, step. */
    scheduleDeletion: (admin: AuthenticatedAdmin, ownerId: string, input: Reasoned) =>
      onOwner(admin, ownerId, async (owner, tx) => {
        if (owner.deletionRequestedAt)
          throw conflict('DELETION_SCHEDULED', 'Deletion is already scheduled.')
        const now = clock()
        const due = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS)
        await repo.updateOwner(ownerId, { deletionRequestedAt: now, deletionDueAt: due }, tx)
        await revokeEverything(ownerId, now, tx)
        await record(
          admin,
          'customer.delete',
          'platform_user',
          ownerId,
          restriction(owner),
          {
            ...restriction({ ...owner, deletionRequestedAt: now, deletionDueAt: due }),
            reason: input.reason,
          },
          tx,
        )
      }),
    /** Restores the previous state: other restrictions are separate markers and stay in place. */
    cancelDeletion: (admin: AuthenticatedAdmin, ownerId: string, input: Reasoned) =>
      onOwner(admin, ownerId, async (owner, tx) => {
        if (!owner.deletionRequestedAt || !owner.deletionDueAt)
          throw conflict('DELETION_NOT_SCHEDULED', 'No deletion is scheduled.')
        if (owner.deletionDueAt.getTime() <= clock().getTime())
          throw conflict('DELETION_DUE', 'The cancellation period has ended.')
        await repo.updateOwner(ownerId, { deletionRequestedAt: null, deletionDueAt: null }, tx)
        await record(
          admin,
          'customer.delete_cancel',
          'platform_user',
          ownerId,
          restriction(owner),
          {
            ...restriction({ ...owner, deletionRequestedAt: null, deletionDueAt: null }),
            reason: input.reason,
          },
          tx,
        )
      }),
    suspendSubscription: (admin: AuthenticatedAdmin, ownerId: string, input: Reasoned) =>
      onSubscription(
        admin,
        ownerId,
        'subscription.suspend',
        { reason: input.reason },
        async (tx) => {
          await billing.suspend(ownerId, tx)
          const now = clock()
          for (const id of await repo.organizationIds(ownerId, tx))
            await repo.revokeOrganizationSessions(id, now, tx)
        },
      ),
    // Coverage-changing actions: change, period note and audit in one transaction.
    resumeSubscription: (admin: AuthenticatedAdmin, ownerId: string, input: Reasoned) =>
      onSubscription(admin, ownerId, 'subscription.resume', { reason: input.reason }, (tx) =>
        billing.resume(ownerId, tx),
      ),
    changePlan: (
      admin: AuthenticatedAdmin,
      ownerId: string,
      planCode: string,
      { reason }: Reasoned,
    ) =>
      onSubscription(admin, ownerId, 'subscription.change_plan', { reason }, (tx) =>
        billing.changePlan(
          ownerId,
          planCode,
          { adminId: admin.id, email: admin.email, reason },
          tx,
        ),
      ),
    /** Trial conversion; the settlement choice and dates are audited with the reason. */
    activate: (admin: AuthenticatedAdmin, ownerId: string, input: AdminPlanActivation) => {
      const settlement =
        input.settlement === 'complimentary'
          ? input.paymentMethod || input.receivedReference
            ? (() => {
                throw new AppError(
                  400,
                  'PAYMENT_DETAILS_UNEXPECTED',
                  'Complimentary access has no payment method or reference.',
                )
              })()
            : { kind: 'complimentary' as const }
          : input.paymentMethod && input.receivedReference?.trim()
            ? {
                kind: 'payment' as const,
                method: input.paymentMethod,
                reference: input.receivedReference.trim(),
              }
            : (() => {
                throw new AppError(
                  400,
                  'PAYMENT_DETAILS_REQUIRED',
                  'Give the payment method and the received reference.',
                )
              })()
      const { reason, planCode, cycle, startsOn, endsOn } = input
      return onSubscription(
        admin,
        ownerId,
        'subscription.activate',
        { planCode, cycle, startsOn, endsOn, settlement: input.settlement, reason },
        (tx) =>
          billing.activate(
            ownerId,
            { planCode, cycle, startsOn, endsOn, settlement },
            { adminId: admin.id, email: admin.email, reason },
            tx,
          ),
      )
    },
    extend: (admin: AuthenticatedAdmin, ownerId: string, days: number, { reason }: Reasoned) =>
      onSubscription(admin, ownerId, 'subscription.extend', { days, reason }, (tx) =>
        billing.extend(ownerId, days, { adminId: admin.id, email: admin.email, reason }, tx),
      ),
    async suspendOrganization(admin: AuthenticatedAdmin, organizationId: string, input: Reasoned) {
      const ownerId = await withAdmin(async (tx) => {
        const org = await repo.organization(organizationId, tx)
        if (!org) throw new AppError(404, 'NOT_FOUND', 'Organization not found.')
        if (org.suspendedAt)
          throw conflict('ALREADY_SUSPENDED', 'This organization is already suspended.')
        const now = clock()
        await repo.setSuspension(organizationId, now, tx)
        await repo.revokeOrganizationSessions(organizationId, now, tx)
        await record(
          admin,
          'organization.suspend',
          'organization',
          organizationId,
          { suspendedAt: null },
          {
            suspendedAt: now.toISOString(),
            source: 'admin',
            ownerId: org.ownerId,
            reason: input.reason,
          },
          tx,
        )
        return org.ownerId
      })
      return detail(ownerId)
    },
    async renameOrganizationSlug(
      admin: AuthenticatedAdmin,
      organizationId: string,
      input: Reasoned & { slug: string },
    ) {
      const slug = normalizeSlug(input.slug)
      const problem = slugProblem(slug)
      if (problem === 'SLUG_RESERVED')
        throw new AppError(400, 'SLUG_RESERVED', 'This address is reserved.')
      if (problem)
        throw new AppError(
          400,
          'SLUG_INVALID',
          'Use 3 to 40 lowercase letters, digits or hyphens, without a leading or trailing hyphen.',
        )
      const ownerId = await withAdmin(async (tx) => {
        const org = await repo.organization(organizationId, tx)
        if (!org) throw new AppError(404, 'NOT_FOUND', 'Organization not found.')
        if (org.slug === slug)
          throw conflict('SLUG_UNCHANGED', 'The organization already uses this address.')
        if ((await repo.slugUsers(slug, tx)).some((id) => id !== organizationId))
          throw conflict('SLUG_TAKEN', 'This address is already used.')
        const now = clock()
        await repo.renameSlug(organizationId, org.slug, slug, now, tx)
        // Sessions belong to the old host; everyone signs in again on the new address.
        await repo.revokeOrganizationSessions(organizationId, now, tx)
        await record(
          admin,
          'organization.rename_slug',
          'organization',
          organizationId,
          { slug: org.slug },
          { slug, ownerId: org.ownerId, reason: input.reason },
          tx,
        )
        return org.ownerId
      }).catch((error: unknown) => {
        if (databaseCode(error) === '23505')
          throw conflict('SLUG_TAKEN', 'This address is already used.')
        throw error
      })
      return detail(ownerId)
    },
    async reactivateOrganization(
      admin: AuthenticatedAdmin,
      organizationId: string,
      input: Reasoned,
    ) {
      const ownerId = await withAdmin(async (tx) => {
        const org = await repo.organization(organizationId, tx)
        if (!org) throw new AppError(404, 'NOT_FOUND', 'Organization not found.')
        if (!org.suspendedAt)
          throw conflict('ORGANIZATION_NOT_SUSPENDED', 'This organization is not suspended.')
        await repo.setSuspension(organizationId, null, tx)
        await record(
          admin,
          'organization.reactivate',
          'organization',
          organizationId,
          { suspendedAt: org.suspendedAt.toISOString(), source: org.suspensionSource },
          { suspendedAt: null, ownerId: org.ownerId, reason: input.reason },
          tx,
        )
        return org.ownerId
      })
      return detail(ownerId)
    },
    /** Creates the owner (no organization) and emails a single-use set-password link. */
    async create(admin: AuthenticatedAdmin, input: AdminOwnerCreate) {
      const sub = input.subscription
      const grant =
        sub.kind === 'paid'
          ? sub.planCode && sub.cycle && sub.coverageStart && sub.coverageEnd
            ? {
                planCode: sub.planCode,
                cycle: sub.cycle,
                start: new Date(sub.coverageStart),
                end: new Date(sub.coverageEnd),
              }
            : (() => {
                throw new AppError(
                  400,
                  'INVALID_SUBSCRIPTION',
                  'A paid subscription needs a plan, a cycle and coverage dates.',
                )
              })()
          : null
      const link = invitationLink()
      const email = input.email.trim().toLowerCase()
      const owner = await withAdmin(async (tx) => {
        const now = clock()
        const created = await repo.createOwner(
          {
            email,
            // Unusable until the invitation sets a real password.
            passwordHash: `${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            locale: input.locale,
            invitedAt: now,
          },
          tx,
        )
        if (!created)
          throw conflict('EMAIL_TAKEN', 'An account already exists with this email address.')
        if (grant)
          await billing.grant(
            created.id,
            grant,
            { adminId: admin.id, email: admin.email, reason: input.reason },
            tx,
          )
        await repo.replaceInvitation(created.id, link.tokenHash, link.expiresAt, tx)
        await record(
          admin,
          'customer.create',
          'platform_user',
          created.id,
          {},
          {
            email,
            locale: input.locale,
            subscription: grant
              ? {
                  kind: 'paid',
                  planCode: grant.planCode,
                  cycle: grant.cycle,
                  coverageStart: grant.start.toISOString(),
                  coverageEnd: grant.end.toISOString(),
                }
              : { kind: 'trial' },
            reason: input.reason,
          },
          tx,
        )
        return created
      })
      await sendInvitation(owner, link)
      return detail(owner.id)
    },
    /** Only while the owner never set a password; earlier links stop working. */
    async resendInvitation(admin: AuthenticatedAdmin, ownerId: string, reason: string) {
      const link = invitationLink()
      const owner = await withAdmin(async (tx) => {
        const owner = await repo.owner(ownerId, tx)
        if (!owner) throw notFound()
        if (!owner.invitedAt || owner.emailVerifiedAt)
          throw conflict('INVITATION_NOT_PENDING', 'This customer has already set a password.')
        await repo.replaceInvitation(ownerId, link.tokenHash, link.expiresAt, tx)
        await record(
          admin,
          'customer.invite',
          'platform_user',
          ownerId,
          {},
          {
            expiresAt: link.expiresAt.toISOString(),
            reason,
          },
          tx,
        )
        return owner
      })
      await sendInvitation(owner, link)
    },
  }
}
