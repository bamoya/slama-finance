import type { Transaction } from '../../../lib/db.js'

export interface MessageAttachment {
  objectKey: string
  filename: string
  contentType: string
  byteSize: number
  position: number
}
export interface ComposedMessage {
  idempotencyKey: string
  actor: string | null
  from: { email: string; name: string }
  to: string
  cc: string[]
  subject: string
  html: string
  text: string
  attachments: MessageAttachment[]
}
export interface MessageStatus {
  id: string
  status: string
  attempts: number
  maxAttempts: number
  createdAt: Date
  sentAt: Date | null
  lastErrorCode: string | null
  to: string
  cc: string[]
}
export interface NotificationPublicApi {
  enqueue(payload: ComposedMessage, tx?: Transaction): Promise<MessageStatus>
  status(id: string, tx?: Transaction): Promise<MessageStatus>
  retry(id: string, tx?: Transaction): Promise<MessageStatus>
  cancel(id: string, tx?: Transaction): Promise<MessageStatus>
}
