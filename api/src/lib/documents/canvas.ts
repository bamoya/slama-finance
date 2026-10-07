import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, rgb, StandardFonts } from 'pdf-lib'

export const W = 595.28
export const H = 841.89
const require = createRequire(import.meta.url)
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
const clean = (value: string) =>
  [...value].filter((char) => char.charCodeAt(0) >= 32 || '\n\r\t'.includes(char)).join('')
type Face = 'regular' | 'bold' | 'serif'
const fontBytes = Promise.all([
  readFile(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
  readFile(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
  readFile(new URL('../../../assets/fonts/NotoSansArabic-Regular.ttf', import.meta.url)),
])

/** Every primitive writes to both PDF and SVG: preview and download share exact coordinates. */
export async function createDocumentCanvas() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const bytes = await fontBytes
  const [regular, bold, arabic] = await Promise.all(
    bytes.map((data) => pdf.embedFont(data, { subset: true })),
  )
  const serif = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  const fontFor = (value: string, face: Face): PDFFont =>
    /\p{Script=Arabic}/u.test(value)
      ? arabic!
      : face === 'serif'
        ? serif
        : face === 'bold'
          ? bold!
          : regular!
  // Fontsource ships language subsets. Shape Arabic words together, but never
  // ask the Arabic subset to render adjacent Latin text (which produces .notdef).
  const textRuns = (value: string) =>
    clean(value)
      .split(/([\p{Script=Arabic}\p{Mark}]+(?:[ \t]+[\p{Script=Arabic}\p{Mark}]+)*)/u)
      .filter(Boolean)
  const color = (hex: string) =>
    rgb(
      ...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ]),
    )
  const pages: string[][] = []
  let pageIndex = -1
  const measure = (value: string, size: number, face: Face = 'regular') =>
    textRuns(value).reduce(
      (width, run) => width + fontFor(run, face).widthOfTextAtSize(run, size),
      0,
    )
  const wrap = (value: string, width: number, size: number, face: Face = 'regular') =>
    clean(value)
      .split(/\r?\n/)
      .flatMap((paragraph) => {
        const lines: string[] = []
        let line = ''
        for (const word of paragraph.split(/(\s+)/)) {
          if (line && measure(line + word, size, face) > width) {
            lines.push(line.trimEnd())
            line = ''
          }
          for (const char of word) {
            if (line && measure(line + char, size, face) > width) {
              lines.push(line.trimEnd())
              line = ''
            }
            if (line || char.trim()) line += char
          }
        }
        lines.push(line.trimEnd())
        return lines
      })
  function drawText(
    value: string,
    x: number,
    y: number,
    size = 10,
    fill = '#222c28',
    face: Face = 'regular',
  ) {
    value = clean(value)
    if (!value) return
    for (const run of textRuns(value)) {
      const font = fontFor(run, face)
      const width = font.widthOfTextAtSize(run, size)
      const rtl = /\p{Script=Arabic}/u.test(run)
      pdf.getPage(pageIndex).drawText(run, { x, y: H - y - size, size, font, color: color(fill) })
      const family = rtl ? 'Arabic' : face === 'serif' ? 'Times New Roman' : 'Document'
      pages[pageIndex]!.push(
        `<text x="${rtl ? x + width : x}" y="${y + size}" font-family="${family}" font-size="${size}" font-weight="${face === 'bold' ? 700 : 400}" font-style="${face === 'serif' ? 'italic' : 'normal'}"${rtl ? ' direction="rtl" text-anchor="start"' : ''} fill="${fill}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${escape(run)}</text>`,
      )
      x += width
    }
  }
  function rect(x: number, y: number, width: number, height: number, fill: string) {
    pdf
      .getPage(pageIndex)
      .drawRectangle({ x, y: H - y - height, width, height, color: color(fill) })
    pages[pageIndex]!.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`,
    )
  }
  const imageCache = new Map<Uint8Array, Awaited<ReturnType<typeof pdf.embedPng>>>()
  async function image(
    data: Uint8Array,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    alt: string,
  ) {
    let embedded = imageCache.get(data)
    if (!embedded) {
      embedded = await pdf.embedPng(data)
      imageCache.set(data, embedded)
    }
    const size = embedded.scaleToFit(maxWidth, maxHeight)
    pdf.getPage(pageIndex).drawImage(embedded, { x, y: H - y - size.height, ...size })
    pages[pageIndex]!.push(
      `<image x="${x}" y="${y}" width="${size.width}" height="${size.height}" aria-label="${escape(alt)}" href="data:image/png;base64,${Buffer.from(data).toString('base64')}"/>`,
    )
    return size
  }
  return {
    pdf,
    measure,
    wrap,
    text: drawText,
    rect,
    image,
    get pageCount() {
      return pages.length
    },
    addPage() {
      pdf.addPage([W, H])
      pages.push([])
      pageIndex = pages.length - 1
      rect(0, 0, W, H, '#ffffff')
    },
    selectPage(index: number) {
      pageIndex = index
    },
    html(layout: string, density: string) {
      const fontCss = bytes
        .map(
          (data, index) =>
            `@font-face{font-family:${index === 2 ? 'Arabic' : 'Document'};font-weight:${index === 1 ? 700 : 400};src:url(data:font/${index === 2 ? 'ttf' : 'woff'};base64,${data.toString('base64')}) format('${index === 2 ? 'truetype' : 'woff'}')}`,
        )
        .join('')
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${fontCss}*{box-sizing:border-box}body{margin:0;background:#e4e7ec}svg{display:block;width:100%;height:auto;background:white;margin-bottom:12px}@page{size:A4;margin:0}@media print{svg{margin:0;break-after:page}}</style></head><body class="${layout}" data-density="${density}">${pages.map((commands, i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Page ${i + 1} of ${pages.length}">${commands.join('')}</svg>`).join('')}</body></html>`
    },
  }
}
