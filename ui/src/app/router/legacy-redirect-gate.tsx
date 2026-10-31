import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { getPublicOrganizationAddress } from '../../api/generated/identity/identity'
import type { PlatformSite } from '../../lib/platform-sites'
import { NotFoundPage } from '../pages/not-found-page'
import { joinOrigin, resolveLegacyRedirect } from './legacy-redirects'

/** Sends old path-based addresses (/organizations/<id>/…, /admin/…, /owner/…) to their site. */
export function LegacyRedirectGate({
  site,
  children,
}: {
  site: PlatformSite
  children: ReactNode
}) {
  const target = useMemo(() => resolveLegacyRedirect(site, window.location.pathname), [site])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!target) return
    const suffix = window.location.search + window.location.hash
    if (target.kind === 'origin') {
      window.location.replace(`${target.url}${suffix}`)
      return
    }
    let active = true
    getPublicOrganizationAddress(target.organizationId)
      .then(({ url }) => {
        if (active) window.location.replace(joinOrigin(url, target.rest, suffix))
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [target])
  if (!target) return children
  return failed ? <NotFoundPage /> : null
}
