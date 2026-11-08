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

/** Recognition state for one boxed area of the page. */
export type RegionStatus = 'pending' | 'ready' | 'failed'

/**
 * A boxed area of the page and the LaTeX it was recognized as. The projector
 * swaps each `ready` region's ink for typeset math at exactly these
 * coordinates, so the rect is stored in canvas space, not screen space.
 */
export type Region = {
  id: string
  rect: Selection
  latex: string
  status: RegionStatus
  error?: string | null
}

export type Drawing = {
  strokes: Stroke[]
  updatedAt: string
  canvasSize?: { width: number; height: number }
  regions?: Region[]
}

const dataDirectory = path.join(process.cwd(), '.data')
const drawingFile = path.join(dataDirectory, 'drawing.json')

function normalize(value: Drawing): Drawing {
  return { ...value, regions: Array.isArray(value.regions) ? value.regions : [] }
}

async function write(drawing: Drawing): Promise<void> {
  await mkdir(dataDirectory, { recursive: true })
  const temporaryFile = `${drawingFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temporaryFile, JSON.stringify(drawing), 'utf8')
  await rename(temporaryFile, drawingFile)
}

export const drawingStore = {
  async get(): Promise<Drawing | null> {
    try {
      const contents = await readFile(drawingFile, 'utf8')
      const value: unknown = JSON.parse(contents)
      if (typeof value === 'object' && value !== null && 'strokes' in value && Array.isArray(value.strokes)) {
        return normalize(value as Drawing)
      }
      return null
    } catch {
      return null
    }
  },

  async set(drawing: Drawing): Promise<void> {
    await write(normalize(drawing))
  },

  /**
   * Patch one region in place.
   *
   * The tablet owns strokes and region geometry; both surfaces may edit a
   * region's LaTeX. Doing that as a read-modify-write here means an edit from
   * the laptop cannot clobber ink the tablet published a moment earlier, which
   * a whole-document POST from either side would.
   */
  async updateRegion(id: string, patch: Partial<Pick<Region, 'latex' | 'status' | 'error'>>): Promise<Drawing | null> {
    const current = await this.get()
    if (!current) return null
    const regions = (current.regions ?? []).map((region) =>
      region.id === id ? { ...region, ...patch } : region,
    )
    if (!regions.some((region) => region.id === id)) return current
    const next: Drawing = { ...current, regions, updatedAt: new Date().toISOString() }
    await write(next)
    return next
  },

  /** Remove one region, leaving the ink untouched. */
  async removeRegion(id: string): Promise<Drawing | null> {
    const current = await this.get()
    if (!current) return null
    const regions = (current.regions ?? []).filter((region) => region.id !== id)
    const next: Drawing = { ...current, regions, updatedAt: new Date().toISOString() }
    await write(next)
    return next
  },
}
