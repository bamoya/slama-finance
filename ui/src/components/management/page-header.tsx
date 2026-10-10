import './actions-i18n'

import { ArrowLeft, PanelTop } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'wouter'

import { translate, useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { buttonVariants } from '../ui/button'
import { usePageActions } from './use-page-actions'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  status,
  backHref,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  status?: ReactNode
  backHref?: string
}) {
  useUiLanguage()

  const { t } = useTranslation('pageActions')
  const pageActions = usePageActions()
  const [pathname] = useLocation()
  const parent = pathname.slice(0, pathname.lastIndexOf('/'))
  const back = backHref ?? (!parent || parent === '/settings' ? '/dashboard' : parent)
  return (
    <header
      data-slot="page-header"
      className="page-header flex flex-col gap-3 rounded-panel border border-border bg-[var(--surface)] p-4 md:p-5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2 lg:basis-80 lg:gap-4">
        <Link
          href={back}
          aria-label={t('back')}
          className={cn(buttonVariants({ variant: 'outline', size: 'icon-lg' }), 'lg:hidden')}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <span
          data-slot="page-icon"
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] lg:size-12 lg:rounded-[14px]"
        >
          <PanelTop className="size-4 lg:size-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {eyebrow && (
            <div
              data-slot="page-breadcrumbs"
              className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-[var(--muted)] lg:mb-2 lg:gap-2 lg:text-xs"
            >
              <span>{translate('Slama Finance')}</span>
              <span className="text-[var(--border)]">/</span>
              <span className="text-[var(--accent)]">{eyebrow}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="break-words text-2xl font-bold tracking-[-.04em] text-[var(--text)] lg:text-3xl">
              {title}
            </h2>
            {status}
          </div>
          <p
            data-slot="page-description"
            className="mt-2 hidden max-w-2xl text-sm leading-6 text-[var(--muted)] lg:block"
          >
            {description}
          </p>
        </div>
      </div>
      <div className="page-header-actions flex w-full max-w-full flex-wrap items-center justify-end gap-2 lg:ml-auto lg:w-auto">
        {actions && (
          <div
            role="group"
            aria-label={t('actions')}
            className="flex max-w-full flex-wrap items-center justify-end gap-2"
          >
            {actions}
          </div>
        )}
        <div ref={pageActions?.setTarget} data-slot="page-form-actions" className="empty:hidden" />
      </div>
    </header>
  )
}
