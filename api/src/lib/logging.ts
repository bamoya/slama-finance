import type { FastifyServerOptions } from 'fastify'

export const loggerOptions: Exclude<FastifyServerOptions['logger'], boolean | undefined> = {
  redact: {
    paths: [
      'req.headers',
      'req.body',
      'res.headers',
      'password',
      'passwordHash',
      'temporaryPassword',
      '*.temporaryPassword',
      'newPassword',
      'currentPassword',
      '*.newPassword',
      '*.currentPassword',
      'RESEND_API_KEY',
      '*.RESEND_API_KEY',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      '*.S3_ACCESS_KEY_ID',
      '*.S3_SECRET_ACCESS_KEY',
      'token',
      'tokenHash',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.tokenHash',
      '*.body',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req(request) {
      return { method: request.method, path: request.url?.split('?')[0], remoteAddress: request.ip }
    },
    res(reply) {
      return { statusCode: reply.statusCode }
    },
    err() {
      return { type: 'Error', message: 'Details withheld from operational logs', stack: '' }
    },
  },
}
