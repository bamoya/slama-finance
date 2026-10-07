import { ChevronRight } from 'lucide-react'
import { type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'wouter'

import { AccountMenu } from '../../features/identity'
import { translate, useUiLanguage } from '../../lib/i18n'
import { useTheme } from '../../lib/use-theme'
import { PageActionsProvider } from '../management/page-actions-context'
import { LanguageSwitcher } from '../ui/language-switcher'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui/sidebar'
import { ThemeToggle } from '../ui/theme-toggle'
import { AppSidebar } from './app-sidebar'
import { MobileNavigation } from './mobile-navigation'
import { navigationTitle } from './navigation'

export function AppShell({ children }: { children: ReactNode }) {
  useUiLanguage()

  const { isDark, toggleTheme } = useTheme()
  const [pathname] = useLocation()
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
            <PageActionsProvider key={pathname}>{children}</PageActionsProvider>
          </div>
        </SidebarInset>
        <MobileNavigation />
      </SidebarProvider>
    </div>
  )
}
