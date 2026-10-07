import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, UserRound } from 'lucide-react'
import { Link } from 'wouter'

import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useLogout } from '../hooks/use-logout'
import { useSession } from '../hooks/use-session'

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:ring-1 data-[highlighted]:ring-inset data-[highlighted]:ring-[var(--accent)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50'

export function AccountMenu({ isDark }: { isDark: boolean }) {
  useUiLanguage()

  const user = useSession().data?.user
  const logout = useLogout()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="brand" size="icon-md" shape="round" aria-label={translate('Account menu')}>
          {user?.firstName?.[0]?.toUpperCase() ?? user?.email[0]?.toUpperCase()}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className={`${isDark ? 'is-dark' : ''} z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)] shadow-lg`}
        >
          <DropdownMenu.Label className="truncate px-3 py-2 text-xs text-[var(--muted)]">
            {user?.email}
          </DropdownMenu.Label>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/profile">
              <UserRound size={16} aria-hidden="true" />
              {translate('Profile')}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-2 h-px bg-[var(--border)]" />
          <DropdownMenu.Item
            className={itemClass}
            disabled={logout.isPending}
            onSelect={(event) => {
              event.preventDefault()
              logout.mutate()
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {logout.isPending ? translate('Logging out…') : translate('Log out')}
          </DropdownMenu.Item>
          {logout.isError && (
            <div className="px-3 py-2">
              <FormError error={logout.error} />
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
