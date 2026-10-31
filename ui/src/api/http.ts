import axios, { type AxiosRequestConfig } from 'axios'

import { ApiError, decodeApiError } from '../lib/api-error'
import { validateResponse } from './generated/schemas/responses'

/** Browser calls always target the current origin; generated paths already start with /api/v1. */
const apiBaseUrl = ''

export const httpClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
  // OpenAPI form/explode arrays are repeated keys, not PHP-style sections[].
  paramsSerializer: { indexes: null },
  transformResponse: [(data: unknown) => data],
})

/** Shared Orval mutator: feature requests use this or generated API functions. */
export async function apiRequest<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  const request = { ...config, ...options }
  const path = request.url ?? ''
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new Error('API paths must be relative to the configured API')
  try {
    const response = await httpClient.request({
      ...request,
      baseURL: apiBaseUrl,
      withCredentials: true,
      validateStatus: () => true,
    })
    let data: unknown = response.status === 204 ? undefined : response.data
    if (
      (response.status < 200 || response.status >= 300) &&
      typeof Blob !== 'undefined' &&
      data instanceof Blob
    ) {
      // Binary downloads still return the standard JSON envelope on failure.
      // Bound parsing so an upstream HTML/download error cannot consume unbounded memory.
      const blob = data
      data =
        blob.size <= 65_536
          ? await (typeof blob.text === 'function'
              ? blob.text()
              : new Promise<string>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = () => resolve(String(reader.result ?? ''))
                  reader.onerror = () => reject(reader.error)
                  reader.readAsText(blob)
                }))
          : undefined
    }
    if (typeof data === 'string') {
      try {
        data = data ? JSON.parse(data) : undefined
      } catch {
        if (response.status >= 200 && response.status < 300)
          throw new ApiError(
            response.status,
            'INVALID_RESPONSE',
            'The server returned an unexpected response.',
          )
        data = undefined
      }
    }
    if (
      response.status === 401 &&
      !path.startsWith('/api/v1/auth/') &&
      !path.startsWith('/api/v1/organization-auth/') &&
      !path.startsWith('/api/v1/owner-auth/') &&
      !path.startsWith('/api/v1/owner/') &&
      !path.startsWith('/api/v1/admin/') &&
      !path.startsWith('/api/v1/public/') &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event('slama:session-expired'))
    if (
      (response.status === 403 || response.status === 402) &&
      data &&
      typeof data === 'object' &&
      'code' in data &&
      (data.code === 'ORGANIZATION_SUSPENDED' || data.code === 'SUBSCRIPTION_EXPIRED') &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event('slama:organization-unavailable'))
    if (response.status < 200 || response.status >= 300)
      throw decodeApiError(response.status, data, response.headers['x-request-id'])
    if (request.responseType === 'blob') return data as T
    try {
      return validateResponse(request.method ?? 'GET', path, response.status, data) as T
    } catch {
      throw new ApiError(
        response.status,
        'INVALID_RESPONSE',
        'The server returned an unexpected response.',
      )
    }
  } catch (error) {
    if (error instanceof ApiError || axios.isCancel(error)) throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection.')
  }
}

export type ErrorType<_T> = ApiError
