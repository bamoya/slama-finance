export function pageOffset({ page, pageSize }: { page: number; pageSize: number }) {
  return (page - 1) * pageSize
}
export function pageResult<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
) {
  return { items, page: query.page, pageSize: query.pageSize, total }
}
// Repositories map these allowlisted keys to columns, never interpolate query strings.
export function stableSort<T extends string>(sort: T, direction: 'asc' | 'desc') {
  return sort === 'id'
    ? [{ field: sort, direction }]
    : [
        { field: sort, direction },
        { field: 'id', direction },
      ]
}
