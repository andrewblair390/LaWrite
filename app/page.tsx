'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

function isTabletOS() {
  const userAgent = navigator.userAgent
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isIPadOS || /Android|iPhone|iPad|iPod/i.test(userAgent)
}

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace(isTabletOS() ? '/tablet' : '/computer')
  }, [router])

  return (
    <main className="splash">
      <img className="splash-mark" src="/lawrite.png" alt="Lawrite" width={1606} height={629} />
      <p>Opening your workspace…</p>
    </main>
  )
}
