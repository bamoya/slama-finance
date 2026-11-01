import { ChevronRight } from 'lucide-react'
import { type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'

import { AccountMenu, useAuthorization } from '../../features/organization/identity'
import { translate, useUiLanguage } from '../../lib/i18n'
import { useTheme } from '../../lib/use-theme'
import { ForbiddenActionContext } from '../management/forbidden-action-context'
import { PageActionsProvider } from '../management/page-actions-context'
import { buttonVariants } from '../ui/button'
import { LanguageSwitcher } from '../ui/language-switcher'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui/sidebar'
import { ThemeToggle } from '../ui/theme-toggle'
import { AppSidebar } from './app-sidebar'
import { MobileNavigation } from './mobile-navigation'
import { navigationGroups, navigationTitle } from './navigation'

export function AppShell({ children }: { children: ReactNode }) {
  useUiLanguage()

  const { isDark, toggleTheme } = useTheme()
  const [pathname] = useLocation()
  const { canRoute } = useAuthorization()
  const landing = navigationGroups.flatMap((group) => group.items).find((item) => canRoute(item.to))
  const deniedAction = (
    <Link
      href={landing?.to ?? '/profile'}
      className={buttonVariants({ variant: 'outline', size: 'md' })}
    >
      {landing?.to === '/dashboard'
        ? translate('Back to dashboard')
        : landing
          ? translate('Open {{page}}', { page: translate(landing.label) })
          : translate('Open my profile')}
    </Link>
  )
  const defaultOpen = !document.cookie.split('; ').includes('sidebar_state=false')
  return (
    <div className={`app-canvas ${isDark ? 'is-dark' : ''}`}>
      <SidebarProvider
        defaultOpen={defaultOpen}
        style={
          {
            '--sidebar-width': 'var(--ui-sidebar-width)',
            '--sidebar-width-icon': '4rem',
          } as CSSProperties
        }
      >
        <AppSidebar isDark={isDark} />
        <SidebarInset className="min-w-0 min-h-svh bg-[var(--app-bg)]">
          <header className="topbar">
            <div className="topbar-title min-w-0">
              <SidebarTrigger />
              <span className="hidden text-sm text-[var(--muted)] sm:inline">
                {translate('Finance')}
              </span>
              <ChevronRight className="hidden text-[var(--muted)] sm:block" size={16} />
              <h1 className="truncate">{translate(navigationTitle(pathname))}</h1>
            </div>
            <div className="topbar-actions">
              <LanguageSwitcher />
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
              <AccountMenu isDark={isDark} />
            </div>
          </header>
          <div className="app-page">
            <ForbiddenActionContext.Provider value={deniedAction}>
              <PageActionsProvider key={pathname}>{children}</PageActionsProvider>
            </ForbiddenActionContext.Provider>
          </div>
        </SidebarInset>
        <MobileNavigation />
      </SidebarProvider>
    </div>
  )
}
