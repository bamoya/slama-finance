import ts from 'typescript'
import { expect, it } from 'vitest'

const sources = import.meta.glob<string>(['../../features/**/*.tsx', '../management/**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

it('keeps action sizing and typography in the shared button variants', () => {
  const violations: string[] = []
  const forbidden =
    /(?:^|\s)(?:h-\d|min-h-\d|size-\d|p[xytrbl]?-\d|font-|text-(?:xs|sm|base|lg)|rounded-|bg-|border-\[)/
  for (const [path, source] of Object.entries(sources)) {
    if (path.includes('.test.')) continue
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const check = (node: ts.Node, value: string) => {
      if (forbidden.test(value))
        violations.push(
          `${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: use variant/size instead of ${value}`,
        )
    }
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(file) === 'Button'
      ) {
        const attr = node.attributes.properties.find(
          (attr) => ts.isJsxAttribute(attr) && attr.name.getText(file) === 'className',
        )
        if (
          attr &&
          ts.isJsxAttribute(attr) &&
          attr.initializer &&
          ts.isStringLiteral(attr.initializer)
        )
          check(attr, attr.initializer.text)
      }
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'buttonVariants') {
        const options = node.arguments[0]
        if (options && ts.isObjectLiteralExpression(options))
          for (const prop of options.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name.getText(file) === 'className' &&
              ts.isStringLiteral(prop.initializer)
            )
              check(prop, prop.initializer.text)
          }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  expect(violations).toEqual([])
})
