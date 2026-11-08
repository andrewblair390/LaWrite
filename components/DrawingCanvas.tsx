'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Region, Selection } from '@/lib/drawingStore'
import { createId, hasInkInRect, patchRegion, recognizeRegion, typesetInto } from '@/lib/ink'

type Point = { x: number; y: number }
type Stroke = { id: string; color: string; width: number; points: Point[] }
type Mode = 'ink' | 'select' | 'erase'

const palette = ['#24271f', '#b84e3c', '#638357', '#4970a4', '#8769a0']
const MIN_BOX = 12

function makeSelection(start: Point, end: Point): Selection {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

function rectContains(rect: Selection, point: Point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}

function nearStroke(stroke: Stroke, point: Point, radius: number) {
  const limit = radius + stroke.width / 2
  const limitSquared = limit * limit
  if (stroke.points.length === 1) {
    const dx = stroke.points[0].x - point.x, dy = stroke.points[0].y - point.y
    return dx * dx + dy * dy <= limitSquared
  }
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const length = dx * dx + dy * dy
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0
    const ex = point.x - (a.x + t * dx), ey = point.y - (a.y + t * dy)
    if (ex * ex + ey * ey <= limitSquared) return true
  }
  return false
}

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeRef = useRef<Stroke | null>(null)
  const undoStackRef = useRef<Stroke[][]>([])
  const eraseBeforeRef = useRef<Stroke[] | null>(null)
  const publishQueueRef = useRef<Promise<void>>(Promise.resolve())
  const inFlightRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const activePointerTypeRef = useRef<string | null>(null)
  const penDetectedRef = useRef(false)
  const selectionStartRef = useRef<Point | null>(null)
  const regionsRef = useRef<Region[]>([])

  const [color, setColor] = useState(palette[0])
  const [width, setWidth] = useState(3)
  const [mode, setMode] = useState<Mode>('ink')
  const [palmGuard, setPalmGuard] = useState(true)
  const [regions, setRegions] = useState<Region[]>([])
  const [draftSelection, setDraftSelection] = useState<Selection | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [strokeCount, setStrokeCount] = useState(0)
  const [undoCount, setUndoCount] = useState(0)

  const commitRegions = useCallback((next: Region[]) => {
    regionsRef.current = next
    setRegions(next)
  }, [])

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

  const publish = useCallback((strokes: Stroke[], nextRegions = regionsRef.current) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const body = JSON.stringify({
      strokes,
      regions: nextRegions,
      canvasSize: rect ? { width: rect.width, height: rect.height } : undefined,
    })
    inFlightRef.current += 1
    publishQueueRef.current = publishQueueRef.current.then(async () => {
      try {
        const response = await fetch('/api/drawing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        if (!response.ok) throw new Error('Sync failed')
      } catch { /* Nothing is surfaced on the board; the next stroke republishes. */ }
      finally { inFlightRef.current -= 1 }
    })
    return publishQueueRef.current
  }, [])

  /**
   * Restore the page on load.
   *
   * The store is file-backed, so reloading the tablet mid-lesson must not lose
   * the ink or the boxes — without this the tablet comes back empty while the
   * projector still shows everything, and tapping a box finds nothing to edit.
   * Stroke and rect coordinates are in the publishing canvas's CSS pixels, so
   * they are rescaled if this canvas is a different size.
   */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/drawing', { cache: 'no-store' })
        if (!response.ok) return
        const data = (await response.json()) as
          { strokes?: Stroke[]; regions?: Region[]; canvasSize?: { width: number; height: number } } | null
        if (cancelled || !data) return
        if (strokesRef.current.length || regionsRef.current.length) return

        const rect = canvasRef.current?.getBoundingClientRect()
        const from = data.canvasSize
        const sx = rect && from?.width ? rect.width / from.width : 1
        const sy = rect && from?.height ? rect.height / from.height : 1

        strokesRef.current = (data.strokes ?? []).map((stroke) => ({
          ...stroke,
          points: stroke.points.map((point) => ({ x: point.x * sx, y: point.y * sy })),
        }))
        setStrokeCount(strokesRef.current.length)
        commitRegions((data.regions ?? []).map((region) => ({
          ...region,
          rect: {
            x: region.rect.x * sx, y: region.rect.y * sy,
            width: region.rect.width * sx, height: region.rect.height * sy,
          },
        })))
        redraw()
      } catch { /* start with a blank page */ }
    })()
    return () => { cancelled = true }
  }, [commitRegions, redraw])

  /**
   * Mirror LaTeX edits made on the laptop back onto the tablet.
   *
   * Only `latex`/`status`/`error` are taken from the server — the tablet owns
   * the ink and the box geometry, so adopting the server's strokes here would
   * fight with whatever the pen is doing right now. Deletions are applied only
   * when no publish is in flight, otherwise a box created a moment ago would
   * be removed before the server had heard about it.
   */
  useEffect(() => {
    const stream = new EventSource('/api/drawing/stream')
    stream.addEventListener('drawing', (event: MessageEvent) => {
      try {
        const incoming = JSON.parse(event.data) as { regions?: Region[] }
        const serverRegions = incoming.regions ?? []
        const byId = new Map(serverRegions.map((region) => [region.id, region]))
        const settled = inFlightRef.current === 0
        const merged = regionsRef.current
          .filter((region) => !settled || byId.has(region.id))
          .map((region) => {
            const remote = byId.get(region.id)
            return remote ? { ...region, latex: remote.latex, status: remote.status, error: remote.error } : region
          })
        const changed = merged.length !== regionsRef.current.length ||
          merged.some((region, index) => {
            const before = regionsRef.current[index]
            return !before || before.latex !== region.latex || before.status !== region.status
          })
        if (changed) commitRegions(merged)
      } catch { /* keep local regions */ }
    })
    return () => stream.close()
  }, [commitRegions])

  /** Box released: record the region, publish it, then recognize it. */
  const addRegion = useCallback(async (rect: Selection) => {
    const region: Region = { id: createId(), rect, latex: '', status: 'pending', error: null }
    const next = [...regionsRef.current, region]
    commitRegions(next)
    await publish(strokesRef.current, next)

    if (!hasInkInRect(strokesRef.current, rect)) {
      commitRegions(regionsRef.current.map((r) => r.id === region.id
        ? { ...r, status: 'failed' as const, error: 'That box has no ink in it.' } : r))
      await patchRegion(region.id, { status: 'failed', error: 'That box has no ink in it.' })
      return
    }

    const canvas = canvasRef.current?.getBoundingClientRect()
    try {
      const latex = await recognizeRegion(strokesRef.current, canvas ? { width: canvas.width, height: canvas.height } : undefined, rect)
      commitRegions(regionsRef.current.map((r) => r.id === region.id
        ? { ...r, latex, status: 'ready' as const, error: null } : r))
      await patchRegion(region.id, { latex, status: 'ready', error: null })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Recognition failed.'
      commitRegions(regionsRef.current.map((r) => r.id === region.id
        ? { ...r, status: 'failed' as const, error: message } : r))
      await patchRegion(region.id, { status: 'failed', error: message })
    }
  }, [commitRegions, publish])

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
      if (activePointerIdRef.current !== null) {
        // A release for the previous pointer never arrived. Pointer capture
        // normally guarantees it, but capture can be lost — a stylus leaving
        // the digitizer abruptly is the common case. Without this check the id
        // stays latched and every later stroke is dropped by this very gate,
        // which reads as "strokes sometimes don't register".
        // Not holding capture for it means it is no longer a live pointer,
        // whether capture was lost or never granted. A genuine second finger
        // is still blocked, because capture for the first one is held.
        if (canvas.hasPointerCapture(activePointerIdRef.current)) return
        const abandoned = activeRef.current
        if (abandoned && abandoned.points.length) {
          // Keep the ink that was already drawn rather than discarding it.
          undoStackRef.current = [...undoStackRef.current, strokesRef.current]
          setUndoCount(undoStackRef.current.length)
          strokesRef.current = [...strokesRef.current, abandoned]
          setStrokeCount(strokesRef.current.length)
          void publish(strokesRef.current)
        }
        activeRef.current = null
        activePointerIdRef.current = null
        activePointerTypeRef.current = null
        selectionStartRef.current = null
        setDraftSelection(null)
      }
      if (event.pointerType === 'touch' && !event.isPrimary) return
      event.preventDefault()
      try { canvas.setPointerCapture(event.pointerId) } catch { /* Continue drawing if pointer capture is unavailable. */ }
      activePointerIdRef.current = event.pointerId
      activePointerTypeRef.current = event.pointerType
      const point = pointFrom(event)
      if (mode === 'select') {
        selectionStartRef.current = point
        setDraftSelection({ x: point.x, y: point.y, width: 0, height: 0 })
        return
      }
      if (mode === 'erase') {
        eraseBeforeRef.current = strokesRef.current
        const next = strokesRef.current.filter((stroke) => !nearStroke(stroke, point, Math.max(10, width * 2)))
        if (next.length !== strokesRef.current.length) { strokesRef.current = next; redraw() }
        return
      }
      const stroke: Stroke = { id: createId(), color, width, points: [point] }
      activeRef.current = stroke; drawStroke(stroke)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return
      if (mode === 'select' && selectionStartRef.current) {
        const coalesced = event.getCoalescedEvents?.() ?? []
        const samples = coalesced.length ? coalesced : [event]
        setDraftSelection(makeSelection(selectionStartRef.current, pointFrom(samples[samples.length - 1])))
        return
      }
      if (mode === 'erase' && eraseBeforeRef.current) {
        const coalesced = event.getCoalescedEvents?.() ?? []
        for (const sample of coalesced.length ? coalesced : [event]) {
          const point = pointFrom(sample)
          const next = strokesRef.current.filter((stroke) => !nearStroke(stroke, point, Math.max(10, width * 2)))
          if (next.length !== strokesRef.current.length) { strokesRef.current = next; redraw() }
        }
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
      if (mode === 'select' && selectionStartRef.current) {
        const start = selectionStartRef.current
        const point = pointFrom(event)
        const rect = makeSelection(start, point)
        selectionStartRef.current = null; setDraftSelection(null)
        activePointerIdRef.current = null; activePointerTypeRef.current = null
        if (rect.width >= MIN_BOX && rect.height >= MIN_BOX) {
          void addRegion(rect)
        } else {
          // Too small to be a box: treat it as a tap and open the newest
          // region under the finger for editing.
          const hit = [...regionsRef.current].reverse().find((region) => rectContains(region.rect, point))
          if (hit) setEditingId(hit.id)
        }
        return
      }
      if (mode === 'erase' && eraseBeforeRef.current) {
        const point = pointFrom(event)
        const atEnd = strokesRef.current.filter((stroke) => !nearStroke(stroke, point, Math.max(10, width * 2)))
        if (atEnd.length !== strokesRef.current.length) { strokesRef.current = atEnd; redraw() }
        if (strokesRef.current.length !== eraseBeforeRef.current.length) {
          undoStackRef.current = [...undoStackRef.current, eraseBeforeRef.current]
          setUndoCount(undoStackRef.current.length); setStrokeCount(strokesRef.current.length)
          void publish(strokesRef.current)
        }
        eraseBeforeRef.current = null
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
        activeRef.current = null; undoStackRef.current = [...undoStackRef.current, strokesRef.current]
        setUndoCount(undoStackRef.current.length); strokesRef.current = [...strokesRef.current, stroke]
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
    // Second line of defence: if capture is lost the release is delivered
    // somewhere other than the canvas, so watch the window too. `up` ignores
    // ids it does not recognise, which makes the duplicate delivery in the
    // normal case a no-op.
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel)
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel)
    }
  }, [color, width, mode, palmGuard, drawStroke, publish, redraw, addRegion])

  const clear = () => {
    if (strokesRef.current.length) { undoStackRef.current = [...undoStackRef.current, strokesRef.current]; setUndoCount(undoStackRef.current.length) }
    activeRef.current = null; strokesRef.current = []
    activePointerIdRef.current = null; activePointerTypeRef.current = null; selectionStartRef.current = null
    commitRegions([]); setDraftSelection(null); setEditingId(null); setStrokeCount(0); redraw()
    void publish([], [])
  }
  const undo = () => {
    const previous = undoStackRef.current[undoStackRef.current.length - 1]
    if (!previous) return
    undoStackRef.current = undoStackRef.current.slice(0, -1); setUndoCount(undoStackRef.current.length)
    strokesRef.current = previous; setStrokeCount(previous.length); redraw(); void publish(previous)
  }

  const deleteRegion = async (id: string) => {
    const next = regionsRef.current.filter((region) => region.id !== id)
    commitRegions(next)
    setEditingId(null)
    await fetch(`/api/drawing?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  const saveRegion = async (id: string, latex: string) => {
    commitRegions(regionsRef.current.map((region) => region.id === id
      ? { ...region, latex, status: 'ready' as const, error: null } : region))
    await patchRegion(id, { latex, status: 'ready', error: null })
  }

  const redoRegion = async (id: string) => {
    const region = regionsRef.current.find((item) => item.id === id)
    if (!region) return
    commitRegions(regionsRef.current.map((item) => item.id === id
      ? { ...item, status: 'pending' as const, error: null } : item))
    await patchRegion(id, { status: 'pending', error: null })
    const canvas = canvasRef.current?.getBoundingClientRect()
    try {
      const latex = await recognizeRegion(strokesRef.current, canvas ? { width: canvas.width, height: canvas.height } : undefined, region.rect)
      await saveRegion(id, latex)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Recognition failed.'
      commitRegions(regionsRef.current.map((item) => item.id === id
        ? { ...item, status: 'failed' as const, error: message } : item))
      await patchRegion(id, { status: 'failed', error: message })
    }
  }

  const editing = regions.find((region) => region.id === editingId) ?? null


  return <>
    <div className="canvas-wrap">
      <div className={`paper-surface ${mode === 'select' ? 'is-selecting' : ''} ${mode === 'erase' ? 'is-erasing' : ''}`}>
        <canvas ref={canvasRef} aria-label="Ruled note page" />
        <svg className="selection-overlay" aria-hidden="true">
          {regions.map((region) => (
            <g key={region.id}>
              <rect className={`region-rect is-${region.status}`} x={region.rect.x} y={region.rect.y}
                width={region.rect.width} height={region.rect.height} rx="3" />
            </g>
          ))}
          {draftSelection && <rect x={draftSelection.x} y={draftSelection.y}
            width={draftSelection.width} height={draftSelection.height} rx="3" />}
        </svg>
      </div>
    </div>

    <div className="canvas-tools note-tools">
      <div className="mode-switch" role="group" aria-label="Canvas mode">
        <button className={`mode-button ${mode === 'ink' ? 'active' : ''}`} onClick={() => setMode('ink')} aria-pressed={mode === 'ink'}>✎ <span>Ink</span></button>
        <button className={`mode-button ${mode === 'erase' ? 'active' : ''}`} onClick={() => setMode('erase')} aria-pressed={mode === 'erase'}>⌫ <span>Erase</span></button>
        <button className={`mode-button ${mode === 'select' ? 'active' : ''}`} onClick={() => setMode('select')} aria-pressed={mode === 'select'}>▧ <span>Select</span></button>
      </div>
      <button className={`guard-toggle ${palmGuard ? 'enabled' : ''}`} onClick={() => setPalmGuard((value) => !value)} aria-pressed={palmGuard} title="With palm guard on, touch input is ignored after a stylus is detected">{palmGuard ? 'Palm guard on' : 'Touch enabled'}</button>
      <span className="tool-divider" />
      <div className={`color-set ${mode !== 'ink' ? 'muted-tools' : ''}`}>
        {palette.map((swatch) => <button key={swatch} className={`color-button ${color === swatch ? 'selected' : ''}`} style={{ backgroundColor: swatch }} onClick={() => setColor(swatch)} aria-label={`Use ${swatch} ink`} aria-pressed={color === swatch} disabled={mode !== 'ink'} />)}
      </div>
      <label className={`width-control ${mode !== 'ink' ? 'muted-tools' : ''}`}>PEN <input type="range" min="1" max="9" value={width} onChange={(event) => setWidth(Number(event.target.value))} aria-label="Pen width" disabled={mode !== 'ink'} /><span>{width}px</span></label>
      <span className="toolbar-spacer" />
      <button className="quiet-button" onClick={undo} disabled={!undoCount}>Undo</button>
      <button className="quiet-button" onClick={clear}>Clear</button>
    </div>

    {editing && (
      <RegionSheet
        region={editing}
        onClose={() => setEditingId(null)}
        onSave={(latex) => void saveRegion(editing.id, latex)}
        onRedo={() => void redoRegion(editing.id)}
        onDelete={() => void deleteRegion(editing.id)}
      />
    )}
  </>
}

/** Tablet-sized editor for one equation, opened by tapping its box. */
function RegionSheet({ region, onClose, onSave, onRedo, onDelete }: {
  region: Region
  onClose: () => void
  onSave: (latex: string) => void
  onRedo: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(region.latex)
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => { setDraft(region.latex) }, [region.latex])

  useEffect(() => {
    const host = previewRef.current
    if (!host || !draft.trim()) return
    let cancelled = false
    setPreviewFailed(false)
    const timer = window.setTimeout(() => {
      void typesetInto(host, draft).catch(() => { if (!cancelled) setPreviewFailed(true) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [draft])

  return (
    <div className="sheet-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="region-sheet" role="dialog" aria-label="Edit equation">
        <div className="sheet-head">
          <strong>Edit equation</strong>
          <span className="toolbar-spacer" />
          <button className="quiet-button" onClick={onClose}>Done</button>
        </div>

        <textarea
          className="sheet-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={region.status === 'pending' ? 'Recognizing…' : 'LaTeX for this box'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="LaTeX source"
        />

        <div className="sheet-preview">
          {previewFailed ? <span className="board-typeset-raw">{draft}</span> : <div ref={previewRef} />}
        </div>

        {region.error && <div className="region-error">{region.error}</div>}

        <div className="sheet-actions">
          <button className="quiet-button" onClick={onRedo}>Re-recognize</button>
          <button className="quiet-button" onClick={onDelete}>Delete box</button>
          <span className="toolbar-spacer" />
          <button className="primary-button" onClick={() => { onSave(draft); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}
