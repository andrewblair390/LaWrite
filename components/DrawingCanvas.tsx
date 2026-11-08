'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Stroke = { id: string; color: string; width: number; points: Point[] }

const palette = ['#24271f', '#b84e3c', '#638357', '#4970a4', '#8769a0']

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeRef = useRef<Stroke | null>(null)
  const [color, setColor] = useState(palette[0])
  const [width, setWidth] = useState(3)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [strokeCount, setStrokeCount] = useState(0)

  const drawStroke = useCallback((stroke: Stroke) => {
    const ctx = ctxRef.current
    if (!ctx || !stroke.points.length) return
    ctx.save(); ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color
    ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (stroke.points.length === 1) {
      ctx.beginPath(); ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.beginPath(); ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.stroke()
    }
    ctx.restore()
  }, [])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current; const ctx = ctxRef.current
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    strokesRef.current.forEach(drawStroke)
  }, [drawStroke])

  useEffect(() => {
    ctxRef.current = canvasRef.current?.getContext('2d') ?? null
    redraw(); window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
  }, [redraw])

  const publish = useCallback(async (strokes: Stroke[]) => {
    try {
      const rect = canvasRef.current?.getBoundingClientRect()
      const response = await fetch('/api/drawing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strokes, canvasSize: rect ? { width: rect.width, height: rect.height } : undefined }) })
      if (!response.ok) throw new Error('Sync failed')
      setLastSaved(new Date().toISOString()); setSyncError(false)
    } catch { setSyncError(true) }
  }, [])

  const pointFrom = (event: PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return
      event.preventDefault(); canvas.setPointerCapture(event.pointerId)
      const stroke: Stroke = { id: crypto.randomUUID(), color, width, points: [pointFrom(event)] }
      activeRef.current = stroke; drawStroke(stroke)
    }
    const move = (event: PointerEvent) => {
      const stroke = activeRef.current
      if (!stroke) return
      const point = pointFrom(event); stroke.points.push(point)
      const ctx = ctxRef.current
      if (!ctx) return
      ctx.save(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const prev = stroke.points[stroke.points.length - 2]; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(point.x, point.y); ctx.stroke(); ctx.restore()
    }
    const up = () => {
      const stroke = activeRef.current
      if (!stroke) return
      activeRef.current = null; strokesRef.current = [...strokesRef.current, stroke]
      setStrokeCount(strokesRef.current.length)
      void publish(strokesRef.current)
    }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
    return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up) }
  }, [color, width, drawStroke, publish])

  const clear = () => { activeRef.current = null; strokesRef.current = []; setStrokeCount(0); redraw(); void publish([]) }
  const undo = () => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(strokesRef.current.length); redraw(); void publish(strokesRef.current) }

  return <><div className="canvas-wrap"><canvas ref={canvasRef} aria-label="Drawing canvas"/></div><div className="canvas-tools"><span className="tool-label">INK</span><div className="color-set">{palette.map((swatch) => <button key={swatch} className={`color-button ${color === swatch ? 'selected' : ''}`} style={{ backgroundColor: swatch }} onClick={() => setColor(swatch)} aria-label={`Use ${swatch} ink`} aria-pressed={color === swatch}/>)}</div><label className="width-control">WEIGHT <input type="range" min="1" max="9" value={width} onChange={(event) => setWidth(Number(event.target.value))} aria-label="Pen width"/><span>{width}px</span></label><span className="toolbar-spacer"/><button className="quiet-button" onClick={undo} disabled={!strokeCount}>Undo</button><button className="quiet-button" onClick={clear}>Clear page</button><span className="sync-note">{syncError ? 'SYNC ISSUE' : lastSaved ? `SYNCED ${new Date(lastSaved).toLocaleTimeString()}` : 'READY TO DRAW'}</span></div></>
}
