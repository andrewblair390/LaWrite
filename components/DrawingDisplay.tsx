'use client'

import { useEffect, useRef } from 'react'
import { Drawing } from '@/lib/drawingStore'

export default function DrawingDisplay({ drawing }: { drawing: Drawing }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const source = drawing.canvasSize ?? { width: rect.width, height: rect.height }
    const sx = rect.width / source.width; const sy = rect.height / source.height
    drawing.strokes.forEach((stroke) => {
      if (!stroke.points.length) return
      ctx.save(); ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color
      ctx.lineWidth = stroke.width * Math.min(sx, sy)
      if (stroke.points.length === 1) {
        ctx.beginPath(); ctx.arc(stroke.points[0].x * sx, stroke.points[0].y * sy, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.beginPath(); ctx.moveTo(stroke.points[0].x * sx, stroke.points[0].y * sy)
        stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x * sx, point.y * sy)); ctx.stroke()
      }
      ctx.restore()
    })
    if (drawing.selection) {
      const box = drawing.selection
      ctx.save()
      ctx.fillStyle = 'rgba(188, 203, 104, 0.12)'
      ctx.strokeStyle = '#84934a'
      ctx.lineWidth = 1.5
      ctx.setLineDash([7, 5])
      ctx.fillRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy)
      ctx.strokeRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy)
      ctx.restore()
    }
  }, [drawing])

  return <canvas ref={canvasRef} aria-label="Live drawing preview" />
}
