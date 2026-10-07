import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

it('keeps migration timestamps increasing so upgrades do not silently skip migrations', () => {
  const journal = JSON.parse(
    readFileSync(new URL('../db/migrations/meta/_journal.json', import.meta.url), 'utf8'),
  ) as { entries: { tag: string; when: number }[] }
  for (let index = 1; index < journal.entries.length; index++) {
    const current = journal.entries[index]!
    expect(current.when, current.tag).toBeGreaterThan(journal.entries[index - 1]!.when)
  }
})
