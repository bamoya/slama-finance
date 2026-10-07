import { isIP } from 'node:net'

import { z } from 'zod'

const positive = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback)
const origin = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value
    } catch {
      return false
    }
  }, 'Use an exact HTTP(S) origin without a path or trailing slash')

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: positive(3000, 65535),
    // Exact reverse-proxy IPs only; never trust arbitrary forwarded headers.
    TRUST_PROXY_IPS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().refine((value) => isIP(value) !== 0, 'Use exact proxy IPs'))),
    DATABASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .url()
        .refine((value) => /^postgres(ql)?:/.test(value))
        .optional(),
    ),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .transform((value) => value.split(',').map((entry) => entry.trim()))
      .pipe(z.array(origin).min(1)),
    BODY_LIMIT_BYTES: positive(1048576, 10485760),
    REQUEST_TIMEOUT_MS: positive(15000, 120000),
    READINESS_TIMEOUT_MS: positive(1000, 10000),
    DATABASE_POOL_SIZE: positive(10, 50),
    RATE_LIMIT_MAX: positive(100, 10000),
    SESSION_TTL_DAYS: positive(30, 90),
    MEDIA_ASSET_DIR: z.string().default('.local/media'),
    S3_ENDPOINT: z.string().url().optional().or(z.literal('')),
    S3_REGION: z.string().default('us-ashburn-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    RESEND_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    EMAIL_FROM: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional(),
    ),
    PASSWORD_RESET_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    NOTIFICATION_TRANSPORT: z.enum(['recording', 'resend', 'smtp']).optional(),
    SMTP_HOST: z.enum(['127.0.0.1', 'localhost', '::1', 'mailpit']).default('127.0.0.1'),
    SMTP_PORT: positive(1025, 65535),
    NOTIFICATION_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    NOTIFICATION_POLL_MS: positive(2000, 60000),
    REPORT_POLL_MS: positive(10000, 60000),
    NOTIFICATION_PAYLOAD_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(0),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.NOTIFICATION_TRANSPORT === 'smtp')
      context.addIssue({
        code: 'custom',
        path: ['NOTIFICATION_TRANSPORT'],
        message: 'SMTP is local Mailpit only; use Resend in production',
      })
    if (env.NODE_ENV === 'production' && env.NOTIFICATION_TRANSPORT === 'recording')
      context.addIssue({
        code: 'custom',
        path: ['NOTIFICATION_TRANSPORT'],
        message: 'Recording email transport is development/test only',
      })
    if (env.NOTIFICATION_TRANSPORT === 'resend' && (!env.RESEND_API_KEY || !env.EMAIL_FROM))
      context.addIssue({
        code: 'custom',
        path: ['NOTIFICATION_TRANSPORT'],
        message: 'Resend requires credentials and a permitted sender',
      })
    const storageFields = [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const
    if (env.NODE_ENV === 'production' || storageFields.some((key) => env[key])) {
      for (const key of storageFields)
        if (!env[key])
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required for private object storage',
          })
      if (
        env.NODE_ENV === 'production' &&
        env.S3_ENDPOINT &&
        !env.S3_ENDPOINT.startsWith('https://')
      )
        context.addIssue({
          code: 'custom',
          path: ['S3_ENDPOINT'],
          message: 'HTTPS required in production',
        })
    }
    const emailFields = ['RESEND_API_KEY', 'EMAIL_FROM', 'PASSWORD_RESET_URL'] as const
    if (
      env.NODE_ENV === 'production' ||
      (env.NOTIFICATION_TRANSPORT !== 'smtp' && emailFields.some((key) => env[key]))
    ) {
      for (const key of emailFields)
        if (!env[key])
          context.addIssue({ code: 'custom', path: [key], message: 'Required for email delivery' })
    }
    if (env.PASSWORD_RESET_URL) {
      let url: URL
      try {
        url = new URL(env.PASSWORD_RESET_URL)
      } catch {
        return
      }
      if (
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        (url.protocol !== 'https:' &&
          !(
            env.NODE_ENV !== 'production' &&
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname)
          ))
      )
        context.addIssue({
          code: 'custom',
          path: ['PASSWORD_RESET_URL'],
          message: 'Use a trusted HTTPS reset page without query or fragment',
        })
    }
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL)
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Required in production',
      })
    if (
      env.NODE_ENV === 'production' &&
      env.CORS_ORIGIN.some((value) => !value.startsWith('https://'))
    )
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'HTTPS required in production',
      })
  })

export type Environment = z.infer<typeof environmentSchema>
export function loadEnvironment(input: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(input)
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`)
  }
  return result.data
}
