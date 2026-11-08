'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawing } from '@/lib/drawingStore'

type MathJaxWindow = Window & { MathJax?: { typesetPromise?: (elements?: HTMLElement[]) => Promise<void>; typesetClear?: (elements?: HTMLElement[]) => void; startup?: { typeset?: boolean; promise?: Promise<unknown> }; tex?: Record<string, unknown> } }
let mathJaxLoad: Promise<void> | null = null

function loadMathJax() {
  const host = window as MathJaxWindow
  if (host.MathJax?.typesetPromise) return Promise.resolve()
  if (mathJaxLoad) return mathJaxLoad
  host.MathJax = { ...(host.MathJax ?? {}), startup: { ...(host.MathJax?.startup ?? {}), typeset: false }, tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] } }
  mathJaxLoad = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mathjax]')
    const script = existing ?? document.createElement('script')
    const timeout = window.setTimeout(() => reject(new Error('Preview renderer timed out.')), 15000)
    script.onload = () => {
      const ready = () => { window.clearTimeout(timeout); resolve() }
      if (host.MathJax?.startup?.promise) void host.MathJax.startup.promise.then(ready, reject)
      else if (host.MathJax?.typesetPromise) ready()
      else { window.clearTimeout(timeout); reject(new Error('Preview renderer did not initialize.')) }
    }
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Preview renderer could not load.')) }
    if (!existing) { script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js'; script.async = true; script.dataset.mathjax = 'true'; document.head.appendChild(script) }
  }).catch((error) => { mathJaxLoad = null; throw error })
  return mathJaxLoad
}

function unwrapLatex(source: string) {
  const value = source.trim()
  const wrappers: [string, string][] = [['\\[', '\\]'], ['$$', '$$'], ['\\(', '\\)'], ['$', '$']]
  const wrapper = wrappers.find(([start, end]) => value.startsWith(start) && value.endsWith(end))
  return wrapper ? value.slice(wrapper[0].length, -wrapper[1].length).trim() : value
}

function makeDrawingImage(drawing: Drawing, selection: NonNullable<Drawing['selection']>): Promise<Blob> {
  if (!hasInkInSelection(drawing, selection)) return Promise.reject(new Error('There is no ink inside the selected area.'))

  const sourceWidth = drawing.canvasSize?.width ?? selection.x + selection.width
  const sourceHeight = drawing.canvasSize?.height ?? selection.y + selection.height
  const pad = 12
  const left = Math.max(0, selection.x - pad)
  const top = Math.max(0, selection.y - pad)
  const right = Math.min(sourceWidth, selection.x + selection.width + pad)
  const bottom = Math.min(sourceHeight, selection.y + selection.height + pad)
  const scale = Math.min(1, 2000 / Math.max(right - left, bottom - top))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((right - left) * scale))
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not prepare the drawing for recognition.'))

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale); ctx.translate(-left, -top)
  ctx.beginPath(); ctx.rect(selection.x, selection.y, selection.width, selection.height); ctx.clip()
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

function hasInkInSelection(drawing: Drawing, selection: NonNullable<Drawing['selection']>) {
  const right = selection.x + selection.width
  const bottom = selection.y + selection.height
  return drawing.strokes.some((stroke) => {
    if (!stroke.points.length) return false
    const bounds = stroke.points.reduce((box, point) => ({
      left: Math.min(box.left, point.x), top: Math.min(box.top, point.y),
      right: Math.max(box.right, point.x), bottom: Math.max(box.bottom, point.y),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
    return bounds.right >= selection.x && bounds.left <= right &&
      bounds.bottom >= selection.y && bounds.top <= bottom
  })
}

export default function LatexTranslator({ drawing }: { drawing: Drawing | null }) {
  const [latex, setLatex] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const autoRequestIdRef = useRef<string | null>(null)
  const selection = drawing?.selection ?? null
  const selectionHasInk = Boolean(selection && drawing && hasInkInSelection(drawing, selection))

  useEffect(() => {
    const preview = previewRef.current
    if (!preview || !latex.trim()) return
    let cancelled = false
    const host = window as MathJaxWindow
    host.MathJax?.typesetClear?.([preview])
    preview.textContent = `\\[${unwrapLatex(latex)}\\]`
    setPreviewError(false)
    void loadMathJax().then(() => {
      if (cancelled) return
      return (window as MathJaxWindow).MathJax?.typesetPromise?.([preview])
    }).catch(() => { if (!cancelled) setPreviewError(true) })
    return () => { cancelled = true; (window as MathJaxWindow).MathJax?.typesetClear?.([preview]) }
  }, [latex])

  const translate = useCallback(async () => {
    if (!drawing || !selection || !selectionHasInk) return
    setLoading(true); setCopied(false); setError(null)
    try {
      const image = await makeDrawingImage(drawing, selection)
      const form = new FormData()
      form.set('image', image, 'drawing.png')
      const response = await fetch('/api/translate', { method: 'POST', body: form })
      const result = await response.json() as { latex?: string; error?: string }
      if (!response.ok || !result.latex) throw new Error(result.error || 'Recognition failed. Try again.')
      setLatex(result.latex)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recognition failed. Try again.')
    } finally { setLoading(false) }
  }, [drawing, selection, selectionHasInk])

  useEffect(() => {
    const selectionId = drawing?.selectionId
    if (!selectionId) {
      autoRequestIdRef.current = null
      setLatex(''); setCopied(false); setError(null); setLoading(false)
      return
    }
    if (autoRequestIdRef.current === selectionId) return
    autoRequestIdRef.current = selectionId
    setLatex(''); setCopied(false); setError(null)
    void translate()
  }, [drawing?.selectionId])

  const copy = async () => {
    if (!latex) return
    try { await navigator.clipboard.writeText(latex); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
    catch { setError('Clipboard access was blocked. Select and copy the LaTeX manually.') }
  }

  return <><p className="translation-intro">Draw a box around one expression in Select area mode. Pix2Text will translate each new box automatically.</p>{loading && <div className="translation-intro" role="status">Recognizing selected area…</div>}{error && <div className="translation-error" role="alert">{error}<button className="quiet-button" style={{ marginLeft: 10 }} onClick={() => void translate()}>Try again</button></div>}{latex ? <><div className="panel-head" style={{ padding: '0', marginTop: 22, border: 0 }}><strong>EDITABLE LATEX</strong><button className="quiet-button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy source'}</button></div><textarea className="latex-output" value={latex} onChange={(event) => setLatex(event.target.value)} aria-label="Editable LaTeX output" spellCheck={false}/><div className="math-preview-wrap"><div className="math-preview-label">RENDERED PREVIEW</div><div className="math-preview" aria-label="Rendered equation preview"><div ref={previewRef}>{previewError ? 'The preview needs an internet connection to load its free MathJax renderer.' : 'Loading equation preview…'}</div></div></div><div className="mock-note">Check the recognized source before using it. Handwriting recognition can make mistakes.</div></> : !loading && !error && <div className="empty-state" style={{ minHeight: 210 }}><div>{!selection ? 'Select area mode on the paper, then drag a box around one expression.' : selectionHasInk ? 'The selected expression will appear here.' : 'The box does not contain any ink yet.'}</div></div>}</>
}
