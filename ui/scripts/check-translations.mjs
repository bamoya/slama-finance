import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const exports = {}
new Function(
  'exports',
  ts.transpileModule(fs.readFileSync(path.join(root, 'lib/locales/fr.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(exports)
const catalog = exports.french
const missing = new Set()
const placeholders = (value) => (value.match(/\{\{[^}]+\}\}/g) ?? []).sort().join(',')
for (const [source, translated] of Object.entries(catalog)) {
  if (placeholders(source) !== placeholders(translated)) {
    missing.add(`Interpolation mismatch: ${source}`)
  }
}
function check(phrase, file) {
  if (/[A-Za-z]/.test(phrase) && !Object.hasOwn(catalog, phrase)) {
    missing.add(`${path.relative(root, file)}: ${phrase}`)
  }
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!['generated', 'locales', 'test'].includes(entry.name)) walk(file)
      continue
    }
    if (!/\.tsx?$/.test(file) || /\.(test|spec)\./.test(file)) continue
    const tree = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const initializers = new Map()
    function scan(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        initializers.set(node.name.getText(tree), node.initializer)
      }
      ts.forEachChild(node, scan)
    }
    scan(tree)
    function values(node, seen = new Set()) {
      if (!node || seen.has(node)) return
      seen.add(node)
      if (ts.isStringLiteral(node)) check(node.text, file)
      else if (ts.isPropertyAssignment(node)) values(node.initializer, seen)
      else if (ts.isIdentifier(node)) values(initializers.get(node.text), seen)
      else if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
        values(node.expression, seen)
      else if (ts.isConditionalExpression(node)) {
        values(node.whenTrue, seen)
        values(node.whenFalse, seen)
      } else if (ts.isObjectLiteralExpression(node))
        node.properties.forEach((value) => values(value, seen))
    }
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(tree)
        if (name === 'registerTranslations') values(node.arguments[1])
        if (name === 'translate') values(node.arguments[0])
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
}
walk(root)
if (missing.size) {
  console.error([...missing].join('\n'))
  process.exitCode = 1
} else console.log('French catalog coverage and interpolation checks passed.')
