import { Landmark, LayoutDashboard, ScrollText, Users, Wallet } from 'lucide-react'

import type { PortalNavigationItem } from '../../../../components/layout/portal-shell'
import { adminPaths } from './admin-paths'

export const administrationNavigation: PortalNavigationItem[] = [
  { href: adminPaths.overview, label: 'Overview', icon: LayoutDashboard },
  { href: adminPaths.payments, label: 'Payments', icon: Wallet },
  { href: adminPaths.customers, label: 'Customers', icon: Users },
  { href: adminPaths.billing, label: 'Billing settings', icon: Landmark },
  { href: adminPaths.audit, label: 'Audit log', icon: ScrollText },
]
