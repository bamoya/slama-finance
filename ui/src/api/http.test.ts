import { QueryClient } from '@tanstack/react-query'
import { type AxiosAdapter, AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { login } from '../features/identity/auth/api/auth-client'
import { ApiError, shouldRetryQuery } from '../lib/api-error'
import { getListStaffQueryOptions } from './generated/identity/identity'
import { downloadMedia } from './generated/media/media'
import { healthCheck } from './generated/shared/shared'
import { apiRequest, httpClient } from './http'

function mockResponse(data: unknown, status = 200, headers = {}) {
  const adapter = vi.fn<AxiosAdapter>(async (config) => ({
    data,
    status,
    headers,
    statusText: '',
    config,
  }))
  vi.spyOn(httpClient.defaults, 'adapter', 'get').mockReturnValue(adapter)
  return adapter
}

describe('shared Axios transport', () => {
  it('serializes array filters using repeated OpenAPI query keys', () => {
    const url = new URL(
      httpClient.getUri({
        url: '/v1/reports/analysis',
        params: { sections: ['revenue', 'collections'] },
      }),
    )
    expect(url.searchParams.getAll('sections')).toEqual(['revenue', 'collections'])
    expect(url.searchParams.has('sections[]')).toBe(false)
  })
  it('validates generated query results before they enter the cache', async () => {
    mockResponse('{"items": "invalid"}')
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const options = getListStaffQueryOptions({ page: 1, pageSize: 25 })
    await expect(cache.fetchQuery(options)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(cache.getQueryData(options.queryKey)).toBeUndefined()
    cache.clear()
  })
  it('generates distinct keys for paginated queries and forwards cancellation', async () => {
    const adapter = mockResponse(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 25 }))
    const first = getListStaffQueryOptions({ page: 1, pageSize: 25 })
    const second = getListStaffQueryOptions({ page: 2, pageSize: 25 })
    expect(first.queryKey).not.toEqual(second.queryKey)
    const cache = new QueryClient()
    await cache.fetchQuery(first)
    expect(adapter.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal)
    expect(cache.getQueryData(first.queryKey)).toMatchObject({ items: [] })
    cache.clear()
  })
  it('uses the generated binary download contract without JSON validation', async () => {
    const blob = new Blob(['image'], { type: 'image/png' })
    const adapter = mockResponse(blob)
    expect(await downloadMedia('11111111-1111-4111-8111-111111111111')).toBe(blob)
    expect(adapter.mock.calls[0]?.[0].responseType).toBe('blob')
  })
  it('routes generated calls through the configured instance', async () => {
    const adapter = mockResponse('{"status":"ok"}')
    expect(await healthCheck()).toEqual({ status: 'ok' })
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      baseURL: 'http://localhost:3000',
      url: '/health',
      withCredentials: true,
      timeout: 15_000,
    })
  })
  it('decodes download errors without masking permission and export-limit failures', async () => {
    for (const [status, code] of [
      [403, 'FORBIDDEN'],
      [400, 'EXPORT_TOO_LARGE'],
    ] as const) {
      mockResponse(
        new Blob([JSON.stringify({ code, message: 'Narrow the requested scope.' })], {
          type: 'application/json',
        }),
        status,
        { 'x-request-id': 'download-request' },
      )
      await expect(
        apiRequest({ url: '/v1/reports/exports', responseType: 'blob' }),
      ).rejects.toMatchObject({ status, code, requestId: 'download-request' })
    }
    mockResponse(new Blob(['<html>private error</html>']), 502)
    await expect(
      apiRequest({ url: '/v1/reports/exports', responseType: 'blob' }),
    ).rejects.toMatchObject({ status: 502, message: 'The request could not be completed.' })
  })
  it('serializes authentication JSON through the same instance', async () => {
    const adapter = mockResponse(
      JSON.stringify({
        user: {
          id: '123e4567-e89b-42d3-a456-426614174000',
          email: 'staff@example.com',
          firstName: null,
          lastName: null,
          avatarUrl: null,
        },
        purpose: 'full',
        permissionKeys: [],
      }),
    )
    await login({ email: 'staff@example.com', password: 'test-password' })
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      url: '/v1/auth/login',
      method: 'post',
      data: JSON.stringify({ email: 'staff@example.com', password: 'test-password' }),
    })
  })
  it('preserves validation errors and request IDs while hiding HTML errors', async () => {
    mockResponse(
      JSON.stringify({
        code: 'VALIDATION_ERROR',
        message: 'Check fields',
        fieldErrors: { name: ['Required'] },
      }),
      400,
      { 'x-request-id': 'request-123' },
    )
    await expect(apiRequest({ url: '/test' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: { name: ['Required'] },
      requestId: 'request-123',
    })
    mockResponse('<html>private-proxy-error</html>', 502)
    await expect(apiRequest({ url: '/test' })).rejects.toMatchObject({
      message: 'The request could not be completed.',
    })
  })
  it('handles empty and invalid successful responses', async () => {
    mockResponse('', 204)
    expect(await apiRequest({ url: '/test' })).toBeUndefined()
    mockResponse('<html>invalid</html>')
    await expect(apiRequest({ url: '/test' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('normalizes network failures and timeouts', async () => {
    const adapter = mockResponse('')
    for (const code of ['ERR_NETWORK', 'ECONNABORTED']) {
      adapter.mockRejectedValueOnce(new AxiosError('private details', code))
      await expect(apiRequest({ url: '/test' })).rejects.toMatchObject({
        status: 0,
        code: 'NETWORK_ERROR',
      })
    }
  })
  it('preserves AbortSignal cancellation without sending a request', async () => {
    const adapter = mockResponse('')
    const controller = new AbortController()
    controller.abort()
    await expect(apiRequest({ url: '/test', signal: controller.signal })).rejects.toMatchObject({
      code: 'ERR_CANCELED',
    })
    expect(adapter).not.toHaveBeenCalled()
  })
  it('rejects external URLs and prevents base URL/credential overrides', async () => {
    const adapter = mockResponse('{}')
    for (const url of ['https://evil.test', '//evil.test', '/\\evil.test'])
      await expect(apiRequest({ url })).rejects.toThrow('relative')
    expect(adapter).not.toHaveBeenCalled()
    await apiRequest({ url: '/test', baseURL: 'https://evil.test', withCredentials: false })
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      baseURL: 'http://localhost:3000',
      withCredentials: true,
    })
  })
  it('does not retry client errors or conflicts', () => {
    for (const status of [400, 401, 403, 404, 409, 429])
      expect(shouldRetryQuery(0, new ApiError(status, 'ERROR', 'Error'))).toBe(false)
    expect(shouldRetryQuery(0, new ApiError(503, 'ERROR', 'Error'))).toBe(true)
    expect(shouldRetryQuery(1, new Error('network'))).toBe(false)
  })
})
