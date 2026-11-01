import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { useForbiddenAction } from './forbidden-action-context'

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
/** Access-denied page: the route exists but the role does not allow it. The API stays authoritative. */
export function ForbiddenState() {
  useUiLanguage()

  const action = useForbiddenAction()
  return (
    <div className="mt-6 max-sm:px-4">
      <section
        role="alert"
        className="mx-auto max-w-[36rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--text)]"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--surface-hover)] text-[var(--muted)]">
          <Lock aria-hidden="true" size={22} />
        </span>
        <h2 className="mt-4 text-xl font-semibold">{translate('Restricted access')}</h2>
        <p className="mt-2 text-[var(--muted)]">
          {translate(
            'Your role does not allow you to open this page. Ask an administrator of your organization for access.',
          )}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </section>
    </div>
  )
}
