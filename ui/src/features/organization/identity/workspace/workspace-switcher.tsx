import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../../../../components/ui/sidebar'
import { useWorkspace } from './workspace-state'

/** Staff sessions are organization-specific. Switching accounts requires a separate login. */
export function WorkspaceSwitcher() {
  const workspace = useWorkspace()
  if (!workspace) return null
  const name = workspace.organization.name
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg" tooltip={name}>
          <div aria-label={name}>
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold group-data-[collapsible=icon]:hidden">
              {name}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
