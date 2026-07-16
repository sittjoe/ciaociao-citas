import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { appointmentTypeLabels, isVideoEngagement, normalizeAppointmentType } from '@/lib/commercial'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { CalendarDays, CalendarPlus, Gem, Monitor } from 'lucide-react'
import type { AppointmentStatus, GuestStatus } from '@/types'
import CancelButton from './CancelButton'
import RescheduleSection from './RescheduleSection'
import LocationCard, { getShowroomAddress } from './LocationCard'
import GuestsPanel, { type GuestSummary } from './GuestsPanel'
import { TitleReveal, DepthReveal, LightSweep } from '@/components/motion/cinematic'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Estado de tu cita' }

interface PageProps { params: Promise<{ code: string }> }

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

export default async function ReservaPage({ params }: PageProps) {
  const { code } = await params

  const snap = await adminDb
    .collection('appointments')
    .where('confirmationCode', '==', code.toUpperCase())
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

  // Acciones (calendario, videollamada, cómo llegar): solo citas aceptadas
  // que aún no ocurren.
  const isUpcoming       = appt.slotDatetime.getTime() > Date.now()
  const showActions      = appt.status === 'accepted' && isUpcoming
  const showroomAddress  = getShowroomAddress()
  const showroomMapsUrl  = (process.env.NEXT_PUBLIC_SHOWROOM_MAPS_URL ?? process.env.SHOWROOM_MAPS_URL ?? '').trim()

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

  return (
    <main className="min-h-screen bg-cream">
      <section className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8 sm:py-16">
        <Image
          src="/atelier-vivo-hero.webp"
          alt="Detalle de joyería fina en mesa de atelier"
          fill
          sizes="100vw"
          className="object-cover opacity-18"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.982_0.008_86/0.78),oklch(0.982_0.008_86/0.96))]" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1fr_440px]">
          <header>
            <p className="mb-4 text-[0.6rem] font-semibold uppercase tracking-display-eyebrow text-champagne">
              Ciao Ciao · {isVideo ? 'Video consulta' : 'Showroom privado'}
            </p>
            <h1 className="font-serif text-[clamp(3rem,7vw,5.5rem)] font-light leading-[0.94] text-ink">
              <TitleReveal text="Estado de tu cita" />
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-ink-muted">
              Conserva este código. El equipo lo usará para ubicar tu solicitud y preparar {isVideo ? 'tu llamada' : 'tu visita'}.
            </p>
          </header>

          <DepthReveal delay={0.35}>
          <Card variant="atelier" className="relative w-full space-y-5 overflow-hidden p-6 sm:p-7">
            <LightSweep delay={1.1} />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="h-eyebrow mb-2">Tu cita</p>
                <h2 className="font-serif text-2xl font-light text-ink">{appt.name}</h2>
              </div>
              <StatusBadge status={appt.status} />
            </div>

            <p className="text-sm leading-6 text-ink-muted">{statusMessage(appt.status, isVideo, Boolean(appt.meetingUrl))}</p>

            <div className="rounded-2xl border border-ink-line bg-porcelain/70 px-4 py-2 text-sm">
              {([
                ['Tipo',    appointmentTypeLabels[appt.appointmentType]],
                ['Código',  appt.confirmationCode],
                ['Fecha',   formatDate(appt.slotDatetime)],
                ['Hora',    formatTime(appt.slotDatetime)],
                ...(isVideo ? [['Link', appt.meetingUrl || 'Pendiente por enviar']] : []),
                ...(isVideo && appt.meetingProvider ? [['Plataforma', appt.meetingProvider]] : []),
                ...(isVideo && appt.meetingInstructions ? [['Indicaciones', appt.meetingInstructions]] : []),
                ...(appt.notes ? [['Notas', appt.notes]] : [] as [string, string][]),
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 border-b border-ink-line py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-5">
                  <span className="text-ink-muted">{label}</span>
                  <span className="break-words text-ink sm:max-w-[60%] sm:text-right">{value}</span>
                </div>
              ))}
            </div>

            {!isVideo && guests.length > 0 && (
              <GuestsPanel
                guests={guests}
                hostName={appt.name}
                dateStr={formatDate(appt.slotDatetime)}
                timeStr={formatTime(appt.slotDatetime)}
              />
            )}

            {showActions && (
              <div className="space-y-2.5">
                {isVideo && appt.meetingUrl && (
                  <a
                    href={appt.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-champagne-solid px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-champagne-deep"
                  >
                    <Monitor size={16} strokeWidth={1.5} />
                    Unirme a la videollamada
                  </a>
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <a
                    href={`/api/calendar/${appt.id}?code=${encodeURIComponent(appt.confirmationCode)}`}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-champagne px-5 py-2.5 text-sm font-medium text-champagne transition-colors duration-200 hover:bg-champagne-soft"
                  >
                    <CalendarPlus size={15} strokeWidth={1.5} />
                    Agregar a mi calendario
                  </a>
                  <a
                    href={googleCalendarUrl(appt, isVideo, showroomAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-ink-line px-5 py-2.5 text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-cream-soft hover:text-ink"
                  >
                    <CalendarDays size={15} strokeWidth={1.5} />
                    Google Calendar
                  </a>
                </div>
              </div>
            )}

            {showActions && !isVideo && showroomAddress && (
              <LocationCard address={showroomAddress} googleMapsUrl={showroomMapsUrl || undefined} />
            )}

            {canReschedule && (
              <RescheduleSection
                token={appt.cancelToken}
                appointmentType={appt.appointmentType}
                currentSlotId={appt.slotId}
              />
            )}

            {canCancel && <CancelButton token={appt.cancelToken} />}

            <div className="flex items-center justify-between border-t border-ink-line pt-3">
              <span className="inline-flex items-center gap-2 text-xs text-ink-subtle">
                {isVideo ? <Monitor size={13} strokeWidth={1.5} className="text-champagne" /> : <Gem size={13} strokeWidth={1.5} className="text-champagne" />}
                {isVideo ? 'Video consulta' : 'Showroom privado CDMX'}
              </span>
              <a href="/" className="text-xs font-medium text-champagne hover:text-champagne-deep transition-colors">
                Nueva cita
              </a>
            </div>
          </Card>
          </DepthReveal>
        </div>
      </section>
    </main>
  )
}
