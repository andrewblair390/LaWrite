'use client'

import { Selection, Stroke } from '@/lib/drawingStore'

/**
 * Browser-only helpers shared by the tablet and the projector. Both surfaces
 * must crop, recognize and typeset identically, so this lives in one place
 * rather than being duplicated per view.
 */

export function createId() {
  const randomUUID = globalThis.crypto?.randomUUID
  return typeof randomUUID === 'function'
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function strokeBounds(stroke: Stroke) {
  return stroke.points.reduce(
    (box, point) => ({
      left: Math.min(box.left, point.x), top: Math.min(box.top, point.y),
      right: Math.max(box.right, point.x), bottom: Math.max(box.bottom, point.y),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  )
}

export function hasInkInRect(strokes: Stroke[], rect: Selection) {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return strokes.some((stroke) => {
    if (!stroke.points.length) return false
    const bounds = strokeBounds(stroke)
    return bounds.right >= rect.x && bounds.left <= right && bounds.bottom >= rect.y && bounds.top <= bottom
  })
}

/** Crop the ink inside `rect` onto a white canvas for the recognizer. */
export function makeRegionImage(
  strokes: Stroke[],
  canvasSize: { width: number; height: number } | undefined,
  rect: Selection,
): Promise<Blob> {
  if (!hasInkInRect(strokes, rect)) return Promise.reject(new Error('There is no ink inside that box.'))

  const sourceWidth = canvasSize?.width ?? rect.x + rect.width
  const sourceHeight = canvasSize?.height ?? rect.y + rect.height
  const pad = 12
  const left = Math.max(0, rect.x - pad)
  const top = Math.max(0, rect.y - pad)
  const right = Math.min(sourceWidth, rect.x + rect.width + pad)
  const bottom = Math.min(sourceHeight, rect.y + rect.height + pad)
  const scale = Math.min(1, 2000 / Math.max(right - left, bottom - top))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((right - left) * scale))
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not prepare the drawing for recognition.'))

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale); ctx.translate(-left, -top)
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip()
  for (const stroke of strokes) {
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

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export the drawing image.'))), 'image/png'))
}

/** Send one cropped box to Pix2Text. Resolves to the recognized LaTeX. */
export async function recognizeRegion(
  strokes: Stroke[],
  canvasSize: { width: number; height: number } | undefined,
  rect: Selection,
): Promise<string> {
  const image = await makeRegionImage(strokes, canvasSize, rect)
  const form = new FormData()
  form.set('image', image, 'drawing.png')
  const response = await fetch('/api/translate', { method: 'POST', body: form })
  const result = (await response.json()) as { latex?: string; error?: string }
  if (!response.ok || !result.latex) throw new Error(result.error || 'Recognition failed.')
  return result.latex
}

/** Persist one region's LaTeX/status without republishing the whole page. */
export async function patchRegion(
  id: string,
  patch: { latex?: string; status?: 'pending' | 'ready' | 'failed'; error?: string | null },
) {
  await fetch('/api/drawing', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
}

export function unwrapLatex(source: string) {
  const value = source.trim()
  const wrappers: [string, string][] = [['\\[', '\\]'], ['$$', '$$'], ['\\(', '\\)'], ['$', '$']]
  const wrapper = wrappers.find(([start, end]) => value.startsWith(start) && value.endsWith(end))
  return wrapper ? value.slice(wrapper[0].length, -wrapper[1].length).trim() : value
}

type MathJaxWindow = Window & {
  MathJax?: {
    typesetPromise?: (elements?: HTMLElement[]) => Promise<void>
    typesetClear?: (elements?: HTMLElement[]) => void
    startup?: { typeset?: boolean; promise?: Promise<unknown> }
    tex?: Record<string, unknown>
    loader?: Record<string, unknown>
    options?: Record<string, unknown>
  }
}

let mathJaxLoad: Promise<void> | null = null

export function loadMathJax() {
  const host = window as MathJaxWindow
  if (host.MathJax?.typesetPromise) return Promise.resolve()
  if (mathJaxLoad) return mathJaxLoad
  host.MathJax = {
    ...(host.MathJax ?? {}),
    // The board renders LaTeX that arrives over an unauthenticated endpoint,
    // so anything on the network can put a string here. MathJax's autoload
    // pulls in the `html` package on \href, which would turn that string into
    // a clickable javascript: link on the projector. ui/safe blocks URLs,
    // classes, ids and inline styles outright — equations never need them.
    loader: { load: ['ui/safe'] },
    options: {
      safeOptions: { allow: { URLs: 'none', classes: 'none', cssIDs: 'none', styles: 'none' } },
    },
    startup: { ...(host.MathJax?.startup ?? {}), typeset: false },
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
  }
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
    if (!existing) {
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js'
      script.async = true
      script.dataset.mathjax = 'true'
      document.head.appendChild(script)
    }
  }).catch((error) => { mathJaxLoad = null; throw error })
  return mathJaxLoad
}

/** Typeset `latex` into `host`, then scale it to fit `box`. */
export async function typesetInto(host: HTMLElement, latex: string, box?: { width: number; height: number }) {
  const page = window as MathJaxWindow
  page.MathJax?.typesetClear?.([host])
  host.textContent = `\\[${unwrapLatex(latex)}\\]`
  await loadMathJax()
  await page.MathJax?.typesetPromise?.([host])
  if (!box) return
  const inner = host.firstElementChild as HTMLElement | null
  if (!inner) return
  inner.style.transform = ''
  // Display math (`\[...\]`) renders as a block-level mjx-container, so it
  // reports the full width of its parent and the width ratio collapses to 1.
  // Shrink-wrapping it first makes the measurement reflect the actual glyphs.
  inner.style.display = 'inline-block'
  const natural = inner.getBoundingClientRect()
  if (!natural.width || !natural.height) return
  // Fill the box in both directions. MathJax's natural size is body-text
  // sized, which is unreadable on a projector, so scaling up to the box the
  // teacher drew is the point: the typeset math ends up as large as the
  // handwriting it replaced. The cap stops a one-character box exploding.
  const fit = Math.min(box.width / natural.width, box.height / natural.height)
  const factor = Math.max(0.15, Math.min(fit, 6))
  inner.style.transformOrigin = 'left center'
  inner.style.transform = `scale(${factor})`
}
