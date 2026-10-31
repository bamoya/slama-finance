import { useEffect } from 'react'

import { useGetPublicSite } from '../../api/generated/identity/identity'
import { SessionEvents } from '../../features/organization/identity'
import { UnknownSitePage } from '../pages/unknown-site-page'
import { joinOrigin } from '../router/legacy-redirects'
import { organizationRoutes } from '../router/organization-routes'

/** Former addresses redirect to the current one; unknown addresses show the generic page. */
export default function OrganizationSite() {
  const site = useGetPublicSite({ query: { retry: false, staleTime: Infinity } })
  const redirectTo = site.data?.redirectTo
  useEffect(() => {
    if (redirectTo)
      window.location.replace(
        joinOrigin(
          redirectTo,
          window.location.pathname,
          window.location.search + window.location.hash,
        ),
      )
  }, [redirectTo])
  if (site.isPending || redirectTo) return null
  if (site.data && !site.data.organization) return <UnknownSitePage />
  return (
    <>
      <SessionEvents />
      {organizationRoutes}
    </>
  )
}
