'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Selection } from '@/lib/drawingStore'

type Point = { x: number; y: number }
type Stroke = { id: string; color: string; width: number; points: Point[] }

const palette = ['#24271f', '#b84e3c', '#638357', '#4970a4', '#8769a0']

function makeSelection(start: Point, end: Point): Selection {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeRef = useRef<Stroke | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const activePointerTypeRef = useRef<string | null>(null)
  const penDetectedRef = useRef(false)
  const selectionStartRef = useRef<Point | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  const [color, setColor] = useState(palette[0])
  const [width, setWidth] = useState(3)
  const [selectMode, setSelectMode] = useState(false)
  const [palmGuard, setPalmGuard] = useState(true)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [draftSelection, setDraftSelection] = useState<Selection | null>(null)
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

  const publish = useCallback(async (strokes: Stroke[], nextSelection = selectionRef.current) => {
    try {
      const rect = canvasRef.current?.getBoundingClientRect()
      const response = await fetch('/api/drawing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strokes, selection: nextSelection, canvasSize: rect ? { width: rect.width, height: rect.height } : undefined }) })
      if (!response.ok) throw new Error('Sync failed')
      setLastSaved(new Date().toISOString()); setSyncError(false)
    } catch { setSyncError(true) }
  }, [])

  const pointFrom = (event: PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return
      if (event.pointerType === 'pen') {
        penDetectedRef.current = true
        if (activePointerTypeRef.current === 'touch') {
          activeRef.current = null; activePointerIdRef.current = null; activePointerTypeRef.current = null
          selectionStartRef.current = null; setDraftSelection(null); redraw()
        }
      }
      if (event.pointerType === 'touch' && palmGuard && penDetectedRef.current) return
      if (activePointerIdRef.current !== null) return
      if (event.pointerType === 'touch' && !event.isPrimary) return
      event.preventDefault(); canvas.setPointerCapture(event.pointerId)
      activePointerIdRef.current = event.pointerId
      activePointerTypeRef.current = event.pointerType
      const point = pointFrom(event)
      if (selectMode) {
        selectionStartRef.current = point
        setDraftSelection({ x: point.x, y: point.y, width: 0, height: 0 })
        return
      }
      const stroke: Stroke = { id: crypto.randomUUID(), color, width, points: [point] }
      activeRef.current = stroke; drawStroke(stroke)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return
      if (selectMode && selectionStartRef.current) {
        const coalesced = event.getCoalescedEvents?.() ?? []
        const samples = coalesced.length ? coalesced : [event]
        setDraftSelection(makeSelection(selectionStartRef.current, pointFrom(samples[samples.length - 1])))
        return
      }
      const stroke = activeRef.current
      if (!stroke) return
      const ctx = ctxRef.current
      if (!ctx) return
      ctx.save(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const coalesced = event.getCoalescedEvents?.() ?? []
      const samples = coalesced.length ? coalesced : [event]
      for (const sample of samples) {
        const point = pointFrom(sample)
        const previous = stroke.points[stroke.points.length - 1]
        if (previous.x === point.x && previous.y === point.y) continue
        stroke.points.push(point)
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke()
      }
      ctx.restore()
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return
      if (selectMode && selectionStartRef.current) {
        const rect = makeSelection(selectionStartRef.current, pointFrom(event))
        selectionStartRef.current = null; setDraftSelection(null)
        const next = rect.width >= 12 && rect.height >= 12 ? rect : null
        selectionRef.current = next; setSelection(next)
        activePointerIdRef.current = null; activePointerTypeRef.current = null
        void publish(strokesRef.current, next)
        return
      }
      const stroke = activeRef.current
      if (stroke) {
        const point = pointFrom(event)
        const previous = stroke.points[stroke.points.length - 1]
        if (previous && (previous.x !== point.x || previous.y !== point.y)) {
          stroke.points.push(point)
          const ctx = ctxRef.current
          if (ctx) {
            ctx.save(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'
            ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke(); ctx.restore()
          }
        }
        activeRef.current = null; strokesRef.current = [...strokesRef.current, stroke]
        setStrokeCount(strokesRef.current.length)
        void publish(strokesRef.current)
      }
      activePointerIdRef.current = null; activePointerTypeRef.current = null
    }
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return
      if (selectionStartRef.current) {
        selectionStartRef.current = null
        activePointerIdRef.current = null; activePointerTypeRef.current = null
        setDraftSelection(null)
        return
      }
      up(event)
    }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel)
    return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel) }
  }, [color, width, selectMode, palmGuard, drawStroke, publish, redraw])

  const clear = () => {
    activeRef.current = null; strokesRef.current = []; selectionRef.current = null
    activePointerIdRef.current = null; activePointerTypeRef.current = null; selectionStartRef.current = null
    setSelection(null); setDraftSelection(null); setStrokeCount(0); redraw(); void publish([] , null)
  }
  const clearSelection = () => { selectionRef.current = null; setSelection(null); setDraftSelection(null); void publish(strokesRef.current, null) }
  const undo = () => { strokesRef.current = strokesRef.current.slice(0, -1); setStrokeCount(strokesRef.current.length); redraw(); void publish(strokesRef.current) }
  const visibleSelection = draftSelection ?? selection

  return <><div className="canvas-wrap"><div className={`paper-surface ${selectMode ? 'is-selecting' : ''}`}><canvas ref={canvasRef} aria-label="Ruled note page"/><svg className="selection-overlay" aria-hidden="true">{visibleSelection && <rect x={visibleSelection.x} y={visibleSelection.y} width={visibleSelection.width} height={visibleSelection.height} rx="3"/>}</svg></div></div><div className="canvas-tools note-tools"><div className="mode-switch" role="group" aria-label="Canvas mode"><button className={`mode-button ${!selectMode ? 'active' : ''}`} onClick={() => setSelectMode(false)} aria-pressed={!selectMode}>✎ <span>Ink</span></button><button className={`mode-button ${selectMode ? 'active' : ''}`} onClick={() => setSelectMode(true)} aria-pressed={selectMode}>▧ <span>Select area</span></button></div><button className={`guard-toggle ${palmGuard ? 'enabled' : ''}`} onClick={() => setPalmGuard((value) => !value)} aria-pressed={palmGuard} title="With palm guard on, touch input is ignored after a stylus is detected">{palmGuard ? 'Palm guard on' : 'Touch enabled'}</button>{selection && <button className="quiet-button clear-selection" onClick={clearSelection}>Clear box</button>}<span className="tool-divider"/><div className={`color-set ${selectMode ? 'muted-tools' : ''}`}>{palette.map((swatch) => <button key={swatch} className={`color-button ${color === swatch ? 'selected' : ''}`} style={{ backgroundColor: swatch }} onClick={() => setColor(swatch)} aria-label={`Use ${swatch} ink`} aria-pressed={color === swatch} disabled={selectMode}/>)}</div><label className={`width-control ${selectMode ? 'muted-tools' : ''}`}>PEN <input type="range" min="1" max="9" value={width} onChange={(event) => setWidth(Number(event.target.value))} aria-label="Pen width" disabled={selectMode}/><span>{width}px</span></label><span className="toolbar-spacer"/><button className="quiet-button" onClick={undo} disabled={!strokeCount}>Undo</button><button className="quiet-button" onClick={clear}>Clear</button><span className="sync-note">{syncError ? 'SYNC ISSUE' : selection ? 'AREA SELECTED' : selectMode ? 'DRAG A BOX AROUND THE MATH' : lastSaved ? `SAVED ${new Date(lastSaved).toLocaleTimeString()}` : 'READY TO WRITE'}</span></div></>
}
