import { useWorkspace } from '../../workspace/workspace-state'
import { canAccessRoute, hasPermission } from '../permissions'
import { useSession } from './use-session'

/** Fail closed for missing/expired sessions and restricted onboarding sessions. */
export function useAuthorization() {
  const workspace = useWorkspace()
  const features = workspace?.subscription.entitlements.features
  const session = useSession()
  const available = session.data?.purpose === 'full' && !session.isError
  const keys = available ? (session.data?.permissionKeys ?? []) : []
  const can = (permission: string) => {
    if (features) {
      if (
        permission.startsWith('templates.') &&
        !permission.endsWith('.read') &&
        !features.includes('custom_templates')
      )
        return false
      if (permission.startsWith('roles.') && !features.includes('staff_roles')) return false
      if (
        permission === 'staff.create' &&
        workspace!.subscription.entitlements.staffPerOrganization !== null &&
        workspace!.organization.staffCount >=
          workspace!.subscription.entitlements.staffPerOrganization!
      )
        return false
      if (
        permission.startsWith('notification_dispatches.') &&
        !features.includes('business_emails')
      )
        return false
    }
    return available && hasPermission(keys, permission)
  }
  const canAll = (permissions: readonly string[]) => available && permissions.every(can)
  const canRoute = (path: string) =>
    available &&
    canAccessRoute(keys, path) &&
    (!features ||
      ((!path.startsWith('/report-schedules') || features.includes('scheduled_reports')) &&
        (!path.startsWith('/reports') || features.includes('advanced_analytics'))))
  return { can, canAll, canRoute }
}
