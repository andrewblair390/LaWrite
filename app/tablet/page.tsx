'use client'

import Link from 'next/link'
import DrawingCanvas from '@/components/DrawingCanvas'

export default function TabletPage() {
  return <div className="tablet-shell"><header className="tablet-topbar"><Link href="/" aria-label="Back to home">←</Link><img className="brand-mark" src="/lawrite.png" alt="Lawrite" width={1606} height={629}/><span className="doc-name">Untitled notes</span></header><main className="tablet-main"><section className="canvas-panel tablet-canvas-panel"><DrawingCanvas/></section></main></div>
}
