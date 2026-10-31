import { ArrowLeft, FileCheck2, Info } from 'lucide-react'
import { Link } from 'wouter'

import { Eyebrow } from '../components/ui'
import { useMarketing } from '../hooks/marketing-context'
type Section = { title: string; paragraphs: string[] }
export function Legal({ type }: { type: 'privacy' | 'terms' | 'notice' }) {
  const { t } = useMarketing()
  const content: Record<typeof type, { title: string; intro: string; sections: Section[] }> = {
    privacy: {
      title: t('Privacy policy'),
      intro: t(
        'Understand which data the service needs, why it is used and how to exercise your rights.',
      ),
      sections: [
        {
          title: t('Who is responsible?'),
          paragraphs: [
            t(
              'BaMoYa Finance is a service published by an individual. Responsible party: [legal name to complete]. Privacy contact: [email to complete]. Address: [address to complete].',
            ),
          ],
        },
        {
          title: t('The data involved'),
          paragraphs: [
            t(
              'For your account: identity, email, sign-in and subscription information. For your organizations: business details, staff, clients, catalog, sales documents and recorded payments.',
            ),
            t(
              'The contact form prepares an email using your name, email, message and any optional details. You review and send it in your own email app; the website does not submit the form to a server.',
            ),
          ],
        },
        {
          title: t('Why use it?'),
          paragraphs: [
            t(
              'Intended purposes are service delivery, access management, subscription billing, responding to requests and security. The corresponding legal bases will be specified before launch.',
            ),
            t(
              'Business data entered into an organization is intended for that organization’s operations. The respective responsibilities of the publisher and client business must be detailed in the terms and, where necessary, a data-processing agreement.',
            ),
          ],
        },
        {
          title: t('Hosting and providers'),
          paragraphs: [
            t(
              'Hosting provider, data location, storage and email providers: [list and countries to confirm]. Any transfers and their safeguards must be documented before the service opens.',
            ),
            t(
              'This working draft does not certify compliance or completion of any formalities. Applicable Moroccan requirements remain to be verified before publication.',
            ),
          ],
        },
        {
          title: t('Retention and deletion'),
          paragraphs: [
            t(
              'Operational, backup and legal retention periods must be confirmed for each data category. Subscription expiry and a request to delete an organization are distinct processes.',
            ),
            t(
              'The final document will explain data export, deletion requests and legally applicable retention exceptions.',
            ),
          ],
        },
        {
          title: t('Your choices and rights'),
          paragraphs: [
            t(
              'You will be able to contact [privacy email to complete] for a request about your data. The procedure, required evidence and applicable timelines will be detailed in the published version.',
            ),
            t(
              'This website stores language and theme preferences in this browser. Authenticated access uses session cookies. The final cookie and analytics policy must be confirmed before commercial launch.',
            ),
          ],
        },
      ],
    },
    terms: {
      title: t('Terms of service'),
      intro: t(
        'A readable framework for using BaMoYa Finance, subscriptions and our relationship with you.',
      ),
      sections: [
        {
          title: t('The service and its publisher'),
          paragraphs: [
            t(
              'BaMoYa Finance is a business management tool: clients, products, estimates, invoices, deliveries, payments and financial insights. Publisher: [legal name to complete], [status to confirm], [address to complete].',
            ),
            t(
              'The service records payments declared by users. It does not execute bank transfers or replace accounting, tax or legal advice.',
            ),
          ],
        },
        {
          title: t('Account and organizations'),
          paragraphs: [
            t(
              'The owner manages organizations through a platform account and uses independent organization administrator credentials. Each organization has its own workspace and staff accounts. You remain responsible for granted access and entered data.',
            ),
            t(
              'Features, organization count, staff seats and storage and email quotas depend on the chosen plan. The initial administrator consumes a member seat.',
            ),
          ],
        },
        {
          title: t('Trial and paid activation'),
          paragraphs: [
            t(
              'The trial lasts seven calendar days from creation of the first organization, without payment required. Trial limits are shown on the Pricing page.',
            ),
            t(
              'At launch, activation and renewal are manual after payment confirmation. The total price and any taxes must be communicated before payment. Start and end dates are displayed in the portal.',
            ),
          ],
        },
        {
          title: t('Renewal and refunds'),
          paragraphs: [
            t(
              'No automatic debit is planned at launch. You may choose not to renew. Access continues until the end of the paid period, subject to other applicable terms.',
            ),
            t(
              'The proposed commercial policy offers a seven-day refund guarantee on the first payment. Renewal requests are reviewed individually. Applicable statutory rights remain unaffected. Refund procedure and timeline: [to validate before launch].',
            ),
          ],
        },
        {
          title: t('Support and availability'),
          paragraphs: [
            t(
              'Support covers getting started, usage questions and bug investigation. Email and WhatsApp, Monday to Friday during Moroccan business hours. Target response: two business days, without a contractually guaranteed timeline.',
            ),
            t(
              'Custom development and data entry are excluded from standard support and may be quoted separately. No numerical uptime commitment or 24/7 assistance is promised in this launch proposal.',
            ),
          ],
        },
        {
          title: t('Data, service termination and applicable framework'),
          paragraphs: [
            t(
              'The privacy policy describes processed data. Export, retention and deletion procedures after expiry must be validated before publication.',
            ),
            t(
              'Applicable law, complaint handling, responsibilities and dispute resolution must be finalized for the publisher’s status and intended customers. Contact: [email to complete].',
            ),
          ],
        },
      ],
    },
    notice: {
      title: t('Legal notice'),
      intro: t('Publisher identification and contact information for the BaMoYa Finance website.'),
      sections: [
        {
          title: t('Service publisher'),
          paragraphs: [
            t(
              'Product name: BaMoYa Finance. Parent brand: BaMoYa. Publisher: individual — [legal first and last name to complete]. Professional status: [to confirm].',
            ),
            t(
              'Business address: [to complete]. Identifiers and registrations applicable to the chosen status: [to confirm]. Personal details must be confirmed by the publisher before publication.',
            ),
          ],
        },
        {
          title: t('Contact and publication'),
          paragraphs: [
            t(
              'Publication contact: [name to complete]. Email: [to complete]. Business phone / WhatsApp: [to complete]. Details will be entered and verified before commercial publication.',
            ),
          ],
        },
        {
          title: t('Hosting'),
          paragraphs: [
            t(
              'Website and service host: [company name, address and contact to confirm]. Hosting country and technical providers: [to confirm in the privacy policy].',
            ),
          ],
        },
        {
          title: t('Visual identity and content'),
          paragraphs: [
            t(
              'The BaMoYa Finance logo supplied by the publisher is used in this design proposal. Screenshots and illustrations use fictional data and are not customer testimonials or results.',
            ),
            t(
              'Conditions for reusing text, graphics and trademarks will be specified in the published version.',
            ),
          ],
        },
        {
          title: t('Status of this version'),
          paragraphs: [
            t(
              'Account registration and sign-in connect to the service. Contact and demo requests use your email app, without automatic booking. Commercial information and legal documents must be validated before commercial launch.',
            ),
          ],
        },
      ],
    },
  }
  const c = content[type]
  return (
    <div className="container legal-page">
      <Link href="/" className="legal-back">
        <ArrowLeft size={15} />
        {t('Back to home')}
      </Link>
      <header className="legal-heading">
        <Eyebrow>{t('INFORMATION & TRANSPARENCY')}</Eyebrow>
        <h1>{c.title}</h1>
        <p>{c.intro}</p>
        <span className="legal-date">{t('Working draft')} · 30-10-2026</span>
      </header>
      <div className="legal-draft">
        <Info size={20} />
        <div>
          <strong>{t('Provisional document — validate before publication')}</strong>
          <p>
            {t(
              'Bracketed details must be completed. This content is for design purposes and is not a final legal document.',
            )}
          </p>
        </div>
      </div>
      <div className="legal-layout">
        <aside>
          <span>{t('ON THIS PAGE')}</span>
          <nav aria-label={t('Table of contents')}>
            {c.sections.map((s, i) => (
              <a href={`#section-${i + 1}`} key={s.title}>
                <span>0{i + 1}</span>
                {s.title}
              </a>
            ))}
          </nav>
          <div className="legal-help">
            <FileCheck2 size={22} />
            <strong>{t('Need clarification?')}</strong>
            <Link href="/contact">{t('Contact us')} →</Link>
          </div>
        </aside>
        <article>
          {c.sections.map((s, i) => (
            <section id={`section-${i + 1}`} key={s.title}>
              <span className="legal-section-number">0{i + 1}</span>
              <h2>{s.title}</h2>
              {s.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}
          <div className="legal-end">
            {t('Also read')}
            <div>
              {type !== 'privacy' && <Link href="/confidentialite">{t('Privacy')}</Link>}
              {type !== 'terms' && <Link href="/conditions">{t('Terms of service')}</Link>}
              {type !== 'notice' && <Link href="/mentions-legales">{t('Legal notice')}</Link>}
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
