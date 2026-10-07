import { describe, expect, it, vi } from 'vitest'

import { collectActivityPages } from './use-client-activity'

describe('Activity pagination', () => {
  it('loads beyond the first page instead of presenting a truncated tree', async () => {
    const load = vi.fn(async (offset: number) => ({
      items: Array.from({ length: offset === 0 ? 100 : 5 }, (_, index) => offset + index),
      total: 105,
    }))
    expect(await collectActivityPages(load)).toHaveLength(105)
    expect(load.mock.calls).toEqual([[0], [100]])
  })
  it('propagates a later-page failure instead of presenting incomplete relationships', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], total: 2 })
      .mockRejectedValueOnce(new Error('offline'))
    await expect(collectActivityPages(load)).rejects.toThrow('offline')
  })
})
