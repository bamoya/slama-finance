import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function componentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory()
      ? componentFiles(path)
      : path.endsWith('.tsx') && !path.endsWith('.test.tsx')
        ? [path]
        : []
  })
}

describe('theme-safe error colors', () => {
  it('never uses the destructive button background as a text color', () => {
    const offenders = componentFiles(resolve(process.cwd(), 'src')).filter((path) =>
      /text-(?:destructive\b|\[var\(--destructive\)\])/.test(readFileSync(path, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
