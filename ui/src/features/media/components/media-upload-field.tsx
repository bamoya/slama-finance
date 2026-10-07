import { ImagePlus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import type { UploadMedia } from '../../../api/generated/models'
import { FormError } from '../../../components/management/form-error'
import { Button } from '../../../components/ui/button'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useMediaUpload } from '../hooks/use-media-upload'
import { MediaPreview } from './media-preview'

export function MediaUploadField({
  purpose,
  label,
  value,
  onChange,
  disabled,
  onBusy,
}: {
  purpose: UploadMedia['purpose']
  label: string
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  onBusy: (busy: boolean) => void
}) {
  useUiLanguage()

  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const { can } = useAuthorization()
  const allowed =
    purpose === 'company_logo'
      ? can('company_settings.update') || can('templates.create') || can('templates.update')
      : purpose === 'company_signature'
        ? can('templates.create') || can('templates.update')
        : purpose === 'product_image' && (can('products.create') || can('products.update'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const { upload, progress, cancel } = useMediaUpload()
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return (
    <div className="space-y-3">
      {value && (
        <MediaPreview
          assetId={value}
          alt={purpose === 'product_image' ? label : `Company ${label}`}
        />
      )}
      {!disabled && allowed && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="md"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={16} aria-hidden="true" />
            {translate('Upload')} {label}
          </Button>
          <input
            ref={input}
            id={id}
            aria-label={translate('Upload {{value0}}', { value0: label })}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setError(undefined)
              setBusy(true)
              onBusy(true)
              try {
                const result = await upload(file, purpose)
                if (alive.current) onChange(result.id)
              } catch (reason) {
                if (alive.current) setError(reason)
              } finally {
                if (alive.current) {
                  setBusy(false)
                  onBusy(false)
                }
              }
            }}
          />
          {value && (
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              <X size={16} aria-hidden="true" />
              {translate('Remove')} {label}
            </Button>
          )}
          {busy && (
            <Button type="button" variant="outline" onClick={cancel}>
              {translate('Cancel upload')}
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-[var(--muted)]">
        {translate(
          'PNG, JPEG or WebP · maximum 2 MiB. Unused uploads are removed after 24 hours. Removing an image takes effect when you save.',
        )}
      </p>
      {busy && (
        <p role="status">
          {translate('Uploading')} {label}… {progress}%
        </p>
      )}
      <FormError error={error} />
    </div>
  )
}
