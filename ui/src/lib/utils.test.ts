import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('Density utility overrides', () => {
  it.each([
    ['h-control', 'h-10'],
    ['size-action', 'size-10'],
    ['p-panel', 'p-4'],
    ['px-panel', 'px-4'],
    ['gap-section', 'gap-2'],
    ['rounded-control', 'rounded-full'],
  ])('merges %s and %s in either direction', (token, override) => {
    expect(cn(token, override)).toBe(override)
    expect(cn(override, token)).toBe(token)
  })
})
