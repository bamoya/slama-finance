/** Production uses the same-origin reverse proxy unless an origin is explicitly configured. */
export function resolveApiBaseUrl(configured: string | undefined, production: boolean) {
  return (configured ?? (production ? '' : 'http://localhost:3000')).trim().replace(/\/$/, '')
}
