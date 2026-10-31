/** Generated operations provide the bytes; browser URLs are always released. */
export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
