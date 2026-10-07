import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const modules = new Set([
  'identity',
  'settings',
  'media',
  'clients',
  'catalog',
  'sales',
  'reporting',
])
// Exact existing files only. Remove these exceptions when migrating the foundation.
const legacy = new Set(['src/modules/audit/writer.ts'])
const layers = {
  routes: ['controllers', 'schemas', 'types', 'middlewares'],
  controllers: ['services', 'mappers', 'schemas', 'types'],
  services: ['services', 'repositories', 'mappers', 'schemas', 'types', 'shared'],
  repositories: ['repositories', 'types', 'shared'],
  mappers: ['types', 'schemas'],
  schemas: ['types', 'schemas'],
  types: ['types'],
}
const relative = (filename) =>
  path.relative(root, filename).split(path.sep).join('/').replace(/\.js$/, '.ts')
const owner = (filename) =>
  filename
    .match(/^src\/(modules|support)\/([^/]+)\//)
    ?.slice(1)
    .join('/')
const layer = (filename) => filename.split('/').find((part) => Object.hasOwn(layers, part))
const publicEntry = (filename) =>
  /^src\/(modules|support)\/([^/]+)\/(index|\2\.public)\.ts$/.test(filename)

export default {
  rules: {
    boundaries: {
      meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}' } },
      create(context) {
        const from = relative(context.filename)
        const fromOwner = owner(from)
        const fromLayer = layer(from)
        const report = (node, reason) =>
          context.report({ node, messageId: 'boundary', data: { reason } })
        function check(node) {
          if (!node) return
          const specifier = node.value
          if (typeof specifier !== 'string') {
            report(node, 'Use a literal import path so architectural boundaries can be checked.')
            return
          }
          if (!specifier.startsWith('.')) {
            if (
              specifier.startsWith('#') ||
              specifier.startsWith('@/') ||
              path.isAbsolute(specifier)
            )
              report(node, 'Internal imports must use relative paths; aliases are not configured.')
            if (
              !legacy.has(from) &&
              fromOwner &&
              ((specifier === 'fastify' &&
                !['routes', 'controllers'].includes(fromLayer) &&
                !publicEntry(from)) ||
                (/^(drizzle-orm|postgres)(\/|$)/.test(specifier) && fromLayer !== 'repositories'))
            )
              report(
                node,
                'Keep HTTP dependencies in routes/controllers and database dependencies in repositories.',
              )
            return
          }
          const to = relative(path.resolve(path.dirname(context.filename), specifier))
          const toOwner = owner(to)
          const toLayer = layer(to)
          if (toOwner && toOwner !== fromOwner && !publicEntry(to)) {
            report(
              node,
              'Import another module only through its root index.ts or <module>.public.ts.',
            )
            return
          }
          if (/^src\/(lib|config|integrations)\//.test(from) && toOwner)
            report(
              node,
              'Shared infrastructure must not depend on business modules or support services.',
            )
          if (legacy.has(from)) return
          if (
            fromOwner &&
            fromLayer &&
            toOwner &&
            toOwner !== fromOwner &&
            fromLayer !== 'services' &&
            !/\.public\.ts$/.test(to)
          )
            report(
              node,
              'Cross-module runtime collaboration belongs in services, not HTTP or persistence layers.',
            )
          if (
            fromOwner &&
            fromLayer &&
            fromOwner === toOwner &&
            (publicEntry(to) || (toLayer && !layers[fromLayer].includes(toLayer)))
          )
            report(
              node,
              `Invalid layer dependency: ${fromLayer} cannot import ${toLayer ?? 'module entry points'}.`,
            )
          if (fromOwner && fromLayer !== 'repositories' && to.startsWith('db/schema/'))
            report(node, 'Only repositories may import database table definitions.')
          if (fromOwner && /^src\/(app|server)\.ts$/.test(to))
            report(node, 'Modules must not depend on the application composition root.')
        }
        return {
          Program(node) {
            const name = from.match(/^src\/modules\/([^/]+)\//)?.[1]
            if (name && !modules.has(name) && !legacy.has(from))
              report(
                node,
                'Use an approved module: identity, settings, clients, catalog, sales or reporting.',
              )
          },
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
          TSImportType: (node) => check(node.argument),
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require')
              check(node.arguments[0])
          },
        }
      },
    },
  },
}
