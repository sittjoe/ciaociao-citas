'use client'

import { useEffect, useState } from 'react'
import { countdownLabel } from '@/lib/countdown'

/**
 * Cuenta regresiva a la cita. El servidor no sabe la hora del dispositivo,
 * así que el texto aparece al montar (sin desajuste de hidratación) dentro de
 * un espacio ya reservado (sin salto de layout). Se refresca cada 30 s.
 */
export default function Countdown({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const target = new Date(iso).getTime()
    const tick = () => setLabel(countdownLabel(target, Date.now()))
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [iso])
  return (
    <p className="min-h-[1.75rem] font-serif text-xl italic text-champagne-deep" aria-live="off">
      {label}
    </p>
  )
}
