import type {
  CreateOwnerOrganization,
  OwnerBrandUpload,
  OwnerOnboarding,
  OwnerOnboardingConfiguration,
  SaveOwnerOnboarding,
} from '../../../../contracts/generated/identity/owner-onboarding.schemas.js'
import { OwnerOnboardingConfigurationSchema } from '../../../../contracts/generated/identity/owner-onboarding.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError, databaseCode } from '../../../../lib/errors.js'
import { normalizeSlug, slugProblem } from '../../../../lib/platform-sites.js'
import type { OrganizationProvisioningPublicApi } from '../../../organization/identity/index.js'
import type { OwnerBrandingPublicApi } from '../../../organization/media/index.js'
import type { SettingsPublicApi } from '../../../organization/settings/index.js'
import type { createOwnerAuthService } from '../../identity/services/owner-auth.service.js'
import type { SubscriptionsPublicApi } from '../../subscriptions/index.js'
import { toOwnerOrganization } from '../mappers/owner-organization.mapper.js'
import type { createOwnerOnboardingRepository } from '../repositories/owner-onboarding.repository.js'

type Row = Awaited<ReturnType<ReturnType<typeof createOwnerOnboardingRepository>['get']>>
const map = (row: Row): OwnerOnboarding => ({
  organization: toOwnerOrganization({ organization: row.organization, staffCount: row.staffCount }),
  configuration: OwnerOnboardingConfigurationSchema.parse(row.profile.configuration),
  currentStep: row.profile.currentStep,
  version: row.profile.version,
  completedAt: row.profile.completedAt?.toISOString() ?? null,
})
export function createOwnerOnboardingService(
  repository: ReturnType<typeof createOwnerOnboardingRepository>,
  owners: ReturnType<typeof createOwnerAuthService>,
  branding: () => OwnerBrandingPublicApi,
  activation?: {
    invite?: OrganizationProvisioningPublicApi['invite']
    subscriptions: SubscriptionsPublicApi
    settings: () => SettingsPublicApi
    provision: (
      tx: Transaction,
      input: { email: string; firstName: string | null; lastName: string | null },
    ) => Promise<string>
  },
  /** Whole-SaaS slug usage (current and former addresses); owners cannot read other organizations. */
  slugs: { taken: (slug: string, exceptOrganizationId?: string) => Promise<boolean> } = {
    taken: async () => false,
  },
) {
  const slugError = (problem: 'SLUG_INVALID' | 'SLUG_RESERVED') =>
    problem === 'SLUG_RESERVED'
      ? new AppError(400, 'SLUG_RESERVED', 'This address is reserved.')
      : new AppError(
          400,
          'SLUG_INVALID',
          'Use 3 to 40 lowercase letters, digits or hyphens, without a leading or trailing hyphen.',
        )
  const taken = () => new AppError(409, 'SLUG_TAKEN', 'This address is already used.')
  const assertBrand = async (
    ownerId: string,
    organizationId: string,
    c: OwnerOnboardingConfiguration,
  ) => {
    if (c.branding.logoAssetId)
      await branding().assert(ownerId, organizationId, c.branding.logoAssetId, 'company_logo')
    if (c.branding.signatureAssetId)
      await branding().assert(
        ownerId,
        organizationId,
        c.branding.signatureAssetId,
        'company_signature',
      )
  }
  const clean = (configuration: OwnerOnboardingConfiguration, ownerEmail?: string) => {
    const c = OwnerOnboardingConfigurationSchema.parse(configuration)
    c.name = c.name.trim()
    if (!c.name) throw new AppError(400, 'VALIDATION_ERROR', 'Organization name is required.')
    const emails = c.invitations.map((i) => i.email.trim().toLowerCase())
    if (new Set(emails).size !== emails.length)
      throw new AppError(400, 'VALIDATION_ERROR', 'Each staff email can only be invited once.')
    if (ownerEmail && emails.includes(ownerEmail.toLowerCase()))
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'The initial administrator already uses this email.',
      )
    c.invitations = c.invitations.map((i, index) => ({ ...i, email: emails[index]! }))
    if (!c.defaults.vatEnabled) c.defaults.vatRate = 0
    return c
  }
  return {
    async create(token: string | undefined, input: CreateOwnerOrganization) {
      const owner = await owners.session(token)
      const configuration = clean({
        name: input.name,
        activity: input.activity ?? null,
        company: {},
        branding: { accentColor: '#a77b28' },
        defaults: {
          layout: 'essential',
          language: owner.locale,
          currency: 'MAD',
          paymentDueDays: 15,
          estimateValidDays: 15,
          compact: false,
          vatEnabled: false,
          vatRate: 0,
        },
        invitations: [],
      })
      const slug = normalizeSlug(input.slug)
      const problem = slugProblem(slug)
      if (problem) throw slugError(problem)
      if (await slugs.taken(slug, input.requestId)) throw taken()
      return map(
        await repository
          .create(
            owner.id,
            input.requestId,
            slug,
            configuration,
            activation
              ? (tx) => activation.subscriptions.admitOrganization(owner.id, tx)
              : undefined,
            activation
              ? (tx) =>
                  activation.provision(tx, {
                    email: owner.email,
                    firstName: owner.firstName,
                    lastName: owner.lastName,
                  })
              : undefined,
          )
          .catch((error: unknown) => {
            // Concurrent creation or a former address: the unique index / slug guard decides.
            if (databaseCode(error) === '23505') throw taken()
            throw error
          }),
      )
    },
    /** Read-only reference data for the Company identity step; never blocks onboarding. */
    async legalRequirements(token: string | undefined) {
      await owners.session(token)
      return activation?.settings().legalRequirements() ?? { items: [] }
    },
    /** Advisory only: creation enforces uniqueness atomically (unique index and slug guard). */
    async slugAvailability(token: string | undefined, input: string) {
      await owners.session(token)
      const slug = normalizeSlug(input)
      const problem = slugProblem(slug)
      if (problem)
        return {
          slug,
          available: false,
          reason: problem === 'SLUG_RESERVED' ? ('reserved' as const) : ('invalid' as const),
        }
      if (await slugs.taken(slug)) return { slug, available: false, reason: 'taken' as const }
      return { slug, available: true, reason: null }
    },
    async get(token: string | undefined, id: string) {
      const owner = await owners.session(token)
      return map(await repository.get(owner.id, id))
    },
    async save(token: string | undefined, id: string, input: SaveOwnerOnboarding) {
      const owner = await owners.session(token)
      await repository.get(owner.id, id)
      const c = clean(input.configuration, owner.email)
      await assertBrand(owner.id, id, c)
      return map(await repository.save(owner.id, id, input.expectedVersion, c, input.currentStep))
    },
    async complete(token: string | undefined, id: string, version: number) {
      const owner = await owners.session(token)
      const row = await repository.get(owner.id, id)
      const c = clean(
        OwnerOnboardingConfigurationSchema.parse(row.profile.configuration),
        owner.email,
      )
      if (row.organization.activatedAt) return map(row)
      await assertBrand(owner.id, id, c)
      const images = activation
        ? await branding().prepareWorkspace(owner.id, id, [
            c.branding.logoAssetId,
            c.branding.signatureAssetId,
          ])
        : []
      return map(
        await repository.save(
          owner.id,
          id,
          version,
          c,
          6,
          true,
          activation
            ? async (tx) => {
                const plan = await activation.subscriptions.assertAccess(tx)
                if (
                  !plan.entitlements.features.includes('custom_templates') &&
                  (c.defaults.layout !== 'essential' || c.defaults.compact)
                )
                  throw new AppError(
                    403,
                    'FEATURE_UNAVAILABLE',
                    'Your plan includes one fixed document layout.',
                  )
                await activation.invite?.(tx, c.invitations, c.defaults.language)
                await branding().attachWorkspace(tx, images, owner.id)
                await activation.settings().applyOrganizationSetup(tx, c, owner.id)
              }
            : undefined,
        ),
      )
    },
    async image(token: string | undefined, id: string, assetId: string) {
      const owner = await owners.session(token)
      await repository.get(owner.id, id)
      return branding().image(owner.id, id, assetId)
    },
    async upload(token: string | undefined, id: string, input: OwnerBrandUpload) {
      const owner = await owners.session(token)
      const row = await repository.get(owner.id, id)
      if (
        row.profile.completedAt ||
        row.organization.activatedAt ||
        row.organization.suspendedAt ||
        row.organization.pausedAt ||
        row.organization.deletionRequestedAt
      )
        throw new AppError(
          409,
          'ONBOARDING_UNAVAILABLE',
          'Organization setup cannot be changed in its current state.',
        )
      return branding().upload(owner.id, id, input)
    },
  }
}
