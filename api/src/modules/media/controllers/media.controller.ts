import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  DeleteMediaSchema,
  getMediaParamsSchema,
  UploadMediaSchema,
} from '../../../contracts/generated/media/media.schemas.js'
import type { createMediaService } from '../services/media.service.js'

export function createMediaController(service: ReturnType<typeof createMediaService>) {
  return {
    async upload(r: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.upload(UploadMediaSchema.parse(r.body), r.actor!.userId))
    },
    get: (r: FastifyRequest) =>
      service.get(getMediaParamsSchema.parse(r.params).id, r.actor!.userId),
    async download(r: FastifyRequest, reply: FastifyReply) {
      const bytes = await service.download(getMediaParamsSchema.parse(r.params).id, r.actor!.userId)
      return reply
        .type('image/png')
        .header('content-disposition', 'inline; filename="image.png"')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(bytes))
    },
    async remove(r: FastifyRequest, reply: FastifyReply) {
      await service.remove(
        getMediaParamsSchema.parse(r.params).id,
        DeleteMediaSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
