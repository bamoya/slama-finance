import '../../../../../components/layout/portal-shell.css'
import '../styles/admin-auth.css'

import { type ReactNode, useEffect } from 'react'

import { PlatformBrand } from '../../../../../components/branding/platform-brand'
import { LanguageSwitcher } from '../../../../../components/ui/language-switcher'
import { ThemeToggle } from '../../../../../components/ui/theme-toggle'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useTheme } from '../../../../../lib/use-theme'

export function SignInLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  useUiLanguage()
  const { isDark, toggleTheme } = useTheme()
  useEffect(() => {
    document.title = 'B-Finance'
  }, [title])
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex,nofollow'
    document.head.append(robots)
    return () => robots.remove()
  }, [])
  useEffect(() => {
    document.documentElement.classList.add('portal-document')
    return () => document.documentElement.classList.remove('portal-document')
  }, [])
  return (
    <div className={`app-canvas portal-shell admin-auth ${isDark ? 'is-dark' : ''}`}>
      <header className="admin-auth-topbar">
        <PlatformBrand />
        <div className="admin-auth-topbar-actions">
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="admin-auth-main">
        <section className="admin-auth-panel" aria-labelledby="admin-auth-title">
          <div className="admin-auth-form-column">
            <div className="admin-auth-heading">
              <h1 id="admin-auth-title">{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {children}
          </div>
          <aside className="admin-auth-context">
            <PlatformBrand />
            <p>{translate('Invoicing and finance, in one place.')}</p>
          </aside>
        </section>
      </main>
    </div>
  )
}
