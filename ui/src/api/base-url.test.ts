import { afterEach, describe, expect, it } from 'vitest'

import { configuredApiBaseUrl, resolveApiBaseUrl } from './base-url'

describe('API deployment origin', () => {
  afterEach(() => {
    delete window.__SLAMA_CONFIG__
  })
  it('prefers runtime configuration over build configuration', () => {
    window.__SLAMA_CONFIG__ = { apiBaseUrl: 'https://runtime.example.test' }
    expect(configuredApiBaseUrl('https://build.example.test')).toBe('https://runtime.example.test')
  })
  it('preserves explicit same-origin runtime configuration', () => {
    window.__SLAMA_CONFIG__ = { apiBaseUrl: '' }
    expect(configuredApiBaseUrl('https://build.example.test')).toBe('')
  })
  it('falls back to development configuration without a runtime value', () => {
    window.__SLAMA_CONFIG__ = {}
    expect(configuredApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })
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
