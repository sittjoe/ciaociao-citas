import Image from 'next/image'
import type { Metadata } from 'next'
import { BookingWizard } from '@/components/booking/BookingWizard'

export const metadata: Metadata = {
  title: 'Agendar Cita – Ciao Ciao Joyería',
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="flex flex-col lg:grid lg:grid-cols-2 lg:h-screen">

        {/* Copy – shows below image on mobile, left column on desktop */}
        <div className="order-2 lg:order-1 flex flex-col justify-center px-8 py-14 sm:px-12 lg:px-16 xl:px-20">
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl text-ink tracking-tight leading-none">
            Ciao Ciao
          </h1>
          <p className="text-xs text-ink-muted tracking-[0.35em] uppercase mt-3 font-semibold">
            Joyería Fina
          </p>
          <div className="w-12 h-px bg-champagne mt-6 mb-8" />
          <p className="text-base text-ink-muted leading-relaxed max-w-[320px] mb-8">
            Agenda tu visita personalizada a nuestro showroom exclusivo. Selecciona fecha y espera nuestra confirmación.
          </p>
          <a href="#booking" className="btn-primary self-start text-sm">
            Reservar cita →
          </a>
        </div>

        {/* Jewelry image – full height on desktop, proportional on mobile */}
        <div className="order-1 lg:order-2 relative h-[65vw] max-h-[70vh] lg:h-full overflow-hidden bg-champagne-soft">
          <Image
            src="/hero-jewelry.jpg"
            alt="Collar riviera de diamantes — Ciao Ciao Joyería Fina"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover fade-in"
          />
          {/* Mobile: subtle gradient fade into cream */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-cream to-transparent lg:hidden" />
        </div>
      </section>

      {/* ── Booking ───────────────────────────────────────────────────────── */}
      <section id="booking" className="py-16 sm:py-24 px-4">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-[0.35em] uppercase text-champagne mb-3">
            Reserva en minutos
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl text-ink tracking-tight">
            Agenda tu cita
          </h2>
        </div>
        <BookingWizard />
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="py-10 text-center text-xs text-ink-subtle border-t border-stone-100 space-y-1.5">
        <p className="font-semibold text-ink-muted tracking-wide uppercase text-[0.65rem]">
          Ciao Ciao Joyería · Showroom Privado
        </p>
        <p>
          <a href="mailto:hola@ciaociao.mx" className="hover:text-champagne transition-colors duration-200">
            hola@ciaociao.mx
          </a>
        </p>
      </footer>
    </main>
  )
}
