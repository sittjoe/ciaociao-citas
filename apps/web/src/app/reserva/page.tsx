import Image from 'next/image'
import type { Metadata } from 'next'
import { ReservationLookup } from '@/components/booking/ReservationLookup'

export const metadata: Metadata = { title: 'Ver mi reserva' }

export default function ReservaLookupPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-cream px-4 py-10 sm:px-8">
      <Image
        src="/atelier-vivo-hero.png"
        alt="Detalle de joyería fina en mesa de atelier"
        fill
        sizes="100vw"
        className="object-cover opacity-18"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.982_0.008_86/0.80),oklch(0.982_0.008_86/0.97))]" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <ReservationLookup />
      </div>
    </main>
  )
}
