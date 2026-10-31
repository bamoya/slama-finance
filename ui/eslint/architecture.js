import path from 'node:path'

export default {
  rules: {
    boundaries: {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          public: 'Import another feature through its public index.ts, not its internal files.',
          generated:
            'A feature must use its own generated API module. Use the owning feature public API for cross-module workflows.',
        },
      },
      create(context) {
        const file = context.filename.replaceAll('\\', '/')
        const owner =
          file.match(/\/features\/(?:platform|organization)\/([^/]+)\//)?.[1] ??
          file.match(/\/features\/([^/]+)\//)?.[1]
        function check(node, source) {
          if (typeof source?.value !== 'string' || !source.value.startsWith('.')) return
          const target = path.resolve(path.dirname(file), source.value).replaceAll('\\', '/')
          const feature = target.match(/\/features\/(?:platform|organization)\/([^/]+)(?:\/(.*))?$/)
          if (
            feature &&
            feature[1] !== owner &&
            !(file.includes('/features/platform/') && target.includes('/features/platform/')) &&
            feature[2] &&
            !/^index(?:\.tsx?)?$/.test(feature[2])
          )
            context.report({ node, messageId: 'public' })
          const generated = target.match(
            /\/api\/generated\/(?:schemas\/)?(identity|settings|media|catalog|clients|sales|reporting|subscriptions)\//,
          )?.[1]
          const generatedOwner = { products: 'catalog', reports: 'reporting' }[owner] ?? owner
          if (
            owner &&
            generated &&
            generatedOwner !== generated &&
            !(
              file.includes('/features/platform/') &&
              ['identity', 'subscriptions'].includes(generated)
            )
          )
            context.report({ node, messageId: 'generated' })
        }
        return {
          ImportDeclaration(node) {
            check(node, node.source)
          },
          ExportNamedDeclaration(node) {
            check(node, node.source)
          },
          ExportAllDeclaration(node) {
            check(node, node.source)
          },
          ImportExpression(node) {
            check(node, node.source)
          },
        }
      },
    },
  },
}
