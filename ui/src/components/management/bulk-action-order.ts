// Shared by every list: constructive actions first, destructive actions last.
const order: Record<string, number> = {
  downloadZip: 10,
  regenerate: 20,
  update: 30,
  category: 30,
  enable: 40,
  restore: 50,
  deliver: 60,
  disable: 70,
  archive: 80,
  cancel: 90,
  delete: 100,
}

export function orderBulkActions<T extends { key: string; destructive?: boolean }>(
  actions: T[],
): T[] {
  const rank = (action: T) => order[action.key] ?? (action.destructive ? 85 : 35)
  return [...actions].sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key))
}
