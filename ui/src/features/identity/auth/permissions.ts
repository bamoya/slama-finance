/** Explicit resource grants govern routes; section grants govern report content. */
export function routePermission(path: string): string | undefined {
  if (path === '/dashboard') return 'reports.read'
  if (path.startsWith('/reports/schedules')) return 'reports.read'
  if (path.startsWith('/reports/runs')) return 'reports.read'
  if (path.startsWith('/reports')) return 'reports.read'
  if (path.startsWith('/settings/notifications')) return 'notification_rules.read'
  if (path.startsWith('/invoices')) return 'invoices.read'
  if (path.startsWith('/estimates')) return 'estimates.read'
  if (path.startsWith('/delivery-notes')) return 'delivery_notes.read'
  if (path.startsWith('/payments')) return 'payments.read'
  if (path.startsWith('/clients')) return 'clients.read'
  if (path.startsWith('/products/categories')) return 'categories.read'
  if (path.startsWith('/products')) return 'products.read'
  if (path.startsWith('/settings/company')) return 'company_settings.read'
  if (path.startsWith('/settings/bank-accounts')) return 'bank_accounts.read'
  if (path.startsWith('/settings/invoice-appearance')) return 'templates.read'
  if (path.startsWith('/settings/staff'))
    return path.endsWith('/new')
      ? 'staff.create'
      : path.endsWith('/edit')
        ? 'staff.update'
        : 'staff.read'
  if (path.startsWith('/settings/roles'))
    return path.endsWith('/new') ? 'roles.create' : 'roles.read'
}
export function hasPermission(keys: readonly string[], permission?: string) {
  return !permission || keys.includes(permission)
}
export function canAccessRoute(keys: readonly string[], path: string) {
  return routePermissions(path).every((permission) => hasPermission(keys, permission))
}
export function routePermissions(path: string): string[] {
  const primary = routePermission(path)
  const required = primary ? [primary] : []
  if (path.startsWith('/reports/schedules') || path.startsWith('/reports/runs'))
    required.push('reports.read')
  if (path === '/reports/schedules/new') required.push('reports.read')
  if (/^\/reports\/schedules\/[^/]+\/edit$/.test(path)) required.push('reports.read')
  if (/^\/reports\/schedules\/[^/]+\/runs$/.test(path)) required.push('reports.read')
  for (const [route, resource] of [
    ['invoices', 'invoices'],
    ['estimates', 'estimates'],
    ['delivery-notes', 'delivery_notes'],
    ['payments', 'payments'],
  ]) {
    if (path === `/${route}/new`) required.push(`${resource}.create`)
    if (new RegExp(`^/${route}/[^/]+/edit$`).test(path)) required.push(`${resource}.update`)
  }
  if (/^\/(estimates|delivery-notes)\/[^/]+\/convert$/.test(path)) required.push('invoices.create')
  if (path === '/payments/new') required.push('invoices.read')
  if (path === '/clients/new') required.push('clients.create')
  if (/^\/clients\/[^/]+\/edit$/.test(path)) required.push('clients.update')
  if (path === '/products/new') required.push('products.create')
  if (/^\/products\/[^/]+\/edit$/.test(path)) required.push('products.update')
  if (path === '/products/categories/new') required.push('categories.create')
  if (/^\/products\/categories\/[^/]+\/edit$/.test(path)) required.push('categories.update')
  if (path === '/settings/company/edit') required.push('company_settings.update')
  if (/^\/settings\/notifications\/[^/]+\/edit$/.test(path))
    required.push('notification_rules.update')
  if (path.startsWith('/settings/bank-accounts/') && /\/(new|edit)$/.test(path))
    required.push(path.endsWith('/new') ? 'bank_accounts.create' : 'bank_accounts.update')
  if (path.startsWith('/settings/invoice-appearance/') && /\/(new|edit)$/.test(path))
    required.push(path.endsWith('/new') ? 'templates.create' : 'templates.update')
  if (path.startsWith('/settings/staff/') && /\/(new|edit)$/.test(path)) required.push('staff.read')
  if (path === '/settings/roles/new') required.push('roles.read')
  return required
}
