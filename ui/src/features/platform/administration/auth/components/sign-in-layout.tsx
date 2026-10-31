import '../../../../../components/layout/portal-shell.css'
import '../styles/admin-auth.css'

import { Check } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'

import { PlatformBrand } from '../../../../../components/branding/platform-brand'
import { LanguageSwitcher } from '../../../../../components/ui/language-switcher'
import { ThemeToggle } from '../../../../../components/ui/theme-toggle'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useTheme } from '../../../../../lib/use-theme'

export type SignInStep = 'credentials' | 'code'

const steps: { id: SignInStep; label: string }[] = [
  { id: 'credentials', label: 'Password' },
  { id: 'code', label: 'Code' },
]

export function SignInLayout({
  title,
  description,
  step,
  children,
}: {
  title: string
  description: string
  step: SignInStep
  children: ReactNode
}) {
  useUiLanguage()
  const { isDark, toggleTheme } = useTheme()
  useEffect(() => {
    document.title = 'BaMoYa Finance'
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
  const current = steps.findIndex((item) => item.id === step)
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
            {step === 'code' && (
              <ol className="admin-auth-stepper" aria-label={translate('Sign-in steps')}>
                {steps.map((item, index) => (
                  <li
                    key={item.id}
                    aria-current={index === current ? 'step' : undefined}
                    data-state={index < current ? 'done' : index === current ? 'current' : 'todo'}
                  >
                    <span className="admin-auth-step-mark">
                      {index < current ? <Check size={13} aria-hidden="true" /> : index + 1}
                    </span>
                    {translate(item.label)}
                  </li>
                ))}
              </ol>
            )}
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
