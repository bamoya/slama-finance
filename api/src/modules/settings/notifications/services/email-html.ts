import { convert } from 'html-to-text'
import sanitizeHtml from 'sanitize-html'

// Email fragments only: no executable content, external CSS, forms or embedded documents.
// Inline styles are deliberately allowlisted, not accepted with an unrestricted CSS regex.
const length = /^(?:0|\d+(?:\.\d+)?(?:px|pt|em|rem|%))$/
const spacing =
  /^(?:0|\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|pt|em|rem|%))){0,3}$/
const color = /^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i
export const escapeEmailText = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

export function sanitizeEmailHtml(html: string, emailDefaults = false) {
  return sanitizeHtml(html, {
    allowedTags: [
      'div',
      'span',
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'caption',
    ],
    allowedAttributes: {
      '*': ['style', 'dir', 'lang'],
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      table: ['width', 'cellpadding', 'cellspacing', 'border', 'role'],
      td: ['colspan', 'rowspan', 'width', 'align', 'valign'],
      th: ['colspan', 'rowspan', 'width', 'align', 'valign', 'scope'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        color: [color],
        'background-color': [color],
        'font-family': [/^[a-z\s,'"-]+$/i],
        'font-size': [length],
        'font-weight': [/^(?:normal|bold|[1-9]00)$/],
        'font-style': [/^(?:normal|italic)$/],
        'text-align': [/^(?:left|right|center|justify)$/],
        'text-decoration': [/^(?:none|underline|line-through)$/],
        'line-height': [/^\d+(?:\.\d+)?(?:px|pt|em|%)?$/],
        padding: [spacing],
        margin: [spacing],
        'padding-top': [length],
        'padding-bottom': [length],
        'padding-left': [length],
        'padding-right': [length],
        width: [length, /^auto$/],
        'max-width': [length],
        height: [length, /^auto$/],
        border: [/^\d+px\s+(?:solid|dashed)\s+#[0-9a-f]{3,8}$/i],
        'border-radius': [length],
        'border-collapse': [/^(?:collapse|separate)$/],
        'vertical-align': [/^(?:top|middle|bottom)$/],
        display: [/^(?:block|inline|inline-block|table|table-cell)$/],
      },
    },
    transformTags: {
      // Variables are text-only. Never allow a variable to form a URL or CSS value.
      '*': (tagName, attribs) => {
        const defaults: Record<string, string> = {
          table: 'max-width:100%;border-collapse:collapse',
          td: 'padding:8px;border:1px solid #dddddd;vertical-align:top',
          th: 'padding:8px;border:1px solid #dddddd;vertical-align:top',
          img: 'max-width:100%;height:auto',
          p: 'margin:0 0 12px',
        }
        const clean = Object.fromEntries(
          Object.entries(attribs).filter(([, value]) => !/[{}]/.test(value)),
        )
        return {
          tagName,
          attribs:
            emailDefaults && defaults[tagName]
              ? { ...clean, style: `${defaults[tagName]};${clean.style ?? ''}` }
              : clean,
        }
      },
    },
  })
}

export const emailPlainText = (html: string) =>
  convert(html, {
    wordwrap: 100,
    selectors: [{ selector: 'img', format: 'skip' }],
  })

export function emailDocument(fragment: string, locale?: string) {
  const styled = sanitizeEmailHtml(fragment, true)
  return `<div lang="${locale?.startsWith('en') ? 'en' : 'fr'}" dir="ltr" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222222;background-color:#ffffff;padding:16px">${styled}</div>`
}
