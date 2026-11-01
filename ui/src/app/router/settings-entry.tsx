import { Redirect } from 'wouter'

import { navigationGroups } from '../../components/layout/navigation'
import { ForbiddenState } from '../../components/management/page-state'
import { useAuthorization } from '../../features/organization/identity'

/** `/settings` has no page of its own: open the first settings page the role can use. */
export function SettingsEntry() {
  const { canRoute } = useAuthorization()
  const target = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.to.startsWith('/settings/') && canRoute(item.to))
  return target ? <Redirect to={target.to} replace /> : <ForbiddenState />
}
