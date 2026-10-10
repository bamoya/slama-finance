const titles = {
  fr: {
    invoice: 'Facture',
    estimate: 'Devis',
    delivery: 'Bon de livraison',
    payment_receipt: 'Reçu de paiement',
  },
  en: {
    invoice: 'Invoice',
    estimate: 'Estimate',
    delivery: 'Delivery note',
    payment_receipt: 'Payment receipt',
  },
}

export function documentTitle(kind: keyof typeof titles.fr, locale: unknown = 'fr') {
  const language = typeof locale === 'string' ? locale.split('-')[0] : 'fr'
  return titles[language === 'en' ? 'en' : 'fr'][kind]
}
