import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import SwaggerParser from '@apidevtools/swagger-parser'
import YAML from 'yaml'

const apiRoot = path.resolve(import.meta.dirname, '..')
const annotations = [
  'title',
  'description',
  'example',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'externalDocs',
  '$schema',
  '$id',
]
const keywords = new Set([
  ...annotations,
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'const',
  'enum',
  'format',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'default',
  'anyOf',
])

/** Deliberately bounded compiler: unsupported validation must fail generation. */
export function compileSchema(schema, { query = false } = {}) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new Error('Expected a resolved schema object')
  for (const key of Object.keys(schema))
    if (!keywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`)
  if (schema.anyOf) {
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length < 2)
      throw new Error('anyOf requires at least two schemas')
    for (const key of Object.keys(schema))
      if (key !== 'anyOf' && !annotations.includes(key))
        throw new Error(`Unsupported anyOf sibling keyword: ${key}`)
    return `z.union([${schema.anyOf.map((branch) => compileSchema(branch, { query })).join(', ')}])`
  }
  let result
  if (Array.isArray(schema.type)) {
    const { default: fallback, enum: values, const: constant, ...rest } = schema
    result = `z.union([${schema.type.map((type) => compileSchema({ ...rest, type }, { query })).join(', ')}])`
    if (values)
      result += `.refine((value): value is ${values.map((value) => JSON.stringify(value)).join(' | ')} => ${JSON.stringify(values)}.includes(value), "Invalid enum value")`
    if (constant !== undefined)
      result += `.refine((value): value is ${JSON.stringify(constant)} => value === ${JSON.stringify(constant)}, "Unexpected constant")`
    return fallback === undefined ? result : `${result}.default(${JSON.stringify(fallback)})`
  }
  const kind = schema.type ?? (schema.properties ? 'object' : undefined)
  switch (kind) {
    case 'null':
      result = 'z.null()'
      break
    case 'string': {
      result = 'z.string()'
      for (const [keyword, method] of [
        ['minLength', 'min'],
        ['maxLength', 'max'],
      ])
        if (schema[keyword] !== undefined) result += `.${method}(${schema[keyword]})`
      if (schema.pattern) result += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`
      if (schema.format) {
        const formats = {
          uuid: '.uuid()',
          date: '.date()',
          email: '.email()',
          'date-time': '.datetime({ offset: true })',
          uri: '.url()',
        }
        if (!formats[schema.format]) throw new Error(`Unsupported string format: ${schema.format}`)
        result += formats[schema.format]
      }
      break
    }
    case 'integer':
    case 'number':
      result = kind === 'integer' ? 'z.number().int()' : 'z.number()'
      for (const [keyword, method] of [
        ['minimum', 'min'],
        ['maximum', 'max'],
        ['exclusiveMinimum', 'gt'],
        ['exclusiveMaximum', 'lt'],
      ])
        if (schema[keyword] !== undefined) result += `.${method}(${schema[keyword]})`
      break
    case 'boolean':
      result = query
        ? "z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean())"
        : 'z.boolean()'
      break
    case 'array':
      result = `z.array(${compileSchema(schema.items)})`
      for (const [keyword, method] of [
        ['minItems', 'min'],
        ['maxItems', 'max'],
      ])
        if (schema[keyword] !== undefined) result += `.${method}(${schema[keyword]})`
      if (schema.uniqueItems)
        result +=
          '.refine(value => new Set(value.map(item => JSON.stringify(item))).size === value.length, "Items must be unique")'
      break
    case 'object': {
      const fields = Object.entries(schema.properties ?? {}).map(([name, value]) => {
        let expression = compileSchema(value, { query })
        // Defaults describe parsed output. Optional inputs with defaults are not optional outputs.
        if (!(schema.required ?? []).includes(name) && value.default === undefined)
          expression += '.optional()'
        return `${JSON.stringify(name)}: ${expression}`
      })
      result = `z.object({${fields.join(',\n')}})`
      if (schema.additionalProperties === false) result += '.strict()'
      else if (typeof schema.additionalProperties === 'object')
        result += `.catchall(${compileSchema(schema.additionalProperties)})`
      else result += '.passthrough()'
      for (const [keyword, comparison] of [
        ['minProperties', '>='],
        ['maxProperties', '<='],
      ])
        if (schema[keyword] !== undefined)
          result += `.refine(value => Object.keys(value).length ${comparison} ${schema[keyword]}, ${JSON.stringify(`${keyword}: ${schema[keyword]}`)})`
      break
    }
    default:
      throw new Error(`Unsupported or missing schema type: ${kind}`)
  }
  if (schema.const !== undefined)
    result += `.refine((value): value is ${JSON.stringify(schema.const)} => value === ${JSON.stringify(schema.const)}, "Unexpected constant")`
  if (schema.enum)
    result += `.refine((value): value is ${schema.enum.map((value) => JSON.stringify(value)).join(' | ')} => ${JSON.stringify(schema.enum)}.includes(value), "Invalid enum value")`
  if (schema.default !== undefined) result += `.default(${JSON.stringify(schema.default)})`
  if (query && ['integer', 'number'].includes(kind))
    result = `z.preprocess(value => typeof value === 'string' && /^\\d+$/.test(value) ? Number(value) : value, ${result})`
  return result
}

