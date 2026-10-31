import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Mail,
  MessageCircle,
  Video,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useSearch } from 'wouter'

import { Checkbox } from '../../../../components/ui/checkbox'
import { Textarea } from '../../../../components/ui/textarea'
import { Button, Eyebrow, RouteButton, Select, TextField } from '../components/ui'
import { contactChannels, contactDraftUrl } from '../data/contact'
import { useMarketing } from '../hooks/marketing-context'
export function Contact() {
  const { t, locale } = useMarketing()
  const channels = contactChannels()
  const search = useSearch()
  const [tab, setTab] = useState<'question' | 'demo'>(
    new URLSearchParams(search).get('tab') === 'demo' ? 'demo' : 'question',
  )
  const [sent, setSent] = useState(false)
  const [values, setValues] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
    availability: '',
    subject: 'general',
  })
  const [consent, setConsent] = useState(false)
  useEffect(() => {
    setTab(new URLSearchParams(search).get('tab') === 'demo' ? 'demo' : 'question')
    setSent(false)
  }, [search])
  useEffect(() => {
    if (sent) document.querySelector<HTMLElement>('.form-success')?.focus()
  }, [sent])
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!channels.email) return
    window.location.href = contactDraftUrl(channels.email, tab, values, locale)
    setSent(true)
  }
  return (
    <>
      <section className="container page-intro contact-intro">
        <Eyebrow>{t('LET’S TALK ABOUT YOUR BUSINESS')}</Eyebrow>
        <h1>
          {t('A question?')}
          <br />
          <span>{t('A real conversation.')}</span>
        </h1>
        <p>{t('Need an answer or a guided overview? Tell us what would help.')}</p>
      </section>
      <section className="container contact-layout">
        <aside className="contact-aside">
          <h2>{t('The right conversation, at the right time.')}</h2>
          <p>
            {t('No account or complete brief required. A few words about your business will do.')}
          </p>
          <div className="contact-method">
            <span className="feature-icon">
              <Mail size={20} />
            </span>
            <div>
              <h3>{t('By email')}</h3>
              {channels.email ? (
                <a href={`mailto:${channels.email}`}>{channels.email}</a>
              ) : (
                <span className="pending-detail">{t('[Contact email to confirm]')}</span>
              )}
            </div>
          </div>
          <div className="contact-method">
            <span className="feature-icon">
              <MessageCircle size={20} />
            </span>
            <div>
              <h3>WhatsApp</h3>
              {channels.whatsapp ? (
                <a href={`https://wa.me/${channels.whatsapp}`} target="_blank" rel="noreferrer">
                  {channels.whatsappDisplay}
                </a>
              ) : (
                <span className="pending-detail">{t('[Number to confirm]')}</span>
              )}
            </div>
          </div>
          <div className="contact-method">
            <span className="feature-icon">
              <Video size={20} />
            </span>
            <div>
              <h3>{t('A guided demo')}</h3>
              <span>{t('By appointment, confirmed personally.')}</span>
            </div>
          </div>
          <div className="support-note">
            <Clock3 size={18} />
            <div>
              <strong>{t('Monday to Friday')}</strong>
              <p>
                {t(
                  'During Moroccan business hours · Africa/Casablanca. We aim to reply within two business days, without a guaranteed response time.',
                )}
              </p>
            </div>
          </div>
          <span className="contact-prototype-note">
            {channels.email
              ? t('Your request opens in your email app. You review and send it yourself.')
              : t('Contact details are being finalized. Online requests are not available yet.')}
          </span>
        </aside>
        <div className="contact-card">
          <div className="contact-tabs" role="tablist" aria-label={t('Request type')}>
            {(['question', 'demo'] as const).map((type) => (
              <button
                key={type}
                role="tab"
                id={`tab-${type}`}
                aria-selected={tab === type}
                aria-controls="contact-panel"
                tabIndex={tab === type ? 0 : -1}
                onKeyDown={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault()
                    const next =
                      e.key === 'Home'
                        ? 'question'
                        : e.key === 'End'
                          ? 'demo'
                          : type === 'question'
                            ? 'demo'
                            : 'question'
                    setTab(next)
                    setSent(false)
                    document.getElementById(`tab-${next}`)?.focus()
                  }
                }}
                onClick={() => {
                  setTab(type)
                  setSent(false)
                }}
              >
                {type === 'question' ? <MessageCircle size={17} /> : <Video size={17} />}{' '}
                {type === 'question' ? t('Ask a question') : t('Request a demo')}
              </button>
            ))}
          </div>
          <div id="contact-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {sent ? (
              <div className="form-success" role="status" tabIndex={-1}>
                <span>
                  <CheckCircle2 size={34} />
                </span>
                <Eyebrow>{t('EMAIL DRAFT')}</Eyebrow>
                <h2>{t('Your email draft is ready.')}</h2>
                <p>
                  {t(
                    'Review and send the draft in your email app. No email has been sent by this website and no appointment is confirmed automatically.',
                  )}
                </p>
                <div className="request-summary">
                  <strong>{values.name}</strong>
                  <span>{values.email}</span>
                  <span>{tab === 'demo' ? t('Demo request') : t('B-Finance question')}</span>
                </div>
                <Button onClick={() => setSent(false)}>
                  {t('Back to the form')}
                  <ArrowRight size={16} />
                </Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2>
                  {tab === 'demo'
                    ? t('Let’s explore your future workspace.')
                    : t('How can we help?')}
                </h2>
                <p className="form-intro">
                  {tab === 'demo'
                    ? t(
                        'Suggest your availability. We will confirm the time with you before any booking.',
                      )
                    : t('Tell us what you need. We will reply personally.')}
                </p>
                <p className="required-note">{t('* Required fields')}</p>
                <div className="form-grid">
                  <TextField
                    label={t('Your name')}
                    required
                    autoComplete="name"
                    placeholder={t('Full name')}
                    {...field('name')}
                  />
                  <TextField
                    label={t('Your email')}
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="vous@entreprise.ma"
                    {...field('email')}
                  />
                  {tab === 'demo' ? (
                    <>
                      <TextField
                        label={t('Business')}
                        optional
                        autoComplete="organization"
                        placeholder={t('Your business name')}
                        {...field('company')}
                      />
                      <TextField
                        label={t('Phone')}
                        optional
                        type="tel"
                        autoComplete="tel"
                        placeholder={t('To reach you if needed')}
                        {...field('phone')}
                      />
                    </>
                  ) : (
                    <div className="field full">
                      <label>{t('Your topic')}</label>
                      <Select
                        label={t('Your topic')}
                        value={values.subject}
                        onChange={(subject) => setValues((v) => ({ ...v, subject }))}
                        options={[
                          {
                            value: 'general',
                            label: t('A product question'),
                          },
                          {
                            value: 'pricing',
                            label: t('Plans and subscription'),
                          },
                          {
                            value: 'support',
                            label: t('Help using the product'),
                          },
                          { value: 'other', label: t('Another request') },
                        ]}
                      />
                    </div>
                  )}
                  {tab === 'demo' && (
                    <div className="full">
                      <TextField
                        label={t('Your availability')}
                        optional
                        placeholder={t('E.g. Tuesday or Thursday afternoon, Morocco time')}
                        {...field('availability')}
                      />
                    </div>
                  )}
                  <div className="field full">
                    <label htmlFor="contact-message">
                      {tab === 'demo' ? t('Your business and needs') : t('Your message')}
                      {tab === 'question' ? (
                        <span className="required"> *</span>
                      ) : (
                        <small>{t('Optional')}</small>
                      )}
                    </label>
                    <Textarea
                      className="input"
                      id="contact-message"
                      rows={4}
                      required={tab === 'question'}
                      placeholder={
                        tab === 'demo'
                          ? t('What would you like to explore during the demo?')
                          : t('Tell us a little more…')
                      }
                      {...field('message')}
                    />
                  </div>
                </div>
                <label className="consent-row">
                  <Checkbox
                    className="consent-checkbox"
                    required
                    checked={consent}
                    onCheckedChange={(value) => setConsent(value === true)}
                  />
                  <span>
                    {t('I agree to my details being used to answer this request.')}{' '}
                    <Link href="/confidentialite">{t('Privacy')}</Link>
                  </span>
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  className="submit-button"
                  disabled={!channels.email}
                >
                  {t('Prepare my email')}
                  <ArrowUpRight size={16} />
                </Button>
                <p className="form-demo-note">
                  {channels.email
                    ? t('Opens your email app. Your request is sent only when you send the email.')
                    : t('A contact email must be configured before this form can be used.')}
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
      <div className="container contact-bottom">
        <span>
          <Check size={16} />
          {t('Prefer to explore on your own?')}
        </span>
        <RouteButton href="/fonctionnalites" variant="ghost">
          {t('Explore features')}
          <ArrowRight size={16} />
        </RouteButton>
      </div>
    </>
  )
}
