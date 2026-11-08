'use client'

import Link from 'next/link'
import DrawingCanvas from '@/components/DrawingCanvas'

export default function TabletPage() {
  return <div className="tablet-shell"><header className="tablet-topbar"><Link href="/" aria-label="Back to home">←</Link><span>Untitled notes</span><span className="tablet-page-number">PAGE 01</span></header><main className="tablet-main"><section className="canvas-panel tablet-canvas-panel"><DrawingCanvas/></section></main></div>
}
