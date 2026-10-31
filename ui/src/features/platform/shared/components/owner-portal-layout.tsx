import '../styles/owner-portal.css'

import {
  Building2,
  ChevronRight,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { Link, Redirect, useLocation } from 'wouter'

import { useGetOwnerSession } from '../../../../api/generated/identity/identity'
import { PlatformBrand } from '../../../../components/branding/platform-brand'
import { FormError } from '../../../../components/management/form-error'
import { PageActionsProvider } from '../../../../components/management/page-actions-context'
import { LoadingState } from '../../../../components/management/page-state'
import { Button } from '../../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import { LanguageSwitcher } from '../../../../components/ui/language-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '../../../../components/ui/sidebar'
import { ThemeToggle } from '../../../../components/ui/theme-toggle'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { useTheme } from '../../../../lib/use-theme'
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
  useUiLanguage()
  const { isDark, toggleTheme } = useTheme()
  const [pathname] = useLocation()
  const session = useGetOwnerSession({ query: { retry: false, staleTime: 30_000 } })
  const logout = useOwnerLogout()
  const current =
    navigation.find((item) => item.href !== '/owner' && pathname.startsWith(item.href)) ??
    (pathname === '/owner/account' ? { label: 'Owner account' } : navigation[0]!)
  useEffect(() => {
    document.documentElement.classList.add('owner-portal-document')
    return () => document.documentElement.classList.remove('owner-portal-document')
  }, [])
  useEffect(() => {
    document.title = `${translate(current.label)} — BaMoYa Finance`
  }, [current.label])
  if (session.error?.status === 401) return <Redirect to={ownerAuthPaths.login} />
  return (
    <div
      className={`app-canvas owner-portal ${onboarding ? 'owner-onboarding-active ' : ''}${isDark ? 'is-dark' : ''}`}
    >
      <SidebarProvider
        style={{ '--sidebar-width': '220px', '--sidebar-width-icon': '64px' } as CSSProperties}
      >
        <Sidebar collapsible="icon" className="owner-sidebar">
          <SidebarHeader className="owner-sidebar-header">
            <Link href="/owner" aria-label="BaMoYa Finance" className="owner-sidebar-brand">
              <PlatformBrand className="platform-brand-on-dark" />
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                {translate('Owner portal')}
              </SidebarGroupLabel>
              <nav aria-label={translate('Owner navigation')}>
                <SidebarMenu>
                  {navigation.map(({ href, label, icon: Icon }) => {
                    const active = href === '/owner' ? pathname === href : pathname.startsWith(href)
                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={translate(label)}>
                          <Link
                            href={href}
                            aria-label={translate(label)}
                            aria-current={active ? 'page' : undefined}
                          >
                            <Icon aria-hidden="true" />
                            <span className="group-data-[collapsible=icon]:hidden">
                              {translate(label)}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="owner-sidebar-context">
              <ShieldCheck size={17} />
              <span>{translate('One account. Independent organizations.')}</span>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={translate('Help')}>
                  <Link href="/contact" aria-label={translate('Help')}>
                    <CircleHelp />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {translate('Help')}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail className="ui-action" />
        </Sidebar>
        <div className="owner-portal-body">
          <header className="owner-topbar">
            <div className="owner-location">
              <SidebarTrigger className="owner-sidebar-trigger" />
              <Link href="/owner">{translate('Owner portal')}</Link>
              <ChevronRight size={14} />
              <span>{translate(current.label)}</span>
            </div>
            <div className="owner-topbar-actions">
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
              <LanguageSwitcher />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={translate('Owner account menu')}
                    size="icon-md"
                    className="owner-avatar"
                  >
                    {session.data?.owner.firstName?.[0]?.toUpperCase() ?? <UserRound />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="owner-main">
            <FormError error={session.error ?? logout.error} />
            {session.isPending ? (
              <LoadingState />
            ) : session.data ? (
              <OwnerAccountContext.Provider value={session.data.owner}>
                <PageActionsProvider key={pathname}>{children}</PageActionsProvider>
              </OwnerAccountContext.Provider>
            ) : null}
          </main>
        </div>
        <nav className="owner-bottom-nav" aria-label={translate('Owner mobile navigation')}>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (href === '/owner' ? pathname === href : pathname.startsWith(href))
                  ? 'page'
                  : undefined
              }
            >
              <Icon size={19} />
              <span>{translate(label)}</span>
            </Link>
          ))}
        </nav>
      </SidebarProvider>
    </div>
  )
}
