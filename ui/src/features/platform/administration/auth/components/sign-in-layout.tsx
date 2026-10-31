import '../../../../../components/layout/portal-shell.css'
import '../styles/admin-auth.css'

import { Check, ScrollText, ShieldCheck, Users, Wallet } from 'lucide-react'
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
    document.title = `${title} — BaMoYa Finance`
  }, [title])
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
            <div className="admin-auth-heading">
              <h1 id="admin-auth-title">{title}</h1>
              <p>{description}</p>
            </div>
            {children}
            <div className="admin-auth-note">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{translate('Every sign-in is recorded in the audit log.')}</span>
            </div>
          </div>
          <aside className="admin-auth-context">
            <span className="admin-auth-eyebrow">{translate('Platform administration')}</span>
            <h2>{translate('Operate the platform with confidence.')}</h2>
            <p>
              {translate(
                'Verify payments, manage customer subscriptions and keep a complete audit trail.',
              )}
            </p>
            <div className="admin-auth-highlight">
              <span>
                <ShieldCheck size={19} aria-hidden="true" />
              </span>
              <div>
                <strong>{translate('Mandatory two-factor authentication')}</strong>
                <small>
                  {translate(
                    'Every administrator signs in with a password and an authenticator code.',
                  )}
                </small>
              </div>
            </div>
            <div className="admin-auth-capabilities">
              <span>
                <Wallet size={17} aria-hidden="true" />
                {translate('Payment verification')}
              </span>
              <span>
                <Users size={17} aria-hidden="true" />
                {translate('Customer subscriptions')}
              </span>
              <span>
                <ScrollText size={17} aria-hidden="true" />
                {translate('Audit log of every action')}
              </span>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
