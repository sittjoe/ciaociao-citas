import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
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
    <main className="min-h-screen flex flex-col items-center px-4 py-12 sm:py-20">
      <header className="text-center mb-10">
        <h1 className="font-serif text-4xl text-gold-400 tracking-widest uppercase">Ciao Ciao</h1>
        <p className="text-xs text-gold-700 tracking-[0.4em] uppercase mt-2">Joyería · Showroom Privado</p>
        <div className="w-16 h-px bg-gold-700 mx-auto mt-5" />
      </header>

      <div className="w-full max-w-md card-luxury fade-up space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-gold-400">Tu cita</h2>
          <StatusBadge status={appt.status} />
        </div>

        <p className="text-sm text-gold-700">{STATUS_MESSAGES[appt.status]}</p>

        <div className="divide-y divide-rich-muted text-sm">
          {([
            ['Código',  appt.confirmationCode],
            ['Nombre',  appt.name],
            ['Fecha',   formatDate(appt.slotDatetime)],
            ['Hora',    formatTime(appt.slotDatetime)],
            ...(appt.notes ? [['Notas', appt.notes]] : [] as [string, string][]),
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between py-2.5">
              <span className="text-gold-700">{label}</span>
              <span className="text-gold-light text-right max-w-[60%]">{value}</span>
            </div>
          ))}
        </div>

        {appt.status === 'accepted' && (
          <a
            href={`/api/calendar/${appt.id}.ics`}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-5 rounded-xl border border-gold-500 text-gold-500 text-sm font-medium hover:bg-gold-500/10 transition-colors"
          >
            Agregar a mi calendario (.ics)
          </a>
        )}

        {canCancel && <CancelButton token={appt.cancelToken} />}

        <div className="pt-2 border-t border-rich-muted text-center">
          <a href="/" className="text-xs text-gold-700 hover:text-gold-400 transition-colors">
            Agendar nueva cita →
          </a>
        </div>
      </div>
    </main>
  )
}
