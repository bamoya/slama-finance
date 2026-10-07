import '../../../../lib/notifications-i18n'

import { useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type SendDocumentInput,
  SendDocumentInputSchema,
} from '../../../../api/generated/schemas/sales/notifications.schemas'
import { FormError } from '../../../../components/management/form-error'
import { RequestState } from '../../../../components/management/request-state'
import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../../../components/ui/dialog'
import { useUiLanguage } from '../../../../lib/i18n'
import { useClientNotificationPreferences } from '../../../clients'
import { useAuthorization } from '../../../identity'
import { refreshSales } from '../../refresh'
import { refreshDocumentNotifications, useSendDocumentActions } from '../queries'

export function SendDocumentDialog({
  documentType,
  id,
  clientId,
  version,
}: {
  documentType: 'invoice' | 'estimate'
  id: string
  clientId: string
  version: number
}) {
  useUiLanguage()

  const { t } = useTranslation('notifications'),
    cache = useQueryClient(),
    actions = useSendDocumentActions(),
    { can } = useAuthorization()
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [queued, setQueued] = useState('')
  const request = useRef<SendDocumentInput>()
  const canPreview = can('clients.read') && can('client_notification_preferences.read')
  const query = useClientNotificationPreferences(clientId, open && canPreview)
  const preference = query.data?.items.find((row) => row.eventKey === `${documentType}_sent`)
  const send = async () => {
    if (busy || query.isFetching || !canPreview || !preference?.effectiveEnabled) return
    setBusy(true)
    setError(undefined)
    request.current ??= { expectedVersion: version, requestId: crypto.randomUUID() }
    try {
      const data = SendDocumentInputSchema.parse(request.current)
      const result = await actions.send(documentType, id, data)
      setQueued(result.recipient)
      await Promise.all([
        refreshSales(cache),
        refreshDocumentNotifications(cache, documentType, id),
      ])
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Send data-icon="inline-start" />
          {t('send')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t('sendTitle')}</DialogTitle>
        <DialogDescription>{t('sendDescription')}</DialogDescription>
        <div className="mt-4 grid gap-4">
          {!canPreview ? (
            <p role="status" className="text-sm text-destructive">
              {t('loadPreferences')}
            </p>
          ) : query.isPending || query.isError ? (
            <RequestState query={query} />
          ) : preference ? (
            <>
              <p className="break-words text-sm">
                {preference.recipient
                  ? t('recipient', { email: preference.recipient })
                  : t('missingRecipient')}
              </p>
              {preference.cc.length > 0 && (
                <p className="break-words text-sm">
                  {t('cc')}: {preference.cc.join(', ')}
                </p>
              )}
              {preference.reason && (
                <p role="status" className="text-sm text-destructive">
                  {t(`reasons.${preference.reason}`)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('serverEligibility')}</p>
          )}
          <p className="text-xs text-muted-foreground">{t('deliveryHint')}</p>
          {queued && (
            <div className="grid gap-2">
              <p role="status">
                {t('preparing')} {t('recipient', { email: queued })}
              </p>
              <p className="text-xs text-muted-foreground">{t('newSendHint')}</p>
              <Button
                variant="outline"
                disabled={busy || !canPreview}
                onClick={() => {
                  if (!canPreview) return
                  request.current = undefined
                  setQueued('')
                  setError(undefined)
                  void query.refetch()
                }}
              >
                {t('newSend')}
              </Button>
            </div>
          )}
          <FormError error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={
                busy ||
                !canPreview ||
                !!queued ||
                (canPreview && (query.isFetching || query.isPending || query.isError)) ||
                !preference?.effectiveEnabled
              }
              onClick={() => void send()}
            >
              <Send data-icon="inline-start" />
              {t('send')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
