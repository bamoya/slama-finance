import { motion, useReducedMotion } from 'framer-motion'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { ClientNotificationPreference } from '../../../api/generated/schemas/clients/notification-preferences.schemas'
import { ConflictDialog } from '../../../components/management/conflict-dialog'
import { FormError } from '../../../components/management/form-error'
import { StatusBadge } from '../../../components/management/status-badge'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '../../../components/ui/field'
import { InfoHint } from '../../../components/ui/info-hint'
import { Switch } from '../../../components/ui/switch'
import { PreferenceEmailInput } from './preference-email-input'
import { usePreferenceEditor } from './use-preference-editor'

export function PreferenceEditor({
  id,
  initial,
  reload,
}: {
  id: string
  initial: ClientNotificationPreference[]
  reload: () => Promise<ClientNotificationPreference[]>
}) {
  const { t } = useTranslation('notifications'),
    reducedMotion = useReducedMotion(),
    modeId = useId()
  const editor = usePreferenceEditor(id, initial, reload)
  const { form, rows, custom, editable, resetting } = editor
  const recipients = [...new Set(rows.flatMap((row) => (row.recipient ? [row.recipient] : [])))]
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting && !resetting) void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
        {([submitting, dirty]) => {
          const busy = submitting || resetting
          return (
            <div className="grid gap-4">
              <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
                <div className="flex items-center gap-1">
                  <h2 className="text-lg font-semibold">{t('preferences')}</h2>
                  <InfoHint label={t('preferenceHelp')}>{t('preferenceHint')}</InfoHint>
                </div>
                {!!rows.length && (editable || (editor.hasOverrides && editor.canReset)) && (
                  <label
                    htmlFor={modeId}
                    className="flex min-h-control cursor-pointer items-center gap-3 text-sm font-medium"
                  >
                    {t('customizePreferences')}
                    <Switch
                      id={modeId}
                      checked={custom}
                      disabled={busy || (custom && editor.hasOverrides && !editor.canReset)}
                      aria-controls={`${modeId}-fields`}
                      onCheckedChange={editor.toggle}
                    />
                  </label>
                )}
              </header>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{t(custom ? 'customPreferences' : 'companyDefaults')}</span>
                <span className="break-all">
                  {recipients.length
                    ? t('recipient', { email: recipients.join(', ') })
                    : t('missingRecipient')}
                </span>
              </div>
              <FormError error={editor.error} />
              {editor.partial && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t('partialPreferences')}
                </p>
              )}
              {!rows.length && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
              {!custom ? (
                <div className="flex flex-wrap gap-2">
                  {rows.map((row) => (
                    <span
                      key={row.ruleId}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      {t(`events.${row.eventKey}`)}
                      <StatusBadge
                        label={t(row.effectiveEnabled ? 'enabled' : 'disabled')}
                        tone={row.effectiveEnabled ? 'active' : 'archived'}
                      />
                      {row.reason && (
                        <InfoHint label={t('eventHelp', { event: t(`events.${row.eventKey}`) })}>
                          {t(`reasons.${row.reason}`)}
                        </InfoHint>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <motion.div
                  id={`${modeId}-fields`}
                  initial={{ opacity: reducedMotion ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  <form.Field name="items">
                    {(field) => (
                      <FieldGroup className="gap-0">
                        {rows.map((row, index) => {
                          const value = field.state.value[index]!,
                            invalid = editor.invalid.includes(index)
                          const blocked = !row.globalEnabled,
                            emailId = `${modeId}-cc-${index}`
                          const update = (changes: Partial<typeof value>) =>
                            field.handleChange(
                              field.state.value.map((item, position) =>
                                position === index ? { ...item, ...changes } : item,
                              ),
                            )
                          return (
                            <div
                              key={row.ruleId}
                              className="grid items-start gap-3 border-t border-border py-4 lg:grid-cols-[minmax(10rem,1fr)_11rem_minmax(0,1.5fr)] lg:gap-content"
                            >
                              <div className="flex min-h-control items-center gap-1">
                                <h3 className="text-sm font-semibold">
                                  {t(`events.${row.eventKey}`)}
                                </h3>
                                {row.reason && (
                                  <InfoHint
                                    label={t('eventHelp', { event: t(`events.${row.eventKey}`) })}
                                  >
                                    {t(`reasons.${row.reason}`)}
                                  </InfoHint>
                                )}
                              </div>
                              <Field data-disabled={busy || !editable || blocked}>
                                <FieldLabel
                                  className="flex min-h-control items-center"
                                  htmlFor={`${modeId}-enabled-${index}`}
                                >
                                  {t('receiveEmail')}
                                </FieldLabel>
                                <label
                                  className="flex min-h-control items-center gap-2"
                                  htmlFor={`${modeId}-enabled-${index}`}
                                >
                                  <Switch
                                    id={`${modeId}-enabled-${index}`}
                                    aria-label={`${t('receiveEmail')} ${t(`events.${row.eventKey}`)}`}
                                    checked={!blocked && value.enabled}
                                    disabled={busy || !editable || blocked}
                                    onCheckedChange={(enabled) => update({ enabled })}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {t(!blocked && value.enabled ? 'on' : 'off')}
                                  </span>
                                </label>
                              </Field>
                              <Field
                                data-invalid={invalid}
                                data-disabled={busy || !editable || blocked || !value.enabled}
                              >
                                <div className="flex items-center gap-1">
                                  <FieldLabel htmlFor={emailId}>
                                    {t('additionalRecipients')}
                                  </FieldLabel>
                                  <InfoHint label={t('ccHelpLabel')}>{t('ccHelp')}</InfoHint>
                                </div>
                                <PreferenceEmailInput
                                  id={emailId}
                                  emails={value.cc}
                                  pending={value.pending}
                                  invalid={invalid}
                                  disabled={busy || !editable || blocked || !value.enabled}
                                  onChange={(cc, pending) => update({ cc, pending })}
                                />
                                {invalid && (
                                  <FieldError id={`${emailId}-error`}>{t('invalidCc')}</FieldError>
                                )}
                              </Field>
                            </div>
                          )
                        })}
                      </FieldGroup>
                    )}
                  </form.Field>
                  {editable && !!rows.length && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                      {editor.saved && !dirty && (
                        <span role="status" className="mr-auto text-sm text-muted-foreground">
                          {t('preferencesSaved')}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={editor.discard}
                      >
                        {t('discard')}
                      </Button>
                      <Button type="submit" disabled={busy || (editor.saved && !dirty)}>
                        {t('save')}
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
              <Dialog
                open={editor.resetOpen}
                onOpenChange={(open) => {
                  if (!busy) editor.setResetOpen(open)
                }}
              >
                <DialogContent>
                  <DialogTitle className="text-lg font-semibold">
                    {t('restoreDefaults')}
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-sm text-muted-foreground">
                    {t('restoreDefaultsHint')}
                  </DialogDescription>
                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => editor.setResetOpen(false)}
                    >
                      {t('cancel')}
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void editor.restore()}>
                      {t('restoreAction')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <ConflictDialog
                open={editor.conflict}
                onOpenChange={editor.setConflict}
                onReload={() => {
                  void editor.reloadAll().catch(editor.setError)
                }}
              />
            </div>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
