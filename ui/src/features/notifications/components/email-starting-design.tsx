import { useState } from 'react'

import { textToEmailHtml } from '../../../components/email-editor/email-html'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog'
import { translate, useUiLanguage } from '../../../lib/i18n'

export function EmailStartingDesign({
  onApply,
  locale,
  variables,
}: {
  onApply: (html: string) => void
  locale: string
  variables: string[]
}) {
  useUiLanguage()
  const [choice, setChoice] = useState<'simple' | 'branded' | null>(null)
  const arabic = locale === 'ar-MA'
  const content = textToEmailHtml(
    arabic
      ? 'مرحباً {{clientName}}،\nيرجى الاطلاع على تفاصيل مستندكم أدناه.\nشكراً لثقتكم.'
      : 'Bonjour {{clientName}},\nVeuillez trouver les informations de votre document ci-dessous.\nMerci pour votre confiance.',
  )
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{translate('Starting design')}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setChoice('simple')}>
          {translate('Simple')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setChoice('branded')}>
          {translate('Branded')}
        </Button>
      </div>
      <Dialog
        open={choice !== null}
        onOpenChange={(open) => {
          if (!open) setChoice(null)
        }}
      >
        <DialogContent>
          <DialogTitle>{translate('Replace email content?')}</DialogTitle>
          <DialogDescription>
            {translate(
              'This replaces your unsaved body with a starting design. Subject, sender and timing are kept. Nothing is saved until you confirm the form.',
            )}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setChoice(null)}>
              {translate('Cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                const labels: Record<string, [string, string]> = {
                  documentNumber: ['Document', 'المستند'],
                  paymentNumber: ['Paiement', 'الدفع'],
                  issueDate: ['Date', 'التاريخ'],
                  dueDate: ['Échéance', 'تاريخ الاستحقاق'],
                  validUntil: ['Validité', 'صالح حتى'],
                  total: ['Total', 'المجموع'],
                  amount: ['Montant reçu', 'المبلغ المستلم'],
                  outstanding: ['Solde restant', 'الرصيد المتبقي'],
                  currency: ['Devise', 'العملة'],
                }
                const rows = variables
                  .filter((v) => v !== 'clientName')
                  .map(
                    (v) => `<tr><td>${labels[v]?.[arabic ? 1 : 0] ?? v}</td><td>{{${v}}}</td></tr>`,
                  )
                  .join('')
                onApply(
                  choice === 'simple'
                    ? content
                    : `<div dir="${arabic ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:600px;padding:24px"><h2><span style="color:#a77718">Slama Finance</span></h2>${content}<table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table><hr><p><span style="font-size:12px;color:#666666">Slama Finance</span></p></div>`,
                )
                setChoice(null)
              }}
            >
              {translate('Use design')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
