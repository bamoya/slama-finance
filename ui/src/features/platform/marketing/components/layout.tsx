import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Globe,
  Menu as MenuIcon,
  Moon,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'

import { PlatformBrand } from '../../../../components/branding/platform-brand'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { useMarketing } from '../hooks/marketing-context'
import { Button, Eyebrow, IconButton, RouteButton, TrialButton } from './ui'
export function Brand() {
  return (
    <Link href="/" className="brand-link" aria-label="B-Finance">
      <PlatformBrand />
      <span className="brand-by">by BaMoYa</span>
    </Link>
  )
}
export function Header() {
  const { t, dark, setDark, locale, setLocale } = useMarketing()
  const [location] = useLocation()
  const [open, setOpen] = useState(false)
  const [floating, setFloating] = useState(false)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      // Hysteresis keeps the header steady near the scroll threshold.
      setFloating((current) => window.scrollY > (current ? 24 : 64))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  useEffect(() => setOpen(false), [location])
  const nav: [string, string][] = [
    ['/fonctionnalites', t('Features')],
    ['/tarifs', t('Pricing')],
    ['/contact', t('Contact')],
  ]
  return (
    <div className="site-header-shell">
      <header
        className={`site-header${floating ? ' is-floating' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            document.querySelector<HTMLButtonElement>('.mobile-menu-button')?.focus()
          }
        }}
      >
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label={t('Main navigation')}>
            {nav.map(([href, label]) => (
              <Link key={href} href={href} aria-current={location === href ? 'page' : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <IconButton
              label={dark ? t('Use light theme') : t('Use dark theme')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('Switch to French')}
              onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            >
              <Globe size={15} />
              {locale.toUpperCase()}
            </Button>
            <RouteButton className="desktop-login" variant="ghost" href={ownerAuthPaths.login}>
              {t('Sign in')}
            </RouteButton>
            <TrialButton className="header-trial" />
            <IconButton
              label={open ? t('Close menu') : t('Open menu')}
              className="mobile-menu-button"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <MenuIcon size={20} />}
            </IconButton>
          </div>
        </div>
        {open && (
          <nav id="mobile-menu" className="mobile-menu" aria-label={t('Mobile navigation')}>
            {nav.map(([href, label]) => (
              <Link
                href={href}
                key={href}
                onClick={() => setOpen(false)}
                aria-current={location === href ? 'page' : undefined}
              >
                {label}
                <ChevronRight size={16} />
              </Link>
            ))}
            <RouteButton variant="outline" href={ownerAuthPaths.login}>
              {t('Sign in')}
            </RouteButton>
            <TrialButton />
          </nav>
        )}
      </header>
    </div>
  )
}
export function Footer() {
  const { t } = useMarketing()
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Brand />
            <p>
              {t('Less paperwork.')}
              <br />
              {t('More clarity for your business.')}
            </p>
            <span className="footer-made">{t('Built for businesses in Morocco.')}</span>
          </div>
          <div>
            <h3>{t('Product')}</h3>
            <Link href="/fonctionnalites">{t('Features')}</Link>
            <Link href="/tarifs">{t('Pricing')}</Link>
            <Link href="/contact?tab=demo">{t('Request a demo')}</Link>
          </div>
          <div>
            <h3>{t('Need a hand?')}</h3>
            <Link href="/contact">{t('Contact us')}</Link>
            <Link href="/contact?tab=demo">{t('Take a guided tour')}</Link>
            <a href="/owner">
              {t('My account')}
              <ArrowUpRight size={12} />
            </a>
          </div>
          <div>
            <h3>{t('Information')}</h3>
            <Link href="/confidentialite">{t('Privacy')}</Link>
            <Link href="/conditions">{t('Terms of service')}</Link>
            <Link href="/mentions-legales">{t('Legal notice')}</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 B-Finance. {t('A BaMoYa product.')}</span>
          <span className="prototype-mark">
            <i />
            {t('Built for businesses in Morocco.')}
          </span>
          <span>FR / EN · MAD</span>
        </div>
      </div>
    </footer>
  )
}
export function FinalCTA() {
  const { t } = useMarketing()
  return (
    <section className="container final-cta">
      <div>
        <Eyebrow>{t('YOUR NEXT STEP')}</Eyebrow>
        <h2>{t('Make room for your business.')}</h2>
        <p>{t('Start simply. Your first estimate is waiting.')}</p>
      </div>
      <div className="cta-side">
        <TrialButton>{t('Try free for 7 days')}</TrialButton>
        <span>
          <Check size={13} />
          {t('No payment required · No automatic charge')}
        </span>
      </div>
    </section>
  )
}
