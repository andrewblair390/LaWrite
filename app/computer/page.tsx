'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Drawing } from '@/lib/drawingStore'
import DrawingDisplay from '@/components/DrawingDisplay'
import LatexTranslator from '@/components/LatexTranslator'

function printableSvg(drawing: Drawing | null) {
  const page = drawing?.canvasSize ?? { width: 1400, height: 900 }
  const width = Math.max(1, page.width)
  const height = Math.max(1, page.height)
  const ink = drawing?.strokes.map((stroke) => {
    const points = stroke.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    if (!points.length) return ''
    const color = /^#[\da-f]{3,8}$/i.test(stroke.color) ? stroke.color : '#24271f'
    const weight = Number.isFinite(stroke.width) ? Math.max(1, Math.min(stroke.width, 24)) : 3
    if (points.length === 1) return `<circle cx="${points[0].x}" cy="${points[0].y}" r="${weight / 2}" fill="${color}"/>`
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('') ?? ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Exported handwritten notes"><defs><pattern id="rules" width="180" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H180" fill="none" stroke="#dce4da" stroke-width="1"/></pattern></defs><rect width="${width}" height="${height}" fill="#fffefa"/><rect width="${width}" height="${height}" fill="url(#rules)"/><path d="M72 0V${height}" stroke="#e7c7bf" stroke-width="1"/>${ink}</svg>`
}

export default function ComputerPage() {
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [connected, setConnected] = useState(false)
  const [exportError, setExportError] = useState(false)

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
  const exportPdf = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { setExportError(true); return }
    setExportError(false)
    const svg = printableSvg(drawing)
    printWindow.document.open()
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Math notes</title><style>@page{size:auto;margin:14mm}html,body{margin:0;padding:0}.print-note{width:100%;font-family:Arial,sans-serif}.print-title{margin:0 0 12px;color:#555;font-size:12px}svg{display:block;width:100%;height:auto;max-height:9.5in;object-fit:contain}</style></head><body><main class="print-note"><p class="print-title">Math notes</p>${svg}</main></body></html>`)
    printWindow.document.close()
    printWindow.onafterprint = () => printWindow.close()
    window.setTimeout(() => printWindow.print(), 300)
  }
  const strokeCount = drawing?.strokes.length ?? 0

  return <div className="workspace"><header className="workspace-header computer-header"><div className="header-left"><Link className="wordmark" href="/">∑ ink.</Link><div className="workspace-title"><strong>Review desk</strong></div></div><div className="status-pill"><span className="status-dot" style={{ background: connected ? '#91a646' : '#c18c53' }}/>{connected ? 'CONNECTED' : 'RECONNECTING'}</div></header><main className="workarea computer-workarea"><div className="computer-grid"><section className="review-panel"><div className="panel-head"><strong>Note page</strong><span>{strokeCount ? `${strokeCount} ${strokeCount === 1 ? 'STROKE' : 'STROKES'}` : 'EMPTY PAGE'}</span></div><div className="review-canvas"><div className="review-canvas-inner">{strokeCount ? <DrawingDisplay drawing={drawing!}/> : <div className="empty-state">Draw on the tablet to see the page here.</div>}</div></div><div className="canvas-tools"><button className="primary-button" onClick={exportPdf}>Save page as PDF</button><span className="toolbar-spacer"/><button className="quiet-button" onClick={() => void clearDrawing()}>Clear page</button></div>{exportError && <div className="translation-error" role="alert">Allow pop-ups to open the PDF print view.</div>}</section><section className="review-panel"><div className="panel-head"><strong>LaTeX</strong><span>PIX2TEXT</span></div><div className="translation-box"><LatexTranslator drawing={drawing}/></div></section></div></main></div>
}
