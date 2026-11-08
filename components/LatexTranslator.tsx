'use client'

import { useCallback, useEffect, useState } from 'react'
import { Drawing } from '@/lib/drawingStore'

function makeDrawingImage(drawing: Drawing): Promise<Blob> {
  const points = drawing.strokes.flatMap((stroke) => stroke.points)
  if (!points.length) return Promise.reject(new Error('There is no ink to recognize yet.'))

  const bounds = points.reduce((box, point) => ({
    left: Math.min(box.left, point.x), top: Math.min(box.top, point.y),
    right: Math.max(box.right, point.x), bottom: Math.max(box.bottom, point.y),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
  const widestStroke = Math.max(...drawing.strokes.map((stroke) => stroke.width))
  const pad = Math.max(24, widestStroke * 5)
  const sourceWidth = drawing.canvasSize?.width ?? bounds.right + pad
  const sourceHeight = drawing.canvasSize?.height ?? bounds.bottom + pad
  const left = Math.max(0, bounds.left - pad)
  const top = Math.max(0, bounds.top - pad)
  const right = Math.min(sourceWidth, bounds.right + pad)
  const bottom = Math.min(sourceHeight, bounds.bottom + pad)
  const scale = Math.min(1, 2000 / Math.max(right - left, bottom - top))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((right - left) * scale))
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not prepare the drawing for recognition.'))

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale); ctx.translate(-left, -top)
  for (const stroke of drawing.strokes) {
    if (!stroke.points.length) continue
    ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color
    ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    if (stroke.points.length === 1) {
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2); ctx.fill()
    } else {
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
  }

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not export the drawing image.')), 'image/png'))
}

export default function LatexTranslator({ drawing }: { drawing: Drawing | null }) {
  const [latex, setLatex] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasInk = Boolean(drawing?.strokes.some((stroke) => stroke.points.length))

  useEffect(() => {
    setLatex(''); setCopied(false); setError(null)
  }, [drawing?.updatedAt])

  const translate = useCallback(async () => {
    if (!drawing || !hasInk) return
    setLoading(true); setCopied(false); setError(null)
    try {
      const image = await makeDrawingImage(drawing)
      const form = new FormData()
      form.set('image', image, 'drawing.png')
      const response = await fetch('/api/translate', { method: 'POST', body: form })
      const result = await response.json() as { latex?: string; error?: string }
      if (!response.ok || !result.latex) throw new Error(result.error || 'Recognition failed. Try again.')
      setLatex(result.latex)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recognition failed. Try again.')
    } finally { setLoading(false) }
  }, [drawing, hasInk])

  const copy = async () => {
    if (!latex) return
    try { await navigator.clipboard.writeText(latex); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
    catch { setError('Clipboard access was blocked. Select and copy the LaTeX manually.') }
  }

  return <><p className="translation-intro">Recognize the current page with Pix2Text running locally. The result is editable before you copy it.</p><button className="primary-button" style={{ width: '100%' }} onClick={() => void translate()} disabled={loading || !hasInk}>{loading ? 'Recognizing handwriting…' : 'Recognize handwriting'}</button>{error && <div className="translation-error" role="alert">{error}</div>}{latex ? <><div className="panel-head" style={{ padding: '0', marginTop: 22, border: 0 }}><strong>EDITABLE LATEX</strong><button className="quiet-button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy source'}</button></div><textarea className="latex-output" value={latex} onChange={(event) => setLatex(event.target.value)} aria-label="Editable LaTeX output" spellCheck={false}/><div className="mock-note">Check the recognized source before using it. Handwriting recognition can make mistakes.</div></> : !error && <div className="empty-state" style={{ minHeight: 210 }}><div>{hasInk ? 'Your recognized LaTeX will appear here.' : 'Add some math to the shared canvas to get started.'}</div></div>}</>
}
