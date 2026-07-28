import { useRef, useEffect, useState } from 'react'

// Draw-to-sign canvas. Calls onChange(dataUrl | null) whenever the
// signature is drawn or cleared. Scales for devicePixelRatio so
// strokes stay crisp on retina/mobile screens.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasStroke = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  function getPoint(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function start(e) {
    e.preventDefault()
    drawing.current = true
    const { x, y } = getPoint(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e) {
    if (!drawing.current) return
    e.preventDefault()
    const { x, y } = getPoint(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStroke.current = true
    setEmpty(false)
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (hasStroke.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasStroke.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative border border-gray-300 rounded bg-white">
        <canvas
          ref={canvasRef}
          className="w-full h-48 touch-none cursor-crosshair rounded"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none">
            Sign here
          </p>
        )}
      </div>
      <button type="button" onClick={clear} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700">
        Clear signature
      </button>
    </div>
  )
}
