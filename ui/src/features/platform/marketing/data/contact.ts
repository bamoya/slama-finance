/** Public contact channels are deployment configuration, never private credentials. */
export function contactChannels() {
  const runtime = window.__SLAMA_CONFIG__
  const email = (runtime?.contactEmail ?? import.meta.env.VITE_PUBLIC_CONTACT_EMAIL ?? '').trim()
  const phone = (
    runtime?.whatsappNumber ??
    import.meta.env.VITE_PUBLIC_WHATSAPP_NUMBER ??
    ''
  ).trim()
  const digits = phone.replace(/[+\s()-]/g, '')
  return {
    email: /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? email : null,
    whatsapp: /^\d{10,15}$/.test(digits) ? digits : null,
    whatsappDisplay: phone,
  }
}

export function contactDraftUrl(
  email: string,
  kind: 'question' | 'demo',
  values: {
    name: string
    email: string
    company: string
    phone: string
    message: string
    availability: string
    subject: string
  },
  locale: string,
) {
  const french = locale === 'fr'
  const subject = `B-Finance — ${kind === 'demo' ? (french ? 'Demande de démonstration' : 'Demo request') : french ? 'Question' : 'Question'}`
  const fields: [string, string][] = [
    [french ? 'Nom' : 'Name', values.name],
    ['Email', values.email],
    [french ? 'Entreprise' : 'Business', values.company],
    [french ? 'Téléphone' : 'Phone', values.phone],
    [
      french ? 'Disponibilités (heure du Maroc)' : 'Availability (Morocco time)',
      values.availability,
    ],
    [french ? 'Sujet' : 'Topic', kind === 'question' ? values.subject : ''],
    ['Message', values.message],
  ]
  const body = fields
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n\n')
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
