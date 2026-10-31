import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, LogOut, ScrollText, Settings2, Users } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Link, Redirect, useLocation } from 'wouter'

import {
  getGetAdminSessionQueryKey,
  useAdminLogout,
  useGetAdminSession,
} from '../../../../api/generated/administration/administration'
import { PlatformBrand } from '../../../../components/branding/platform-brand'
import { FormError } from '../../../../components/management/form-error'
import { LoadingState } from '../../../../components/management/page-state'
import { Button } from '../../../../components/ui/button'
import { LanguageSwitcher } from '../../../../components/ui/language-switcher'
import { ThemeToggle } from '../../../../components/ui/theme-toggle'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useTheme } from '../../../../lib/use-theme'
import { adminPaths } from '../admin-paths'

const navigation = [
  { href: adminPaths.payments, label: 'Payments', icon: CreditCard },
  { href: adminPaths.owners, label: 'Customers', icon: Users },
  { href: adminPaths.billing, label: 'Billing settings', icon: Settings2 },
  { href: adminPaths.audit, label: 'Audit log', icon: ScrollText },
]

const isAdminKey = (key: readonly unknown[]) =>
  typeof key[0] === 'string' && key[0].startsWith('/v1/admin')

/** Any 401 from an admin request means the session is gone: clear it and sign out. */
function useSignedOutOnUnauthorized(onSignedOut: () => void) {
  const client = useQueryClient()
  useEffect(() => {
    const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401
    const queries = client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        isAdminKey(event.query.queryKey) &&
        event.query.queryKey[0] !== getGetAdminSessionQueryKey()[0] &&
        isUnauthorized(event.query.state.error)
      )
        onSignedOut()
    })
    const mutations = client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && isUnauthorized(event.mutation.state.error)) onSignedOut()
    })
    return () => {
      queries()
      mutations()
    }
  }, [client, onSignedOut])
}

/** Dedicated platform-administrator shell: no links into owner or organization areas. */
export function AdminLayout({ children, title }: { children: ReactNode; title: string }) {
  useUiLanguage()
  const { isDark, toggleTheme } = useTheme()
  const client = useQueryClient()
  const [pathname, navigate] = useLocation()
  const session = useGetAdminSession({ query: { retry: false, staleTime: 30_000 } })
  const logout = useAdminLogout()
  const signedOut = session.error instanceof ApiError && session.error.status === 401
  const leave = () => {
    client.removeQueries({ predicate: (query) => isAdminKey(query.queryKey) })
    navigate(adminPaths.login, { replace: true })
  }
  useSignedOutOnUnauthorized(leave)
  useEffect(() => {
    document.title = `${translate(title)} — ${translate('Administration')}`
  }, [title])
  if (signedOut) return <Redirect to={adminPaths.login} />
  return (
    <div className={`app-canvas admin-portal min-h-dvh ${isDark ? 'is-dark' : ''}`}>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link
            href={adminPaths.payments}
            aria-label={translate('Administration')}
            className="flex items-center gap-2"
          >
            <PlatformBrand />
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
              {translate('Administration')}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
            <LanguageSwitcher />
            {session.data && (
              <span className="hidden text-sm text-[var(--muted)] sm:inline">
                {session.data.admin.name}
              </span>
            )}
            <Button
              variant="outline"
              disabled={logout.isPending}
              onClick={() => {
                void logout.mutateAsync().then(leave, () => {})
              }}
            >
              <LogOut data-icon="inline-start" />
              {translate('Log out')}
            </Button>
          </div>
          <nav
            aria-label={translate('Administration navigation')}
            className="-mx-1 flex w-full gap-1 overflow-x-auto px-1"
          >
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {translate(label)}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{translate(title)}</h1>
        <FormError error={signedOut ? null : (session.error ?? logout.error)} />
        {session.isPending ? <LoadingState /> : session.data ? children : null}
      </main>
    </div>
  )
}
