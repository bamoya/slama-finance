export type AuthenticatedAdmin = {
  id: string
  email: string
  name: string
  expiresAt: Date
  /** Current full session; security reauthentication is bound to it. */
  sessionId: string
}
