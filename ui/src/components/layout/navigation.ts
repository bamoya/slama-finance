import {
  Bell,
  Box,
  Building2,
  ChartNoAxesCombined,
  FileText,
  Landmark,
  LayoutDashboard,
  PackageOpen,
  Palette,
  ReceiptText,
  ShieldCheck,
  Truck,
  UsersRound,
  WalletCards,
} from 'lucide-react'

import { translate } from '../../lib/i18n'

type NavigationItem = { label: string; to: string; icon: typeof LayoutDashboard }
export const navigationGroups: { label: string; items: NavigationItem[] }[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', to: '/products', icon: PackageOpen },
      { label: 'Categories', to: '/products/categories', icon: Box },
    ],
  },
  { label: 'Customers', items: [{ label: 'Clients', to: '/clients', icon: UsersRound }] },
  {
    label: 'Sales',
    items: [
      { label: 'Estimates', to: '/estimates', icon: FileText },
      { label: 'Invoices', to: '/invoices', icon: ReceiptText },
      { label: 'Payments', to: '/payments', icon: WalletCards },
      { label: 'Delivery notes', to: '/delivery-notes', icon: Truck },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { label: 'Reports', to: '/reports', icon: ChartNoAxesCombined },
      { label: 'Scheduled reports', to: '/reports/schedules', icon: Bell },
    ],
  },
  {
    label: 'Identity',
    items: [
      { label: 'Staff', to: '/settings/staff', icon: UsersRound },
      { label: 'Roles & permissions', to: '/settings/roles', icon: ShieldCheck },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Company settings', to: '/settings/company', icon: Building2 },
      { label: 'Bank accounts', to: '/settings/bank-accounts', icon: Landmark },
      { label: 'Document templates', to: '/settings/invoice-appearance', icon: Palette },
      { label: 'Notifications', to: '/settings/notifications', icon: Bell },
    ],
  },
]
export function navigationTitle(path: string) {
  if (path === '/profile' || path.startsWith('/profile/')) return translate('My profile')
  return (
    navigationGroups
      .flatMap((group) => group.items)
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => path === item.to || path.startsWith(item.to + '/'))?.label ?? 'Slama Finance'
  )
}
