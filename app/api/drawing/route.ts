import { NextResponse } from 'next/server'
import { drawingStore, Drawing, Region, RegionStatus } from '@/lib/drawingStore'

export const dynamic = 'force-dynamic'

/**
 * These endpoints are unauthenticated and bound to the LAN so a tablet can
 * reach them, which means anything on the network can write here. Values are
 * rebuilt field by field rather than spread from the request, and bounded, so
 * a hostile or buggy client cannot push unbounded data to every connected
 * board through the event stream.
 */
const MAX_LATEX = 4000
const MAX_ERROR = 500
const MAX_REGIONS = 200
const MAX_ID = 128

function isStatus(value: unknown): value is RegionStatus {
  return value === 'pending' || value === 'ready' || value === 'failed'
}

function sanitizeRegion(value: unknown): Region | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<Region>
  if (typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > MAX_ID) return null

  const rect = candidate.rect
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every((n) => Number.isFinite(n))) return null

  return {
    id: candidate.id,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    latex: typeof candidate.latex === 'string' ? candidate.latex.slice(0, MAX_LATEX) : '',
    status: isStatus(candidate.status) ? candidate.status : 'pending',
    error: typeof candidate.error === 'string' ? candidate.error.slice(0, MAX_ERROR) : null,
  }
}

export async function GET() {
  return NextResponse.json(await drawingStore.get())
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Drawing

    if (!body || !Array.isArray(body.strokes)) {
      return NextResponse.json({ error: 'Invalid drawing payload' }, { status: 400 })
    }

    const regions: Region[] = Array.isArray(body.regions)
      ? body.regions.slice(0, MAX_REGIONS).map(sanitizeRegion).filter((r): r is Region => r !== null)
      : []

    const drawing: Drawing = {
      strokes: body.strokes,
      updatedAt: new Date().toISOString(),
      canvasSize: body.canvasSize,
      regions,
    }

    await drawingStore.set(drawing)

    return NextResponse.json({ ok: true, drawing })
  } catch {
    return NextResponse.json({ error: 'Failed to parse drawing' }, { status: 400 })
  }
}

/** Patch a single region's LaTeX or status without touching the ink. */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; latex?: string; status?: unknown; error?: unknown }
    if (typeof body?.id !== 'string' || !body.id || body.id.length > MAX_ID) {
      return NextResponse.json({ error: 'A region id is required' }, { status: 400 })
    }

    const patch: Partial<Pick<Region, 'latex' | 'status' | 'error'>> = {}
    if (typeof body.latex === 'string') patch.latex = body.latex.slice(0, MAX_LATEX)
    if (isStatus(body.status)) patch.status = body.status
    if (body.error === null) patch.error = null
    else if (typeof body.error === 'string') patch.error = body.error.slice(0, MAX_ERROR)

    const drawing = await drawingStore.updateRegion(body.id, patch)
    if (!drawing) return NextResponse.json({ error: 'No drawing to update' }, { status: 404 })
    return NextResponse.json({ ok: true, drawing })
  } catch {
    return NextResponse.json({ error: 'Failed to parse region update' }, { status: 400 })
  }
}

/** Remove one boxed region without disturbing the ink. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id || id.length > MAX_ID) return NextResponse.json({ error: 'A region id is required' }, { status: 400 })
  const drawing = await drawingStore.removeRegion(id)
  if (!drawing) return NextResponse.json({ error: 'No drawing to update' }, { status: 404 })
  return NextResponse.json({ ok: true, drawing })
}
