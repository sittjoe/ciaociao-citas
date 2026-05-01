import Image from 'next/image'
import type { Metadata } from 'next'
import { BookingWizard } from '@/components/booking/BookingWizard'
import { Reveal, StaggerChildren, StaggerItem } from '@/components/motion'

export const metadata: Metadata = {
  title: 'Agendar Cita – Ciao Ciao Joyería',
}

const trustItems = [
  {
    eyebrow: 'Confirmación personal',
    copy:    'Cada solicitud es revisada y aprobada por nuestro equipo.',
    align:   'text-left',
  },
  {
    eyebrow: 'Calendario sincronizado',
    copy:    'Tu cita confirmada llega con invitación de calendario.',
    align:   'text-center',
  },
  {
    eyebrow: 'Showroom privado',
    copy:    'Atención dedicada, sin interrupciones ni prisas.',
    align:   'text-right',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream">
      {/* ─── Hero ─────────────────────────────────────── */}
      <section className="relative min-h-[92vh] lg:min-h-screen overflow-hidden bg-ink">
        <Image
          src="/hero-jewelry.jpg"
          alt="Collar riviera de diamantes — Ciao Ciao Joyería Fina"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-65 fade-in"
        />
        {/* warm-left gradient overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(10,8,6,0.82)_0%,rgba(0,0,0,0.4)_55%,rgba(0,0,0,0.08)_100%)]" />

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
            <a
              href="#booking"
              className="hidden sm:inline-flex text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/70 hover:text-champagne-soft transition-colors"
            >
              Reservar
            </a>
          </header>

          <div className="max-w-2xl pb-10 sm:pb-16">
            <StaggerChildren>
              <StaggerItem>
                <p className="mb-5 text-[0.6rem] font-semibold uppercase tracking-[0.38em] text-champagne-soft">
                  Showroom privado · México
                </p>
              </StaggerItem>

              <StaggerItem>
                <h1 className="font-serif text-[clamp(3.5rem,9vw,7.5rem)] leading-[0.92] text-white font-light">
                  Ciao Ciao
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mt-7 max-w-md text-base leading-7 text-white/72 sm:text-lg">
                  Agenda una visita personalizada para descubrir piezas seleccionadas con atención privada y confirmación por nuestro equipo.
                </p>
              </StaggerItem>

              <StaggerItem>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <a href="#booking" className="btn-primary text-sm">
                    Reservar cita
                  </a>
                  <a
                    href="mailto:hola@ciaociao.mx"
                    className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/55 hover:bg-white/10"
                  >
                    Contactar showroom
                  </a>
                </div>
              </StaggerItem>
            </StaggerChildren>
          </div>
        </div>
      </section>

      {/* ─── Trust strip ─────────────────────────────── */}
      <section className="border-b border-ink-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-7 sm:px-8">
          <div className="grid gap-0 sm:grid-cols-3">
            {trustItems.map((item, i) => (
              <Reveal key={item.eyebrow} direction={i === 0 ? 'left' : i === 2 ? 'right' : 'up'}>
                <div className={`px-6 py-5 ${item.align}`}>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.26em] text-champagne">
                    {item.eyebrow}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{item.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Booking section ──────────────────────────── */}
      <section id="booking" className="px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[300px_1fr] lg:gap-20 lg:items-start">

          {/* Sidebar — visible on desktop only */}
          <Reveal direction="left">
            <div className="text-center lg:text-left mb-10 lg:mb-0 lg:sticky lg:top-20">
              <p className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-champagne">
                Reserva en minutos
              </p>
              <h2 className="font-serif font-light text-4xl tracking-tight text-ink sm:text-5xl mb-6">
                Agenda tu cita
              </h2>
              <p className="text-sm leading-6 text-ink-muted hidden lg:block">
                Selecciona fecha, horario y comparte tus datos para que podamos confirmar tu visita.
              </p>
              <div className="hidden lg:block mt-8 pt-8 border-t border-ink-line space-y-3 text-xs text-ink-subtle">
                <p>✦ Experiencia exclusiva</p>
                <p>✦ Confirmación en 24h</p>
                <p>✦ Showroom privado CDMX</p>
              </div>
            </div>
          </Reveal>

          <BookingWizard />
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────── */}
      <footer className="border-t border-ink-line bg-white px-4 py-10 text-center text-xs text-ink-subtle space-y-1.5">
        <p className="font-semibold text-ink-muted tracking-wide uppercase text-[0.6rem]">
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
