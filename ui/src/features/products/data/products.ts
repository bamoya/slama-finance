import { translate } from '../../../lib/i18n'
export type Product = {
  id: string
  name: string
  description: string
  reference: string
  category: string
  unit: string
  price: number
  status: 'Active' | 'Archived'
}

// Sales-document POC data only. Catalog management uses the API; these screens
// are not persisted yet. Each entry represents one fixed-weight package.
export const products: Product[] = [
  {
    id: 'wheat-100',
    name: 'Premium wheat · 100 g',
    get description() {
      return translate('One 100 g package of premium wheat.')
    },
    reference: 'WHT-001 / 100 g',
    category: 'Grains',
    unit: '100 g package',
    price: 18,
    status: 'Active',
  },
  {
    id: 'wheat-500',
    name: 'Premium wheat · 500 g',
    get description() {
      return translate('One 500 g package of premium wheat.')
    },
    reference: 'WHT-001 / 500 g',
    category: 'Grains',
    unit: '500 g package',
    price: 75,
    status: 'Active',
  },
  {
    id: 'flour-1000',
    name: 'Soft wheat flour · 1 kg',
    get description() {
      return translate('One 1 kg package of flour.')
    },
    reference: 'FLR-001 / 1 kg',
    category: 'Flour',
    unit: '1 kg package',
    price: 28,
    status: 'Active',
  },
  {
    id: 'flour-2000',
    name: 'Soft wheat flour · 2 kg',
    get description() {
      return translate('One 2 kg package of flour.')
    },
    reference: 'FLR-001 / 2 kg',
    category: 'Flour',
    unit: '2 kg package',
    price: 50,
    status: 'Archived',
  },
]

export const formatMoney = (amount: number) =>
  new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 0,
  }).format(amount)
