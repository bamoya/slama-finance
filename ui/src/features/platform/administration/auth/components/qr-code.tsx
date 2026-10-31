import QRCode from 'qrcode'
import { useMemo } from 'react'

/** Render the enrollment URI locally as SVG; the secret never leaves the browser. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const size = modules.size
    let path = ''
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if (modules.get(x, y)) path += `M${x} ${y}h1v1h-1z`
    return { size, path }
  }, [value])
  const quiet = 3
  const total = matrix.size + quiet * 2
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-quiet} ${-quiet} ${total} ${total}`}
      className="size-48 rounded-lg bg-white"
      shapeRendering="crispEdges"
    >
      <path d={matrix.path} fill="#000" />
    </svg>
  )
}
