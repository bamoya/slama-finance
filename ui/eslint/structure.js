import fs from 'node:fs'
import path from 'node:path'

export const BANNED_TOKENS = [
  'utils',
  'util',
  'helpers',
  'helper',
  'misc',
  'common',
  'stuff',
  'manager',
  'managers',
]
const GENERIC_PREFIX = 'admin|owner|app|main|base|my'
const GENERIC_NOUN =
  'table|layout|list|form|card|modal|button|dialog|header|sidebar|wrapper|container'
const GENERIC_NAME = new RegExp(`^(${GENERIC_PREFIX})-(${GENERIC_NOUN})$`)

/** Strip directories and every extension: "a/b/admin-table.test.tsx" -> "admin-table". */
const stem = (segment) => segment.split('.')[0]

export function namingProblem(segment) {
  const base = stem(segment)
  if (base.split('-').some((token) => BANNED_TOKENS.includes(token)))
    return `"${segment}" uses a banned catch-all name; name it after what it does`
  if (/-portal\.service\./.test(segment))
    return `"${segment}" is a *-portal.service; name the service after its capability`
  if (GENERIC_NAME.test(base))
    return `"${segment}" is a generic <prefix>-<noun> name; describe the content instead`
  return null
}

/**
 * Pure checker. `files` are POSIX paths relative to the scanned root (features/ or modules/),
 * e.g. "organization/identity/staff/pages/staff-page.tsx".
 * Returns [{ path, message }] for violations not covered by `exceptions`.
 */
export function findViolations(files, { layers, forbiddenLayers, exceptions = [] }) {
  const dirs = new Set()
  for (const file of files) {
    const parts = file.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const found = new Map()
  const add = (p, message) => found.has(p) || found.set(p, message)

  for (const entry of [...dirs, ...files]) {
    const name = entry.split('/').at(-1)
    const problem = namingProblem(name)
    if (problem) add(entry, problem)
  }
  const children = new Map()
  for (const dir of dirs) {
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
    children.set(parent, [...(children.get(parent) ?? []), dir.split('/').at(-1)])
  }
  const isLayer = (dir) => layers.includes(dir.split('/').at(-1))
  const hasLayerAncestor = (dir) =>
    dir
      .split('/')
      .slice(0, -1)
      .some((segment) => layers.includes(segment))
  for (const dir of dirs) {
    if (hasLayerAncestor(dir)) continue // anything goes inside a layer folder
    const name = dir.split('/').at(-1)
    const depth = dir.split('/').length
    if (depth >= 3 && forbiddenLayers.includes(name))
      add(dir, `"${name}" is not an allowed layer folder (allowed: ${layers.join(', ')})`)
    if (depth < 2 || isLayer(dir)) continue
    const names = children.get(dir) ?? []
    const layerChildren = names.filter((child) => layers.includes(child))
    const domainChildren = names.filter(
      (child) => !layers.includes(child) && !forbiddenLayers.includes(child),
    )
    if (layerChildren.length && domainChildren.length) {
      // Flag the minority group; ties flag the layer folders.
      const flagLayers = layerChildren.length <= domainChildren.length
      for (const child of flagLayers ? layerChildren : domainChildren)
        add(
          `${dir}/${child}`,
          `"${dir}" mixes layer folders (${layerChildren.join(', ')}) with domain folders (${domainChildren.join(', ')}); move layers into a domain subfolder`,
        )
    }
  }
  const covered = (p) => exceptions.some((e) => p === e.path || p.startsWith(`${e.path}/`))
  return [...found].filter(([p]) => !covered(p)).map(([p, message]) => ({ path: p, message }))
}

export function listFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(rel)
      else out.push(rel)
    }
  }
  walk('')
  return out
}

export const UI_LAYERS = ['pages', 'components', 'hooks', 'api', 'styles']
export const UI_FORBIDDEN_LAYERS = [
  'data',
  'lib',
  'services',
  'repositories',
  'controllers',
  'routes',
  'mappers',
  'types',
  'models',
  'store',
]

const LEGACY = 'legacy, pending refactor'
/** Paths are relative to ui/src/features. New violations must fail; shrink this list, never grow it. */
export const STRUCTURE_EXCEPTIONS = [
  { path: 'organization/catalog/data', reason: LEGACY },
  { path: 'organization/clients/data', reason: LEGACY },
  { path: 'organization/delivery-notes/data', reason: LEGACY },
  { path: 'organization/documents/data', reason: LEGACY },
  { path: 'organization/payments/data', reason: LEGACY },
  { path: 'organization/reports/lib', reason: LEGACY },
  {
    path: 'organization/sales/components',
    reason: `${LEGACY} (layer folder beside domain folders)`,
  },
  { path: 'organization/settings/document-templates/utils', reason: LEGACY },
  { path: 'platform/marketing/data', reason: LEGACY },
]

export const checkFeatures = (files, exceptions = STRUCTURE_EXCEPTIONS) =>
  findViolations(files, { layers: UI_LAYERS, forbiddenLayers: UI_FORBIDDEN_LAYERS, exceptions })
