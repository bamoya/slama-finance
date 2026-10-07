import type { Transaction } from '../../../lib/db.js'
import type { MessageAttachment } from '../../../support/notifications/index.js'

export interface ReportNotificationOwner {
  assertReadable(tx: Transaction, id: string, actor: string): Promise<void>
  assertRetryable(tx: Transaction, id: string, actor: string, messageId?: string): Promise<void>
}
export type PrepareNotificationAttachment = (
  type: 'invoice' | 'estimate',
  id: string,
  version: number,
  actor: string | null,
) => Promise<MessageAttachment>
