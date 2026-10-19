import { describe, expect, it, vi } from 'vitest'

import { createImpactConfirmation } from '../src/lib/impact-confirmation.js'

describe('impact confirmation tokens', () => {
  it('binds the preview to its full graph and actor, and rejects forged tokens', () => {
    const confirmation = createImpactConfirmation()
    const graph = { actor: 'one', ids: ['invoice'], payments: [{ id: 'payment', version: 2 }] }
    const { token } = confirmation.issue(graph)
    expect(() => confirmation.assert(token, graph)).not.toThrow()
    expect(() => confirmation.assert(token, { ...graph, actor: 'two' })).toThrow()
    expect(() => confirmation.assert(token, { ...graph, payments: [] })).toThrow()
    expect(() => confirmation.assert(`${token}x`, graph)).toThrow()
    expect(() => createImpactConfirmation().assert(token, graph)).toThrow()
  })
  it('expires after five minutes', () => {
    vi.useFakeTimers()
    try {
      const confirmation = createImpactConfirmation()
      const { token } = confirmation.issue({})
      vi.advanceTimersByTime(300_001)
      expect(() => confirmation.assert(token, {})).toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})
