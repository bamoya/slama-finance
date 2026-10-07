import { describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'

describe('real PostgreSQL readiness', () => {
  it('probes and closes the real pooled database connection', async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required')
    const app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: process.env.TEST_DATABASE_URL,
      }),
      logger: false,
    })
    try {
      const responses = await Promise.all([app.inject('/ready'), app.inject('/ready')])
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200])
      expect(app.database()).toBe(app.database())
    } finally {
      await app.close()
    }
  })
})
