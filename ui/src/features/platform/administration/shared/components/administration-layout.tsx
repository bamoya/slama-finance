import { useQueryClient } from '@tanstack/react-query'
import { LogOut, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'

import {
  useAdminLogout,
  useGetAdminSession,
} from '../../../../../api/generated/administration/administration'
import { PortalShell } from '../../../../../components/layout/portal-shell'
import { DropdownMenuItem, DropdownMenuLabel } from '../../../../../components/ui/dropdown-menu'
import { ApiError } from '../../../../../lib/api-error'
import { translate } from '../../../../../lib/i18n'
import { adminPaths } from '../admin-paths'
import { administrationNavigation } from '../administration-navigation'
import { isAdminKey, useSignedOutOnUnauthorized } from '../hooks/use-signed-out-on-unauthorized'

/** Dedicated platform-administrator shell: no links into owner or organization areas. */
export function AdministrationLayout({ children, title }: { children: ReactNode; title: string }) {
  const client = useQueryClient()
  const [, navigate] = useLocation()
  const session = useGetAdminSession({ query: { retry: false, staleTime: 30_000 } })
  const logout = useAdminLogout()
  const signedOut = session.error instanceof ApiError && session.error.status === 401
  const leave = () => {
    client.removeQueries({ predicate: (query) => isAdminKey(query.queryKey) })
    navigate(adminPaths.login, { replace: true })
  }
  useSignedOutOnUnauthorized(leave)
  return (
    <PortalShell
      className="admin-portal"
      homeHref={adminPaths.overview}
      portalLabel="Administration"
      badge={{ label: 'Administration', icon: ShieldCheck }}
      navigation={administrationNavigation}
      navigationLabel={translate('Administration navigation')}
      mobileNavigationLabel={translate('Administration mobile navigation')}
      currentLabel={title}
      titleSuffix={translate('Administration')}
      accountLabel={translate('Administrator account menu')}
      accountInitial={session.data?.admin.name}
      accountMenu={
        <>
          {session.data && (
            <DropdownMenuLabel className="px-2 py-1.5 text-xs text-[var(--muted)]">
              {session.data.admin.email}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem
            disabled={logout.isPending}
            onSelect={() => {
              void logout.mutateAsync().then(leave, () => {})
            }}
          >
            <LogOut />
            {translate('Log out')}
          </DropdownMenuItem>
        </>
      }
      guard={{
        signedOutRedirect: signedOut ? adminPaths.login : null,
        isPending: session.isPending,
        error: signedOut ? null : (session.error ?? logout.error),
      }}
      ready={Boolean(session.data)}
    >
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{translate(title)}</h1>
        {children}
      </div>
    </PortalShell>
  )
}
