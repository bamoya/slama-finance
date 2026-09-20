import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

export function buildApp() {
  const app = Fastify({ logger: true })

  void app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') ?? false })
  void app.register(helmet)
  void app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
