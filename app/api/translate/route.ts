import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const maxImageBytes = 8 * 1024 * 1024

export async function POST(request: Request) {
  let image: FormDataEntryValue | null
  try {
    image = (await request.formData()).get('image')
  } catch {
    return NextResponse.json({ error: 'Could not read the drawing image.' }, { status: 400 })
  }

  if (typeof image !== 'object' || image === null || !('arrayBuffer' in image) || !('name' in image) || !('type' in image) || !('size' in image)) {
    return NextResponse.json({ error: 'A drawing image is required.' }, { status: 400 })
  }
  const uploadedImage = image as File
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(uploadedImage.type)) {
    return NextResponse.json({ error: 'Upload a PNG, JPEG, or WebP drawing.' }, { status: 415 })
  }
  if (uploadedImage.size > maxImageBytes) {
    return NextResponse.json({ error: 'The drawing image is too large. Try a smaller canvas.' }, { status: 413 })
  }

  const form = new FormData()
  form.set('file_type', 'formula')
  form.set('resized_shape', '768')
  form.set('image', uploadedImage, uploadedImage.name || 'drawing.png')

  const serviceUrl = process.env.PIX2TEXT_URL || 'http://127.0.0.1:8503/pix2text'
  try {
    const response = await fetch(serviceUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
    const payload: unknown = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: 'Pix2Text could not read this drawing.' }, { status: 502 })
    }

    const result = typeof payload === 'object' && payload !== null && 'results' in payload
      ? (payload as { results: unknown }).results
      : null
    if (typeof result === 'string' && result.trim()) {
      return NextResponse.json({ latex: result.trim() })
    }
    if (Array.isArray(result)) {
      const lines = result.map((item) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && 'text' in item) return String((item as { text: unknown }).text)
        return ''
      }).filter(Boolean)
      if (lines.length) return NextResponse.json({ latex: lines.join('\n') })
    }
    return NextResponse.json({ error: 'Pix2Text returned no recognizable math. Try a larger or clearer drawing.' }, { status: 422 })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json({ error: timedOut
      ? 'Recognition took too long. Try again with a smaller drawing.'
      : 'Pix2Text is not running. Start the local OCR service, then try again.' }, { status: timedOut ? 504 : 503 })
  }
}
