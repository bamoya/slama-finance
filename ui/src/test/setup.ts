import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import i18n from '../lib/i18n'

// Node's experimental Web Storage can shadow jsdom's global. Provide a fresh
// browser-compatible store per test without requiring a persistent disk file.
beforeEach(() => {
  // Existing behavioral assertions explicitly exercise English. Locale tests
  // switch to French and independently verify the production default.
  void i18n.changeLanguage('en')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      values.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      values.delete(String(key))
    },
    clear: () => values.clear(),
  } satisfies Storage)
})

// Browser APIs used by Radix controls but not provided by jsdom.
HTMLElement.prototype.hasPointerCapture = () => false
HTMLElement.prototype.setPointerCapture = () => {}
HTMLElement.prototype.releasePointerCapture = () => {}
HTMLElement.prototype.scrollIntoView = () => {}
window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
