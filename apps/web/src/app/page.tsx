import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { BookingWizard } from '@/components/booking/BookingWizard'
import { CinematicHero } from '@/components/landing/CinematicHero'
import { ChooseExperienceLink } from '@/components/landing/ChooseExperience'
import { Rise } from '@/components/motion/cinematic'
import { HousePicture } from '@/components/brand/Picture'
import { HouseSeal, Wordmark } from '@/components/brand/Wordmark'

export const metadata: Metadata = {
  title: { absolute: 'Cita privada | Ciao Ciao Joyería' },
}

// La cita en tres momentos. Numerales romanos como los capítulos del
// certificado: la casa cuenta las cosas en capítulos, no en «pasos».
const moments = [
  {
    numeral: 'I',
    title: 'Antes de que llegues',
    copy: 'Nos cuentas qué buscas y tu presupuesto. Con eso preparamos una charola con piezas elegidas para ti.',
  },
  {
    numeral: 'II',
    title: 'Durante tu hora',
    copy: 'Pruebas con calma, con buena luz y espejo. Te explicamos cada pieza: metal, piedras y hechura.',
  },
  {
    numeral: 'III',
    title: 'Cuando decides',
    copy: 'A tu ritmo. Si quieres pensarlo, te recibimos de nuevo cuando quieras.',
  },
]

const faqs = [
  {
    q: '¿Dónde está el showroom?',
    a: 'Es un espacio privado en la Ciudad de México. La dirección exacta te la damos cuando tu cita está confirmada: llega en tu correo y en la página de tu reserva.',
  },
  {
    q: '¿Por qué me piden identificación?',
    a: 'Toda persona que entra al showroom muestra una identificación oficial vigente; así cuidamos a quienes nos visitan y a las piezas. Solo la revisa el equipo de Ciao Ciao. La videollamada no la requiere.',
  },
  {
    q: '¿Puedo llevar invitados?',
    a: 'Sí, hasta con tres invitados. Al reservar nos das su nombre y correo, y cada uno recibe un enlace para verificar su identificación a más tardar 24 horas antes de la cita.',
  },
  {
    q: '¿Qué llevo a la cita?',
    a: 'Tu identificación oficial original. Si buscas un anillo y sabes la talla, ayuda; si no, lo resolvemos ahí. Fotos de piezas que te gusten siempre son bienvenidas.',
  },
  {
    q: '¿Cuándo sé que mi cita está confirmada?',
    a: 'El equipo revisa cada solicitud personalmente y te escribe por correo, normalmente en menos de 24 horas. Con la confirmación llega la invitación para tu calendario.',
  },
  {
    q: '¿Puedo cambiarla o cancelarla?',
    a: 'Sí, desde la página de tu reserva. Puedes moverla a otro horario hasta 12 horas antes, o cancelarla si ya no puedes venir.',
  },
  {
    q: '¿Hay un presupuesto mínimo?',
    a: 'Nuestras piezas empiezan desde $20,000 MXN. Contarnos tu presupuesto nos ayuda a preparar opciones que de verdad te sirvan.',
  },
]

