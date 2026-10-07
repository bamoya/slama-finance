import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { expect, it } from 'vitest'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

it('keeps every feature pagination inside its section or collapsible table container', () => {
  const violations: string[] = []
  for (const file of files('src/features').filter(
    (file) => file.endsWith('.tsx') && !file.includes('.test.'),
  )) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    function visit(node: ts.Node) {
      if (
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(source) === 'DataTablePagination'
      ) {
        let parent = node.parent
        while (
          parent &&
          !(
            ts.isJsxElement(parent) &&
            ['section', 'details'].includes(parent.openingElement.tagName.getText(source))
          )
        )
          parent = parent.parent
        if (!parent) violations.push(file)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(violations).toEqual([])
})

it('does not render a duplicate product or category footer counter', () => {
  for (const page of ['products', 'categories']) {
    const source = readFileSync(`src/features/products/pages/${page}-page.tsx`, 'utf8')
    expect(source).not.toMatch(/t\('count(?:Products|Categories)'/)
  }
})
