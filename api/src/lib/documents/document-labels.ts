import { resolveLanguage } from '../language.js'

const french: Record<string, string> = {
  'Document date': 'Date du document',
  'RECEIVED FROM': 'REÇU DE',
  CUSTOMER: 'CLIENT',
  'AMOUNT RECEIVED': 'MONTANT REÇU',
  'INVOICE BALANCE AT PAYMENT RECORDING': 'SOLDE À L’ENREGISTREMENT DU PAIEMENT',
  'Product name': 'Nom du produit',
  Qty: 'Qté',
  'Unit price': 'Prix unitaire',
  VAT: 'TVA',
  Total: 'Total',
  'Received by / signature': 'Réceptionnaire / signature',
  'Authorized signature': 'Signature autorisée',
  Invoice: 'Facture',
  'Due date': 'Échéance',
  'Valid until': 'Valable jusqu’au',
  Subtotal: 'Sous-total',
  'Payment terms': 'Conditions de paiement',
  'Bank details': 'Coordonnées bancaires',
  Method: 'Mode de paiement',
  Cash: 'Espèces',
  Cheque: 'Chèque',
  'Bank transfer': 'Virement bancaire',
  Reference: 'Référence',
  'Cheque bank': 'Banque du chèque',
  'Cheque number': 'Numéro du chèque',
  'Collection date': 'Date d’encaissement',
  'Awaiting collection': 'En attente d’encaissement',
  'Invoice total': 'Total de la facture',
  'Collected to date': 'Encaissé à cette date',
  Remaining: 'Solde restant',
  'Cancellation reason': 'Motif d’annulation',
  'CANCELLED - not valid as proof of payment': 'ANNULÉ — ne constitue pas une preuve de paiement',
  'Cheque received - awaiting collection': 'Chèque reçu — en attente d’encaissement',
  'Bank transfer recorded - awaiting confirmation':
    'Virement enregistré — en attente de confirmation',
  'Cheque collected': 'Chèque encaissé',
  'Payment collected': 'Paiement encaissé',
  'This receipt does not confirm cleared funds.':
    'Ce reçu ne confirme pas l’encaissement des fonds.',
}

export function documentLabel(value: string, locale?: unknown) {
  return resolveLanguage(locale) === 'fr' ? (french[value] ?? value) : value
}
