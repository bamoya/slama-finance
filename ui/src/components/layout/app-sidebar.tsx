import { Link, useLocation } from 'wouter'

import { Can, routePermissions, useAuthorization, useSession } from '../../features/identity'
import { translate, useUiLanguage } from '../../lib/i18n'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '../ui/sidebar'
import { navigationGroups } from './navigation'

export function AppSidebar({ isDark }: { isDark: boolean }) {
  useUiLanguage()

  const [pathname] = useLocation()
  const { setOpenMobile } = useSidebar()
  const { canRoute } = useAuthorization()
  const user = useSession().data?.user
  const activePath = navigationGroups
    .flatMap((group) => group.items)
    .filter((item) => canRoute(item.to))
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(item.to + '/'))?.to
  const closeMobile = () => setOpenMobile(false)
  return (
    <Sidebar collapsible="icon" className={`finance-navigation ${isDark ? 'is-dark' : ''}`}>
      <SidebarHeader className="p-3">
        <div className="flex h-12 items-center gap-3 overflow-hidden px-1">
          <img
            src="/slama-logo.png"
            alt={translate('Slama')}
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="whitespace-nowrap font-semibold group-data-[collapsible=icon]:hidden">
            {translate('Slama Finance')}
          </span>
          <SidebarTrigger className="ml-auto shrink-0 md:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={translate('Main navigation')}>
          {navigationGroups.map(
            (group) =>
              group.items.some((item) => canRoute(item.to)) && (
                <SidebarGroup
                  key={group.label}
                  aria-label={translate(group.label)}
                  className="px-3 py-2"
                >
                  <SidebarGroupLabel>{translate(group.label)}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map(({ label, to, icon: Icon }) => (
                        <Can key={to} permission={routePermissions(to)}>
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={activePath === to}
                              tooltip={translate(label)}
                              className="ui-action h-10 rounded-xl border border-transparent"
                            >
                              <Link
                                href={to}
                                aria-label={translate(label)}
                                aria-current={activePath === to ? 'page' : undefined}
                                onClick={closeMobile}
                              >
                                <Icon aria-hidden="true" />
                                <span>{translate(label)}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </Can>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ),
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip={translate('My profile')}
              isActive={pathname.startsWith('/profile')}
              className="ui-action rounded-xl border border-transparent"
            >
              <Link
                href="/profile"
                aria-label={translate('View my profile')}
                aria-current={pathname.startsWith('/profile') ? 'page' : undefined}
                onClick={closeMobile}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
                  {user?.firstName?.[0] ?? user?.email[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <strong className="block truncate">
                    {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email}
                  </strong>
                  <small className="block truncate text-[var(--sidebar-muted)]">
                    {user?.email}
                  </small>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="ui-action" />
    </Sidebar>
  )
}
