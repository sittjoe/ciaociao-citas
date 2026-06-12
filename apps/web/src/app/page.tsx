import type { Metadata } from 'next'
import { CalendarCheck, Clock, ShieldCheck } from 'lucide-react'
import { BookingWizard } from '@/components/booking/BookingWizard'
import { CinematicHero } from '@/components/landing/CinematicHero'
import { DepthReveal, LightSweep } from '@/components/motion/cinematic'

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
      <CinematicHero />

      {/* ─── Trust strip ─────────────────────────────── */}
      <section className="border-b border-ink-line bg-porcelain">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {trustItems.map((item, i) => (
              <DepthReveal key={item.eyebrow} delay={i * 0.09}>
                <div className="card-relief relative flex h-full items-start gap-4 overflow-hidden rounded-xl border border-ink-line bg-porcelain px-5 py-5">
                  <LightSweep delay={0.4 + i * 0.09} />
                  <item.Icon size={18} strokeWidth={1.5} className="mt-0.5 text-champagne" />
                  <div>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-eyebrow text-champagne">
                    {item.eyebrow}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{item.copy}</p>
                  </div>
                </div>
              </DepthReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Booking section ──────────────────────────── */}
      <section id="booking" className="surface-atelier px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[340px_1fr] lg:gap-20 lg:items-start">

            <DepthReveal className="text-center lg:text-left mb-10 lg:mb-0 lg:sticky lg:top-20">
              <p className="mb-3 text-[0.6rem] font-semibold uppercase tracking-display-eyebrow text-champagne">
                Reserva en minutos
              </p>
              <h2 className="font-serif font-light text-4xl tracking-tight text-ink sm:text-5xl mb-6">
                Agenda tu cita
              </h2>
              <p className="text-sm leading-6 text-ink-muted lg:block">
                Unos pasos breves para preparar tu visita. El equipo revisa cada solicitud personalmente.
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
            </DepthReveal>

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
