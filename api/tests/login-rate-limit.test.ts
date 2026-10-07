import { describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'

describe('login rate limit', () => {
  it('separates forwarded clients only through an explicitly trusted proxy', async () => {
    const app = await buildApp({
      logger: false,
      environment: loadEnvironment({ NODE_ENV: 'test', TRUST_PROXY_IPS: '10.0.0.10' }),
    })
    const attempt = (client: string, peer = '10.0.0.10') =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        remoteAddress: peer,
        headers: { origin: 'http://localhost:5173', 'x-forwarded-for': client },
        payload: { email: 'invalid', password: 'short' },
      })
    try {
      for (let index = 0; index < 5; index++)
        expect((await attempt('192.0.2.1')).statusCode).toBe(400)
      expect((await attempt('192.0.2.1')).statusCode).toBe(429)
      expect((await attempt('192.0.2.2')).statusCode).toBe(400)
      for (let index = 0; index < 5; index++)
        expect((await attempt(`192.0.2.${index}`, '198.51.100.1')).statusCode).toBe(400)
      expect((await attempt('192.0.2.99', '198.51.100.1')).statusCode).toBe(429)
    } finally {
      await app.close()
    }
  })
  it('blocks the sixth attempt, ignores spoofed forwarded IPs and isolates other routes/clients', async () => {
    const app = await buildApp({
      logger: false,
      environment: loadEnvironment({ NODE_ENV: 'test' }),
    })
    try {
      const headers = { origin: 'http://localhost:5173' }
      // Invalid input avoids needing a database; every login attempt still counts.
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          remoteAddress: '192.0.2.1',
          headers,
          payload: { email: 'invalid', password: 'short' },
        })
        expect(response.statusCode).toBe(400)
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        remoteAddress: '192.0.2.1',
        headers: { ...headers, 'x-forwarded-for': '192.0.2.99' },
        payload: { email: 'another@example.test', password: 'valid-length-password' },
      })
      expect(blocked.statusCode).toBe(429)
      expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED', requestId: expect.any(String) })
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/auth/login',
            remoteAddress: '192.0.2.2',
            headers,
            payload: { email: 'invalid', password: 'short' },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (await app.inject({ url: '/v1/auth/session', remoteAddress: '192.0.2.1' })).statusCode,
      ).toBe(401)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/auth/logout',
            remoteAddress: '192.0.2.1',
            headers,
          })
        ).statusCode,
      ).toBe(204)
    } finally {
      await app.close()
    }
  })
})
