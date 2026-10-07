import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

export type FieldErrors = Record<string, string[]>
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return
  const value = error as { code?: unknown; cause?: unknown }
  if (typeof value.code === 'string') return value.code
  if (value.cause && value.cause !== error) {
    const cause = value.cause as { code?: unknown }
    if (typeof cause.code === 'string') return cause.code
  }
}

export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof ZodError) {
    const fields: FieldErrors = Object.create(null)
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_form'
      ;(fields[path] ??= []).push(issue.message)
    }
    return new AppError(400, 'VALIDATION_ERROR', 'Check the submitted fields.', fields)
  }
  const code = databaseCode(error)
  if (code === '23505')
    return new AppError(409, 'DUPLICATE_RECORD', 'A record with these values already exists.')
  if (code === '23503')
    return new AppError(409, 'RELATED_RECORD_CONFLICT', 'A related record prevents this operation.')
  if (code === '23514' || code === '23502' || code === '22P02')
    return new AppError(400, 'VALIDATION_ERROR', 'The submitted data is invalid.')
  if (code === '40001' || code === '40P01')
    return new AppError(409, 'CONCURRENT_CHANGE', 'The record changed. Reload and try again.')
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE')
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.')
  if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE')
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported content type.')
  if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY')
    return new AppError(400, 'INVALID_JSON', 'The JSON body is invalid.')
  if (code === 'FST_ERR_VALIDATION')
    return new AppError(400, 'VALIDATION_ERROR', 'The request is invalid.')
  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
}

export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const exposed = publicError(error)
    // Never log raw SQL errors/causes: these may contain submitted data.
    if (exposed.statusCode >= 500) request.log.error({ code: exposed.code }, 'Request failed')
    return reply.code(exposed.statusCode).send({
      code: exposed.code,
      message: exposed.message,
      ...(exposed.fieldErrors && { fieldErrors: exposed.fieldErrors }),
      requestId: request.id,
    })
  })
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      requestId: request.id,
    }),
  )
}
