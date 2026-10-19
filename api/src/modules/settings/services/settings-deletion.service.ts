import type {
  ConfirmSettingsDeletion,
  SettingsDeletionSelection,
} from '../../../contracts/generated/settings/deletion.schemas.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { createImpactConfirmation } from '../../../lib/impact-confirmation.js'
import { assertVersion } from '../../../lib/validation.js'
import type { MediaPublicApi } from '../../media/index.js'
import type { SalesSettingsDeletionApi } from '../../sales/index.js'
import type { createSettingsRepository } from '../repositories/settings.repository.js'
import { createSettingsDeletionRepository } from '../repositories/settings-deletion.repository.js'

export function createSettingsDeletionService(
  repo: ReturnType<typeof createSettingsRepository>,
  sales: SalesSettingsDeletionApi,
  media: MediaPublicApi,
) {
  const deletion = createSettingsDeletionRepository(),
    confirmation = createImpactConfirmation()
  async function graph(input: SettingsDeletionSelection, actor: string, tx: Transaction) {
    for (const action of ['read', 'delete'])
      await repo.authorizeWrite(tx, actor, `${input.resource}.${action}`)
    const ids = input.records.map((row) => row.id.toLowerCase()).sort()
    if (new Set(ids).size !== ids.length)
      throw new AppError(400, 'DUPLICATE_SELECTION', 'Select each record only once.')
    const state = await deletion.graph(tx, input.resource, ids)
    for (const record of input.records) {
      const root = state.roots.find((row) => row.id === record.id.toLowerCase())
      if (!root) throw new AppError(404, 'RECORD_NOT_FOUND', 'A selected record no longer exists.')
      assertVersion(root.version, record.expectedVersion)
    }
    if (state.clearDefault)
      for (const action of ['read', 'update'])
        await repo.authorizeWrite(tx, actor, `company_settings.${action}`)
    const references = await sales.preview(tx, input.resource, ids, actor)
    return { actor, resource: input.resource, ids, state, references }
  }
  return {
    preview(input: SettingsDeletionSelection, actor: string) {
      return repo.transaction(async (tx) => {
        const value = await graph(input, actor, tx)
        return {
          ...confirmation.issue(value),
          groups: [
            {
              resource: input.resource,
              operation: 'delete' as const,
              records: value.state.roots.map((row) => ({ id: row.id, name: row.name })),
            },
            ...value.references.groups,
            ...(value.state.clearDefault
              ? [
                  {
                    resource: 'company_settings',
                    operation: 'detach' as const,
                    records: [{ id: '1', name: 'Company default' }],
                  },
                ]
              : []),
          ],
          requiredPermissions: [
            `${input.resource}.read`,
            `${input.resource}.delete`,
            ...value.references.requiredPermissions,
            ...(value.state.clearDefault
              ? ['company_settings.read', 'company_settings.update']
              : []),
          ],
          blockers: [],
          media: 0,
        }
      })
    },
    confirm(input: ConfirmSettingsDeletion, actor: string) {
      return repo.transaction(async (tx) => {
        const value = await graph(input, actor, tx)
        confirmation.assert(input.token, value)
        await sales.detach(tx, input.resource, value.ids, actor, value.references.fingerprint)
        if (value.state.clearDefault) {
          const after = await deletion.clearDefault(tx, input.resource, actor)
          await repo.audit(
            tx,
            actor,
            'company_settings',
            '1',
            'clear_default',
            value.state.company,
            after,
          )
        }
        await deletion.remove(tx, input.resource, value.ids)
        for (const before of value.state.roots)
          await repo.audit(
            tx,
            actor,
            input.resource === 'templates' ? 'document_templates' : 'bank_accounts',
            before.id,
            'delete',
            before,
            null,
          )
        if (input.resource === 'templates')
          await media.release(
            tx,
            value.state.roots.flatMap((row) =>
              'logoAssetId' in row ? [row.logoAssetId, row.signatureAssetId] : [],
            ),
          )
      })
    },
  }
}
