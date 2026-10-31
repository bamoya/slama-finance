import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useTheme } from '../../../../../lib/use-theme'

export function OrganizationUnavailable() {
  useUiLanguage()
  const { isDark } = useTheme()
  return (
    <main
      className={`flex min-h-screen items-center justify-center bg-[var(--surface)] p-6 text-[var(--text)] ${isDark ? 'is-dark' : ''}`}
    >
      <div className="max-w-md text-center">
        <img src="/branding/b-finance-mark.png" alt="" className="mx-auto mb-6 h-14 w-14" />
        <h1 className="text-2xl font-semibold">
          {translate('Organization temporarily unavailable')}
        </h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          {translate(
            'This organization is currently paused. Please contact your organization administrator.',
          )}
        </p>
      </div>
    </main>
  )
}
