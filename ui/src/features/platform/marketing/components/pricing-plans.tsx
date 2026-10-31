import { CalendarDays, Check, LifeBuoy, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { planNames } from '../data/plans'
import { useMarketing } from '../hooks/marketing-context'
import { TrialButton } from './ui'

// Shared by the landing page and pricing page so prices and limits stay aligned.
export function PricingPlans() {
  const { t, locale } = useMarketing()
  const [annual, setAnnual] = useState(false)
  const money = (n: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-GB', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n)
  const plans = [
    {
      name: planNames[0],
      monthly: 99,
      annual: 990,
      description: t('The essentials to start on your own.'),
      features: [
        t('1 organization · you are the administrator'),
        t('Unlimited clients, products and documents'),
        t('Deposits, payments and receipts'),
        t('1 fixed layout, logo and signature'),
        t('Basic dashboard'),
        t('1 GB storage'),
      ],
      excluded: t('No additional staff accounts or business emails.'),
    },
    {
      name: planNames[1],
      monthly: 299,
      annual: 2990,
      description: t('For a team that wants more clarity.'),
      features: [
        t('3 organizations'),
        t('5 members per organization, administrator included'),
        t('All Essential features'),
        t('Customizable layouts and roles'),
        t('Full analytics and PDF / Excel reports'),
        t('Notifications and scheduled reports'),
        t('10 GB · 2,000 business emails / month'),
        t('Custom domain per organization'),
      ],
    },
    {
      name: planNames[2],
      monthly: 799,
      annual: 7990,
      description: t('For managing businesses at a larger scale.'),
      features: [
        t('Unlimited organizations'),
        t('Unlimited staff'),
        t('All Business features'),
        t('50 GB storage'),
        t('10,000 business emails / month'),
        t('Priority support handling'),
      ],
      excluded: t('Storage and email remain subject to the stated quotas.'),
    },
  ]
  return (
    <div className="pricing-plans">
      <div className="billing-control">
        <div role="group" aria-label={t('Billing period')}>
          <button aria-pressed={!annual} onClick={() => setAnnual(false)}>
            {t('Monthly')}
          </button>
          <button aria-pressed={annual} onClick={() => setAnnual(true)}>
            {t('Annual')}
          </button>
        </div>
        <span>{t('2 months free with annual billing')}</span>
      </div>
      <div className="plan-grid">
        {plans.map((p, i) => {
          const amount = annual ? p.annual : p.monthly
          return (
            <article className={`plan-card ${i === 1 ? 'recommended' : ''}`} key={p.name}>
              {i === 1 && <span className="recommended-label">{t('RECOMMENDED FOR TEAMS')}</span>}
              <div className="plan-card-heading">
                <span className={`plan-dot plan-${i}`} />
                <h3>{p.name}</h3>
              </div>
              <p className="plan-description">{p.description}</p>
              <div className="plan-price">
                <strong>{money(amount)}</strong>
                <span>DH HT / {annual ? t('year') : t('month')}</span>
              </div>
              <div className="plan-tax">
                {money(amount * 1.2)} DH TTC / {annual ? t('year') : t('month')}*
              </div>
              <p className="plan-billing-note">
                {annual
                  ? t('{{amount}} DH excl. VAT / month, billed annually.', {
                      amount: money(amount / 12),
                    })
                  : t('Paid monthly, renewed manually.')}
              </p>
              <TrialButton variant={i === 1 ? 'primary' : 'outline'}>
                {t('Start free trial')}
              </TrialButton>
              <div className="plan-features">
                {p.features.map((f) => (
                  <div key={f}>
                    <Check size={15} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              {p.excluded && <p className="plan-exclusion">{p.excluded}</p>}
            </article>
          )
        })}
      </div>
      <p className="tax-disclaimer">
        {t(
          '* Tax-inclusive amounts illustrate 20% VAT, subject to its applicability to the operator. Tax rate and disclosures must be confirmed before commercialization.',
        )}
      </p>
      <div className="pricing-facts">
        {[
          [CalendarDays, t('7-day trial'), t('No payment or automatic debit.')],
          [
            ShieldCheck,
            t('A reassuring first payment'),
            t('7-day first-payment refund guarantee.'),
          ],
          [LifeBuoy, t('A human contact'), t('Email and WhatsApp, on business days.')],
        ].map(([Icon, title, desc]) => {
          const I = Icon as typeof Check
          return (
            <div key={String(title)}>
              <I size={22} />
              <span>
                <strong>{String(title)}</strong>
                <small>{String(desc)}</small>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
