import { ArrowRight, Check, ChevronDown, Minus } from 'lucide-react'

import { FinalCTA } from '../components/layout'
import { PricingPlans } from '../components/pricing-plans'
import { Eyebrow, FAQ, RouteButton, SectionHeading } from '../components/ui'
import { planNames } from '../data/plans'
import { useMarketing } from '../hooks/marketing-context'
export function Pricing() {
  const { t } = useMarketing()
  const rows = [
    { name: t('Organizations'), v: ['1', '3', t('Unlimited')] },
    {
      name: t('Members / organization'),
      v: [t('1 · administrator included'), '5', t('Unlimited')],
    },
    {
      name: t('Clients, catalog and documents'),
      v: [t('Unlimited'), t('Unlimited'), t('Unlimited')],
    },
    {
      name: t('Partial payments and receipts'),
      v: [true, true, true],
    },
    {
      name: t('Document layouts'),
      v: [t('1 fixed layout'), t('Customizable'), t('Customizable')],
    },
    { name: t('Logo and signature'), v: [true, true, true] },
    {
      name: t('Staff roles and permissions'),
      v: [false, true, true],
    },
    {
      name: t('Cross-organization analytics'),
      v: [false, true, true],
    },
    {
      name: t('Email, notifications and reminders'),
      v: [false, true, true],
    },
    {
      name: t('PDF / Excel reports and schedules'),
      v: [false, true, true],
    },
    {
      name: t('Website and verified sending domain'),
      v: [false, true, true],
    },
    { name: t('Pooled storage'), v: ['1 Go', '10 Go', '50 Go'] },
    {
      name: t('Pooled business emails / month'),
      v: ['0', '2 000', '10 000'],
    },
  ]
  return (
    <>
      <section className="container page-intro pricing-intro">
        <Eyebrow>{t('STRAIGHTFORWARD PRICING')}</Eyebrow>
        <h1>
          {t('Start simply.')}
          <br />
          <span>{t('Grow when you are ready.')}</span>
        </h1>
        <p>
          {t(
            'Three plans, clear limits. Hosting and routine maintenance included. Try for 7 days with no payment required.',
          )}
        </p>
      </section>
      <section className="container">
        <PricingPlans />
      </section>
      <section className="container section">
        <details className="comparison-details">
          <summary>
            <div>
              <Eyebrow>{t('THE DETAILS THAT MATTER')}</Eyebrow>
              <h2>{t('Compare all features')}</h2>
            </div>
            <span>
              {t('View comparison')}
              <ChevronDown size={18} />
            </span>
          </summary>
          <div
            className="comparison-scroll"
            tabIndex={0}
            role="region"
            aria-label={t('Plan comparison, horizontally scrollable')}
          >
            <table>
              <caption className="sr-only">{t('BaMoYa Finance plan features and quotas')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('Feature')}</th>
                  {planNames.map((name) => (
                    <th scope="col" key={name}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    {row.v.map((v, i) => (
                      <td key={i}>
                        {typeof v === 'boolean' ? (
                          v ? (
                            <Check size={16} aria-label={t('Included')} />
                          ) : (
                            <Minus size={16} aria-label={t('Not included')} />
                          )
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="comparison-note">
            {t(
              'The initial administrator consumes a member seat. Storage and email quotas are pooled per subscription. Domain registration is separate. “Unlimited” applies to organizations and staff, not storage or email.',
            )}
          </p>
        </details>
      </section>
      <section className="section-tint">
        <div className="container section faq-section">
          <SectionHeading
            eyebrow={t('NO SUBSCRIPTION SURPRISES')}
            title={t('Answers before you choose.')}
          />
          <FAQ
            items={[
              {
                q: t('When does the trial start?'),
                a: t(
                  'When you create your first organization. It lasts seven calendar days. The trial provides Business features for one organization, two members including the initial administrator, 50 total business emails and 1 GB storage. No payment is required.',
                ),
              },
              {
                q: t('How do I pay and activate my subscription?'),
                a: t(
                  'At launch, payment and verification are manual. Instructions and the total amount are provided before you pay. Your subscription activates after confirmation, with visible start and end dates.',
                ),
              },
              {
                q: t('Does my subscription renew automatically?'),
                a: t(
                  'No, not at launch. Reminders notify you before expiry. You choose whether to renew; no automatic debit is made. If you stop, access continues until your paid period ends.',
                ),
              },
              {
                q: t('What does the refund guarantee cover?'),
                a: t(
                  'You may request a refund within seven days of your first payment. Renewal refund requests are reviewed individually. Applicable statutory rights remain unaffected. Final procedures will be set out in terms validated before launch.',
                ),
              },
              {
                q: t('What does support include?'),
                a: t(
                  'Getting-started help, usage questions and bug investigation, by email and WhatsApp Monday to Friday during Moroccan business hours. Target first response: two business days, without a contractual response guarantee. Data entry and custom development are separate.',
                ),
              },
              {
                q: t('Can I manage several businesses?'),
                a: t(
                  'Yes. Business includes three organizations and five members per organization, including the administrator. Pro has no organization or staff count limit; its storage and email quotas still apply.',
                ),
              },
            ]}
          />
          <RouteButton href="/contact">
            {t('Still have a question?')}
            <ArrowRight size={16} />
          </RouteButton>
        </div>
      </section>
      <FinalCTA />
    </>
  )
}
