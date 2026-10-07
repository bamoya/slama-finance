import { Ellipsis, House, PackageOpen, ReceiptText, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'wouter'

import { useAuthorization } from '../../features/identity'
import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { useIsMobile } from '../../lib/use-mobile'
import { cn } from '../../lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet'
import { navigationGroups } from './navigation'

registerTranslations('mobileNavigation', {
  home: 'Home',
  sales: 'Sales',
  clients: 'Clients',
  catalog: 'Catalog',
  more: 'More',
  navigation: 'Mobile navigation',
  choose: 'Choose a page',
  profile: 'My profile',
  ...Object.fromEntries(
    navigationGroups.flatMap((group) => group.items.map((item) => [item.label, item.label])),
  ),
})

export function MobileNavigation() {
  useUiLanguage()

  const { t } = useTranslation('mobileNavigation')
  const { canRoute } = useAuthorization()
  const mobile = useIsMobile()
  const [pathname] = useLocation()
  const [panel, setPanel] = useState<string | null>(null)
  const groups = [
    {
      key: 'home',
      icon: House,
      items: navigationGroups.find((group) => group.label === 'Overview')!.items,
    },
    {
      key: 'sales',
      icon: ReceiptText,
      items: navigationGroups.find((group) => group.label === 'Sales')!.items,
    },
    {
      key: 'clients',
      icon: UsersRound,
      items: navigationGroups.find((group) => group.label === 'Customers')!.items,
    },
    {
      key: 'catalog',
      icon: PackageOpen,
      items: navigationGroups.find((group) => group.label === 'Catalog')!.items,
    },
    {
      key: 'more',
      icon: Ellipsis,
      items: [
        ...navigationGroups
          .filter((group) => ['Reporting', 'Identity', 'Settings'].includes(group.label))
          .flatMap((group) => group.items),
        { label: 'profile', to: '/profile', icon: UsersRound },
      ],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => canRoute(item.to)) }))
    .filter((group) => group.items.length)
  if (!mobile) return null
  const active = groups.find((group) =>
    group.items.some((item) => pathname === item.to || pathname.startsWith(item.to + '/')),
  )?.key
  const selected = groups.find((group) => group.key === panel)
  return (
    <>
      <nav aria-label={t('navigation')} className="mobile-bottom-navigation">
        {groups.map(({ key, icon: Icon, items }) => {
          const className = cn('mobile-nav-item', active === key && 'mobile-nav-active')
          const content = (
            <>
              <Icon size={20} aria-hidden="true" />
              <span>{t(key)}</span>
            </>
          )
          return items.length === 1 && key !== 'more' && key !== 'sales' && key !== 'catalog' ? (
            <Link
              key={key}
              href={items[0]!.to}
              className={className}
              aria-current={active === key ? 'page' : undefined}
            >
              {content}
            </Link>
          ) : (
            <button
              key={key}
              type="button"
              className={className}
              aria-haspopup="dialog"
              aria-expanded={panel === key}
              onClick={() => setPanel(key)}
            >
              {content}
            </button>
          )
        })}
      </nav>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="mobile-navigation-sheet flex max-h-[80dvh] flex-col gap-4 rounded-t-2xl border-border bg-[var(--surface)] text-[var(--text)]"
        >
          <SheetTitle>{t(panel ?? 'more')}</SheetTitle>
          <SheetDescription>{t('choose')}</SheetDescription>
          <div className="grid min-h-0 gap-2 overflow-y-auto">
            {selected?.items.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                href={to}
                onClick={() => setPanel(null)}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-muted"
                aria-current={pathname === to || pathname.startsWith(to + '/') ? 'page' : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                {t(label)}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
