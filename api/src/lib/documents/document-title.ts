const titles = {
  fr: {
    invoice: 'Facture',
    simple_invoice: 'Facture simple',
    estimate: 'Devis',
    delivery: 'Bon de livraison',
    payment_receipt: 'Reçu de paiement',
    credit_note: 'Avoir',
    simple_credit_note: 'Avoir simple',
  },
  en: {
    invoice: 'Invoice',
    simple_invoice: 'Simple invoice',
    estimate: 'Estimate',
    delivery: 'Delivery note',
    payment_receipt: 'Payment receipt',
    credit_note: 'Credit note',
    simple_credit_note: 'Simple credit note',
  },
}

export function documentTitle(kind: keyof typeof titles.fr, locale: unknown = 'fr') {
  const language = typeof locale === 'string' ? locale.split('-')[0] : 'fr'
  return titles[language === 'en' ? 'en' : 'fr'][kind]
}
