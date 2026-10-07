import './actions-i18n'

import type { ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { usePageActions } from './use-page-actions'

/** Submit buttons must use the native `form` attribute to retain their form association. */
export function FormActionBar({ className, ...props }: ComponentProps<'div'>) {
  useUiLanguage()

  const { t } = useTranslation('pageActions')
  const destination = usePageActions()
  const actions = (
    <div
      role="group"
      aria-label={t('form')}
      data-slot="form-action-bar"
      className={cn('col-span-full flex flex-wrap items-center justify-end gap-2', className)}
      {...props}
    />
  )
  return destination?.target ? createPortal(actions, destination.target) : actions
}
