/** "First Last" for an owner, or null for legacy accounts without names. */
export function ownerFullName(owner: { firstName: string | null; lastName: string | null }) {
  return [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null
}
