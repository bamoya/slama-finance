const maximumLength = 40
export const minimumSlugLength = 3

/**
 * Live address formatting: accents removed, lowercase, spaces and underscores become hyphens,
 * invalid characters dropped, no leading or repeated hyphens. A single trailing hyphen is kept
 * while typing so "my-shop" can be entered; pass `final` to trim it.
 */
export function formatSlug(input: string, final = false) {
  const formatted = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, maximumLength)
  return final ? formatted.replace(/-+$/, '') : formatted
}

export const suggestSlug = (name: string) => formatSlug(name, true)
