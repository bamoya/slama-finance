import '../styles/marketing.css'

import { type ReactNode, useEffect } from 'react'

import { useMarketing } from '../hooks/marketing-context'
import { Footer, Header } from './layout'
import { MarketingProvider } from './marketing-provider'

function PublicShell({ children }: { children: ReactNode }) {
  const { dark, t } = useMarketing()
  useEffect(() => {
    const elements = [document.documentElement, document.body]
    elements.forEach((element) => element.classList.add('marketing-document'))
    return () => elements.forEach((element) => element.classList.remove('marketing-document'))
  }, [])
  return (
    <div className={`marketing-site${dark ? ' is-dark' : ''}`}>
      <a className="skip-link" href="#marketing-content">
        {t('Skip to content')}
      </a>
      <Header />
      <main id="marketing-content" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  )
}

/** Public website shell, composed with owner identity routes at the application boundary. */
export function PublicSiteLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingProvider>
      <PublicShell>{children}</PublicShell>
    </MarketingProvider>
  )
}
