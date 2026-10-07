import { PDFDocument } from 'pdf-lib'
import { expect, it } from 'vitest'

import { createDocumentCanvas } from '../src/lib/documents/canvas.js'

it('uses script-specific embedded fonts for mixed French and Arabic text and preserves wrap widths', async () => {
  const canvas = await createDocumentCanvas()
  canvas.addPage()
  const text = 'Société Atlas شركة المغرب'
  canvas.text(text, 30, 30)
  const preview = canvas.html('classic', 'normal')
  expect(preview).toContain('font-family="Document"')
  expect(preview).toContain('font-family="Arabic"')
  expect(preview).toContain('Société Atlas ')
  expect(preview).toContain('شركة المغرب')
  expect(preview).toContain('direction="rtl"')
  expect(preview).toContain("format('truetype')")
  const lines = canvas.wrap(text.repeat(20), 180, 10)
  expect(lines.length).toBeGreaterThan(5)
  for (const line of lines) expect(canvas.measure(line, 10)).toBeLessThanOrEqual(180)
  const pdf = await PDFDocument.load(await canvas.pdf.save())
  expect(pdf.getPageCount()).toBe(1)
})
