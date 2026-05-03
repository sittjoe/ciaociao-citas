import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { CalendarPlus, Gem } from 'lucide-react'
import type { AppointmentStatus } from '@/types'
import CancelButton from './CancelButton'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Estado de tu cita' }

interface PageProps { params: Promise<{ code: string }> }

const STATUS_MESSAGES: Record<AppointmentStatus, string> = {
  pending:   'Tu solicitud fue recibida y está pendiente de revisión por nuestro equipo.',
  accepted:  'Tu cita está confirmada. Te esperamos en el showroom.',
  rejected:  'En este momento no podemos confirmar tu cita. Te invitamos a agendar en otro horario.',
  cancelled: 'Esta cita fue cancelada.',
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
    slotDatetime:      (data.slotDatetime as Timestamp).toDate(),
    confirmationCode:  data.confirmationCode as string,
    cancelToken:       data.cancelToken as string,
    notes:             data.notes as string | undefined,
    guestCount:        (data.guestCount as number | undefined) ?? 0,
    guestsAllVerified: (data.guestsAllVerified as boolean | undefined) ?? true,
  }

  const canCancel = appt.status === 'pending' || appt.status === 'accepted'

  return (
    <main className="min-h-screen bg-cream">
      <section className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8 sm:py-16">
        <Image
          src="/atelier-vivo-hero.png"
          alt="Detalle de joyería fina en mesa de atelier"
          fill
          sizes="100vw"
          className="object-cover opacity-18"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.982_0.008_86/0.78),oklch(0.982_0.008_86/0.96))]" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1fr_440px]">
          <header>
            <p className="mb-4 text-[0.6rem] font-semibold uppercase tracking-display-eyebrow text-champagne">
              Ciao Ciao · Showroom privado
            </p>
            <h1 className="font-serif text-[clamp(3rem,7vw,5.5rem)] font-light leading-[0.94] text-ink">
              Estado de tu cita
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-ink-muted">
              Conserva este código. El equipo lo usará para ubicar tu solicitud y preparar tu visita.
            </p>
          </header>

          <Card variant="atelier" className="w-full space-y-5 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="h-eyebrow mb-2">Tu cita</p>
                <h2 className="font-serif text-2xl font-light text-ink">{appt.name}</h2>
              </div>
              <StatusBadge status={appt.status} />
            </div>

            <p className="text-sm leading-6 text-ink-muted">{STATUS_MESSAGES[appt.status]}</p>

            {appt.status === 'accepted' && appt.guestCount > 0 && !appt.guestsAllVerified && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <p className="font-semibold text-amber-900">Invitados pendientes de verificación</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  {appt.guestCount} invitado{appt.guestCount !== 1 ? 's' : ''} aún no ha verificado su identidad.
                  Cada uno recibió un correo con su link personal. Sin verificación no podrán ingresar al showroom.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-ink-line bg-porcelain/70 px-4 py-2 text-sm">
              {([
                ['Código',  appt.confirmationCode],
                ['Fecha',   formatDate(appt.slotDatetime)],
                ['Hora',    formatTime(appt.slotDatetime)],
                ...(appt.notes ? [['Notas', appt.notes]] : [] as [string, string][]),
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-5 border-b border-ink-line py-2.5 last:border-0">
                  <span className="text-ink-muted">{label}</span>
                  <span className="max-w-[60%] text-right text-ink">{value}</span>
                </div>
              ))}
            </div>

            {appt.status === 'accepted' && (
              <a
                href={`/api/calendar/${appt.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-champagne px-5 py-2.5 text-sm font-medium text-champagne transition-colors duration-200 hover:bg-champagne-soft"
              >
                <CalendarPlus size={15} strokeWidth={1.5} />
                Agregar a mi calendario
              </a>
            )}

            {canCancel && <CancelButton token={appt.cancelToken} />}

            <div className="flex items-center justify-between border-t border-ink-line pt-3">
              <span className="inline-flex items-center gap-2 text-xs text-ink-subtle">
                <Gem size={13} strokeWidth={1.5} className="text-champagne" />
                Showroom privado CDMX
              </span>
              <a href="/" className="text-xs font-medium text-champagne hover:text-champagne-deep transition-colors">
                Nueva cita
              </a>
            </div>
          </Card>
        </div>
      </section>
    </main>
  )
}
