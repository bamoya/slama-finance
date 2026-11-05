export const sessionSyncKey = 'slama.session.sync'
export const sessionExpiredKey = 'slama.session.expired'

export type SessionMessage = {
  userId: string
  type: 'activity' | 'logout' | 'inactivity'
  deadline?: string
}

export function publishSessionMessage(message: SessionMessage) {
  try {
    localStorage.setItem(sessionSyncKey, JSON.stringify({ ...message, nonce: Math.random() }))
  } catch {
    // Server expiry still applies when browser storage is unavailable.
  }
}

export function readSessionMessage(
  event: Pick<StorageEvent, 'key' | 'newValue'>,
): SessionMessage | null {
  if (event.key !== sessionSyncKey || !event.newValue) return null
  try {
    const message = JSON.parse(event.newValue)
    if (typeof message.userId !== 'string') return null
    if (message.type === 'logout' || message.type === 'inactivity') return message
    if (
      message.type === 'activity' &&
      typeof message.deadline === 'string' &&
      Number.isFinite(Date.parse(message.deadline))
    )
      return message
  } catch {
    // Ignore malformed messages from old tabs.
  }
  return null
}

export function rememberSessionExpiry() {
  try {
    sessionStorage.setItem(sessionExpiredKey, 'inactivity')
  } catch {
    // The login page can still be shown without an explanatory message.
  }
}
