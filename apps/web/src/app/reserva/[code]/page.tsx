import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { BUSINESS_TZ, cn, formatDate, formatTime12 } from '@/lib/utils'
import { isVideoEngagement, normalizeAppointmentType } from '@/lib/commercial'
import { StatusBadge } from '@/components/ui/Badge'
import { CalendarDays, CalendarPlus, Check, Monitor } from 'lucide-react'
import type { AppointmentStatus, GuestStatus } from '@/types'
import CancelButton from './CancelButton'
import RescheduleSection from './RescheduleSection'
import LocationCard, { getShowroomAddress, getShowroomMapsUrl } from './LocationCard'
import GuestsPanel, { type GuestSummary } from './GuestsPanel'
import { WordsReveal, DepthReveal, LightSweep } from '@/components/motion/cinematic'
import { Wordmark } from '@/components/brand/Wordmark'
import Countdown from './Countdown'
import ReservaGate from './ReservaGate'
import {
  normalizeReservaCode,
  reservaCookieName,
  verifyReservaCookie,
  verifyReservaLinkToken,
} from '@/lib/reserva-access'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = {
  title:  'Estado de tu cita',
  robots: { index: false, follow: false, nocache: true },
}

interface PageProps {
  params:       Promise<{ code: string }>
  searchParams: Promise<{ t?: string | string[] }>
}

/**
 * Sin credencial no se consulta Firestore ni se dice si el código existe:
 * solo la puerta del correo, en el mismo marco visual que la página.
 */
function GateView({ code }: { code: string }) {
  return (
    <main className="paper-grain min-h-screen text-ink">
      <section className="px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto grid min-h-[calc(100svh-6rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1fr_440px]">
          <header>
            <a href="/" className="inline-flex min-h-[44px] items-center text-champagne-deep" aria-label="Ciao Ciao Joyería, inicio">
              <Wordmark className="text-sm" />
            </a>
            <h1 className="mt-10 font-serif text-[clamp(2.6rem,6.4vw,4.6rem)] font-light leading-[1.0] tracking-tight text-ink">
              <WordsReveal text="Tu reserva, solo para ti." />
            </h1>
            <p className="mt-6 max-w-md text-base font-light leading-7 text-ink-muted">
              Confirma el correo con el que reservaste. Este dispositivo lo recordará por 30 días.
            </p>
          </header>
          <DepthReveal delay={0.35}>
            <ReservaGate code={code} />
          </DepthReveal>
        </div>
      </section>
    </main>
  )
}

// Estilos de acción compartidos. Son anclas (<a>), no <Button> (que renderiza
// <button>), pero conservan la jerarquía del sistema: dorado sólido = acción
// principal, contorno champagne = secundaria, contorno tenue = terciaria.
// Todas con área táctil ≥44px y foco visible por teclado.
const ACTION_PRIMARY = 'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-champagne-solid px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-champagne-deep focus-visible:outline-none focus-visible:shadow-focus-ring'
const ACTION_OUTLINE = 'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-champagne px-5 py-2.5 text-sm font-medium text-champagne-solid transition-colors duration-200 hover:bg-champagne-soft focus-visible:outline-none focus-visible:shadow-focus-ring'
const ACTION_QUIET   = 'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-ink-line px-5 py-2.5 text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-cream-soft hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring'

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function statusMessage(status: AppointmentStatus, isVideo: boolean, hasMeetingUrl: boolean): string {
  if (status === 'pending') {
    return isVideo
      ? 'Tu solicitud de video consulta fue recibida y está pendiente de revisión por nuestro equipo.'
      : 'Tu solicitud fue recibida y está pendiente de revisión por nuestro equipo.'
  }
  if (status === 'accepted') {
    if (!isVideo) return 'Tu cita está confirmada. Te esperamos en el showroom.'
    return hasMeetingUrl
      ? 'Tu video consulta está confirmada. El enlace está listo abajo.'
      : 'Tu video consulta está confirmada. Te enviaremos el enlace antes de la llamada.'
  }
  if (status === 'rejected') {
    return 'En este momento no podemos confirmar tu cita. Te invitamos a agendar en otro horario.'
  }
  return 'Esta cita fue cancelada.'
}

/**
 * Enlace «Agregar en Google Calendar» (plantilla render?action=TEMPLATE).
 * Google espera las fechas en UTC (sufijo Z); slotDatetime ya es el instante
 * UTC y la duración de 60 min replica la del .ics de /api/calendar/[apptId].
 */
