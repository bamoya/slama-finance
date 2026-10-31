export type SalesDocument = {
  id: string
  number: string
  kind: 'Invoice' | 'Estimate'
  client: string
  issued: string
  due: string
  total: number
  paidAmount?: number
  status: string
}
export const invoices: SalesDocument[] = [
  {
    id: 'inv-0047',
    number: 'INV-0047',
    kind: 'Invoice',
    client: 'Studio Budi',
    issued: '04 Sep 2026',
    due: '19 Sep 2026',
    total: 2800,
    paidAmount: 1000,
    status: 'Partially paid',
  },
  {
    id: 'inv-0048',
    number: 'INV-0048',
    kind: 'Invoice',
    client: 'Atlas Studio',
    issued: '12 Sep 2026',
    due: '27 Sep 2026',
    total: 14200,
    paidAmount: 5000,
    status: 'Sent',
  },
  {
    id: 'inv-0049',
    number: 'INV-0049',
    kind: 'Invoice',
    client: 'Amana SARL',
    issued: '17 Sep 2026',
    due: '02 Oct 2026',
    total: 8900,
    paidAmount: 0,
    status: 'Draft',
  },
  {
    id: 'inv-0044',
    number: 'INV-0044',
    kind: 'Invoice',
    client: 'Nour Trading',
    issued: '20 Aug 2026',
    due: '04 Sep 2026',
    total: 6400,
    paidAmount: 6400,
    status: 'Paid',
  },
]
export const estimates: SalesDocument[] = [
  {
    id: 'est-0028',
    number: 'EST-0028',
    kind: 'Estimate',
    client: 'Atlas Studio',
    issued: '14 Sep 2026',
    due: '28 Sep 2026',
    total: 16800,
    status: 'Accepted',
  },
  {
    id: 'est-0029',
    number: 'EST-0029',
    kind: 'Estimate',
    client: 'Amana SARL',
    issued: '17 Sep 2026',
    due: '01 Oct 2026',
    total: 8900,
    status: 'Sent',
  },
  {
    id: 'est-0030',
    number: 'EST-0030',
    kind: 'Estimate',
    client: 'Studio Budi',
    issued: '20 Sep 2026',
    due: '04 Oct 2026',
    total: 4200,
    status: 'Draft',
  },
]
