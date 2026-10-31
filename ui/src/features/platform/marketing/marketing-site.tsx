import './styles/marketing.css'

import { useEffect } from 'react'
import { Route, Switch, useLocation } from 'wouter'

import { PublicSiteLayout } from './components/public-site-layout'
import { useMarketing } from './hooks/marketing-context'
import { usePageMotion } from './hooks/use-page-motion'
import { Contact } from './pages/contact'
import { Features } from './pages/features'
import { Home } from './pages/home'
import { Legal } from './pages/legal'
import { Pricing } from './pages/pricing'

function MarketingLayout() {
  const [path] = useLocation()
  const { t, locale } = useMarketing()
  usePageMotion(path)
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': t('Your estimates, invoices and payments, finally together'),
      '/fonctionnalites': t('Features'),
      '/tarifs': t('Pricing'),
      '/contact': t('Contact & demo'),
      '/confidentialite': t('Privacy'),
      '/conditions': t('Terms of service'),
      '/mentions-legales': t('Legal notice'),
    }
    document.title = `${titles[path] || 'B-Finance'} — B-Finance`
  }, [path, locale, t])
  useEffect(() => {
    if (window.location.hash) {
      const frame = requestAnimationFrame(() =>
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView(),
      )
      return () => cancelAnimationFrame(frame)
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.getElementById('marketing-content')?.focus({ preventScroll: true })
  }, [path])
  return (
    <>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/fonctionnalites" component={Features} />
        <Route path="/tarifs" component={Pricing} />
        <Route path="/contact" component={Contact} />
        <Route path="/confidentialite">{() => <Legal type="privacy" />}</Route>
        <Route path="/conditions">{() => <Legal type="terms" />}</Route>
        <Route path="/mentions-legales">{() => <Legal type="notice" />}</Route>
      </Switch>
    </>
  )
}
export function MarketingSite() {
  return (
    <PublicSiteLayout>
      <MarketingLayout />
    </PublicSiteLayout>
  )
}
