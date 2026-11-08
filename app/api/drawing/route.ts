import { NextResponse } from 'next/server'
import { drawingStore, Drawing, Region } from '@/lib/drawingStore'

export const dynamic = 'force-dynamic'

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
      ? body.regions.filter((region) =>
          region && typeof region.id === 'string' && region.rect &&
          Number.isFinite(region.rect.x) && Number.isFinite(region.rect.y) &&
          Number.isFinite(region.rect.width) && Number.isFinite(region.rect.height))
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
    const body = (await req.json()) as { id?: string; latex?: string; status?: Region['status']; error?: string | null }
    if (!body?.id) return NextResponse.json({ error: 'A region id is required' }, { status: 400 })

    const patch: Partial<Pick<Region, 'latex' | 'status' | 'error'>> = {}
    if (typeof body.latex === 'string') patch.latex = body.latex
    if (body.status === 'pending' || body.status === 'ready' || body.status === 'failed') patch.status = body.status
    if (body.error === null || typeof body.error === 'string') patch.error = body.error

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
  if (!id) return NextResponse.json({ error: 'A region id is required' }, { status: 400 })
  const drawing = await drawingStore.removeRegion(id)
  if (!drawing) return NextResponse.json({ error: 'No drawing to update' }, { status: 404 })
  return NextResponse.json({ ok: true, drawing })
}
