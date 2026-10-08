'use client'

import Image from 'next/image'
import { StaggerChildren, StaggerItem } from '@/components/motion'
import {
  ParallaxStage, ParallaxLayer, ScrollParallax, WordsReveal, LightSweep,
} from '@/components/motion/cinematic'

/**
 * Portada: la foto del atelier se queda (decisión de Joe) como el umbral
 * oscuro de la casa; todo lo demás de la página es papel. Una sola promesa,
 * una sola acción principal: el resto de la historia vive debajo.
 *
 * La foto va al fondo (deriva contra el cursor y se rezaga al hacer scroll),
 * el título sube palabra por palabra y una luz champagne cruza una vez.
 * Todo es transform/opacity y se aquieta con «reducir movimiento».
 */
export function CinematicHero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-showroom-ink">
      <ParallaxStage className="relative min-h-[100svh]">

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

        {/* Atmósfera fija: viñeta y fundido a papel al pie. */}
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(100deg,oklch(0.145_0.017_66/0.88)_0%,oklch(0.145_0.017_66/0.62)_46%,oklch(0.145_0.017_66/0.12)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 z-[1] h-48 bg-[linear-gradient(180deg,transparent,oklch(0.145_0.017_66/0.35)_45%,oklch(0.975_0.009_84))]" />

        <LightSweep delay={1.15} className="z-[2]" />

        <div className="relative z-10 flex min-h-[100svh] flex-col justify-between px-5 pb-16 pt-6 sm:px-10 lg:px-16">
          <header className="flex items-center justify-between gap-4 text-porcelain">
            <Image
              src="/logo-ciaociao.png"
              alt="Ciao Ciao Joyería"
              width={120}
              height={72}
              className="h-10 w-auto object-contain brightness-0 invert opacity-90"
              priority
            />
            <a
              href="/reserva"
              className="inline-flex min-h-[44px] items-center rounded-full border border-porcelain/25 px-4 text-11 font-medium uppercase tracking-eyebrow text-porcelain/85 transition-colors duration-200 hover:border-champagne-soft hover:text-champagne-soft"
            >
              Ver mi reserva
            </a>
          </header>

          <ParallaxLayer depth={5} className="max-w-[44rem] pb-6 sm:pb-12">
            <StaggerChildren>
              <StaggerItem>
                <p className="mb-6 text-11 font-medium uppercase tracking-display-eyebrow text-[oklch(0.88_0.045_82)]">
                  Cita privada · Ciudad de México
                </p>
              </StaggerItem>

              <h1 className="font-serif text-[clamp(2.9rem,8.2vw,6.4rem)] font-light leading-[0.98] tracking-tight text-[oklch(0.97_0.012_84)]">
                <WordsReveal text="Una mesa preparada para ti." delay={0.2} />
              </h1>

              <StaggerItem>
                <p className="mt-7 max-w-md text-[1.0625rem] font-light leading-8 text-[oklch(0.92_0.016_84)]">
                  Visítanos en el showroom o por videollamada. Elegimos las piezas antes de que llegues y te damos el tiempo que necesites.
                </p>
              </StaggerItem>

              <StaggerItem>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a href="#reservar" className="btn-atelier min-h-[52px] px-8 text-[0.95rem]">
                    Reservar mi cita
                  </a>
                  <a
                    href="#la-cita"
                    className="inline-flex min-h-[48px] items-center justify-center px-2 text-sm font-medium text-[oklch(0.92_0.016_84)] underline decoration-[oklch(0.88_0.045_82/0.5)] underline-offset-[6px] transition-colors hover:text-champagne-soft"
                  >
                    Cómo es la cita
                  </a>
                </div>
              </StaggerItem>
            </StaggerChildren>
          </ParallaxLayer>
        </div>
      </ParallaxStage>
    </section>
  )
}