const pascal = (value) => value[0].toUpperCase() + value.slice(1)
function group(ref) {
  const match = ref.match(
    /^\.\/(?:modules\/)?((?:identity|settings|media|catalog|clients|sales|reporting|shared)\/[a-z-]+)\.yaml#/,
  )
  if (!match) throw new Error(`Contract must reference an approved module/shared file: ${ref}`)
  return match[1]
}
export async function generateContracts({
  input = path.join(apiRoot, 'openapi/openapi.yaml'),
  output = path.join(apiRoot, 'src/contracts/generated'),
} = {}) {
  const source = YAML.parse(await readFile(input, 'utf8'))
  await SwaggerParser.validate(input)
  const document = await SwaggerParser.dereference(input)
  const files = new Map()
  const responseValidators = []
  const add = (destination, name, schema, options) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
      throw new Error(`Invalid contract identifier: ${name}`)
    const entries = files.get(destination) ?? []
    entries.push(
      `export const ${name}Schema = ${compileSchema(schema, options)}\nexport type ${pascal(name)} = z.infer<typeof ${name}Schema>\n`,
    )
    files.set(destination, entries)
  }
  for (const [name, reference] of Object.entries(source.components.schemas))
    add(group(reference.$ref), name, document.components.schemas[name])
  for (const [url, item] of Object.entries(document.paths)) {
    const destination = group(source.paths[url].$ref)
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      operation.tags = [destination.split('/')[0]]
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        const schema = response.content?.['application/json']?.schema
        if (/^2\d\d$/.test(status) && schema) {
          const pattern =
            '^' +
            url
              .split('/')
              .map((part) =>
                part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              )
              .join('/') +
            '$'
          responseValidators.push(
            `{ method: ${JSON.stringify(method.toUpperCase())}, path: new RegExp(${JSON.stringify(pattern)}), status: ${status}, schema: ${compileSchema(schema)} }`,
          )
        }
      }
      for (const location of ['path', 'query']) {
        const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])].filter(
          (parameter) => parameter.in === location,
        )
        if (!parameters.length) continue
        const schema = { type: 'object', additionalProperties: false, properties: {}, required: [] }
        for (const parameter of parameters) {
          schema.properties[parameter.name] = parameter.schema
          if (parameter.required) schema.required.push(parameter.name)
        }
        add(
          destination,
          `${operation.operationId}${location === 'path' ? 'Params' : 'Query'}`,
          schema,
          { query: location === 'query' },
        )
      }
    }
  }
  // Compile everything before writing so unsupported contracts do not leave partially generated output.
  for (const [destination, entries] of files) {
    const target = path.join(output, `${destination}.schemas.ts`)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(
      target,
      `// Generated from OpenAPI. DO NOT EDIT.\nimport { z } from 'zod'\n\n${entries.join('\n')}`,
    )
  }
  await writeFile(path.join(output, 'openapi.json'), JSON.stringify(document, null, 2))
  await writeFile(
    path.join(output, 'responses.ts'),
    `// Generated from OpenAPI. DO NOT EDIT.\nimport { z } from 'zod'\nconst responses = [${responseValidators.join(',\n')}]\nexport function validateResponse(method: string, path: string, status: number, data: unknown): unknown {\n const response = responses.find(item => item.method === method.toUpperCase() && item.status === status && item.path.test(path.split('?')[0]!))\n return response ? response.schema.parse(data) : data\n}\n`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ui = process.argv.includes('--ui')
  await generateContracts(
    ui
      ? {
          input: path.join(apiRoot, '../ui/openapi/openapi.yaml'),
          output: path.join(apiRoot, '../ui/src/api/generated/schemas'),
        }
      : {},
  )
}
