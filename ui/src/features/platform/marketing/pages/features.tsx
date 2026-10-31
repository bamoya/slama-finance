import {
  ArrowRight,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  Mail,
  Package,
  Palette,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'

import { FinalCTA } from '../components/layout'
import {
  ClientPreview,
  CollectionPreview,
  DashboardPreview,
  DocumentPreview,
} from '../components/previews'
import { ReadingStepper } from '../components/reading-stepper'
import { Eyebrow, RouteButton, SectionHeading, TrialButton } from '../components/ui'
import { useMarketing } from '../hooks/marketing-context'
export function Features() {
  const { t } = useMarketing()
  const workflow = [
    { id: 'preparer', label: t('Prepare') },
    { id: 'facturer', label: t('Invoice') },
    { id: 'encaisser', label: t('Collect') },
    { id: 'piloter', label: t('Understand') },
    { id: 'clients', label: t('Your clients') },
    { id: 'organisations', label: t('Organizations & team') },
  ]
  return (
    <div className="features-page">
      <section className="container page-intro">
        <Eyebrow>{t('THE FEATURES')}</Eyebrow>
        <h1>
          {t('Everything connects.')}
          <br />
          <span>{t('You move forward more simply.')}</span>
        </h1>
        <p>
          {t(
            'From your catalog to your overview, follow one thread: less retyping, more visibility.',
          )}
        </p>
        <div className="hero-actions">
          <TrialButton />
          <RouteButton href="/contact?tab=demo">
            {t('Take a guided tour')}
            <ArrowRight size={16} />
          </RouteButton>
        </div>
      </section>
      <ReadingStepper steps={workflow} />
      <div className="features-content">
        <section id="preparer" className="container section feature-row">
          <div>
            <Eyebrow>{t('01 / PREPARE')}</Eyebrow>
            <h2>
              {t('A good foundation.')}
              <br />
              {t('Less retyping.')}
            </h2>
            <p>
              {t(
                'Bring your clients and catalog together. A product can have several weight and price variants: choose the right one and add it to your document.',
              )}
            </p>
            <ul className="benefit-list">
              <li>
                <Check />
                {t('Categories, products and variants')}
              </li>
              <li>
                <Check />
                {t('Individual and business clients')}
              </li>
              <li>
                <Check />
                {t('Contact and identity details completed at your pace')}
              </li>
            </ul>
          </div>
          <CatalogPreview />
        </section>
        <section className="section-tint">
          <div id="facturer" className="container section feature-row reversed">
            <DocumentPreview />
            <div>
              <Eyebrow>{t('02 / INVOICE')}</Eyebrow>
              <h2>
                {t('From your client’s yes')}
                <br />
                {t('to delivery.')}
              </h2>
              <p>
                {t(
                  'Create an estimate, turn it into one or several invoices, then prepare a delivery note from an invoice. Documents stay connected and easy to find.',
                )}
              </p>
              <ul className="benefit-list">
                <li>
                  <Check />
                  {t('Your logo, signature and document layout')}
                </li>
                <li>
                  <Check />
                  {t('PDFs in French or English')}
                </li>
                <li>
                  <Check />
                  {t('VAT added only when you enable it')}
                </li>
              </ul>
              <span className="plan-footnote">
                {t('Template customization: Business and Pro.')}
              </span>
            </div>
          </div>
        </section>
        <section id="encaisser" className="container section feature-row">
          <div>
            <Eyebrow>{t('03 / COLLECT')}</Eyebrow>
            <h2>
              {t('A deposit today.')}
              <br />
              {t('A balance that stays clear.')}
            </h2>
            <p>
              {t(
                'Your clients do not always pay at once. Record every payment and its method. Outstanding balances update without recalculating everything.',
              )}
            </p>
            <ul className="benefit-list">
              <li>
                <Check />
                {t('Cash, bank transfers, cheques and other methods')}
              </li>
              <li>
                <Check />
                {t('Downloadable payment receipts')}
              </li>
              <li>
                <Check />
                {t('Reminders and delivery based on your preferences')}
              </li>
            </ul>
            <span className="plan-footnote">
              {t(
                'Email delivery and reminders: Business and Pro. Payments are recorded; no bank transfer is executed.',
              )}
            </span>
          </div>
          <CollectionPreview />
        </section>
        <section className="section-tint">
          <div id="piloter" className="container section analytics-feature">
            <SectionHeading
              eyebrow={t('04 / UNDERSTAND')}
              title={t('Numbers that tell you something.')}
              description={t(
                'Compare invoiced and collected amounts, spot overdue balances and understand each organization’s contribution. Revenue is not profit: expenses are not tracked.',
              )}
            />
            <DashboardPreview compact />
            <div className="analytics-benefits">
              <span>
                <ChartNoAxesCombined />
                {t('Trends over your selected period')}
              </span>
              <span>
                <CalendarClock />
                {t('PDF / Excel reports and scheduled delivery')}
              </span>
              <span>
                <Wallet />
                {t('Current outstanding and overdue balances')}
              </span>
            </div>
            <span className="plan-footnote">
              {t('Full analytics, reports and scheduling: Business and Pro.')}
            </span>
          </div>
        </section>
        <section id="clients" className="container section feature-row">
          <div>
            <Eyebrow>{t('AND ALWAYS, YOUR CLIENTS')}</Eyebrow>
            <h2>
              {t('Your client profile becomes')}
              <br />
              {t('your point of reference.')}
            </h2>
            <p>
              {t(
                'Find the context before every conversation: connected documents, payments, balance and history. In a list or tree, the business relationship is clear at a glance.',
              )}
            </p>
            <ul className="benefit-list">
              <li>
                <Check />
                {t('Client-specific indicators')}
              </li>
              <li>
                <Check />
                {t('From estimate to payments, connections stay visible')}
              </li>
              <li>
                <Check />
                {t('Client-specific notification preferences')}
              </li>
            </ul>
          </div>
          <ClientPreview />
        </section>
        <section id="organisations" className="section-tint">
          <div className="container section">
            <SectionHeading
              eyebrow={t('ONE TEAM OR SEVERAL BUSINESSES')}
              title={t('Grow without mixing everything up.')}
              description={t(
                'One owner account for you. Independent workspaces for your businesses. Appropriate access for your staff.',
              )}
            />
            <div className="supporting-grid">
              {[
                {
                  icon: Building2,
                  title: t('Independent organizations'),
                  body: t(
                    'Clients, catalog, documents and teams belong to each business. An independent administrator account is created for you.',
                  ),
                },
                {
                  icon: ShieldCheck,
                  title: t('Roles that make sense'),
                  body: t(
                    'Give each team member the access they need. Staff accounts are scoped to their organization.',
                  ),
                },
                {
                  icon: Palette,
                  title: t('Your identity on your documents'),
                  body: t(
                    'Logo, signature, colors and customizable fixed layouts, without building every page by hand.',
                  ),
                },
                {
                  icon: Mail,
                  title: t('Communication at your pace'),
                  body: t(
                    'Manual delivery, automatic notifications and scheduled reports. Choose what goes out and to whom.',
                  ),
                },
              ].map((item) => (
                <div key={item.title}>
                  <span className="feature-icon">
                    <item.icon size={22} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
            <RouteButton href="/tarifs">
              {t('Compare features by plan')}
              <ArrowRight size={16} />
            </RouteButton>
          </div>
        </section>
      </div>
      <FinalCTA />
    </div>
  )
}
function CatalogPreview() {
  const { t } = useMarketing()
  return (
    <div className="product-illustration catalog-illustration">
      <div className="illustration-toolbar">
        <span>
          <Package size={16} />
          {t('One catalog, all your variants')}
        </span>
        <span className="mini-badge">{t('Illustration')}</span>
      </div>
      <div className="catalog-product">
        <span className="product-block">
          <Package size={38} strokeWidth={1.2} />
        </span>
        <div>
          <span className="mini-badge">{t('Fine foods')}</span>
          <h3>{t('Atlas selection')}</h3>
          <p>{t('One product. The right format for every order.')}</p>
        </div>
      </div>
      <div className="variant-heading">
        <span>{t('VARIANT')}</span>
        <span>{t('UNIT PRICE')}</span>
      </div>
      {[
        ['100 g', '45'],
        ['200 g', '80'],
        ['500 g', '160'],
      ].map(([weight, price], i) => (
        <div className={`variant-line ${i === 1 ? 'chosen' : ''}`} key={weight}>
          <span className="weight-icon">
            <Package size={16} />
          </span>
          <strong>{weight}</strong>
          <span>{price},00 MAD</span>
          {i === 1 ? <Check size={16} /> : <span className="variant-dot" />}
        </div>
      ))}
      <div className="illustration-caption">
        <Users size={15} />
        {t('Find your products and clients as you create documents.')}
      </div>
    </div>
  )
}
