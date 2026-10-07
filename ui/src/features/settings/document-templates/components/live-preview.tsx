import '../translations'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CreateDocumentTemplateSchema,
  type PreviewDocumentTemplateQuery,
  previewDocumentTemplateQuerySchema,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import { previewDocumentTemplate } from '../../../../api/generated/settings/settings'
import { FormError } from '../../../../components/management/form-error'
import { ToggleGroup, ToggleGroupItem } from '../../../../components/ui/toggle-group'
import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../../identity'

export function LivePreview({ values }: { values: Record<string, unknown> }) {
  useUiLanguage()

  const { t } = useTranslation('templates')
  const { can } = useAuthorization()
  const [kind, setKind] = useState<PreviewDocumentTemplateQuery['documentType']>('invoice')
  const [sampleSize, setSampleSize] = useState<PreviewDocumentTemplateQuery['sampleSize']>('short')
  const source = JSON.stringify({
    ...values,
    name: values.name || 'Preview',
    ...(!can('templates.read') ? { showSignature: false, signatureAssetId: null } : {}),
  })
  const [settled, setSettled] = useState(source)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(source), 600)
    return () => clearTimeout(timer)
  }, [source])
  const parsed = CreateDocumentTemplateSchema.safeParse(JSON.parse(settled))
  const query = useQuery({
    queryKey: ['template-live-preview', settled, kind, sampleSize],
    queryFn: ({ signal }) =>
      previewDocumentTemplate(
        CreateDocumentTemplateSchema.parse(JSON.parse(settled)),
        { documentType: kind, sampleSize: kind === 'payment_receipt' ? 'short' : sampleSize },
        { signal },
      ),
    enabled: parsed.success,
    retry: false,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const changing = source !== settled
  return (
    <div className="grid gap-4">
      <ToggleGroup
        type="single"
        value={kind}
        onValueChange={(value) => {
          if (!value) return
          const result = previewDocumentTemplateQuerySchema.shape.documentType.safeParse(value)
          if (result.success) setKind(result.data)
        }}
        variant="outline"
        spacing={2}
        className="flex-wrap"
        aria-label={t('previewType')}
      >
        {['invoice', 'estimate', 'delivery', 'payment_receipt'].map((type) => (
          <ToggleGroupItem key={type} value={type}>
            {t(type)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {kind !== 'payment_receipt' && (
        <ToggleGroup
          type="single"
          value={sampleSize}
          variant="outline"
          spacing={2}
          className="w-fit"
          aria-label={t('sampleSize')}
          onValueChange={(value) => {
            const result = previewDocumentTemplateQuerySchema.shape.sampleSize.safeParse(value)
            if (result.success) setSampleSize(result.data)
          }}
        >
          <ToggleGroupItem value="short">{t('shortSample')}</ToggleGroupItem>
          <ToggleGroupItem value="many">{t('manySample')}</ToggleGroupItem>
        </ToggleGroup>
      )}
      <p className="text-xs text-muted-foreground">{t('sample')}</p>
      {!parsed.success ? (
        <p role="status">{t('invalidPreview')}</p>
      ) : changing || query.isFetching ? (
        <p role="status">{t('rendering')}</p>
      ) : null}
      <FormError error={query.error} />
      {query.data && !changing && !query.isError && (
        <p className="text-xs text-muted-foreground">
          {t('pageCount', { count: query.data.pageCount })}
        </p>
      )}
      {query.data && !changing && !query.isError && (
        <iframe
          title={t('previewTitle')}
          sandbox=""
          srcDoc={query.data.html}
          className="aspect-[210/297] min-h-[500px] w-full rounded-xl border border-border bg-[var(--document-paper)]"
        />
      )}
      <p className="text-xs text-muted-foreground">{t('previewNote')}</p>
    </div>
  )
}
