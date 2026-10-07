import { translate } from '../../../../lib/i18n'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { AssetPreview } from '../../assets/components/asset-field'
import { PreviewPane } from '../../document-templates/components/template-preview'
import type { SettingsField } from './settings-form'
import { SettingsColumns } from './settings-layout'

export function SettingsDetails({
  fields,
  values,
  preview = false,
}: {
  fields: SettingsField[]
  values: Record<string, unknown>
  preview?: boolean
}) {
  useUiLanguage()

  return (
    <SettingsColumns
      fields={fields}
      preview={preview ? <PreviewPane values={values} /> : undefined}
      renderField={(field) => {
        const value = values[field.name]
        const asset = field.type === 'logo' || field.type === 'signature'
        const text =
          value == null || value === ''
            ? translate('Not provided')
            : typeof value === 'boolean'
              ? value
                ? translate('Yes')
                : translate('No')
              : (field.options?.find((option) => option.value === value)?.label ?? String(value))
        return (
          <dl
            key={field.name}
            className={asset || field.type === 'textarea' ? 'min-w-0 sm:col-span-full' : 'min-w-0'}
          >
            <dt className="text-sm text-[var(--muted)]">{field.label}</dt>
            <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-medium">
              {asset && value ? (
                <Can
                  permission={
                    field.type === 'signature'
                      ? 'templates.read'
                      : preview
                        ? 'templates.read'
                        : 'company_settings.read'
                  }
                  fallback="Configured (restricted access)"
                >
                  <AssetPreview assetId={String(value)} kind={field.type as 'logo' | 'signature'} />
                </Can>
              ) : (
                text
              )}
            </dd>
          </dl>
        )
      }}
    />
  )
}
