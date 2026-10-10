import { createDocumentCanvas, H, W } from './canvas.js'
import { documentLabel } from './document-labels.js'
import type { DocumentImages, DocumentModel } from './types.js'
import { text } from './types.js'

const ink = '#222c28'
const muted = '#63706a'
const rule = '#d9dfdb'
const tintOf = (hex: string) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * 0.12)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

/** Seven fixed themes, two densities; a single pagination plan for SVG previews and PDFs. */
export async function renderDocument(
  model: DocumentModel,
  appearance: Record<string, unknown>,
  images: DocumentImages = {},
) {
  const label = (value: string) => documentLabel(value, model.locale)
  // Translate generated labels only, never product names, customer data or custom terms.
  model = {
    ...model,
    reference: model.reference ? [label(model.reference[0]), model.reference[1]] : undefined,
    totals: model.totals?.map(([key, value]) => [label(key), value]),
    sections: model.sections?.map((section) => ({ ...section, title: label(section.title) })),
    receipt: model.receipt
      ? {
          ...model.receipt,
          status: label(model.receipt.status),
          fields: model.receipt.fields.map(([key, value]) => [
            label(key),
            key === 'Method' || key === 'Collection date' ? label(value) : value,
          ]),
          balances: model.receipt.balances.map(([key, value]) => [label(key), value]),
        }
      : undefined,
  }
  const c = await createDocumentCanvas()
  const layout = text(appearance.layout) || 'classic'
  const compact = appearance.density === 'compact'
  const tight = compact || layout === 'minimal'
  const atelier = layout === 'atelier'
  const essential = layout === 'essential'
  const ledger = layout === 'ledger'
  const signature = layout === 'signature'
  const accent = /^#[\da-f]{6}$/i.test(text(appearance.accentColor))
    ? text(appearance.accentColor)
    : '#ad7d1d'
  const tint = tintOf(accent)
  const margin = compact ? 25 : tight ? 30 : 36
  const sidebar = atelier ? (compact ? 112 : 147) : 0
  const left = atelier ? sidebar + (compact ? 16 : 22) : margin
  const right = W - margin
  const width = right - left
  const size = compact ? 8.5 : 9.5
  const leading = size + (compact ? 3 : 4)
  const space = compact ? 9 : 16
  const footerLines = c.wrap(text(appearance.footerText), width - 40, 7.5)
  const bottom = H - margin - Math.max(24, footerLines.length * 10 + 16)
  let y = margin
  function block(
    value: string,
    x: number,
    top: number,
    available: number,
    fontSize = size,
    fill = ink,
    face: 'regular' | 'bold' | 'serif' = 'regular',
  ) {
    const lines = c.wrap(value, available, fontSize, face)
    lines.forEach((line, i) => c.text(line, x, top + i * (fontSize + 3), fontSize, fill, face))
    return lines.length * (fontSize + 3)
  }
  function aligned(
    value: string,
    end: number,
    top: number,
    fontSize = size,
    face: 'regular' | 'bold' = 'regular',
  ) {
    c.text(value, end - c.measure(value, fontSize, face), top, fontSize, ink, face)
  }
  async function newPage(first = false) {
    c.addPage()
    y = margin
    if (atelier) {
      c.rect(0, 0, sidebar, H, tint)
      let sideY = margin
      if (images.logo) {
        const logo = await c.image(
          images.logo,
          20,
          sideY,
          sidebar - 40,
          compact ? 36 : 62,
          'Company logo',
        )
        sideY += logo.height + 12
      }
      for (const [i, value] of model.issuer.entries())
        sideY +=
          block(
            value,
            20,
            sideY,
            sidebar - 38,
            i === 0 ? 10 : 8,
            ink,
            i === 0 ? 'bold' : 'regular',
          ) + 7
    } else if (signature || ledger) c.rect(0, 0, W, ledger ? 6 : 3, ledger ? ink : accent)
    if (!first) {
      const height = block(`${model.title} · ${model.number}`, left, y, width, 11, ink, 'bold')
      y += height + space
      c.rect(left, y - 5, width, 0.6, rule)
      return
    }
    const titleSize = compact ? 20 : essential ? 28 : 24
    if (atelier) {
      y += block(model.title, left, y, width, titleSize, ink, 'bold')
      y += block(model.number, left, y + 4, width, 9, muted) + 8
    } else {
      const headerTop = y
      let issuerX = left
      let issuerTop = y
      const titleWidth = width * (essential ? 0.7 : 0.47)
      const titleX = essential ? left : right - titleWidth
      const titleHeight = block(
        model.title,
        titleX,
        y,
        titleWidth,
        titleSize,
        ink,
        signature ? 'serif' : 'bold',
      )
      const numberHeight = block(model.number, titleX, y + titleHeight + 3, titleWidth, 8.5, muted)
      if (images.logo) {
        await c.image(
          images.logo,
          essential ? right - 52 : left,
          y,
          compact ? 38 : 48,
          compact ? 38 : 48,
          'Company logo',
        )
        if (!essential) issuerX += compact ? 48 : 58
      }
      if (essential) issuerTop += titleHeight + numberHeight + 14
      const issuerWidth = essential ? width : width * 0.5 - (issuerX - left) - 10
      for (const [i, value] of model.issuer.entries())
        issuerTop +=
          block(
            value,
            issuerX,
            issuerTop,
            issuerWidth,
            i === 0 ? 10 : 8,
            i === 0 ? ink : muted,
            i === 0 ? 'bold' : 'regular',
          ) + 2
      y =
        Math.max(
          issuerTop,
          headerTop + titleHeight + numberHeight + 8,
          headerTop + (images.logo ? 48 : 0),
        ) + (compact ? 8 : 14)
      if (layout === 'modern') c.rect(left - 8, headerTop, 4, y - headerTop, accent)
      else
        c.rect(
          left,
          y,
          width,
          signature || layout === 'classic' ? 1.5 : 0.6,
          essential ? ink : accent,
        )
      y += space
    }
    y += space
  }
  const ensure = async (height: number) => {
    if (y + height > bottom) await newPage()
  }
  await newPage(true)

  // Client and document metadata have independent columns and measured heights.
  const partyInset = ledger ? 10 : 0
  const sharedTitleColumn = !atelier && !essential
  const clientX = left + partyInset
  const clientWidth = width * (sharedTitleColumn ? 0.5 : 0.56) - partyInset * 2
  // Align only designs that already place the title and dates on the right.
  // Atelier and Essential retain their distinct title/customer/date layout.
  const metaX = sharedTitleColumn ? right - width * 0.47 : left + width * 0.63
  const metaWidth = right - metaX - partyInset
  const clientRows = model.client.flatMap((value, index) =>
    c.wrap(value, clientWidth, index === 0 ? 10 : size),
  )
  const metadata: [string, string][] = [
    [label('Document date'), model.date],
    ...(model.reference ? [model.reference] : []),
  ]
  const metaHeight = metadata.reduce(
    (h, [, value]) => h + 14 + c.wrap(value, metaWidth, size).length * leading,
    0,
  )
  const partyHeight = Math.max(14 + clientRows.length * leading, metaHeight) + partyInset * 2
  if (ledger) c.rect(left, y, width, partyHeight, tint)
  c.text(
    model.receipt ? label('RECEIVED FROM') : label('CUSTOMER'),
    clientX,
    y + partyInset,
    7.5,
    muted,
  )
  let clientY = y + partyInset + 14
  model.client.forEach((value, index) => {
    clientY += block(
      value,
      clientX,
      clientY,
      clientWidth,
      index === 0 ? 10 : size,
      ink,
      index === 0 ? 'bold' : 'regular',
    )
  })
  let metaY = y + partyInset
  metadata.forEach(([label, value]) => {
    c.text(label.toUpperCase(), metaX, metaY, 7.5, muted)
    metaY += 13
    metaY += block(value, metaX, metaY, metaWidth) + 5
  })
  y = Math.max(clientY, metaY, y + partyHeight) + space

  if (model.receipt) {
    const receipt = model.receipt
    const amountSize = compact ? 25 : 31
    const amountLines = c.wrap(receipt.amount, width - 24, amountSize, signature ? 'serif' : 'bold')
    const statusLines = c.wrap(receipt.status, width - 24, 8)
    const amountHeight = 34 + amountLines.length * (amountSize + 3) + statusLines.length * 11
    await ensure(amountHeight + space)
    if (!essential && !ledger) c.rect(left, y, width, amountHeight, tint)
    if (signature) c.rect(left, y, width, 1.5, accent)
    if (ledger) c.rect(left, y, 3, amountHeight, accent)
    const inset = essential ? 0 : 12
    c.text(label('AMOUNT RECEIVED'), left + inset, y + 10, 8, muted)
    amountLines.forEach((value, i) =>
      c.text(
        value,
        left + inset,
        y + 25 + i * (amountSize + 3),
        amountSize,
        ink,
        signature ? 'serif' : 'bold',
      ),
    )
    statusLines.forEach((value, i) =>
      c.text(
        value,
        left + inset,
        y + 30 + amountLines.length * (amountSize + 3) + i * 11,
        8,
        ink,
        'bold',
      ),
    )
    y += amountHeight + space
    for (let index = 0; index < receipt.fields.length; index += 2) {
      const pair = receipt.fields.slice(index, index + 2)
      const cellWidth = (width - 18) / 2
      const height = Math.max(
        ...pair.map(
          ([label, value]) =>
            c.wrap(label.toUpperCase(), cellWidth, 7.5).length * 10 +
            c.wrap(value, cellWidth, size, 'bold').length * leading +
            10,
        ),
      )
      await ensure(height)
      pair.forEach(([label, value], i) => {
        const x = left + i * (cellWidth + 18)
        const labelHeight = block(label.toUpperCase(), x, y, cellWidth, 7.5, muted)
        block(value, x, y + labelHeight + 2, cellWidth, size, ink, 'bold')
        c.rect(x, y + height - 5, cellWidth, 0.5, rule)
      })
      y += height + (compact ? 4 : 9)
    }
    await ensure(30 + receipt.balances.length * 23)
    y += 6
    c.text(label('INVOICE BALANCE AT PAYMENT RECORDING'), left, y, 8, muted)
    y += 22
    for (const [index, [label, value]] of receipt.balances.entries()) {
      const last = index === receipt.balances.length - 1
      if (last) c.rect(left, y - 4, width, ledger ? 22 : 0.5, ledger ? tint : rule)
      c.text(label, left + (ledger && last ? 6 : 0), y + 3, size, ink, last ? 'bold' : 'regular')
      aligned(value, right - (ledger && last ? 6 : 0), y + 3, size, last ? 'bold' : 'regular')
      y += compact ? 20 : 25
    }
    y += 8
    for (const line of c.wrap(receipt.note, width, 8)) {
      await ensure(12)
      c.text(line, left, y, 8, muted)
      y += 12
    }
  }

  if (model.lines) {
    const financial = model.lines.some((line) => line.price !== undefined)
    const vat = model.lines.some((line) => line.vat !== undefined)
    const numericWidths = financial ? (vat ? [34, 60, 38, 68] : [34, 65, 73]) : [54]
    const widths = [width - numericWidths.reduce((a, b) => a + b, 0), ...numericWidths]
    const headings = [
      label('Product name'),
      label('Qty'),
      ...(financial ? [label('Unit price'), ...(vat ? [label('VAT')] : []), 'Total'] : []),
    ]
    const padding = compact ? 3 : tight ? 5 : 8
    const headerHeight = compact ? 20 : 27
    function tableHeader() {
      if (!essential) c.rect(left, y, width, headerHeight, tint)
      else {
        c.rect(left, y, width, 0.7, ink)
        c.rect(left, y + headerHeight, width, 0.5, rule)
      }
      let x = left
      headings.forEach((label, i) => {
        if (i === 0) c.text(label, x + 4, y + (compact ? 5 : 8), 8, ink, 'bold')
        else aligned(label, x + widths[i]! - 4, y + (compact ? 5 : 8), 8, 'bold')
        x += widths[i]!
      })
      y += headerHeight
    }
    await ensure(headerHeight + leading + padding * 2)
    tableHeader()
    for (const item of model.lines) {
      const values = [
        item.name,
        item.quantity,
        ...(financial
          ? [item.price ?? '', ...(vat ? [item.vat ?? '-'] : []), item.total ?? '']
          : []),
      ]
      const cells = values.map((value, i) => c.wrap(value, widths[i]! - 8, size))
      const rowLines = Math.max(...cells.map((cell) => cell.length))
      let offset = 0
      // Keep ordinary rows intact; split exceptionally long rows safely across pages.
      if (
        y + rowLines * leading + padding * 2 > bottom &&
        rowLines * leading + padding * 2 < bottom - margin - 60
      ) {
        await newPage()
        tableHeader()
      }
      while (offset < rowLines) {
        let capacity = Math.floor((bottom - y - padding * 2) / leading)
        if (capacity < 1) {
          await newPage()
          tableHeader()
          capacity = Math.floor((bottom - y - padding * 2) / leading)
        }
        const count = Math.min(rowLines - offset, capacity)
        let x = left
        cells.forEach((cell, i) => {
          cell.slice(offset, offset + count).forEach((value, j) => {
            if (i === 0) c.text(value, x + 4, y + padding + j * leading, size)
            else aligned(value, x + widths[i]! - 4, y + padding + j * leading)
          })
          x += widths[i]!
        })
        y += count * leading + padding * 2
        c.rect(left, y, width, 0.5, rule)
        offset += count
      }
    }
    y += space
  }

  if (model.totals?.length) {
    await ensure(model.totals.length * 24 + 12)
    const totalX = right - Math.min(width, 220)
    c.rect(totalX, y, right - totalX, 1.5, essential ? ink : accent)
    y += 10
    model.totals.forEach(([label, value], i) => {
      const last = i === model.totals!.length - 1
      c.text(label, totalX, y, last ? 11 : size, ink, last ? 'bold' : 'regular')
      aligned(value, right, y, last ? 11 : size, last ? 'bold' : 'regular')
      y += 24
    })
  }
  for (const section of model.sections ?? []) {
    if (!section.text) continue
    await ensure(space + leading * 3)
    y += space
    if (section.title) {
      c.text(section.title, left, y, size, ink, 'bold')
      y += leading + 3
    }
    for (const line of c.wrap(section.text, width, size)) {
      await ensure(leading)
      c.text(line, left, y, size)
      y += leading
    }
  }
  if (model.receptionSignature) {
    await ensure(64)
    y += 15
    c.text(label('Received by / signature'), left, y, 9, ink)
    y += 40
    c.rect(left, y, Math.min(width, 230), 0.5, rule)
  }
  if (appearance.showSignature === true && images.signature) {
    const signatureHeight = compact ? 42 : 58
    await ensure(signatureHeight + 30)
    y = Math.max(y + 15, bottom - signatureHeight - 20)
    c.text(label('Authorized signature'), right - 130, y, 8, muted)
    await c.image(images.signature, right - 130, y + 14, 130, signatureHeight, 'Company signature')
  }
  for (let i = 0; i < c.pageCount; i++) {
    c.selectPage(i)
    c.rect(left, bottom + 8, width, 0.5, rule)
    footerLines.forEach((value, index) => c.text(value, left, bottom + 17 + index * 10, 7.5, muted))
    aligned(`${i + 1} / ${c.pageCount}`, right, H - margin, 7.5)
  }
  c.pdf.setTitle(`${model.title} ${model.number}`)
  return {
    pdf: c.pdf,
    html: c.html(layout, compact ? 'compact' : 'standard'),
    pageCount: c.pageCount,
  }
}
