import { describe, expect, it } from 'vitest'

import { buildActivityTree, filterActivityTree } from './activity-tree-model'

const estimate = {
  id: 'e1',
  number: 'DEV-1',
  issueDate: '2026-01-01',
  status: 'accepted' as const,
  total: '100',
  currency: 'MAD',
}
const invoice = {
  id: 'i1',
  number: 'FAC-1',
  issueDate: '2026-02-01',
  status: 'issued' as const,
  total: '100',
  currency: 'MAD',
  outstandingAmount: '50',
  paymentStatus: 'partial' as const,
  sourceEstimateId: 'e1',
  deliveryNoteIds: ['d1'],
}
const delivery = {
  id: 'd1',
  number: 'BL-1',
  invoiceId: 'i1',
  invoices: [],
  deliveryDate: '2026-02-02',
  status: 'delivered' as const,
}
const payment = {
  id: 'p1',
  number: 'PAY-1',
  invoiceId: 'i1',
  paymentDate: '2026-03-01',
  status: 'confirmed' as const,
  amount: '50',
  currency: 'MAD',
  method: 'cash' as const,
}

describe('Client activity relationships', () => {
  it('filters each record type independently while keeping ancestor context', () => {
    const tree = buildActivityTree(
      [estimate],
      [invoice],
      [delivery],
      [payment, { ...payment, id: 'p2', status: 'pending' }],
    )
    const filtered = filterActivityTree(tree, {
      search: '',
      from: '',
      to: '',
      estimateStatus: 'accepted',
      invoiceStatus: 'issued',
      paymentStatus: 'confirmed',
      deliveryStatus: 'prepared',
    })
    expect(filtered[0]?.id).toBe('e1')
    expect(filtered[0]?.children[0]?.children.map((node) => node.id)).toEqual(['p1'])
    const paymentsOnly = filterActivityTree(tree, {
      search: '',
      from: '',
      to: '',
      paymentStatus: 'pending',
    })
    expect(paymentsOnly[0]?.children[0]?.children.map((node) => node.id)).toEqual(['d1', 'p2'])
  })
  it('supports multiple invoices per estimate and their own payments and deliveries', () => {
    const tree = buildActivityTree(
      [estimate],
      [invoice, { ...invoice, id: 'i2', number: 'FAC-2', deliveryNoteIds: [] }],
      [delivery],
      [payment],
    )
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children.map((node) => node.id)).toEqual(['i1', 'i2'])
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual(['d1', 'p1'])
    expect(tree[0]?.children[0]?.outstanding).toBe('50 MAD')
    expect(tree[0]?.children[1]?.children).toEqual([])
  })
  it('retains standalone records and never creates inaccessible parents', () => {
    const tree = buildActivityTree([], [], [delivery], [payment])
    expect(tree.map((node) => node.id)).toEqual(['p1', 'd1'])
    expect(JSON.stringify(tree)).not.toContain('/invoices/')
  })
  it('marks shared deliveries as references without duplicating payment amounts', () => {
    const tree = buildActivityTree([], [invoice, { ...invoice, id: 'i2' }], [delivery], [payment])
    expect(tree.every((node) => node.children.find((child) => child.id === 'd1')?.reference)).toBe(
      true,
    )
    expect(
      tree.flatMap((node) => node.children).filter((node) => node.kind === 'payment'),
    ).toHaveLength(1)
  })
  it('keeps ancestors when only a descendant matches combined filters', () => {
    const tree = buildActivityTree([estimate], [invoice], [delivery], [payment])
    const filtered = filterActivityTree(tree, {
      search: 'pay-1',
      paymentStatus: 'confirmed',
      from: '2026-03-01',
      to: '2026-03-01',
    })
    expect(filtered[0]?.id).toBe('e1')
    expect(filtered[0]?.children[0]?.children.map((node) => node.id)).toEqual(['p1'])
    expect(tree[0]?.children[0]?.children).toHaveLength(2)
    expect(filterActivityTree(tree, { search: 'missing', from: '', to: '' })).toEqual([])
  })
})
