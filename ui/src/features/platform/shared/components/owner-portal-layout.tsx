import '../styles/owner-portal.css'

import {
  Building2,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'

import { useGetOwnerSession } from '../../../../api/generated/identity/identity'
import { PortalShell } from '../../../../components/layout/portal-shell'
import { DropdownMenuItem } from '../../../../components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../../../../components/ui/sidebar'
import { translate } from '../../../../lib/i18n'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { OwnerAccountContext } from '../../identity/hooks/use-owner-account'
import { useOwnerLogout } from '../hooks/use-owner-logout'

const navigation = [
  { href: '/owner', label: 'Overview', icon: LayoutDashboard },
  { href: '/owner/organizations', label: 'Organizations', icon: Building2 },
  { href: '/owner/subscription', label: 'Subscription', icon: CreditCard },
]

export function OwnerPortalLayout({
  children,
  onboarding = false,
}: {
  children: ReactNode
  onboarding?: boolean
}) {
  const [pathname] = useLocation()
  const session = useGetOwnerSession({ query: { retry: false, staleTime: 30_000 } })
  const logout = useOwnerLogout()
  const current =
    navigation.find((item) => item.href !== '/owner' && pathname.startsWith(item.href)) ??
    (pathname === '/owner/account' ? { label: 'Owner account' } : navigation[0]!)
  return (
    <PortalShell
      className={`owner-portal ${onboarding ? 'owner-onboarding-active' : ''}`}
      homeHref="/owner"
      portalLabel="Owner portal"
      navigation={navigation}
      navigationLabel={translate('Owner navigation')}
      mobileNavigationLabel={translate('Owner mobile navigation')}
      currentLabel={current.label}
      titleSuffix="B-Finance"
      sidebarFooter={
        <>
          <div className="portal-sidebar-context">
            <ShieldCheck size={17} />
            <span>{translate('One account. Independent organizations.')}</span>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={translate('Help')}>
                <Link href="/contact" aria-label={translate('Help')}>
                  <CircleHelp />
                  <span className="group-data-[collapsible=icon]:hidden">{translate('Help')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </>
      }
      accountLabel={translate('Owner account menu')}
      accountInitial={session.data?.owner.firstName ?? undefined}
      accountMenu={
        <>
          <DropdownMenuItem asChild>
            <Link href="/owner/account">
              <UserRound />
              {translate('Owner account')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={logout.isPending}
            onSelect={() => {
              void logout.logout().catch(() => {})
            }}
          >
            <LogOut />
            {translate('Log out')}
          </DropdownMenuItem>
        </>
      }
      guard={{
        signedOutRedirect: session.error?.status === 401 ? ownerAuthPaths.login : null,
        isPending: session.isPending,
        error: session.error ?? logout.error,
      }}
      ready={Boolean(session.data)}
    >
      {session.data && (
        <OwnerAccountContext.Provider value={session.data.owner}>
          {children}
        </OwnerAccountContext.Provider>
      )}
    </PortalShell>
  )
}
