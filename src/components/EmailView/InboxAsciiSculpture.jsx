import { useEffect, useState } from 'react'

export default function InboxAsciiSculpture({ imageUrl = '/inbox_statue.jpg', cols = 126 }) {
  const [asciiText, setAsciiText] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = imageUrl

    img.onload = () => {
      // Monospace aspect correction (~0.52) preserves accurate sculptural geometry
      const charAspect = 0.52
      const rows = Math.round((cols * (img.height / img.width)) * charAspect)

      const canvas = document.createElement('canvas')
      canvas.width = cols
      canvas.height = rows
      const ctx = canvas.getContext('2d')

      if (!ctx) return

      ctx.drawImage(img, 0, 0, cols, rows)
      const imageData = ctx.getImageData(0, 0, cols, rows)
      const data = imageData.data

      // High-density character spectrum for deep BOLD sculptural volume
      const chars = "   ._,:-=!*+&#%$@0W8M"
      const rowsArray = []

      for (let r = 0; r < rows; r++) {
        let rowStr = ''
        for (let c = 0; c < cols; c++) {
          const offset = (r * cols + c) * 4
          const red = data[offset]
          const green = data[offset + 1]
          const blue = data[offset + 2]
          const alpha = data[offset + 3] / 255

          if (alpha < 0.05) {
            rowStr += ' '
            continue
          }

          let luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
          
          // Boost contrast aggressively toward thicker, bolder ASCII symbols
          luminance = Math.min(1, Math.max(0, (luminance - 0.02) * 1.35))

          const charIdx = Math.floor(luminance * (chars.length - 1))
          rowStr += chars[charIdx] || ' '
        }
        rowsArray.push(rowStr)
      }

      // Calculate minimum trailing empty space across ALL rows uniformly
      let minTrailingSpaces = cols
      rowsArray.forEach(r => {
        if (r.trim().length > 0) {
          const trailing = r.length - r.trimEnd().length
          if (trailing < minTrailingSpaces) minTrailingSpaces = trailing
        }
      })

      // Uniformly slice off the empty right-hand margin while preserving 100% of character grid proportions!
      const finalLines = rowsArray.map(r => r.slice(0, Math.max(0, r.length - (minTrailingSpaces || 0))))

      setAsciiText(finalLines.join('\n'))
      setIsLoaded(true)
    }

    img.onerror = (err) => {
      console.error('Failed to load image for BOLD ASCII conversion:', err)
    }
  }, [imageUrl, cols])

  return (
    <div className="inbox-image-ascii-wrapper">
      <pre className="inbox-image-ascii-content font-mono" aria-hidden="true">
        {asciiText || 'Rendering bold architectural ASCII...'}
      </pre>
    </div>
  )
}