function googleCalendarUrl(appt: {
  slotDatetime: Date
  confirmationCode: string
  meetingUrl?: string
  meetingInstructions?: string
}, isVideo: boolean, showroomAddress: string): string {
  const start  = appt.slotDatetime
  const end    = new Date(start.getTime() + 60 * 60 * 1000)
  const fmtUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

  const details = isVideo
    ? [
        'Video consulta para anillo de compromiso en Ciao Ciao Joyería.',
        appt.meetingUrl ? `Link: ${appt.meetingUrl}` : 'Link pendiente por enviar.',
        appt.meetingInstructions ? `Indicaciones: ${appt.meetingInstructions}` : '',
        `Código de confirmación: ${appt.confirmationCode}`,
      ].filter(Boolean).join('\n')
    : [
        'Tu cita personalizada en el showroom privado de Ciao Ciao Joyería.',
        `Código de confirmación: ${appt.confirmationCode}`,
      ].join('\n')

  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     isVideo ? 'Video consulta Ciao Ciao' : 'Cita en Ciao Ciao Joyería',
    dates:    `${fmtUtc(start)}/${fmtUtc(end)}`,
    details,
    location: isVideo
      ? (appt.meetingUrl || 'Videollamada')
      : (showroomAddress || 'Showroom Ciao Ciao Joyería'),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export default async function ReservaPage({ params, searchParams }: PageProps) {
  const { code: rawCode } = await params
  const { t } = await searchParams
  const code = normalizeReservaCode(rawCode)
  if (!code) notFound()

  // Enlace firmado: /entrar emite la cookie y vuelve a la URL limpia.
  const token = Array.isArray(t) ? t[0] : t
  if (token && verifyReservaLinkToken(code, token)) {
    redirect(`/api/reserva/${code}/entrar?t=${encodeURIComponent(token)}`)
  }

  const cookieStore = await cookies()
  if (!verifyReservaCookie(code, cookieStore.get(reservaCookieName(code))?.value)) {
    return <GateView code={code} />
  }

  const snap = await adminDb
    .collection('appointments')
    .where('confirmationCode', '==', code)
    .limit(1)
    .get()

  if (snap.empty) notFound()

  const doc  = snap.docs[0]
  const data = doc.data()

  const appt = {
    id:                doc.id,
    status:            data.status as AppointmentStatus,
    name:              data.name as string,
    email:             data.email as string,
    slotId:            data.slotId as string,
    slotDatetime:      (data.slotDatetime as Timestamp).toDate(),
    confirmationCode:  data.confirmationCode as string,
    cancelToken:       data.cancelToken as string,
    notes:             data.notes as string | undefined,
    appointmentType:   normalizeAppointmentType(data.appointmentType),
    meetingUrl:        data.meetingUrl as string | undefined,
    meetingProvider:   data.meetingProvider as string | undefined,
    meetingInstructions: data.meetingInstructions as string | undefined,
    guestCount:        (data.guestCount as number | undefined) ?? 0,
    guestsAllVerified: (data.guestsAllVerified as boolean | undefined) ?? true,
  }

  const canCancel = appt.status === 'pending' || appt.status === 'accepted'
  const isVideo = isVideoEngagement(appt.appointmentType)

  // Protagonista: fecha y hora de la cita como cifra de portada (serif).
  const fechaLarga = capitalize(formatInTimeZone(appt.slotDatetime, BUSINESS_TZ, "EEEE d 'de' MMMM", { locale: es }))
  const anio       = formatInTimeZone(appt.slotDatetime, BUSINESS_TZ, 'yyyy')
  // «1:00 pm» en CDMX: la cifra va en serif y el «pm» pequeño al lado.
  const [hora, periodo] = formatTime12(appt.slotDatetime).split(' ')

  // Acciones (calendario, videollamada, cómo llegar): solo citas aceptadas
  // que aún no ocurren.
  const isUpcoming       = appt.slotDatetime.getTime() > Date.now()
  const showActions      = appt.status === 'accepted' && isUpcoming
  const showroomAddress  = getShowroomAddress()
  const showroomMapsUrl  = getShowroomMapsUrl()

  // La clienta puede mover su cita hasta 12 horas antes del horario actual
  // (misma regla que valida /api/reschedule/[token]).
  const canReschedule = canCancel
    && appt.slotDatetime.getTime() - Date.now() >= 12 * 60 * 60 * 1000

  let guests: GuestSummary[] = []
  if (canCancel && appt.guestCount > 0) {
    const guestsSnap = await doc.ref.collection('guests').orderBy('invitedAt', 'asc').get()
    guests = guestsSnap.docs.map(g => {
      const gd = g.data()
      return {
        id:          g.id,
        name:        gd.name as string,
        status:      gd.status as GuestStatus,
        verifyToken: (gd.verifyToken as string | undefined) ?? null,
      }
    })
  }

  const firstName = appt.name.trim().split(/\s+/)[0] ?? ''
  const heading =
    appt.status === 'accepted' && isUpcoming ? `Te esperamos, ${firstName}.`
    : appt.status === 'accepted' ? 'Gracias por tu visita.'
    : appt.status === 'pending' ? 'Tu solicitud está en revisión.'
    : appt.status === 'rejected' ? 'No pudimos confirmar este horario.'
    : 'Esta cita fue cancelada.'

  // Línea de estado: dónde va la cita. Solo tiene sentido mientras está viva.
  const timeline = canCancel ? [
    { label: 'Solicitud recibida', state: 'done' as const },
    { label: 'Confirmada por el equipo', state: appt.status === 'accepted' ? 'done' as const : 'current' as const },
    { label: isVideo ? 'Tu videollamada' : 'Tu visita', state: appt.status === 'accepted' ? 'current' as const : 'next' as const },
  ] : []

  const bring = isVideo
    ? [
        'Una conexión estable y un lugar tranquilo, con buena luz.',
        'Si sabes la talla o tienes fotos de referencia, tenlas a la mano.',
      ]
    : [
        'Tu identificación oficial original y vigente.',
        ...(guests.length > 0 ? ['Tus invitados, cada uno con su identificación ya verificada.'] : []),
        'Llega cinco minutos antes; el equipo te recibe en la puerta.',
      ]

  return (
    <main className="paper-grain min-h-screen text-ink">
      <section className="px-4 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-12">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-16">
          <header className="lg:sticky lg:top-12">
            <a href="/" className="inline-flex min-h-[44px] items-center text-champagne-deep" aria-label="Ciao Ciao Joyería, inicio">
              <Wordmark className="text-sm" />
            </a>
            <p className="mb-4 mt-10 text-11 font-medium uppercase tracking-display-eyebrow text-champagne-solid">
              {isVideo ? 'Videollamada' : 'Cita privada'}
            </p>
            <h1 className="font-serif text-[clamp(2.6rem,6.4vw,4.6rem)] font-light leading-[1.0] tracking-tight text-ink">
              <WordsReveal text={heading} />
            </h1>
            <p className="mt-5 max-w-md text-base font-light leading-7 text-ink-muted">
              {statusMessage(appt.status, isVideo, Boolean(appt.meetingUrl))}
            </p>
            {canCancel && isUpcoming && (
              <div className="mt-6">
                <Countdown iso={appt.slotDatetime.toISOString()} />
              </div>
            )}

            {timeline.length > 0 && (
              <ol className="mt-8 max-w-sm space-y-0" aria-label="Estado de tu cita">
                {timeline.map((step, i) => (
                  <li key={step.label} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < timeline.length - 1 && (
                      <span aria-hidden className={cn('absolute left-[9px] top-6 h-[calc(100%-1.25rem)] w-px', step.state === 'done' ? 'bg-champagne' : 'bg-ink-line')} />
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        'relative mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border',
                        step.state === 'done' && 'border-champagne-solid bg-champagne-solid text-porcelain',
                        step.state === 'current' && 'border-champagne-solid bg-porcelain',
                        step.state === 'next' && 'border-ink-line bg-porcelain',
                      )}
                    >
                      {step.state === 'done' && <Check size={11} strokeWidth={2.25} />}
                      {step.state === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-champagne-solid" />}
                    </span>
                    <span className={cn('text-sm', step.state === 'next' ? 'text-ink-muted' : 'text-ink')}>
                      <span className="sr-only">{step.state === 'done' ? 'Hecho: ' : step.state === 'current' ? 'En curso: ' : 'Después: '}</span>
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </header>

          <div className="space-y-5">
          <DepthReveal delay={0.25}>
          <article className="engraved relative overflow-hidden rounded-[1.6rem] px-6 py-7 sm:px-8">
            <LightSweep delay={1.1} />
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-ink-muted">{appt.name}</p>
              <StatusBadge status={appt.status} />
            </div>

            <div className="mt-5 border-b border-ink-line pb-5">
              <p className="font-serif text-[2rem] font-light leading-[1.05] text-ink">{fechaLarga}</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-[1.7rem] font-light leading-none text-champagne-deep">{hora}</span>
                <span className="text-sm text-ink-muted">{periodo} · hora CDMX · {anio}</span>
              </p>
            </div>

            <dl className="text-sm">
              {([
                ['Experiencia', isVideo ? 'Videollamada' : 'Showroom privado'],
                ['Código',  appt.confirmationCode],
                ...(isVideo ? [['Enlace', appt.meetingUrl || 'Llega antes de la llamada']] : []),
                ...(isVideo && appt.meetingProvider ? [['Plataforma', appt.meetingProvider]] : []),
                ...(isVideo && appt.meetingInstructions ? [['Indicaciones', appt.meetingInstructions]] : []),
                ...(appt.notes ? [['Tu nota', appt.notes]] : [] as [string, string][]),
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 border-b border-ink-line py-3 last:border-0 sm:flex-row sm:justify-between sm:gap-5">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className={cn(
                    'break-words text-ink sm:max-w-[62%] sm:text-right',
                    label === 'Código' && 'font-medium tabular-nums tracking-[0.14em]',
                    label === 'Enlace'   && 'break-all',
                  )}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {showActions && (
              <div className="mt-5 space-y-3 border-t border-ink-line pt-5">
                {isVideo && appt.meetingUrl && (
                  <a href={appt.meetingUrl} target="_blank" rel="noopener noreferrer" className={ACTION_PRIMARY}>
                    <Monitor size={16} strokeWidth={1.5} />
                    Unirme a la videollamada
                  </a>
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <a
                    href={`/api/calendar/${appt.id}?code=${encodeURIComponent(appt.confirmationCode)}`}
                    className={isVideo && appt.meetingUrl ? ACTION_OUTLINE : ACTION_PRIMARY}
                  >
                    <CalendarPlus size={15} strokeWidth={1.5} />
                    Agregar a mi calendario
                  </a>
                  <a
                    href={googleCalendarUrl(appt, isVideo, showroomAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ACTION_QUIET}
                  >
                    <CalendarDays size={15} strokeWidth={1.5} />
                    Google Calendar
                  </a>
                </div>
              </div>
            )}
          </article>
          </DepthReveal>

          {showActions && !isVideo && showroomAddress && (
            <LocationCard address={showroomAddress} googleMapsUrl={showroomMapsUrl || undefined} />
          )}

          {canCancel && isUpcoming && (
            <section aria-labelledby="que-llevar" className="rounded-2xl bg-[var(--paper-deep)] px-5 py-5">
              <h2 id="que-llevar" className="font-serif text-xl text-ink">Qué llevar</h2>
              <ul className="mt-3 space-y-2.5">
                {bring.map(item => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-ink-muted">
                    <span aria-hidden className="mt-[0.6rem] h-1 w-1 shrink-0 rotate-45 bg-champagne" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isVideo && guests.length > 0 && (
            <GuestsPanel
              guests={guests}
              hostName={appt.name}
              dateStr={formatDate(appt.slotDatetime)}
              timeStr={formatTime12(appt.slotDatetime)}
            />
          )}

          {canCancel && (
            <section aria-labelledby="gestionar" className="space-y-3 rounded-2xl border border-ink-line bg-porcelain px-5 py-5">
              <div>
                <h2 id="gestionar" className="font-serif text-xl text-ink">¿Cambió tu agenda?</h2>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  {canReschedule
                    ? 'Puedes moverla a otro horario hasta 12 horas antes, o cancelarla si ya no puedes venir.'
                    : 'Faltan menos de 12 horas, así que ya no se puede mover en línea. Escríbenos y lo resolvemos contigo.'}
                </p>
              </div>
              {canReschedule && (
                <RescheduleSection
                  token={appt.cancelToken}
                  appointmentType={appt.appointmentType}
                  currentSlotId={appt.slotId}
                />
              )}
              {!canReschedule && (
                <a href={`mailto:hola@ciaociao.mx?subject=${encodeURIComponent(`Mi cita ${appt.confirmationCode}`)}`} className={ACTION_OUTLINE}>
                  Escribir a hola@ciaociao.mx
                </a>
              )}
              <CancelButton token={appt.cancelToken} />
            </section>
          )}

          <div className="flex items-center justify-between gap-3 px-1">
            <a
              href="mailto:hola@ciaociao.mx"
              className="inline-flex min-h-[44px] items-center text-xs text-ink-muted transition-colors hover:text-ink"
            >
              hola@ciaociao.mx
            </a>
            <a
              href="/"
              className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-medium text-champagne-solid transition-colors hover:text-champagne-deep focus-visible:outline-none focus-visible:shadow-focus-ring"
            >
              Reservar otra cita
            </a>
          </div>
          </div>
        </div>
      </section>
    </main>
  )
}
