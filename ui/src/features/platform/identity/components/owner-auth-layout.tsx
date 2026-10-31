import '../styles/owner-auth.css'

import { Building2, Check, FileText, ShieldCheck, Users, Wallet } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Link } from 'wouter'

import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ownerAuthPaths } from '../../../../lib/public-paths'

export function OwnerAuthLayout({
  title,
  description,
  mode,
  children,
}: {
  title: string
  description: string
  mode: string
  children: ReactNode
}) {
  useUiLanguage()
  useEffect(() => {
    document.title = `${title} — B-Finance`
  }, [title])
  const accountEntry = mode === 'login' || mode === 'register'
  return (
    <div className="owner-auth container">
      <section className="owner-auth-panel" aria-labelledby="owner-auth-title">
        <div className="owner-auth-form-column">
          {accountEntry && (
            <nav className="owner-auth-tabs" aria-label={translate('Owner account')}>
              <Link
                href={ownerAuthPaths.login}
                aria-current={mode === 'login' ? 'page' : undefined}
              >
                {translate('Log in')}
              </Link>
              <Link
                href={ownerAuthPaths.register}
                aria-current={mode === 'register' ? 'page' : undefined}
              >
                {translate('Create account')}
              </Link>
            </nav>
          )}
          <div className="owner-auth-heading">
            <h1 id="owner-auth-title">{title}</h1>
            <p>{description}</p>
          </div>
          {children}
          <div className="owner-auth-note">
            {mode === 'register' ? (
              <>
                <span>
                  <Check size={14} />
                  {translate('7 days to discover your workspace.')}
                </span>
                <small>{translate('The trial starts with your first organization.')}</small>
              </>
            ) : (
              <span>
                <ShieldCheck size={14} />
                {translate('One owner account. Independent organizations.')}
              </span>
            )}
          </div>
        </div>
        <aside className="owner-auth-context">
          <span className="owner-auth-eyebrow">{translate('YOUR OWNER PORTAL')}</span>
          <h2>{translate('Everything connects.')}</h2>
          <p>{translate('Your estimates, invoices and payments, in one clear view.')}</p>
          <div className="owner-auth-organization">
            <span>
              <Building2 size={19} />
            </span>
            <div>
              <strong>{translate('Your organizations')}</strong>
              <small>{translate('Administrator access included for the owner.')}</small>
            </div>
          </div>
          <div className="owner-auth-capabilities">
            <span>
              <FileText size={17} />
              {translate('Estimates and invoices')}
            </span>
            <span>
              <Wallet size={17} />
              {translate('Payments and receipts')}
            </span>
            <span>
              <Users size={17} />
              {translate('Clients and teams')}
            </span>
          </div>
          <div className="owner-auth-context-note">
            <ShieldCheck size={16} />
            <span>{translate('Each organization keeps its own data and access.')}</span>
          </div>
        </aside>
      </section>
    </div>
  )
}
