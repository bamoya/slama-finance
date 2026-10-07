import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { ObjectStorage } from '../../integrations/contracts.js'
import type { Database } from '../../lib/db.js'
import { createMediaController } from './controllers/media.controller.js'
import { createMediaRepository } from './repositories/media.repository.js'
import { registerMediaRoutes } from './routes/media.routes.js'
import { createMediaService } from './services/media.service.js'
import { createMediaCleanupService } from './services/media-cleanup.service.js'

export type MediaPublicApi = Pick<
  ReturnType<typeof createMediaService>,
  'assertAttach' | 'release' | 'download' | 'get' | 'documentImages'
>
export function createMediaModule(database: () => Database, storage: ObjectStorage) {
  const repository = createMediaRepository(database)
  const service = createMediaService(repository, storage)
  return {
    publicApi: service as MediaPublicApi,
    cleanup: createMediaCleanupService(repository, storage),
    async registerRoutes(app: FastifyInstance, authenticate: preHandlerHookHandler) {
      await app.register(
        async (scope) => registerMediaRoutes(scope, createMediaController(service), authenticate),
        { prefix: '/v1/media' },
      )
    },
  }
}
