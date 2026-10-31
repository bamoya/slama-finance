import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  Check,
  FileText,
  Layers3,
  Package,
  Users,
  Wallet,
} from 'lucide-react'
import { Link } from 'wouter'

import { FinalCTA } from '../components/layout'
import { ClientPreview, DashboardPreview } from '../components/previews'
import { PricingPlans } from '../components/pricing-plans'
import { Eyebrow, FAQ, RouteButton, SectionHeading, TrialButton } from '../components/ui'
import { useMarketing } from '../hooks/marketing-context'
export function Home() {
  const { t } = useMarketing()
  const steps = [
    {
      icon: Package,
      n: '01',
      title: t('Prepare'),
      text: t('Clients, products and variants. An organized foundation, without retyping.'),
    },
    {
      icon: FileText,
      n: '02',
      title: t('Invoice'),
      text: t('From estimate to invoice to delivery note. Everything stays connected.'),
    },
    {
      icon: Wallet,
      n: '03',
      title: t('Collect'),
      text: t('Deposits, partial payments and receipts. Know what is still due.'),
    },
    {
      icon: ChartNoAxesCombined,
      n: '04',
      title: t('Understand'),
      text: t('Readable figures, by client and business. Decide with clarity.'),
    },
  ]
  return (
    <>
      <section className="container home-hero">
        <Eyebrow>{t('EVERYDAY BUSINESS FINANCE, SIMPLIFIED')}</Eyebrow>
        <h1>
          {t('Your estimates, invoices and payments,')}
          <br />
          <span>{t('finally together.')}</span>
        </h1>
        <p className="hero-lead">
          {t(
            'One place to invoice, follow your clients and keep a clear view of your businesses. Built for small teams with plenty to do.',
          )}
        </p>
        <div className="hero-actions">
          <TrialButton>{t('Try free for 7 days')}</TrialButton>
          <RouteButton href="/fonctionnalites" variant="ghost">
            {t('Explore the features')}
            <ArrowRight size={16} />
          </RouteButton>
        </div>
        <div className="hero-reassurance">
          <span>
            <Check />
            {t('No payment to get started')}
          </span>
          <span>
            <Check />
            {t('In French and English')}
          </span>
          <span>
            <Check />
            {t('One or several businesses')}
          </span>
        </div>
        <DashboardPreview />
      </section>
      <section className="capability-strip">
        <div className="container">
          {[
            [FileText, t('Estimates & invoices')],
            [Wallet, t('Payments & receipts')],
            [Users, t('Client insights')],
            [Building2, t('Multiple organizations')],
          ].map(([Icon, label]) => {
            const I = Icon as typeof FileText
            return (
              <span key={String(label)}>
                <I size={18} />
                {String(label)}
              </span>
            )
          })}
        </div>
      </section>
      <section className="container section workflow-section">
        <SectionHeading
          eyebrow={t('LESS BACK AND FORTH')}
          title={t('Your business moves. Your tools keep up.')}
          description={t(
            'Leave scattered files and reconstructed payment histories behind. Follow the thread from the first estimate to the final payment.',
          )}
        />
        <div className="workflow-grid">
          {steps.map((s) => (
            <div className="workflow-step" key={s.n}>
              <div>
                <span className="feature-icon">
                  <s.icon size={22} />
                </span>
                <span className="step-number">{s.n}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <Link href="/fonctionnalites" className="text-link">
          {t('See how everything connects')}
          <ArrowRight size={16} />
        </Link>
      </section>
      <section className="section-tint">
        <div className="container split-section">
          <div>
            <Eyebrow>{t('YOUR CLIENTS AT THE CENTER')}</Eyebrow>
            <h2>
              {t('Before following up,')}
              <br />
              {t('see the whole story.')}
            </h2>
            <p>
              {t(
                'A client calls? Their estimates, invoices, deliveries and payments connect in one profile. Know where you stand without searching everywhere.',
              )}
            </p>
            <ul className="benefit-list">
              <li>
                <Check />
                {t('Balance and payment history')}
              </li>
              <li>
                <Check />
                {t('Linked documents, in a list or tree')}
              </li>
              <li>
                <Check />
                {t('Client-specific reminders and preferences')}
              </li>
            </ul>
            <Link href="/fonctionnalites#clients" className="text-link">
              {t('Explore client insights')}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <ClientPreview />
        </div>
      </section>
      <section className="container section organization-story">
        <div>
          <span className="feature-icon">
            <Layers3 size={24} />
          </span>
          <h2>
            {t('Several businesses.')}
            <br />
            {t('One clear perspective.')}
          </h2>
          <p>
            {t(
              'Each organization keeps its own clients, documents and team. You keep an overview and move between them from your owner account.',
            )}
          </p>
          <RouteButton href="/fonctionnalites#organisations">
            {t('See multi-organization management')}
            <ArrowRight size={16} />
          </RouteButton>
        </div>
        <div className="organization-stack">
          {[
            ['AA', 'Atelier Atlas', 'Casablanca', '148 500'],
            ['MD', 'Maison Dalia', 'Rabat', '96 750'],
            ['CB', 'Coopérative du Bled', 'Marrakech', '54 300'],
          ].map(([initials, name, city, amount], i) => (
            <div className="org-demo-card" key={name}>
              <span className={`org-demo-avatar avatar-${i}`}>{initials}</span>
              <div>
                <strong>{name}</strong>
                <span>
                  {city} · {t('Independent workspace')}
                </span>
              </div>
              <div>
                <b>
                  {amount} <small>MAD</small>
                </b>
                <span>{t('Invoiced in the period')}</span>
              </div>
              <ArrowUpRight size={18} />
            </div>
          ))}
          <span className="fictional-caption">{t('Fictional examples · revenue, not profit')}</span>
        </div>
      </section>
      <section className="section-tint" id="tarifs" aria-labelledby="landing-pricing-title">
        <div className="container section landing-pricing">
          <div className="section-heading">
            <Eyebrow>{t('A PLAN FOR YOUR BUSINESS')}</Eyebrow>
            <h2 id="landing-pricing-title">{t('Choose your starting point.')}</h2>
            <p>
              {t(
                'Three plans, clear limits. Try for 7 days, with no payment required. Hosting and routine maintenance included.',
              )}
            </p>
          </div>
          <PricingPlans />
          <div className="landing-pricing-more">
            <span>
              {t('Activation after payment confirmation. Manual renewal, no automatic charge.')}
            </span>
            <RouteButton href="/tarifs">
              {t('See the full comparison')}
              <ArrowRight size={16} />
            </RouteButton>
          </div>
        </div>
      </section>
      <section className="container section faq-section">
        <SectionHeading eyebrow={t('CLEAR ANSWERS')} title={t('Before you get started.')} />
        <FAQ
          items={[
            {
              q: t('Is this suitable if I work alone?'),
              a: t(
                'Yes. An independent administrator account is created for each organization. Essential includes that one member.',
              ),
            },
            {
              q: t('Do I need to pay to try it?'),
              a: t(
                'No. The trial lasts seven calendar days and requires no payment. It starts when you create your first organization. No automatic charge.',
              ),
            },
            {
              q: t('Can I record several payments for an invoice?'),
              a: t(
                'Yes. Record a deposit and subsequent installments, with cash, bank transfer, cheque or another supported method. The remaining balance is calculated for you.',
              ),
            },
            {
              q: t('How does renewal work?'),
              a: t(
                'At launch, activation and renewal are manual, after payment confirmation. Your subscription dates are shown in your account.',
              ),
            },
          ]}
        />
      </section>
      <FinalCTA />
    </>
  )
}
