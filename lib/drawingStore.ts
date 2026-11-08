import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type Point = { x: number; y: number }
export type Stroke = {
  id: string
  color: string
  width: number
  points: Point[]
}
export type Selection = { x: number; y: number; width: number; height: number }
export type Drawing = {
  strokes: Stroke[]
  updatedAt: string
  canvasSize?: { width: number; height: number }
  selection?: Selection | null
  selectionId?: string | null
}

const dataDirectory = path.join(process.cwd(), '.data')
const drawingFile = path.join(dataDirectory, 'drawing.json')

export const drawingStore = {
  async get(): Promise<Drawing | null> {
    try {
      const contents = await readFile(drawingFile, 'utf8')
      const value: unknown = JSON.parse(contents)
      if (typeof value === 'object' && value !== null && 'strokes' in value && Array.isArray(value.strokes)) {
        return value as Drawing
      }
      return null
    } catch {
      return null
    }
  },

  async set(drawing: Drawing): Promise<void> {
    await mkdir(dataDirectory, { recursive: true })
    const temporaryFile = `${drawingFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(temporaryFile, JSON.stringify(drawing), 'utf8')
    await rename(temporaryFile, drawingFile)
  },
}
