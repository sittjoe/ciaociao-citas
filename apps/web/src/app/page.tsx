import Image from 'next/image'
import type { Metadata } from 'next'
import { CalendarCheck, Clock, ShieldCheck } from 'lucide-react'
import { BookingWizard } from '@/components/booking/BookingWizard'
import { Reveal, StaggerChildren, StaggerItem } from '@/components/motion'

export const metadata: Metadata = {
  title: 'Agendar Cita – Ciao Ciao Joyería',
}

const trustItems = [
  {
    eyebrow: 'Confirmación personal',
    copy:    'Cada solicitud es revisada y aprobada por nuestro equipo.',
    Icon:    ShieldCheck,
  },
  {
    eyebrow: 'Calendario sincronizado',
    copy:    'Tu cita confirmada llega con invitación de calendario.',
    Icon:    CalendarCheck,
  },
  {
    eyebrow: 'Showroom privado',
    copy:    'Atención dedicada, sin interrupciones ni prisas.',
    Icon:    Clock,
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream">
      {/* ─── Hero ─────────────────────────────────────── */}
      <section className="relative min-h-[92vh] lg:min-h-screen overflow-hidden bg-showroom-ink">
        <Image
          src="/atelier-vivo-hero.png"
          alt="Mesa de atelier con joyería fina preparada para una cita privada"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-80 fade-in"
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,oklch(0.145_0.017_66/0.90)_0%,oklch(0.145_0.017_66/0.68)_42%,oklch(0.145_0.017_66/0.16)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,oklch(0.982_0.008_86))]" />

        <div className="relative z-10 flex min-h-[92vh] lg:min-h-screen flex-col justify-between px-6 py-7 sm:px-10 lg:px-16">
          <header className="flex items-center justify-between text-porcelain">
            <Image
              src="/logo-ciaociao.png"
              alt="Ciao Ciao Joyería"
              width={120}
              height={72}
              className="h-10 w-auto object-contain brightness-0 invert opacity-90"
              priority
            />
            <a
              href="#booking"
              className="hidden sm:inline-flex rounded-full border border-porcelain/20 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-eyebrow text-porcelain/78 hover:border-champagne-soft hover:text-champagne-soft transition-colors"
            >
              Reservar
            </a>
          </header>

          <div className="grid gap-10 pb-10 sm:pb-16 lg:grid-cols-[minmax(0,680px)_280px] lg:items-end">
            <StaggerChildren>
              <StaggerItem>
                <p className="mb-5 text-[0.6rem] font-semibold uppercase tracking-display-eyebrow text-[oklch(0.88_0.045_82)]">
                  Showroom privado · México
                </p>
              </StaggerItem>

              <StaggerItem>
                <h1 className="font-serif text-[clamp(3.6rem,9vw,8rem)] leading-[0.9] text-[oklch(0.97_0.012_84)] font-light">
                  Ciao Ciao
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mt-7 max-w-lg text-base leading-7 text-[oklch(0.91_0.018_84)] sm:text-lg">
                  Agenda una visita privada con el equipo. Te recibimos con tiempo, piezas preparadas y una confirmación cuidada de principio a fin.
                </p>
              </StaggerItem>

              <StaggerItem>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <a href="#booking" className="btn-atelier text-sm">
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

            <Reveal direction="up">
              <div className="hidden border-l border-[oklch(0.93_0.018_84/0.32)] pl-6 text-[oklch(0.90_0.018_84)] lg:block">
                <p className="h-eyebrow text-[oklch(0.88_0.045_82)]">Proceso</p>
                <div className="mt-4 space-y-4 text-sm">
                  {['Elige fecha', 'Comparte tus datos', 'Recibe confirmación'].map((item, i) => (
                    <div key={item} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[oklch(0.93_0.018_84/0.38)] text-[0.7rem] tabular-nums">
                        {i + 1}
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Trust strip ─────────────────────────────── */}
      <section className="border-b border-ink-line bg-porcelain">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {trustItems.map(item => (
                <div key={item.eyebrow} className="flex h-full items-start gap-4 border border-ink-line bg-porcelain px-5 py-5 shadow-soft">
                  <item.Icon size={18} strokeWidth={1.5} className="mt-0.5 text-champagne" />
                  <div>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-eyebrow text-champagne">
                    {item.eyebrow}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{item.copy}</p>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Booking section ──────────────────────────── */}
      <section id="booking" className="surface-atelier px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[340px_1fr] lg:gap-20 lg:items-start">

            <div className="text-center lg:text-left mb-10 lg:mb-0 lg:sticky lg:top-20">
              <p className="mb-3 text-[0.6rem] font-semibold uppercase tracking-display-eyebrow text-champagne">
                Reserva en minutos
              </p>
              <h2 className="font-serif font-light text-4xl tracking-tight text-ink sm:text-5xl mb-6">
                Agenda tu cita
              </h2>
              <p className="text-sm leading-6 text-ink-muted lg:block">
                Tres pasos breves para preparar tu visita. El equipo revisa cada solicitud personalmente.
              </p>
              <div className="mt-8 hidden border-t border-ink-line pt-8 text-xs text-ink-subtle lg:block">
                <div className="grid gap-3">
                  {['Experiencia privada', 'Confirmación en 24h', 'Showroom en CDMX'].map(item => (
                    <p key={item} className="flex items-center gap-3">
                      <span className="h-px w-7 bg-champagne" />
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>

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
