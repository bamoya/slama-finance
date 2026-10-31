import { SessionEvents } from '../../features/organization/identity'
import { organizationRoutes } from '../router/organization-routes'

export default function OrganizationSite() {
  return (
    <>
      <SessionEvents />
      {organizationRoutes}
    </>
  )
}
