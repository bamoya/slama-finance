import type { ReactNode } from 'react'

import { LanguageSwitcher } from '../../../../components/ui/language-switcher'
import { ThemeToggle } from '../../../../components/ui/theme-toggle'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useTheme } from '../../../../lib/use-theme'
export function AuthLayout({
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
  return (
    <main
      className={`min-h-screen bg-[var(--surface)] text-[var(--text)] ${isDark ? 'is-dark' : ''}`}
    >
      <section className="grid min-h-screen lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-16 text-white">
          <img
            src="/images/login-wheat-hero.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/85 to-black/20" />
          <div className="relative flex items-center gap-3 text-xl font-bold">
            <img src="/slama-logo.png" alt="" className="h-12 w-12 rounded-full" />
            {translate('Slama Finance')}
          </div>
          <div className="relative">
            <h1 className="text-5xl font-bold">{translate('Rooted in clarity.')}</h1>
            <p className="mt-6 text-lg text-white/80">
              {translate('Every invoice. Every payment. In one clear view.')}
            </p>
          </div>
          <p className="relative text-sm text-white/70">
            {translate('Your company’s finance workspace.')}
          </p>
        </aside>
        <div className="relative flex items-center justify-center px-7 pb-14 pt-24 sm:px-16">
          <div className="absolute right-5 top-5 flex items-center gap-2 sm:right-8 sm:top-8">
            <LanguageSwitcher />
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          </div>
          <div className="w-full max-w-md">
            <img
              src="/slama-logo.png"
              alt={translate('Slama Finance')}
              className="mb-8 h-12 w-12 lg:hidden"
            />
            <h2 className="text-3xl font-bold">{title}</h2>
            <p className="mt-3 mb-8 text-[var(--muted)]">{description}</p>
            {children}
          </div>
        </div>
      </section>
    </main>
  )
}
