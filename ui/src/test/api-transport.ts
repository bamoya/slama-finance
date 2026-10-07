import type { AxiosRequestConfig } from 'axios'

import document from '../api/generated/schemas/openapi.json'

/** Mock only the transport: generated request builders, keys and hooks stay real. */
export function routeApiRequest(mocks: Record<string, (...args: never[]) => unknown>) {
  return async (config: AxiosRequestConfig, options?: AxiosRequestConfig) => {
    for (const [path, item] of Object.entries(document.paths)) {
      const match = new RegExp('^' + path.replace(/\{[^}]+\}/g, '([^/]+)') + '$').exec(
        config.url ?? '',
      )
      if (!match) continue
      const operation = (item as Record<string, { operationId: string }>)[
        (config.method ?? 'GET').toLowerCase()
      ]
      if (!operation) continue
      if (operation.operationId === 'downloadMedia') return new Blob(['png'], { type: 'image/png' })
      const mock = mocks[operation.operationId]
      if (!mock) throw new Error(`Unhandled API operation: ${operation.operationId}`)
      const args: unknown[] = match.slice(1)
      if (config.data !== undefined) args.push(config.data)
      if (config.params !== undefined) args.push(config.params)
      if (operation.operationId === 'listStaff' || operation.operationId === 'getStaff')
        args.push({ signal: config.signal })
      if (operation.operationId === 'uploadMedia') args.push(options)
      return mock(...(args as never[]))
    }
    throw new Error(`Unhandled API URL: ${config.url}`)
  }
}
