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
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { refreshSales } from '../refresh'

export function RegeneratePdfDialog({
  documentType,
  id,
  disabled,
}: RegenerateDocumentPdfParams & { disabled?: boolean }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const cache = useQueryClient()
  const [open, setOpen] = useState(false)
  const [design, setDesign] = useState('saved')
  const regenerate = useRegenerateDocumentPdf({ request: { timeout: 60_000 } })
  const submit = async () => {
    try {
      await regenerate.mutateAsync({
        documentType,
        id,
        data: RegenerateDocumentPdfInputSchema.parse({ design }),
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
          setDesign('saved')
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
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pdf-design">{t('pdfDesign')}</FieldLabel>
            <Select
              id="pdf-design"
              value={design}
              onValueChange={setDesign}
              disabled={regenerate.isPending}
            >
              <SelectGroup>
                <SelectOption value="saved">{t('savedPdfDesign')}</SelectOption>
                <SelectOption value="latest">{t('latestPdfDesign')}</SelectOption>
              </SelectGroup>
            </Select>
          </Field>
        </FieldGroup>
        {documentType === 'delivery_note' && (
          <p className="text-sm text-muted-foreground">{t('deliveryPdfDesign')}</p>
        )}
        <FormError error={regenerate.error} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={regenerate.isPending} onClick={() => setOpen(false)}>
            {t(regenerate.isSuccess ? 'closeRegeneratedPdf' : 'closeRegeneration')}
          </Button>
          <Button
            disabled={regenerate.isPending || regenerate.isSuccess}
            onClick={() => void submit()}
          >
            {t(regenerate.isPending ? 'regeneratingPdf' : 'regeneratePdf')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
