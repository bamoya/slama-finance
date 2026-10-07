import '../translations'

import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'wouter'

import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { SelectionCell, SelectionHeader } from '../../../../components/management/selection-cell'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useTableSelection } from '../../../../components/management/use-table-selection'
import { buttonVariants } from '../../../../components/ui/button'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { SettingsBulkActions } from '../../shared/components/settings-bulk-actions'
import { useCompanySettings, useDocumentTemplates } from '../../shared/queries'
import { TemplateListActions } from '../components/template-list-actions'
import { TemplateListFilters } from '../components/template-list-filters'
import { TemplateListPreview } from '../components/template-list-preview'
import { layoutLabelKey, templateLayouts } from '../utils/design-options'

export function DocumentTemplatesPage() {
  useUiLanguage()

  const { t } = useTranslation('templates')
  const query = useDocumentTemplates()
  const { can } = useAuthorization()
  const company = useCompanySettings(can('company_settings.read'))
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const layout = templateLayouts.find((value) => value === params.get('design')) ?? ''
  const density = ['standard', 'compact'].includes(params.get('density') ?? '')
    ? params.get('density')!
    : ''
  const status = ['active', 'archived', 'all'].includes(params.get('status') ?? '')
    ? params.get('status')!
    : 'active'
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  const rows = (query.data ?? []).filter(
    (row) =>
      (status === 'all' || (status === 'archived' ? !!row.archivedAt : !row.archivedAt)) &&
      (!layout || row.layout === layout) &&
      (!density || row.density === density) &&
      (!search.trim() || normalize(row.name).includes(normalize(search))),
  )
  const filtered = !!search || !!layout || !!density || status !== 'active'
  const suffix = params.size ? '?' + params.toString() : ''
  const selection = useTableSelection(rows, params.toString())
  const canBulk = ['update', 'delete'].some((action) => can(`templates.${action}`))
  const reset = () => setParams(new URLSearchParams(), { replace: true })
  const update = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (!value || (key === 'status' && value === 'active')) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('administration')}
        title={t('title')}
        description={t('listDescription')}
        actions={
          <Can permission="templates.create">
            <Link href={'/settings/invoice-appearance/new' + suffix} className={buttonVariants({})}>
              <Plus data-icon="inline-start" />
              {t('create')}
            </Link>
          </Can>
        }
      />
      <section
        aria-label={t('title')}
        className="overflow-hidden rounded-panel border border-border bg-[var(--surface)]"
      >
        <TemplateListFilters
          {...{ search, layout, density, status, update }}
          reset={filtered ? reset : undefined}
        />
        {canBulk && (
          <SettingsBulkActions
            resource="template"
            selected={selection.selected}
            clear={selection.clear}
          />
        )}
        {query.isPending || query.isError ? (
          <RequestState query={query} />
        ) : (
          <div className="p-3 md:p-5">
            <p role="status" className="mb-3 px-2 text-xs text-muted-foreground">
              {t('resultCount', { count: rows.length, total: query.data.length })}
            </p>
            {!rows.length ? (
              <EmptyState
                title={t(query.data.length ? 'noMatches' : 'noTemplates')}
                description={t(query.data.length ? 'clearHint' : 'createHint')}
              />
            ) : (
              <table data-slot="data-table" className="w-full table-fixed text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    {canBulk && <SelectionHeader selection={selection} />}
                    <th className="w-20 px-3 py-2">
                      <span className="sr-only">{t('previewTitle')}</span>
                    </th>
                    <th className="px-2 py-2">{t('templateName')}</th>
                    <th className="hidden w-36 px-3 py-2 md:table-cell">{t('density')}</th>
                    <th className="hidden w-28 px-3 py-2 sm:table-cell">{t('status')}</th>
                    <th className="w-14 px-2 py-2">
                      <span className="sr-only">{t('actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                      {canBulk && (
                        <SelectionCell selection={selection} id={row.id} name={row.name} />
                      )}
                      <td className="px-3 py-3">
                        <TemplateListPreview template={row} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/settings/invoice-appearance/${row.id}${suffix}`}
                            className="break-words font-semibold hover:underline"
                          >
                            {row.name}
                          </Link>
                          {company.data?.defaultTemplateId === row.id && (
                            <StatusBadge label={t('default')} />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(layoutLabelKey(row.layout))}
                        </p>
                        <div className="mt-1 sm:hidden">
                          <StatusBadge
                            label={t(row.archivedAt ? 'archived' : 'active')}
                            tone={row.archivedAt ? 'archived' : 'active'}
                          />
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                        {t(row.density === 'compact' ? 'compactDensity' : 'standard')}
                      </td>
                      <td className="hidden px-3 py-3 sm:table-cell">
                        <StatusBadge
                          label={t(row.archivedAt ? 'archived' : 'active')}
                          tone={row.archivedAt ? 'archived' : 'active'}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <TemplateListActions template={row} suffix={suffix} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
