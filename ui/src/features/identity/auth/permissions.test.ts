import { describe, expect, it } from 'vitest'

import { canAccessRoute } from './permissions'

describe('sales route permissions', () => {
  it.each([
    ['/invoices', 'invoices'],
    ['/estimates', 'estimates'],
    ['/delivery-notes', 'delivery_notes'],
    ['/payments', 'payments'],
  ])('protects %s list, detail and creation', (path, resource) => {
    expect(canAccessRoute([], path)).toBe(false)
    expect(canAccessRoute([`${resource}.read`], `${path}/record`)).toBe(true)
    expect(canAccessRoute([`${resource}.read`], `${path}/new`)).toBe(false)
    expect(
      canAccessRoute([`${resource}.read`, `${resource}.create`, 'invoices.read'], `${path}/new`),
    ).toBe(true)
  })
  it('requires invoice creation permission for source conversions', () => {
    expect(canAccessRoute(['estimates.read'], '/estimates/source/convert')).toBe(false)
    expect(canAccessRoute(['estimates.read', 'invoices.create'], '/estimates/source/convert')).toBe(
      true,
    )
    expect(canAccessRoute(['delivery_notes.read'], '/delivery-notes/source/convert')).toBe(false)
  })
})
describe('reporting and notification routes', () => {
  it('requires both read and update for notification-rule edit deep links', () => {
    const path = '/settings/notifications/rule/edit'
    expect(canAccessRoute(['notification_rules.read'], '/settings/notifications/rule')).toBe(true)
    expect(canAccessRoute(['notification_rules.read'], path)).toBe(false)
    expect(canAccessRoute(['notification_rules.update'], path)).toBe(false)
    expect(canAccessRoute(['notification_rules.read', 'notification_rules.update'], path)).toBe(
      true,
    )
  })
  it('requires reports read for dashboard and analysis', () => {
    expect(canAccessRoute([], '/dashboard')).toBe(false)
    expect(canAccessRoute(['reports.read'], '/reports')).toBe(true)
  })
  it('uses one reporting grant for every schedule route', () => {
    expect(canAccessRoute(['report_schedules.read'], '/reports/schedules')).toBe(false)
    expect(
      canAccessRoute(['reports.read', 'report_schedules.read'], '/reports/schedules/new'),
    ).toBe(true)
    expect(
      canAccessRoute(
        ['reports.read', 'report_schedules.read', 'report_schedules.create'],
        '/reports/schedules/new',
      ),
    ).toBe(true)
    expect(
      canAccessRoute(['reports.read', 'report_schedules.read'], '/reports/schedules/id/edit'),
    ).toBe(true)
    expect(
      canAccessRoute(['reports.read', 'report_schedules.read'], '/reports/schedules/id/runs'),
    ).toBe(true)
  })
  it('run access and policies have independent grants', () => {
    expect(canAccessRoute(['reports.read'], '/reports/runs/id')).toBe(true)
    expect(canAccessRoute(['reports.read', 'report_runs.read'], '/reports/runs/id')).toBe(true)
    expect(canAccessRoute([], '/settings/notifications')).toBe(false)
    expect(canAccessRoute(['notification_rules.read'], '/settings/notifications')).toBe(true)
  })
})
