import { translate, useUiLanguage } from '../../lib/i18n'

/** Shown for hosts that are not part of the platform; it links nowhere and loads no site code. */
export function UnknownSitePage() {
  useUiLanguage()

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--app-bg)] p-6 text-center text-[var(--text)]">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.16em] text-[var(--accent)]">404</p>
        <h1 className="mt-3 text-4xl font-bold">{translate('Address not found')}</h1>
        <p className="mt-4 text-[var(--muted)]">
          {translate('This address does not match any B-Finance site.')}
        </p>
      </div>
    </main>
  )
}
