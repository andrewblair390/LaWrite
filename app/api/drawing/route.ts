import { NextResponse } from 'next/server'
import { drawingStore, Drawing } from '@/lib/drawingStore'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(drawingStore.get())
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Drawing

    if (!body || !Array.isArray(body.strokes)) {
      return NextResponse.json({ error: 'Invalid drawing payload' }, { status: 400 })
    }

    const drawing: Drawing = {
      strokes: body.strokes,
      updatedAt: new Date().toISOString(),
      canvasSize: body.canvasSize,
    }

    drawingStore.set(drawing)

    return NextResponse.json({ ok: true, drawing })
  } catch {
    return NextResponse.json({ error: 'Failed to parse drawing' }, { status: 400 })
  }
}
