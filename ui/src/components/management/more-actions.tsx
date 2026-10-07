import './actions-i18n'

import { Ellipsis } from 'lucide-react'
import {
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'wouter'

import { useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  type MoreActionOptions,
  MoreActionsContext,
  useMoreActionsContext,
} from './more-actions-context'

/** Action controllers stay mounted outside the menu so opening a dialog can close
 * the menu without unmounting that dialog. Only authorized children register. */
export function MoreActions({
  children,
  compact = false,
  label,
}: {
  children: ReactNode
  compact?: boolean
  label?: string
}) {
  useUiLanguage()

  const { t } = useTranslation('pageActions')
  const [, navigate] = useLocation()
  const [entries, setEntries] = useState<Map<string, () => MoreActionOptions>>(() => new Map())
  const trigger = useRef<HTMLButtonElement>(null)
  const register = useCallback((id: string, getOptions: () => MoreActionOptions) => {
    setEntries((current) => new Map(current).set(id, getOptions))
    return () =>
      setEntries((current) => {
        const next = new Map(current)
        next.delete(id)
        return next
      })
  }, [])
  const context = useMemo(
    () => ({ register, restoreFocus: () => trigger.current?.focus() }),
    [register],
  )
  return (
    <MoreActionsContext.Provider value={context}>
      {children}
      {entries.size > 0 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="outline"
              size={compact ? 'icon' : 'default'}
              aria-label={label ?? t('more')}
            >
              <Ellipsis aria-hidden="true" data-icon="inline-start" />
              {!compact && t('more')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              // Dialog autofocus takes priority; normal dismissal returns to More.
              if (document.querySelector('[role="dialog"]')) event.preventDefault()
            }}
          >
            <DropdownMenuGroup>
              {[...entries].map(([id, getOptions]) => {
                const option = getOptions()
                return (
                  <DropdownMenuItem
                    key={id}
                    disabled={option.disabled}
                    variant={option.destructive ? 'destructive' : 'default'}
                    onSelect={() => {
                      const current = getOptions()
                      if (current.disabled) return
                      if (current.href) navigate(current.href)
                      current.onSelect?.()
                    }}
                  >
                    {option.icon && <span aria-hidden="true">{option.icon}</span>}
                    {option.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MoreActionsContext.Provider>
  )
}

export function MoreAction(options: MoreActionOptions) {
  useUiLanguage()

  const context = useMoreActionsContext()
  const id = useId()
  const current = useRef(options)
  useLayoutEffect(() => {
    current.current = options
  })
  useLayoutEffect(
    () => context?.register(id, () => current.current),
    [context, id, options.label, options.disabled, options.destructive, options.href],
  )
  if (!context) throw new Error('MoreAction must be inside MoreActions.')
  return null
}
