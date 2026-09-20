import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

describe('health endpoint', () => {
  it('reports that the API is available', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })

    await app.close()
  })
})
