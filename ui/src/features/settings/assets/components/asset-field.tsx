import { useUiLanguage } from '../../../../lib/i18n'
import { MediaPreview, MediaUploadField } from '../../../media'

export function AssetPreview({ assetId, kind }: { assetId: string; kind: 'logo' | 'signature' }) {
  useUiLanguage()

  return <MediaPreview assetId={assetId} alt={`Company ${kind}`} />
}
export function AssetField({
  kind,
  ...props
}: {
  kind: 'logo' | 'signature'
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  onBusy: (busy: boolean) => void
}) {
  useUiLanguage()

  return (
    <MediaUploadField
      {...props}
      purpose={kind === 'logo' ? 'company_logo' : 'company_signature'}
      label={kind}
    />
  )
}
