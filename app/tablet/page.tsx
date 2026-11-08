'use client'

import Link from 'next/link'
import DrawingCanvas from '@/components/DrawingCanvas'

export default function TabletPage() {
  return <div className="workspace"><header className="workspace-header"><div className="header-left"><Link className="wordmark" href="/">∑ ink.</Link><div className="workspace-title"><strong>Drawing board</strong><small>Your private space to work through it</small></div></div><div className="status-pill"><span className="status-dot"/> LIVE SYNC</div></header><main className="workarea"><div className="section-kicker">WORKSPACE / TABLET</div><div className="board-layout"><section className="canvas-panel"><div className="panel-head"><strong>Untitled working</strong><span>DRAWING CANVAS</span></div><DrawingCanvas/></section><aside className="side-panel"><div className="section-kicker">A LITTLE ROOM TO THINK</div><h3>Start anywhere.</h3><p>Write an equation, sketch a proof, or work through a problem one line at a time. Your strokes appear live on the review desk.</p><div className="shortcut">Tip<br/>Use your finger or stylus. Switch ink color and weight from the toolbar below your page.</div><div className="sync-note">SYNC IS AUTOMATIC · NO SAVE BUTTON</div></aside></div><div className="mobile-footer">STROKES SYNC AUTOMATICALLY TO THE REVIEW DESK</div></main></div>
}
