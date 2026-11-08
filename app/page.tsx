import Link from 'next/link'

export default function Home() {
  return (
    <main className="home-shell">
      <nav className="topbar"><Link className="brand" href="/">∑ <span>ink<span className="brand-dot">.</span></span></Link><span className="topbar-note">A shared math workspace</span></nav>
      <section className="home-hero">
        <div className="eyebrow"><span className="eyebrow-dot" /> WRITE IT. SEE IT. TYPESET IT.</div>
        <h1>Math moves<br /><em>at the speed</em> of thought.</h1>
        <p className="hero-copy">A calm, connected workspace for handwritten mathematics. Draw on your tablet and keep the full expression in view on your computer.</p>
        <div className="home-actions">
          <Link href="/tablet" className="action-card tablet-card"><span className="action-icon">✎</span><span><strong>Open drawing board</strong><small>For tablet, stylus, or touch</small></span><b>↗</b></Link>
          <Link href="/computer" className="action-card review-card"><span className="action-icon">⌘</span><span><strong>Open review desk</strong><small>Live canvas and LaTeX tools</small></span><b>↗</b></Link>
        </div>
        <div className="how-row"><span>01 <b>Draw</b> on your tablet</span><i>→</i><span>02 <b>Follow along</b> on desktop</span><i>→</i><span>03 <b>Copy</b> your LaTeX</span></div>
      </section>
      <footer className="home-footer"><span>INK / MATH WORKSPACE</span><span>HANDWRITTEN THINKING, CONNECTED</span></footer>
    </main>
  )
}
