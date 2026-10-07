import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  type ClientNotificationPreference,
  ClientNotificationPreferenceInputSchema,
} from '../../../api/generated/schemas/clients/notification-preferences.schemas'
import { ApiError } from '../../../lib/api-error'
import { useAuthorization } from '../../identity'
import {
  refreshClientNotificationPreferences,
  useClientPreferenceActions,
} from '../notification-preferences'

const draft = (row: ClientNotificationPreference) => ({
  enabled: row.overrideEnabled ?? row.globalEnabled,
  cc: row.cc,
  pending: '',
})

export function usePreferenceEditor(
  id: string,
  initial: ClientNotificationPreference[],
  reload: () => Promise<ClientNotificationPreference[]>,
) {
  const { can } = useAuthorization(),
    cache = useQueryClient(),
    actions = useClientPreferenceActions()
  const [rows, setRows] = useState(initial)
  const [custom, setCustom] = useState(initial.some((row) => row.version > 0))
  const [resetOpen, setResetOpen] = useState(false),
    [resetting, setResetting] = useState(false)
  const [error, setError] = useState<unknown>(),
    [conflict, setConflict] = useState(false)
  const [invalid, setInvalid] = useState<number[]>([]),
    [saved, setSaved] = useState(false)
  const [partial, setPartial] = useState(false)
  const hasOverrides = rows.some((row) => row.version > 0)
  const editable = can('client_notification_preferences.update')
  const canReset = can('client_notification_preferences.update')
  const form = useForm({
    defaultValues: { items: initial.map(draft) },
    onSubmit: async ({ value }) => {
      if (!editable || !custom) return
      setError(undefined)
      setSaved(false)
      setPartial(false)
      const results = value.items.map((item, index) =>
        ClientNotificationPreferenceInputSchema.safeParse({
          expectedVersion: rows[index]!.version,
          enabled: item.enabled,
          cc: [
            ...item.cc,
            ...item.pending
              .split(/[,;\n]/)
              .map((email) => email.trim())
              .filter(Boolean),
          ],
        }),
      )
      setInvalid(results.flatMap((result, index) => (result.success ? [] : [index])))
      if (results.some((result) => !result.success)) return
      const next = [...rows]
      let completed = 0
      try {
        for (const [index, result] of results.entries()) {
          if (!result.success) continue
          const row = next[index]!
          if (
            row.version > 0 &&
            row.overrideEnabled === result.data.enabled &&
            JSON.stringify(row.cc) === JSON.stringify(result.data.cc)
          )
            continue
          next[index] = await actions.update(id, row.ruleId, result.data)
          completed++
          setRows([...next]) // Keep successful versions if a later row fails.
        }
        form.reset({ items: next.map(draft) })
        setSaved(true)
      } catch (cause) {
        setError(cause)
        setPartial(completed > 0)
        if (cause instanceof ApiError && cause.status === 409) setConflict(true)
      } finally {
        await refreshClientNotificationPreferences(cache, id)
      }
    },
  })
  const reloadAll = async () => {
    const latest = await reload()
    setRows(latest)
    form.reset({ items: latest.map(draft) })
    setCustom(latest.some((row) => row.version > 0))
    setInvalid([])
    setError(undefined)
    setConflict(false)
    setPartial(false)
    setSaved(false)
  }
  const discard = () => {
    form.reset({ items: rows.map(draft) })
    setInvalid([])
    setError(undefined)
    setSaved(false)
    setCustom(hasOverrides)
  }
  const toggle = (checked: boolean) => {
    setSaved(false)
    if (checked) {
      if (editable) setCustom(true)
      return
    }
    if (hasOverrides || form.state.isDirty) setResetOpen(true)
    else setCustom(false)
  }
  const restore = async () => {
    if (hasOverrides && !canReset) return
    setResetting(true)
    setError(undefined)
    setPartial(false)
    let completed = 0
    try {
      for (const row of rows.filter((row) => row.version > 0)) {
        await actions.reset(id, row.ruleId, row.version)
        completed++
        // Do not retry a successfully deleted override if a later deletion fails.
        setRows((current) =>
          current.map((item) =>
            item.ruleId === row.ruleId
              ? { ...item, version: 0, overrideEnabled: null, cc: [] }
              : item,
          ),
        )
      }
      await reloadAll()
      setCustom(false)
      setResetOpen(false)
    } catch (cause) {
      setError(cause)
      setPartial(completed > 0)
      setResetOpen(false)
      if (cause instanceof ApiError && cause.status === 409) setConflict(true)
    } finally {
      setResetting(false)
      await refreshClientNotificationPreferences(cache, id)
    }
  }
  return {
    form,
    rows,
    custom,
    editable,
    canReset,
    hasOverrides,
    toggle,
    restore,
    discard,
    reloadAll,
    resetOpen,
    setResetOpen,
    resetting,
    invalid,
    error,
    setError,
    conflict,
    setConflict,
    saved,
    partial,
  }
}
