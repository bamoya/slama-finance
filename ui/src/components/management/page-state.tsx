import type { ReactNode } from 'react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'

type PageStateProps = { title: string; description?: string; action?: ReactNode }
export function EmptyState({ title, description, action }: PageStateProps) {
  useUiLanguage()

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--text)]">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-2 text-[var(--muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}
export function LoadingState({ label = translate('Loading…') }: { label?: string }) {
  useUiLanguage()

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[var(--border)] p-8 text-[var(--text)]"
    >
      {label}
    </div>
  )
}
export function ErrorState({ onRetry, requestId }: { onRetry?: () => void; requestId?: string }) {
  useUiLanguage()

  return (
    <div role="alert">
      <EmptyState
        title={translate('Unable to load this page')}
        description={translate(
          'Please try again. If the problem continues, contact your administrator.',
        )}
        action={onRetry && <Button onClick={onRetry}>{translate('Try again')}</Button>}
      />
      {requestId && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {translate('Reference:')} {requestId}
        </p>
      )}
    </div>
  )
}
export function ForbiddenState() {
  useUiLanguage()

  return (
    <EmptyState
      title={translate('Access denied')}
      description={translate('You do not have permission to view this page.')}
    />
  )
}
