import './portal-shell.css'

import { ChevronRight, type LucideIcon, UserRound } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { Link, Redirect, useLocation } from 'wouter'

import { translate, useUiLanguage } from '../../lib/i18n'
import { useTheme } from '../../lib/use-theme'
import { PlatformBrand } from '../branding/platform-brand'
import { FormError } from '../management/form-error'
import { PageActionsProvider } from '../management/page-actions-context'
import { LoadingState } from '../management/page-state'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { LanguageSwitcher } from '../ui/language-switcher'
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
} from '../ui/sidebar'
import { ThemeToggle } from '../ui/theme-toggle'

export type PortalNavigationItem = {
  href: string
  /** English source label, translated at render time. */
  label: string
  icon: LucideIcon
}

export type PortalShellProps = {
  /** Extra classes on the root element (page-specific styling hooks). */
  className?: string
  /** Where the brand and the breadcrumb root link to. */
  homeHref: string
  /** English source label of the portal (sidebar group title and breadcrumb root). */
  portalLabel: string
  /** Small pill shown before the breadcrumb, for example "Administration". */
  badge?: { label: string; icon: LucideIcon }
  navigation: PortalNavigationItem[]
  navigationLabel: string
  mobileNavigationLabel: string
  /** Label of the current page, used by the breadcrumb and the document title. */
  currentLabel: string
  titleSuffix: string
  /** Rendered in the sidebar footer, below the navigation. */
  sidebarFooter?: ReactNode
  accountLabel: string
  /** Avatar content; falls back to a user icon. */
  accountInitial?: string
  /** `DropdownMenuItem`s of the account menu. */
  accountMenu: ReactNode
  /** Guard: redirect target when the session is gone, pending flag, and a request error. */
  guard: { signedOutRedirect: string | null; isPending: boolean; error?: Error | null }
  /** Page content, rendered only once the guard has a session. */
  ready: boolean
  children: ReactNode
}

const isActive = (href: string, pathname: string, homeHref: string) =>
  href === homeHref ? pathname === href : pathname.startsWith(href)

/** Sidebar + top bar + mobile bottom navigation shared by the owner and administration portals. */
export function PortalShell({
  className = '',
  homeHref,
  portalLabel,
  badge,
  navigation,
  navigationLabel,
  mobileNavigationLabel,
  currentLabel,
  titleSuffix,
  sidebarFooter,
  accountLabel,
  accountInitial,
  accountMenu,
  guard,
  ready,
  children,
}: PortalShellProps) {
  useUiLanguage()
  const { isDark, toggleTheme } = useTheme()
  const [pathname] = useLocation()
  useEffect(() => {
    document.documentElement.classList.add('portal-document')
    return () => document.documentElement.classList.remove('portal-document')
  }, [])
  useEffect(() => {
    document.title = `${translate(currentLabel)} — ${titleSuffix}`
  }, [currentLabel, titleSuffix])
  if (guard.signedOutRedirect) return <Redirect to={guard.signedOutRedirect} />
  const BadgeIcon = badge?.icon
  return (
    <div className={`app-canvas portal-shell ${className} ${isDark ? 'is-dark' : ''}`}>
      <SidebarProvider
        style={{ '--sidebar-width': '220px', '--sidebar-width-icon': '64px' } as CSSProperties}
      >
        <Sidebar collapsible="icon" className="portal-sidebar">
          <SidebarHeader className="portal-sidebar-header">
            <Link href={homeHref} aria-label="B-Finance" className="portal-sidebar-brand">
              <PlatformBrand className="platform-brand-on-dark" />
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                {translate(portalLabel)}
              </SidebarGroupLabel>
              <nav aria-label={navigationLabel}>
                <SidebarMenu>
                  {navigation.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href, pathname, homeHref)
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
          <SidebarFooter>{sidebarFooter}</SidebarFooter>
          <SidebarRail className="ui-action" />
        </Sidebar>
        <div className="portal-body">
          <header className="portal-topbar">
            <div className="portal-location">
              <SidebarTrigger className="portal-sidebar-trigger" />
              {badge && BadgeIcon && (
                <span className="portal-badge">
                  <BadgeIcon size={13} />
                  {translate(badge.label)}
                </span>
              )}
              {!badge && <Link href={homeHref}>{translate(portalLabel)}</Link>}
              <ChevronRight size={14} />
              <span>{translate(currentLabel)}</span>
            </div>
            <div className="portal-topbar-actions">
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
              <LanguageSwitcher />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={accountLabel} size="icon-md" className="portal-avatar">
                    {accountInitial?.[0]?.toUpperCase() ?? <UserRound />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">{accountMenu}</DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="portal-main">
            <FormError error={guard.error ?? null} />
            {guard.isPending ? (
              <LoadingState />
            ) : ready ? (
              <PageActionsProvider key={pathname}>{children}</PageActionsProvider>
            ) : null}
          </main>
        </div>
        <nav
          className="portal-bottom-nav"
          aria-label={mobileNavigationLabel}
          style={{ '--portal-nav-count': navigation.length } as CSSProperties}
        >
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href, pathname, homeHref) ? 'page' : undefined}
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
