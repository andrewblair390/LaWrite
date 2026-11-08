import { NextResponse } from 'next/server'
import { drawingStore } from '@/lib/drawingStore'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: connected\ndata: {"status":"ok"}\n\n'))
      const current = drawingStore.get()
      if (current) controller.enqueue(encoder.encode(`event: drawing\ndata: ${JSON.stringify(current)}\n\n`))
      unsubscribe = drawingStore.subscribe((drawing) => {
        try { controller.enqueue(encoder.encode(`event: drawing\ndata: ${JSON.stringify(drawing)}\n\n`)) } catch { unsubscribe?.() }
      })
    },
    cancel() { unsubscribe?.() },
  })

  return new NextResponse(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}
