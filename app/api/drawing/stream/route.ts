import { NextResponse } from 'next/server'
import { drawingStore } from '@/lib/drawingStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false
  let reading = false
  let previous = ''

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (message: string) => {
        if (stopped) return
        try { controller.enqueue(encoder.encode(message)) }
        catch { stop() }
      }

      const poll = async () => {
        if (stopped || reading) return
        reading = true
        try {
          const drawing = await drawingStore.get()
          const serialized = JSON.stringify(drawing)
          if (serialized !== previous) {
            previous = serialized
            if (drawing) enqueue(`event: drawing\ndata: ${serialized}\n\n`)
          }
        } catch {
          // Keep the stream alive and retry on the next poll.
        } finally { reading = false }
      }

      const stop = () => {
        stopped = true
        if (timer) clearInterval(timer)
      }

      enqueue('event: connected\ndata: {"status":"ok"}\n\n')
      void poll()
      timer = setInterval(() => { void poll() }, 250)
    },
    cancel() {
      stopped = true
      if (timer) clearInterval(timer)
    },
  })

  return new NextResponse(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}
