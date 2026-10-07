import { describe, expect, it } from 'vitest'

import { resolveApiBaseUrl } from './base-url'

describe('API deployment origin', () => {
  it('never defaults a production bundle to the visitor’s localhost', () => {
    expect(resolveApiBaseUrl(undefined, true)).toBe('')
    expect(resolveApiBaseUrl(undefined, false)).toBe('http://localhost:3000')
  })
  it('honors explicit same-origin and separate API origins', () => {
    expect(resolveApiBaseUrl('', false)).toBe('')
    expect(resolveApiBaseUrl('/', true)).toBe('')
    expect(resolveApiBaseUrl('https://api.example.test/', true)).toBe('https://api.example.test')
  })
})