export default function HomePage() {
  return (
    <main className="paper-grain min-h-screen text-ink">
      <CinematicHero />

      {/* ─── La cita: qué pasa en ella ───────────────────────────────── */}
      <section id="la-cita" aria-labelledby="la-cita-titulo" className="scroll-mt-6 px-5 pb-20 pt-16 sm:px-10 sm:pb-28 sm:pt-24 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20">
          <Rise>
            <h2 id="la-cita-titulo" className="font-serif text-[clamp(2.2rem,5vw,3.6rem)] font-light leading-[1.04] tracking-tight text-ink">
              Una hora para ti, sin vitrinas de por medio.
            </h2>
            <p className="mt-5 max-w-md text-base font-light leading-7 text-ink-muted">
              Una cita privada no es una visita a una tienda. Es el equipo de Ciao Ciao dedicado a ti, con las piezas ya sobre la mesa.
            </p>
            <ol className="mt-10 space-y-8">
              {moments.map((m, i) => (
                <Rise as="li" key={m.numeral} delay={0.1 + i * 0.08} className="grid grid-cols-[3rem_1fr] gap-4">
                  <span aria-hidden className="chapter-numeral pt-0.5 text-[2.1rem] leading-none">{m.numeral}</span>
                  <div className="border-t border-ink-line pt-3">
                    <h3 className="font-serif text-[1.45rem] font-normal leading-tight text-ink">{m.title}</h3>
                    <p className="mt-1.5 text-[0.95rem] leading-7 text-ink-muted">{m.copy}</p>
                  </div>
                </Rise>
              ))}
            </ol>
          </Rise>

          <Rise delay={0.15} as="figure" className="relative">
            <div className="engraved rounded-[1.75rem] p-3 sm:p-4">
              <div className="overflow-hidden rounded-[1.25rem]">
                <HousePicture
                  name="charola-preparada"
                  alt="Charola de terciopelo con cadenas de oro, una pulsera de diamantes, aretes de esmeralda y un anillo de zafiro, junto a una tarjeta en blanco"
                  sizes="(min-width: 1024px) 560px, 100vw"
                  className="aspect-[4/5] sm:aspect-[3/2] lg:aspect-[4/5]"
                />
              </div>
            </div>
            <figcaption className="mt-4 max-w-sm text-sm leading-6 text-ink-muted">
              La charola se arma con lo que nos cuentas al reservar: tipo de pieza, metal y presupuesto.
            </figcaption>
          </Rise>
        </div>
      </section>

      {/* ─── Dos maneras de vernos ───────────────────────────────────── */}
      <section aria-labelledby="maneras-titulo" className="bg-[var(--paper-deep)] px-5 py-20 sm:px-10 sm:py-28 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <div className="ornament-rule mx-auto mb-8 max-w-xs" aria-hidden>
              <span className="h-1.5 w-1.5 rotate-45 bg-champagne" />
            </div>
            <h2 id="maneras-titulo" className="mx-auto max-w-2xl text-center font-serif text-[clamp(2.1rem,4.6vw,3.3rem)] font-light leading-[1.06] tracking-tight text-ink">
              Dos maneras de vernos
            </h2>
          </Rise>

          <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <Rise as="div" className="group">
              <div className="overflow-hidden rounded-[1.5rem]">
                <HousePicture
                  name="showroom-privado"
                  alt="Mesa de mármol del showroom con una charola de terciopelo, anillos y aretes de diamante, una copa de agua y una servilleta de lino"
                  sizes="(min-width: 1024px) 640px, 100vw"
                  className="aspect-[4/5] sm:aspect-[16/11] lg:aspect-[4/5]"
                  imgClassName="transition-transform duration-[1200ms] ease-expo group-hover:scale-[1.03]"
                />
              </div>
              <h3 className="mt-7 font-serif text-[2rem] font-light leading-tight text-ink">En el showroom</h3>
              <p className="mt-2 max-w-lg text-base font-light leading-7 text-ink-muted">
                Ves y pruebas en persona, en un espacio privado de la Ciudad de México. Puedes venir con hasta tres invitados.
              </p>
              <dl className="mt-5 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 border-t border-ink-line pt-5 text-sm">
                <div><dt className="text-ink-subtle">Duración</dt><dd className="mt-0.5 text-ink">Una hora</dd></div>
                <div><dt className="text-ink-subtle">Necesitas</dt><dd className="mt-0.5 text-ink">Identificación oficial</dd></div>
              </dl>
              <ChooseExperienceLink type="showroom" className="btn-atelier mt-7 min-h-[48px] px-7 text-sm">
                Reservar en el showroom
              </ChooseExperienceLink>
            </Rise>

            <Rise delay={0.12} as="div" className="group lg:pb-6">
              <div className="overflow-hidden rounded-[1.5rem]">
                <HousePicture
                  name="video-consulta"
                  alt="Mano sosteniendo un colgante de zafiro frente a una laptop con una videollamada, junto a un estuche de anillo abierto"
                  sizes="(min-width: 1024px) 460px, 100vw"
                  className="aspect-[3/2]"
                  imgClassName="transition-transform duration-[1200ms] ease-expo group-hover:scale-[1.03]"
                />
              </div>
              <h3 className="mt-7 font-serif text-[2rem] font-light leading-tight text-ink">Por videollamada</h3>
              <p className="mt-2 max-w-md text-base font-light leading-7 text-ink-muted">
                Una llamada guiada para elegir anillo de compromiso: estilo, presupuesto y tiempos, desde donde estés.
              </p>
              <dl className="mt-5 grid max-w-md grid-cols-2 gap-x-6 gap-y-3 border-t border-ink-line pt-5 text-sm">
                <div><dt className="text-ink-subtle">Ideal para</dt><dd className="mt-0.5 text-ink">Anillo de compromiso</dd></div>
                <div><dt className="text-ink-subtle">El enlace</dt><dd className="mt-0.5 text-ink">Llega antes de la llamada</dd></div>
              </dl>
              <ChooseExperienceLink
                type="video_engagement_rings"
                className="mt-7 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-champagne-solid px-7 text-sm font-semibold text-champagne-solid transition-colors duration-200 hover:bg-champagne-tint"
              >
                Reservar videollamada
              </ChooseExperienceLink>
            </Rise>
          </div>
        </div>
      </section>

      {/* ─── Reserva ─────────────────────────────────────────────────── */}
      <section id="reservar" aria-labelledby="reservar-titulo" className="relative scroll-mt-2 px-4 py-20 sm:px-8 sm:py-28">
        {/* Ancla antigua: los enlaces viejos a /#booking siguen llegando aquí. */}
        <span id="booking" aria-hidden className="absolute top-0" />
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-20">
          <Rise className="mb-10 text-center lg:sticky lg:top-16 lg:mb-0 lg:text-left">
            <HouseSeal size={52} className="mb-6" />
            <h2 id="reservar-titulo" className="font-serif text-[clamp(2.3rem,5vw,3.4rem)] font-light leading-[1.02] tracking-tight text-ink">
              Reserva tu cita
            </h2>
            <p className="mx-auto mt-4 max-w-sm text-[0.95rem] leading-7 text-ink-muted lg:mx-0">
              Elige día y hora. El equipo revisa tu solicitud personalmente y te confirma por correo.
            </p>
          </Rise>

          <BookingWizard />
        </div>
      </section>

      {/* ─── Preguntas ───────────────────────────────────────────────── */}
      <section aria-labelledby="preguntas-titulo" className="border-t border-ink-line px-5 py-20 sm:px-10 sm:py-28 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
          <Rise className="lg:sticky lg:top-16 lg:self-start">
            <h2 id="preguntas-titulo" className="font-serif text-[clamp(2.1rem,4.4vw,3.1rem)] font-light leading-[1.05] tracking-tight text-ink">
              Antes de tu visita
            </h2>
            <div className="mt-8 hidden overflow-hidden rounded-[1.5rem] lg:block">
              <HousePicture
                name="macro-anillo"
                alt="Anillo solitario de diamante oval en oro amarillo sobre papel de algodón, con luz de tarde"
                sizes="(min-width: 1024px) 380px, 0px"
                className="aspect-square"
              />
            </div>
          </Rise>

          <div className="faq divide-y divide-ink-line border-y border-ink-line">
            {faqs.map(item => (
              <details key={item.q} className="group">
                <summary className="flex min-h-[64px] cursor-pointer items-center justify-between gap-6 py-4 text-left focus-visible:shadow-focus-ring">
                  <span className="font-serif text-[1.35rem] font-normal leading-snug text-ink">{item.q}</span>
                  <Plus aria-hidden size={18} strokeWidth={1.25} className="faq-mark shrink-0 text-champagne-deep" />
                </summary>
                <p className="max-w-[60ch] pb-6 pr-10 text-[0.95rem] leading-7 text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pie ─────────────────────────────────────────────────────── */}
      <footer className="bg-showroom-ink px-5 py-14 text-center text-[oklch(0.86_0.02_84)] sm:px-10">
        <Wordmark className="text-lg text-[oklch(0.93_0.03_84)]" subtitle="Joyería fina" />
        <div className="ornament-rule mx-auto my-8 max-w-[10rem]" aria-hidden>
          <span className="h-1 w-1 rotate-45 bg-champagne" />
        </div>
        <nav aria-label="Pie de página" className="flex flex-col items-center justify-center gap-1 text-sm sm:flex-row sm:gap-6">
          <a href="mailto:hola@ciaociao.mx" className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-champagne-soft">
            hola@ciaociao.mx
          </a>
          <a href="/reserva" className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-champagne-soft">
            Ver mi reserva
          </a>
        </nav>
      </footer>
    </main>
  )
}
