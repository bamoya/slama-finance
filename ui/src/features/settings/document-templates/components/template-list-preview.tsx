import { X } from 'lucide-react'
import { type CSSProperties, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CreateDocumentTemplateSchema,
  type DocumentTemplate,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { useUiLanguage } from '../../../../lib/i18n'
import { LivePreview } from './live-preview'

export function TemplateListPreview({ template }: { template: DocumentTemplate }) {
  useUiLanguage()

  const { t } = useTranslation('templates')
  const [open, setOpen] = useState(false)
  const values = Object.fromEntries(
    Object.keys(CreateDocumentTemplateSchema.shape).map((key) => [
      key,
      template[key as keyof DocumentTemplate],
    ]),
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('openPreview', { name: template.name })}
        className="template-list-preview rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className={`template-thumbnail template-thumbnail-${template.layout}`}
          style={
            {
              '--document-accent': template.accentColor,
              '--document-tint': `color-mix(in srgb, ${template.accentColor} 12%, var(--document-paper))`,
            } as CSSProperties
          }
        >
          <span className="template-thumbnail-header" />
          <span className="template-thumbnail-address" />
          <span className="template-thumbnail-lines" />
          <span className="template-thumbnail-total" />
        </span>
      </button>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-semibold">{template.name}</DialogTitle>
            <DialogDescription>{t('previewDescription')}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="outline" size="icon" aria-label={t('closePreview')}>
              <X />
            </Button>
          </DialogClose>
        </div>
        {open && <LivePreview values={values} />}
      </DialogContent>
    </Dialog>
  )
}
