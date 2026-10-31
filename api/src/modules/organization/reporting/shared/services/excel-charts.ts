import JSZip from 'jszip'

export interface ExcelChart {
  sheet: number
  row: number
  title: string
  kind: 'line' | 'bar' | 'doughnut'
  labels: string[]
  values: number[]
  categoryFormula: string
  valueFormula: string
}
const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  )
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships'
const officeNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
/** ExcelJS owns cells and styles. This adapter adds native, cell-linked DrawingML charts. */
export async function addExcelCharts(bytes: Uint8Array, charts: ExcelChart[]) {
  const zip = await JSZip.loadAsync(bytes)
  let types = await zip.file('[Content_Types].xml')!.async('string')
  for (const sheet of [...new Set(charts.map((chart) => chart.sheet))]) {
    const items = charts
      .map((chart, i) => ({ chart, id: i + 1 }))
      .filter(({ chart }) => chart.sheet === sheet)
    const anchors: string[] = [],
      relations: string[] = []
    for (const { chart, id } of items) {
      const category = `<c:cat><c:strRef><c:f>${xml(chart.categoryFormula)}</c:f><c:strCache><c:ptCount val="${chart.labels.length}"/>${chart.labels.map((label, i) => `<c:pt idx="${i}"><c:v>${xml(label)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`
      const value = `<c:val><c:numRef><c:f>${xml(chart.valueFormula)}</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="${chart.values.length}"/>${chart.values.map((value, i) => `<c:pt idx="${i}"><c:v>${value}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`
      const colors = ['A87828', '3D8075', '557EA8', 'AD8867', 'A65C72']
      const points =
        chart.kind === 'doughnut'
          ? chart.values
              .map(
                (_, i) =>
                  `<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${colors[i % colors.length]}"/></a:solidFill></c:spPr></c:dPt>`,
              )
              .join('')
          : ''
      const series = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xml(chart.title)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="A87828"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="A87828"/></a:solidFill></a:ln></c:spPr>${chart.kind === 'line' ? '<c:marker><c:symbol val="circle"/><c:size val="4"/></c:marker>' : ''}${points}${category}${value}</c:ser>`
      const axisIds = '<c:axId val="100"/><c:axId val="200"/>'
      const axes =
        chart.kind === 'doughnut'
          ? ''
          : '<c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0.##" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>'
      const body =
        chart.kind === 'doughnut'
          ? `<c:doughnutChart><c:varyColors val="1"/>${series}<c:dLbls><c:showVal val="1"/><c:showPercent val="1"/><c:showLeaderLines val="1"/></c:dLbls><c:holeSize val="62"/></c:doughnutChart>`
          : chart.kind === 'line'
            ? `<c:lineChart><c:grouping val="standard"/>${series}<c:marker val="1"/>${axisIds}</c:lineChart>`
            : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${series}<c:dLbls><c:showVal val="1"/></c:dLbls>${axisIds}</c:barChart>`
      zip.file(
        `xl/charts/chart${id}.xml`,
        `${declaration}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/>${body}${axes}</c:plotArea>${chart.kind === 'doughnut' ? '<c:legend><c:legendPos val="r"/><c:layout/></c:legend>' : ''}<c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`,
      )
      types = types.replace(
        '</Types>',
        `<Override PartName="/xl/charts/chart${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`,
      )
      relations.push(
        `<Relationship Id="rId${id}" Type="${officeNs}/chart" Target="../charts/chart${id}.xml"/>`,
      )
      anchors.push(
        `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.row + 13}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${officeNs}" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
      )
    }
    zip.file(
      `xl/drawings/drawing${sheet}.xml`,
      `${declaration}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}</xdr:wsDr>`,
    )
    zip.file(
      `xl/drawings/_rels/drawing${sheet}.xml.rels`,
      `${declaration}<Relationships xmlns="${relNs}">${relations.join('')}</Relationships>`,
    )
    const path = `xl/worksheets/sheet${sheet}.xml`
    const content = await zip.file(path)!.async('string')
    // Drawing must precede tableParts in SpreadsheetML's ordered worksheet sequence.
    const drawing = '<drawing r:id="reportDrawing"/>'
    zip.file(
      path,
      content.includes('<tableParts')
        ? content.replace('<tableParts', `${drawing}<tableParts`)
        : content.replace('</worksheet>', `${drawing}</worksheet>`),
    )
    const relPath = `xl/worksheets/_rels/sheet${sheet}.xml.rels`
    const rels = zip.file(relPath)
      ? await zip.file(relPath)!.async('string')
      : `${declaration}<Relationships xmlns="${relNs}"></Relationships>`
    zip.file(
      relPath,
      rels.replace(
        '</Relationships>',
        `<Relationship Id="reportDrawing" Type="${officeNs}/drawing" Target="../drawings/drawing${sheet}.xml"/></Relationships>`,
      ),
    )
    types = types.replace(
      '</Types>',
      `<Override PartName="/xl/drawings/drawing${sheet}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
    )
  }
  zip.file('[Content_Types].xml', types)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
