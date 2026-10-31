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

it('starts directly with the current schema and has no historical upgrade migrations', () => {
  const journal = JSON.parse(
    readFileSync(new URL('../db/migrations/meta/_journal.json', import.meta.url), 'utf8'),
  )
  expect(journal.entries.map((entry: { tag: string }) => entry.tag)).toEqual([
    '0000_initial_schema',
  ])
  const baseline = readFileSync(
    new URL('../db/migrations/0000_initial_schema.sql', import.meta.url),
    'utf8',
  )
  expect(baseline).not.toMatch(
    /ALTER TABLE[^;]+(?:ADD COLUMN|DROP COLUMN|ALTER COLUMN|DROP CONSTRAINT)/i,
  )
  expect(baseline).not.toContain('legacy_company_binding')
  expect(baseline).not.toMatch(/^UPDATE\s/im)
})
