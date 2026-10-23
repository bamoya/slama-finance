/** Presentation only: never change ISO dates stored in business records. */
export function displayDate(value: string) {
  return value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3-$2-$1')
}
