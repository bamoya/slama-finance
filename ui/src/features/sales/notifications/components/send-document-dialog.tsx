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
import { Checkbox } from '../../../../components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../../../components/ui/dialog'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
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
  documentType: 'invoice' | 'estimate' | 'delivery_note'
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
  const [confirmedOverride, setConfirmedOverride] = useState(false)
  const request = useRef<SendDocumentInput>()
  const canPreview = can('clients.read') && can('client_notification_preferences.read')
  const query = useClientNotificationPreferences(clientId, open && canPreview)
  const eventKey = documentType === 'delivery_note' ? 'delivery_prepared' : `${documentType}_sent`
  const preference = query.data?.items.find((row) => row.eventKey === eventKey)
  const needsOverride =
    preference?.reason === 'RULE_DISABLED' || preference?.reason === 'CLIENT_OPT_OUT'
  const eligible =
    !!preference?.recipient && (preference.effectiveEnabled || (needsOverride && confirmedOverride))
  const send = async () => {
    if (busy || query.isFetching || !canPreview || !eligible) return
    setBusy(true)
    setError(undefined)
    request.current ??= {
      expectedVersion: version,
      requestId: crypto.randomUUID(),
      ...(needsOverride ? { overridePreferences: true } : {}),
    }
    try {
      const data = SendDocumentInputSchema.parse(request.current)
      const result = await actions.send(documentType, id, data)
      setQueued(result.recipient)
      await Promise.all([
        refreshSales(cache),
        refreshDocumentNotifications(cache, documentType, id),
      ])
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'NOTIFICATION_OVERRIDE_REQUIRED') {
        request.current = undefined
        setConfirmedOverride(false)
        void query.refetch()
      }
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          if (next && !request.current) setConfirmedOverride(false)
          setOpen(next)
        }
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
            <p role="status" className="text-sm text-[var(--error-text)]">
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
              {needsOverride ? (
                <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--accent-soft)] p-3 text-sm">
                  <p>
                    {translate(
                      'Automatic emails are disabled for this client or company. You can still send this one email manually.',
                    )}
                  </p>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={confirmedOverride}
                      onCheckedChange={(checked) => setConfirmedOverride(checked === true)}
                      disabled={busy || !!request.current}
                    />
                    {translate('Send this email anyway')}
                  </label>
                </div>
              ) : (
                preference.reason && (
                  <p role="status" className="text-sm text-[var(--error-text)]">
                    {t(`reasons.${preference.reason}`)}
                  </p>
                )
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
                  setConfirmedOverride(false)
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
                !eligible
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
