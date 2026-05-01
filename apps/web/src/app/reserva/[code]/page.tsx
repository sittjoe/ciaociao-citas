import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { AppointmentStatus } from '@/types'
import CancelButton from './CancelButton'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Estado de tu cita' }

interface PageProps { params: Promise<{ code: string }> }

const STATUS_MESSAGES: Record<AppointmentStatus, string> = {
  pending:   'Tu solicitud fue recibida y está pendiente de revisión por nuestro equipo.',
  accepted:  'Tu cita está confirmada. ¡Te esperamos en el showroom!',
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
    id:               doc.id,
    status:           data.status as AppointmentStatus,
    name:             data.name as string,
    email:            data.email as string,
    slotDatetime:     (data.slotDatetime as Timestamp).toDate(),
    confirmationCode: data.confirmationCode as string,
    cancelToken:      data.cancelToken as string,
    notes:            data.notes as string | undefined,
  }

  const canCancel = appt.status === 'pending' || appt.status === 'accepted'

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 sm:py-20 bg-cream">
      {/* Brand header */}
      <header className="text-center mb-10">
        <h1 className="font-serif font-light text-4xl text-ink tracking-tight leading-none">
          Ciao Ciao
        </h1>
        <div className="w-8 h-px bg-champagne mx-auto my-3" />
        <p className="h-eyebrow">Joyería · Showroom Privado</p>
      </header>

      <Card variant="soft" className="w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-light text-xl text-ink">Tu cita</h2>
          <StatusBadge status={appt.status} />
        </div>

        <p className="text-sm text-ink-muted">{STATUS_MESSAGES[appt.status]}</p>

        <div className="divide-y divide-ink-line text-sm">
          {([
            ['Código',  appt.confirmationCode],
            ['Nombre',  appt.name],
            ['Fecha',   formatDate(appt.slotDatetime)],
            ['Hora',    formatTime(appt.slotDatetime)],
            ...(appt.notes ? [['Notas', appt.notes]] : [] as [string, string][]),
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between py-2.5">
              <span className="text-ink-muted">{label}</span>
              <span className="text-ink text-right max-w-[60%]">{value}</span>
            </div>
          ))}
        </div>

        {appt.status === 'accepted' && (
          <a
            href={`/api/calendar/${appt.id}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-5 rounded-xl
                       border border-champagne text-champagne text-sm font-medium
                       hover:bg-champagne-soft transition-colors duration-200"
          >
            Agregar a mi calendario (.ics)
          </a>
        )}

        {canCancel && <CancelButton token={appt.cancelToken} />}

        <div className="pt-2 border-t border-ink-line text-center">
          <a href="/" className="text-xs text-ink-muted hover:text-champagne transition-colors">
            Agendar nueva cita →
          </a>
        </div>
      </Card>
    </main>
  )
}
