import { useEffect, useState } from 'react'

import { useDownloadMedia } from '../../../api/generated/media/media'
import { FormError } from '../../../components/management/form-error'
import { translate, useUiLanguage } from '../../../lib/i18n'

export function MediaPreview({
  assetId,
  alt = 'Uploaded image',
}: {
  assetId: string
  alt?: string
}) {
  useUiLanguage()

  const [url, setUrl] = useState('')
  const query = useDownloadMedia(assetId, {
    query: { enabled: !!assetId, retry: false },
    request: { responseType: 'blob' },
  })
  useEffect(() => {
    setUrl('')
    if (!query.data) return
    const next = URL.createObjectURL(query.data)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [query.data, assetId])
  if (query.isError) return <FormError error={query.error} />
  if (!url)
    return (
      <p role="status" className="text-sm text-[var(--muted)]">
        {translate('Loading image…')}
      </p>
    )
  return (
    <img
      src={url}
      alt={alt}
      className="h-24 max-w-full rounded-xl border border-[var(--border)] bg-white object-contain p-2"
    />
  )
}
