import { Button } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useSession } from '../hooks/use-session'
export function SessionStatus() {
  useUiLanguage()

  const session = useSession()
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-8 text-[var(--text)]">
      <div role="status" className="space-y-4 text-center">
        <p>
          {session.isError
            ? translate('Unable to verify your session. Check your connection and try again.')
            : translate('Checking your session…')}
        </p>
        {session.isError && (
          <Button onClick={() => void session.refetch()}>{translate('Try again')}</Button>
        )}
      </div>
    </main>
  )
}
