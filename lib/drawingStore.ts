import { EventEmitter } from 'events'

export type Point = { x: number; y: number }
export type Stroke = {
  id: string
  color: string
  width: number
  points: Point[]
}
export type Drawing = {
  strokes: Stroke[]
  updatedAt: string
  canvasSize?: { width: number; height: number }
}

const emitter = new EventEmitter()
let latestDrawing: Drawing | null = null

export const drawingStore = {
  /** Get the most recent drawing (used by the computer side on load). */
  get(): Drawing | null {
    return latestDrawing
  },

  /** Save a new drawing (used by the tablet side) and notify subscribers. */
  set(drawing: Drawing) {
    latestDrawing = drawing
    emitter.emit('change', drawing)
  },

  /** Subscribe to drawing updates (used by the computer side via SSE). */
  subscribe(cb: (drawing: Drawing) => void) {
    emitter.on('change', cb)
    return () => emitter.off('change', cb)
  },
}
