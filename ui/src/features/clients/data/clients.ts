export type Client = {
  id: string
  name: string
  contact: string
  email: string | null
  phone: string
  ice: string
  city: string
  outstanding: number
  invoiced: number
  invoiceCount: number
  status: 'Active' | 'Archived'
  notifications: boolean
}

export const clients: Client[] = [
  {
    id: 'atlas-studio',
    name: 'Atlas Studio',
    contact: 'Salma Alaoui',
    email: 'finance@atlasstudio.ma',
    phone: '+212 522 45 67 80',
    ice: '001234567890123',
    city: 'Casablanca',
    outstanding: 12400,
    invoiced: 84000,
    invoiceCount: 12,
    status: 'Active',
    notifications: true,
  },
  {
    id: 'studio-budi',
    name: 'Studio Budi',
    contact: 'Amine Berrada',
    email: 'amine@studiobudi.ma',
    phone: '+212 661 22 91 40',
    ice: '002948167351908',
    city: 'Rabat',
    outstanding: 2800,
    invoiced: 31200,
    invoiceCount: 7,
    status: 'Active',
    notifications: true,
  },
  {
    id: 'amana',
    name: 'Amana SARL',
    contact: 'Nadia Tazi',
    email: null,
    phone: '+212 535 60 18 11',
    ice: '003728401956721',
    city: 'Fès',
    outstanding: 0,
    invoiced: 42700,
    invoiceCount: 9,
    status: 'Active',
    notifications: false,
  },
  {
    id: 'nour-trading',
    name: 'Nour Trading',
    contact: 'Mehdi Idrissi',
    email: 'accounting@nour.ma',
    phone: '+212 524 31 62 10',
    ice: '001172894501226',
    city: 'Marrakech',
    outstanding: 6200,
    invoiced: 19600,
    invoiceCount: 4,
    status: 'Archived',
    notifications: false,
  },
]
