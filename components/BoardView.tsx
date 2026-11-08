'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Drawing, Region } from '@/lib/drawingStore'
import { typesetInto } from '@/lib/ink'

export type BoardMode = 'ink' | 'latex'

const PAPER = '#fffefa'

/**
 * The student-facing board.
 *
 * In `latex` mode every `ready` region's ink is painted over with the paper
 * colour and replaced, at the same coordinates, by typeset math. Keeping the
 * geometry identical between modes is the whole point: arrows, labels and
 * working that were never boxed stay exactly where they were written.
 *
 * Scaling is uniform (letterboxed) rather than stretched per axis, so a tablet
 * page shown on a differently-shaped projector keeps its proportions and the
 * typeset overlays stay registered to the ink underneath.
 */
export default function BoardView({
  drawing,
  mode,
  showOutlines = false,
}: {
  drawing: Drawing | null
  mode: BoardMode
  showOutlines?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const rect = wrap.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const source = drawing?.canvasSize ?? { width: 1400, height: 900 }
  const scale = size.width && size.height
    ? Math.min(size.width / Math.max(1, source.width), size.height / Math.max(1, source.height))
    : 0
  const offsetX = (size.width - source.width * scale) / 2
  const offsetY = (size.height - source.height * scale) / 2
  const regions: Region[] = drawing?.regions ?? []
  const swapped = mode === 'latex' ? regions.filter((r) => r.status === 'ready' && r.latex.trim()) : []

  // Paint ink, then mask out the regions that are being replaced.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !scale) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(size.width * dpr))
    canvas.height = Math.max(1, Math.round(size.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)

    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const stroke of drawing?.strokes ?? []) {
      if (!stroke.points.length) continue
      ctx.save()
      ctx.strokeStyle = stroke.color
      ctx.fillStyle = stroke.color
      ctx.lineWidth = stroke.width
      if (stroke.points.length === 1) {
        ctx.beginPath()
        ctx.arc(stroke.points[0].x, stroke.points[0].y, Math.max(stroke.width / 2, 0.5), 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
        for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Erase the ink under each swapped region so the typeset math replaces it.
    for (const region of swapped) {
      const pad = 4
      ctx.fillStyle = PAPER
      ctx.fillRect(region.rect.x - pad, region.rect.y - pad, region.rect.width + pad * 2, region.rect.height + pad * 2)
    }

    ctx.restore()
  }, [drawing, size.width, size.height, scale, offsetX, offsetY, mode, swapped.length,
      // Re-mask when any region's latex/status changes.
      regions.map((r) => `${r.id}:${r.status}:${r.latex}`).join('|')])

  return (
    <div className="board-view" ref={wrapRef}>
      <canvas ref={canvasRef} className="board-canvas" aria-label="Lesson board" />

      {showOutlines && scale > 0 && regions.map((region) => (
        <div
          key={`outline-${region.id}`}
          className={`board-outline is-${region.status}`}
          style={{
            left: offsetX + region.rect.x * scale,
            top: offsetY + region.rect.y * scale,
            width: region.rect.width * scale,
            height: region.rect.height * scale,
          }}
        />
      ))}

      {scale > 0 && swapped.map((region) => (
        <TypesetRegion
          key={region.id}
          latex={region.latex}
          left={offsetX + region.rect.x * scale}
          top={offsetY + region.rect.y * scale}
          width={region.rect.width * scale}
          height={region.rect.height * scale}
        />
      ))}
    </div>
  )
}

function TypesetRegion({ latex, left, top, width, height }: {
  latex: string; left: number; top: number; width: number; height: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    setFailed(false)
    void typesetInto(host, latex, { width, height })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [latex, width, height])

  return (
    <div className="board-typeset" style={{ left, top, width, height }}>
      {failed
        ? <span className="board-typeset-raw">{latex}</span>
        : <div ref={hostRef} />}
    </div>
  )
}
