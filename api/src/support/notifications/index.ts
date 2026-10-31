import type { EmailProvider, ObjectStorage } from '../../integrations/contracts.js'
import type { Database, Transaction } from '../../lib/db.js'
import type { WorkerObserver } from '../../lib/worker-observer.js'
import { createNotificationRepository } from './repositories/notification.repository.js'
import { createNotificationService } from './services/notification.service.js'

export type {
  ComposedMessage,
  MessageAttachment,
  MessageStatus,
  NotificationPublicApi,
} from './notifications.public.js'

export function createNotificationSupport(
  database: () => Database,
  storage: ObjectStorage,
  provider: EmailProvider,
  options: {
    allowedFrom: string[]
    clock?: () => Date
    observe?: WorkerObserver
    reserveEmail?: (tx: Transaction, key: string, recipients: number) => Promise<void>
  },
) {
  return createNotificationService(
    createNotificationRepository(database, options.reserveEmail),
    storage,
    provider,
    options,
  )
}
