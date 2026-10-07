import { Link } from 'wouter'

import { translate, useUiLanguage } from '../../lib/i18n'

export function NotFoundPage() {
  useUiLanguage()

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--app-bg)] p-6 text-center text-[var(--text)]">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.16em] text-[var(--accent)]">404</p>
        <h1 className="mt-3 text-4xl font-bold text-[var(--text)]">
          {translate('Page not found')}
        </h1>
        <Link href="/dashboard" className="mt-6 inline-block font-semibold text-[var(--accent)]">
          {translate('Back to dashboard')}
        </Link>
      </div>
    </main>
  )
}
