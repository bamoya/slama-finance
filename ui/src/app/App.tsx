import { lazy, Suspense, useMemo } from 'react'
import { Router } from 'wouter'

import { useUiLanguage } from '../lib/i18n'
import { currentSite } from '../lib/platform-sites'
import { UnknownSitePage } from './pages/unknown-site-page'

// One route tree per site; each is fetched only on its own host.
const PublicSite = lazy(() => import('./sites/public-site'))
const OwnerSite = lazy(() => import('./sites/owner-site'))
const AdminSite = lazy(() => import('./sites/admin-site'))
const OrganizationSite = lazy(() => import('./sites/organization-site'))

export default function App() {
  useUiLanguage()
  const site = useMemo(() => currentSite(), [])
  if (site.kind === 'unknown') return <UnknownSitePage />

  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Suspense fallback={null}>
        {site.kind === 'public' ? (
          <PublicSite />
        ) : site.kind === 'owner' ? (
          <OwnerSite />
        ) : site.kind === 'admin' ? (
          <AdminSite />
        ) : (
          <OrganizationSite />
        )}
      </Suspense>
    </Router>
  )
}
