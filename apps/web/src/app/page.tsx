import Image from 'next/image'
import type { Metadata } from 'next'
import { BookingWizard } from '@/components/booking/BookingWizard'

export const metadata: Metadata = {
  title: 'Agendar Cita – Ciao Ciao Joyería',
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream">
      <section className="relative min-h-[92vh] lg:min-h-screen overflow-hidden bg-ink">
        <Image
          src="/hero-jewelry.jpg"
          alt="Collar riviera de diamantes — Ciao Ciao Joyería Fina"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-70 fade-in"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.2)_58%,rgba(0,0,0,0.06))]" />
        <div className="relative z-10 flex min-h-[92vh] lg:min-h-screen flex-col justify-between px-6 py-7 sm:px-10 lg:px-16">
          <header className="flex items-center justify-between text-white">
            <Image
              src="/logo-ciaociao.png"
              alt="Ciao Ciao Joyería"
              width={120}
              height={72}
              className="h-10 w-auto object-contain"
              priority
            />
            <a href="#booking" className="hidden sm:inline-flex text-xs font-semibold uppercase tracking-[0.22em] hover:text-champagne-soft transition-colors">
              Reservar
            </a>
          </header>

          <div className="max-w-2xl pb-10 sm:pb-16">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.38em] text-champagne-soft">
              Showroom privado
            </p>
            <h1 className="font-serif text-5xl leading-[0.95] text-white sm:text-7xl lg:text-8xl">
              Ciao Ciao
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-white/78 sm:text-lg">
              Agenda una visita personalizada para descubrir piezas seleccionadas con atención privada y confirmación por nuestro equipo.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#booking" className="btn-primary text-sm">
                Reservar cita
              </a>
              <a href="mailto:hola@ciaociao.mx" className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10">
                Contactar showroom
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-stone-100 bg-white">
        <div className="mx-auto grid max-w-5xl gap-0 px-4 py-5 text-center sm:grid-cols-3 sm:px-6">
          {[
            ['Confirmación personal', 'Cada solicitud es revisada por el equipo.'],
            ['Calendario sincronizado', 'Tu cita confirmada llega con invitación.'],
            ['Showroom privado', 'Una experiencia dedicada y sin prisa.'],
          ].map(([title, copy]) => (
            <div key={title} className="px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-champagne">{title}</p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="booking" className="px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[300px_1fr] lg:gap-20 lg:items-start">

          {/* Sidebar — visible on desktop only */}
          <div className="text-center lg:text-left mb-10 lg:mb-0 lg:sticky lg:top-20">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-champagne">
              Reserva en minutos
            </p>
            <h2 className="font-serif text-4xl tracking-tight text-ink sm:text-5xl mb-6">
              Agenda tu cita
            </h2>
            <p className="text-sm leading-6 text-ink-muted hidden lg:block">
              Selecciona fecha, horario y comparte tus datos para que podamos confirmar tu visita.
            </p>
            <div className="hidden lg:block mt-8 pt-8 border-t border-stone-100 space-y-3 text-xs text-ink-subtle">
              <p>✦ Experiencia exclusiva</p>
              <p>✦ Confirmación en 24h</p>
              <p>✦ Showroom privado CDMX</p>
            </div>
          </div>

          <BookingWizard />
        </div>
      </section>

      <footer className="border-t border-stone-100 bg-white px-4 py-10 text-center text-xs text-ink-subtle space-y-1.5">
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
