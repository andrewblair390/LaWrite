'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Drawing } from '@/lib/drawingStore'
import DrawingDisplay from '@/components/DrawingDisplay'
import LatexTranslator from '@/components/LatexTranslator'

export default function ComputerPage() {
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/drawing').then((response) => response.json()).then((data: Drawing | null) => setDrawing(data)).catch(() => setConnected(false))
    const stream = new EventSource('/api/drawing/stream')
    stream.addEventListener('connected', () => setConnected(true))
    stream.addEventListener('drawing', (event: MessageEvent) => {
      try { setDrawing(JSON.parse(event.data) as Drawing) } catch { /* Ignore malformed events and keep the last valid drawing. */ }
    })
    stream.onerror = () => setConnected(false)
    return () => stream.close()
  }, [])

  const clearDrawing = async () => {
    await fetch('/api/drawing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strokes: [] }) })
  }
  const strokeCount = drawing?.strokes.length ?? 0

  return <div className="workspace"><header className="workspace-header"><div className="header-left"><Link className="wordmark" href="/">∑ ink.</Link><div className="workspace-title"><strong>Review desk</strong><small>Follow the thinking as it happens</small></div></div><div className="status-pill"><span className="status-dot" style={{ background: connected ? '#91a646' : '#c18c53' }}/>{connected ? 'CONNECTED' : 'RECONNECTING'}</div></header><main className="workarea"><div className="section-kicker">WORKSPACE / COMPUTER</div><div className="computer-grid"><section className="review-panel"><div className="panel-head"><strong>Live working</strong><span>{strokeCount ? `${strokeCount} ${strokeCount === 1 ? 'STROKE' : 'STROKES'}` : 'WAITING FOR INK'}</span></div><div className="review-canvas"><div className="review-canvas-inner">{strokeCount ? <DrawingDisplay drawing={drawing!}/> : <div className="empty-state"><div><div style={{ fontSize: 26, marginBottom: 10 }}>✎</div>Open the drawing board on your tablet<br/>and your work will appear here.</div></div>}</div></div><div className="canvas-tools"><span className="tool-label">LIVE CANVAS</span><span className="toolbar-spacer"/><button className="quiet-button" onClick={() => void clearDrawing()}>Clear shared page</button></div></section><section className="review-panel"><div className="panel-head"><strong>LaTeX output</strong><span>RECOGNITION PREVIEW</span></div><div className="translation-box"><LatexTranslator drawing={drawing}/></div></section></div><div className="mobile-footer">DRAW ON TABLET · REVIEW HERE</div></main></div>
}
