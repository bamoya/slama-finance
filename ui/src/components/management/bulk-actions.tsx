import './bulk-i18n'

import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../../lib/api-error'
import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { orderBulkActions } from './bulk-action-order'

export type BulkAction<T> = {
  key: string
  label: string
  destructive?: boolean
  warning?: string
  eligible?: (row: T) => boolean
  run?: (row: T) => Promise<unknown>
  runBatch?: (rows: T[], progress: (done: number) => void) => Promise<Outcome[]>
  resultContent?: ReactNode
  onDismiss?: () => void
  content?: ReactNode
  disabled?: boolean
}
export type Outcome = { name: string; status: 'success' | 'skipped' | 'failed'; reason?: string }

export function BulkActions<T extends { id: string }>({
  selected,
  actions,
  name,
  clear,
  refresh,
}: {
  selected: T[]
  actions: BulkAction<T>[]
  name: (row: T) => string
  clear: () => void
  refresh: () => Promise<unknown>
}) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const [confirmation, setConfirmation] = useState<{ key: string; rows: T[] } | null>(null)
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const [done, setDone] = useState(0)
  const [results, setResults] = useState<Outcome[]>([])
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [completedAction, setCompletedAction] = useState<string | null>(null)
  const action = actions.find((item) => item.key === confirmation?.key)
  async function execute() {
    if (!action || !confirmation || action.disabled || running.current) return
    running.current = true
    setPending(true)
    setDone(0)
    setResults([])
    setRefreshFailed(false)
    let outcomes: Outcome[] = []
    if (action.runBatch) {
      try {
        outcomes = await action.runBatch(confirmation.rows, setDone)
      } catch {
        outcomes = confirmation.rows.map((row) => ({
          name: name(row),
          status: 'failed',
          reason: t('failed'),
        }))
      }
    } else
      for (const row of confirmation.rows) {
        if (action.eligible && !action.eligible(row))
          outcomes.push({ name: name(row), status: 'skipped', reason: t('skipped') })
        else
          try {
            if (!action.run) throw new Error('Missing bulk action handler')
            await action.run(row)
            outcomes.push({ name: name(row), status: 'success' })
          } catch (error) {
            outcomes.push({
              name: name(row),
              status: 'failed',
              reason: error instanceof ApiError ? error.message : t('failed'),
            })
          }
        setDone(outcomes.length)
      }
    setResults(outcomes)
    setCompletedAction(action.key)
    clear()
    try {
      await refresh()
    } catch {
      setRefreshFailed(true)
    }
    setPending(false)
    running.current = false
    setConfirmation(null)
  }
  return (
    <>
      {!!selected.length && !!actions.length && (
        <div
          role="group"
          aria-label={t('selected', { count: selected.length })}
          className="flex flex-wrap items-center gap-2 border-b border-border bg-[var(--surface-muted)] p-4"
        >
          <span className="mr-auto text-sm font-semibold">
            {t('selected', { count: selected.length })}
          </span>
          <Button variant="outline" size="sm" disabled={pending} onClick={clear}>
            {t('clear')}
          </Button>
          {orderBulkActions(actions).map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={item.destructive ? 'destructive' : 'outline'}
              disabled={pending || !selected.some((row) => !item.eligible || item.eligible(row))}
              onClick={() => setConfirmation({ key: item.key, rows: [...selected] })}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      {!!results.length && (
        <div className="border-b border-border p-4 text-sm">
          <p role="status">
            {t('results', {
              success: results.filter((row) => row.status === 'success').length,
              skipped: results.filter((row) => row.status === 'skipped').length,
              failed: results.filter((row) => row.status === 'failed').length,
            })}
          </p>
          <ul className="mt-2 max-h-48 overflow-auto">
            {results
              .filter((row) => row.status !== 'success')
              .map((row, index) => (
                <li key={index} className="break-words">
                  {row.name}: {row.reason}
                </li>
              ))}
          </ul>
          {refreshFailed && <p role="alert">{t('refreshFailed')}</p>}
          {actions.find((item) => item.key === completedAction)?.resultContent}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              actions.find((item) => item.key === completedAction)?.onDismiss?.()
              setResults([])
            }}
          >
            {t('dismiss')}
          </Button>
        </div>
      )}
      <Dialog
        open={!!confirmation && !!action}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null)
        }}
      >
        <DialogContent
          className={cn(
            'flex flex-col gap-4',
            localStorage.getItem('slama-theme') === 'dark' && 'is-dark',
          )}
        >
          <DialogTitle>{action?.label}</DialogTitle>
          <DialogDescription>
            {t('confirmation', { action: action?.label, count: confirmation?.rows.length })}{' '}
            {action?.warning ?? (action?.key === 'delete' ? t('deleteWarning') : '')}
          </DialogDescription>
          <ul className="max-h-40 overflow-auto break-words text-sm">
            {confirmation?.rows.map((row) => (
              <li key={row.id}>{name(row)}</li>
            ))}
          </ul>
          <fieldset disabled={pending}>{action?.content}</fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setConfirmation(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant={action?.destructive ? 'destructive' : 'default'}
              disabled={pending || action?.disabled}
              onClick={() => void execute()}
            >
              {pending ? t('working', { done, total: confirmation?.rows.length }) : t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
