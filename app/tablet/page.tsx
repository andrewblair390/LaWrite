'use client'

import Link from 'next/link'
import DrawingCanvas from '@/components/DrawingCanvas'

export default function TabletPage() {
  return <div className="workspace"><header className="workspace-header"><div className="header-left"><Link className="wordmark" href="/">∑ ink.</Link><div className="workspace-title"><strong>Math notes</strong><small>Write freely, select what you want recognized</small></div></div><div className="status-pill"><span className="status-dot"/> LIVE SYNC</div></header><main className="workarea tablet-workarea"><div className="section-kicker">PAPER / 01</div><div className="board-layout"><section className="canvas-panel"><div className="panel-head"><strong>Untitled notes</strong><span>PAGE 01</span></div><DrawingCanvas/></section><aside className="side-panel"><div className="section-kicker">YOUR NOTEBOOK</div><h3>Think on paper.</h3><p>Write equations and work through ideas on the ruled page. Your notes stay visible on the review desk.</p><div className="shortcut"><strong>To recognize an expression</strong><br/>Choose <b>Select area</b>, then drag a box around one expression. Switch back to <b>Ink</b> whenever you want to keep writing.</div><div className="sync-note">SELECTED AREA SYNC IS LIVE</div></aside></div><div className="mobile-footer">WRITE WITH INK · SELECT A BOX TO RECOGNIZE IT</div></main></div>
}
