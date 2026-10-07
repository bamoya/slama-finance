export type PaymentMethod = 'Cash' | 'Bank transfer' | 'Cheque'

export type Payment = {
  id: string
  number: string
  invoice: string
  client: string
  date: string
  amount: number
  method: PaymentMethod
  reference: string
  status: 'Received' | 'Pending'
}

export const payments: Payment[] = [
  {
    id: 'pay-0018',
    number: 'PAY-0018',
    invoice: 'INV-0048',
    client: 'Atlas Studio',
    date: '21 Sep 2026',
    amount: 3000,
    method: 'Bank transfer',
    reference: 'VIR-0921-ATLAS',
    status: 'Received',
  },
  {
    id: 'pay-0017',
    number: 'PAY-0017',
    invoice: 'INV-0048',
    client: 'Atlas Studio',
    date: '18 Sep 2026',
    amount: 2000,
    method: 'Cheque',
    reference: 'CHQ-448921',
    status: 'Pending',
  },
  {
    id: 'pay-0016',
    number: 'PAY-0016',
    invoice: 'INV-0047',
    client: 'Studio Budi',
    date: '12 Sep 2026',
    amount: 1000,
    method: 'Cash',
    reference: 'CASH-0912',
    status: 'Received',
  },
  {
    id: 'pay-0015',
    number: 'PAY-0015',
    invoice: 'INV-0044',
    client: 'Nour Trading',
    date: '02 Sep 2026',
    amount: 6400,
    method: 'Bank transfer',
    reference: 'VIR-0902-NOUR',
    status: 'Received',
  },
]
