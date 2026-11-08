'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawing, Region } from '@/lib/drawingStore'
import BoardView, { BoardMode } from '@/components/BoardView'
import { patchRegion, recognizeRegion } from '@/lib/ink'

export default function ComputerPage() {
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [connected, setConnected] = useState(false)
  const [mode, setMode] = useState<BoardMode>('latex')
  const [panelOpen, setPanelOpen] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const drawingRef = useRef<Drawing | null>(null)

  drawingRef.current = drawing

  useEffect(() => {
    let stopped = false
    let polling = false
    const receiveDrawing = (data: Drawing | null) => {
      if (!data) return
      setDrawing((current) => (current && current.updatedAt > data.updatedAt ? current : data))
    }
    const refresh = async () => {
      if (stopped || polling) return
      polling = true
      try {
        const response = await fetch('/api/drawing', { cache: 'no-store' })
        if (!response.ok) throw new Error('Drawing sync failed')
        receiveDrawing((await response.json()) as Drawing | null)
        setConnected(true)
      } catch {
        if (!stopped) setConnected(false)
      } finally { polling = false }
    }
    void refresh()
    const poll = window.setInterval(() => { void refresh() }, 750)
    const stream = new EventSource('/api/drawing/stream')
    stream.addEventListener('connected', () => setConnected(true))
    stream.addEventListener('drawing', (event: MessageEvent) => {
      try { receiveDrawing(JSON.parse(event.data) as Drawing) } catch { /* keep last good drawing */ }
    })
    stream.onerror = () => { /* polling keeps us in sync */ }
    return () => { stopped = true; window.clearInterval(poll); stream.close() }
  }, [])

  // Keyboard: the projector is driven from the keyboard so the mouse never
  // has to appear on the students' screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      const key = event.key.toLowerCase()
      if (key === 'm') setMode((value) => (value === 'ink' ? 'latex' : 'ink'))
      if (key === 'c') setPanelOpen((value) => !value)
      if (key === 'escape') setPanelOpen(false)
      if (key === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen().catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const regions: Region[] = drawing?.regions ?? []
  const readyCount = regions.filter((r) => r.status === 'ready').length

  const reRecognize = useCallback(async (region: Region) => {
    const current = drawingRef.current
    if (!current) return
    setBusyId(region.id)
    await patchRegion(region.id, { status: 'pending', error: null })
    try {
      const latex = await recognizeRegion(current.strokes, current.canvasSize, region.rect)
      await patchRegion(region.id, { latex, status: 'ready', error: null })
    } catch (cause) {
      await patchRegion(region.id, { status: 'failed', error: cause instanceof Error ? cause.message : 'Recognition failed.' })
    } finally { setBusyId(null) }
  }, [])

  const removeRegion = useCallback(async (id: string) => {
    await fetch(`/api/drawing?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }, [])

  const clearPage = useCallback(async () => {
    await fetch('/api/drawing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strokes: [], regions: [] }),
    })
  }, [])

  return (
    <div className="projector">
      <BoardView drawing={drawing} mode={mode} showOutlines={panelOpen} />

      {!panelOpen && (
        <button className="panel-tab" onClick={() => setPanelOpen(true)} aria-label="Open control panel">
          ⚙
        </button>
      )}

      <aside className={`control-panel ${panelOpen ? 'is-open' : ''}`} aria-hidden={!panelOpen}>
        <div className="control-head">
          <strong>Control panel</strong>
          <span className="status-pill">
            <span className="status-dot" style={{ background: connected ? '#91a646' : '#c18c53' }} />
            {connected ? 'LIVE' : 'RECONNECTING'}
          </span>
          <button className="quiet-button" onClick={() => setPanelOpen(false)} aria-label="Hide control panel">Hide</button>
        </div>

        <div className="control-section">
          <div className="control-label">Projector shows</div>
          <div className="mode-switch control-modes" role="group" aria-label="Board mode">
            <button className={`mode-button ${mode === 'ink' ? 'active' : ''}`} onClick={() => setMode('ink')} aria-pressed={mode === 'ink'}>
              ✎ <span>Handwriting</span>
            </button>
            <button className={`mode-button ${mode === 'latex' ? 'active' : ''}`} onClick={() => setMode('latex')} aria-pressed={mode === 'latex'}>
              ∑ <span>LaTeX</span>
            </button>
          </div>
          <p className="control-hint">
            <kbd>M</kbd> switch mode · <kbd>C</kbd> hide this panel · <kbd>F</kbd> fullscreen
          </p>
        </div>

        <div className="control-section control-grow">
          <div className="control-label">
            Equations {regions.length ? `· ${readyCount}/${regions.length} ready` : ''}
          </div>

          {!regions.length && (
            <p className="control-hint">
              Box an expression on the tablet and it appears here, recognized automatically.
            </p>
          )}

          <ul className="region-list">
            {regions.map((region, index) => (
              <li key={region.id} className={`region-row is-${region.status}`}>
                <div className="region-row-head">
                  <span className="region-index">{index + 1}</span>
                  <span className={`region-status is-${region.status}`}>
                    {region.status === 'pending' ? 'reading…' : region.status === 'failed' ? 'failed' : 'ready'}
                  </span>
                  <span className="toolbar-spacer" />
                  <button className="quiet-button" disabled={busyId === region.id} onClick={() => void reRecognize(region)}>
                    {busyId === region.id ? '…' : 'Redo'}
                  </button>
                  <button className="quiet-button" onClick={() => void removeRegion(region.id)}>Delete</button>
                </div>
                <RegionEditor region={region} />
                {region.error && <div className="region-error">{region.error}</div>}
              </li>
            ))}
          </ul>
        </div>

        <div className="control-section control-footer">
          <button className="quiet-button" onClick={() => void clearPage()}>Clear page</button>
        </div>
      </aside>
    </div>
  )
}

/**
 * One editable equation. Local draft state keeps typing responsive while the
 * SSE stream keeps pushing updates; the draft is only replaced when the stored
 * value actually changes, so a tablet edit still wins if it lands first.
 */
function RegionEditor({ region }: { region: Region }) {
  const [draft, setDraft] = useState(region.latex)
  const [dirty, setDirty] = useState(false)
  const lastStored = useRef(region.latex)

  useEffect(() => {
    if (region.latex !== lastStored.current) {
      lastStored.current = region.latex
      if (!dirty) setDraft(region.latex)
    }
  }, [region.latex, dirty])

  const commit = async () => {
    if (!dirty) return
    setDirty(false)
    lastStored.current = draft
    await patchRegion(region.id, { latex: draft, status: 'ready', error: null })
  }

  return (
    <textarea
      className="region-input"
      value={draft}
      spellCheck={false}
      placeholder={region.status === 'pending' ? 'Recognizing…' : 'LaTeX'}
      onChange={(event) => { setDraft(event.target.value); setDirty(true) }}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void commit() }
      }}
      aria-label={`LaTeX for equation ${region.id}`}
    />
  )
}
