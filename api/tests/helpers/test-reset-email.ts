import type { PasswordResetDelivery } from '../../src/integrations/contracts.js'

// Test-only adapter: captures messages in memory, never logs or sends secrets.
export function createTestResetEmail() {
  const messages: Parameters<PasswordResetDelivery['send']>[0][] = []
  const adapter: PasswordResetDelivery = {
    async send(message) {
      messages.push(message)
    },
  }
  return { adapter, messages }
}
