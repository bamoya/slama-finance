import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useRegenerateDocumentPdf } from '../../../api/generated/sales/sales'
import {
  RegenerateDocumentPdfInputSchema,
  type RegenerateDocumentPdfParams,
} from '../../../api/generated/schemas/sales/artifacts.schemas'
import { FormError } from '../../../components/management/form-error'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog'
import { Field, FieldLabel } from '../../../components/ui/field'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { translate } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useDocumentTemplates } from '../../settings'
import { refreshSales } from '../refresh'

export function RegeneratePdfDialog({
  documentType,
  id,
  disabled,
  currentTemplateId,
}: RegenerateDocumentPdfParams & { disabled?: boolean; currentTemplateId?: string | null }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const cache = useQueryClient()
  const [open, setOpen] = useState(false)
  const { can } = useAuthorization()
  const canChoose = can('templates.read')
  const templates = useDocumentTemplates(open && canChoose)
  const [templateId, setTemplateId] = useState(currentTemplateId ?? '')
  const activeTemplates = templates.data?.filter((template) => !template.archivedAt) ?? []
  const selection =
    canChoose && activeTemplates.some((template) => template.id === templateId)
      ? templateId
      : 'company-default'
  const regenerate = useRegenerateDocumentPdf({ request: { timeout: 60_000 } })
  const submit = async () => {
    try {
      await regenerate.mutateAsync({
        documentType,
        id,
        data: RegenerateDocumentPdfInputSchema.parse({
          templateId: selection === 'company-default' ? null : selection,
        }),
      })
      await refreshSales(cache)
    } catch {
      /* Mutation error remains visible; previous download is preserved. */
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (regenerate.isPending) return
        setOpen(value)
        if (value) {
          setTemplateId(currentTemplateId ?? '')
          regenerate.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <RefreshCw data-icon="inline-start" />
          {t('regeneratePdf')}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex flex-col gap-content">
        <DialogTitle>{t('regeneratePdf')}</DialogTitle>
        <DialogDescription role="status">
          {t(regenerate.isSuccess ? 'pdfRegenerated' : 'regeneratePdfDescription')}
        </DialogDescription>
        <Field>
          <FieldLabel htmlFor={`regenerate-template-${id}`}>
            {translate('Document template')}
          </FieldLabel>
          <Select
            id={`regenerate-template-${id}`}
            value={selection}
            onValueChange={(value) => setTemplateId(value === 'company-default' ? '' : value)}
            disabled={
              regenerate.isPending || regenerate.isSuccess || (canChoose && templates.isPending)
            }
          >
            <SelectGroup>
              <SelectOption value="company-default">{translate('Company default')}</SelectOption>
              {activeTemplates.map((template) => (
                <SelectOption key={template.id} value={template.id}>
                  {template.name}
                </SelectOption>
              ))}
            </SelectGroup>
          </Select>
        </Field>
        <FormError error={canChoose ? templates.error : null} />
        <FormError error={regenerate.error} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={regenerate.isPending} onClick={() => setOpen(false)}>
            {t(regenerate.isSuccess ? 'closeRegeneratedPdf' : 'closeRegeneration')}
          </Button>
          <Button
            disabled={
              regenerate.isPending || regenerate.isSuccess || (canChoose && templates.isPending)
            }
            onClick={() => void submit()}
          >
            {t(regenerate.isPending ? 'regeneratingPdf' : 'regeneratePdf')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
