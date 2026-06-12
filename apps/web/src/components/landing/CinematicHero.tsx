'use client'

import Image from 'next/image'
import { StaggerChildren, StaggerItem } from '@/components/motion'
import {
  ParallaxStage, ParallaxLayer, ScrollParallax, TitleReveal, LightSweep, DepthReveal,
} from '@/components/motion/cinematic'

/**
 * Hero as a vitrine: the photo sits deep (drifts against the cursor, lags the
 * scroll), the title rises out of a 3D mask, the process card floats nearest
 * to the glass, and a champagne light sweep crosses once on arrival.
 */
export function CinematicHero() {
  return (
    <section className="relative min-h-[92vh] lg:min-h-screen overflow-hidden bg-showroom-ink">
      <ParallaxStage className="relative min-h-[92vh] lg:min-h-screen">

        {/* Photo plane — deepest layer. Oversized so parallax drift never
            exposes an edge. */}
        <ParallaxLayer depth={-14} className="absolute -inset-10" style={{ zIndex: 0 }}>
          <ScrollParallax speed={0.72} scaleFrom={1.06} className="absolute inset-0">
            <Image
              src="/atelier-vivo-hero.webp"
              alt="Mesa de atelier con joyería fina preparada para una cita privada"
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-80 fade-in"
            />
          </ScrollParallax>
        </ParallaxLayer>

        {/* Static atmosphere — vignette and page-blend stay pinned so the
            drift beneath them reads as depth. */}
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(100deg,oklch(0.145_0.017_66/0.90)_0%,oklch(0.145_0.017_66/0.68)_42%,oklch(0.145_0.017_66/0.16)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 z-[1] h-40 bg-[linear-gradient(180deg,transparent,oklch(0.982_0.008_86))]" />

        {/* The lamp passes over the vitrine once. */}
        <LightSweep delay={1.15} className="z-[2]" />

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
            <a
              href="/reserva"
              className="hidden sm:inline-flex rounded-full border border-porcelain/20 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-eyebrow text-porcelain/78 hover:border-champagne-soft hover:text-champagne-soft transition-colors"
            >
              Ver mi reserva
            </a>
          </header>

          <div className="grid gap-10 pb-10 sm:pb-16 lg:grid-cols-[minmax(0,680px)_280px] lg:items-end">
            <ParallaxLayer depth={5}>
              <StaggerChildren>
                <StaggerItem>
                  <p className="mb-5 text-[0.6rem] font-semibold uppercase tracking-display-eyebrow text-[oklch(0.88_0.045_82)]">
                    Showroom privado · México
                  </p>
                </StaggerItem>

                <h1 className="font-serif text-[clamp(3.6rem,9vw,8rem)] leading-[0.9] text-[oklch(0.97_0.012_84)] font-light">
                  <TitleReveal text="Ciao Ciao" delay={0.25} />
                </h1>

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
                      href="/reserva"
                      className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/55 hover:bg-white/10"
                    >
                      Ver mi reserva
                    </a>
                  </div>
                </StaggerItem>
              </StaggerChildren>
            </ParallaxLayer>

            <ParallaxLayer depth={12}>
              <DepthReveal delay={0.5}>
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
              </DepthReveal>
            </ParallaxLayer>
          </div>
        </div>
      </ParallaxStage>
    </section>
  )
}
