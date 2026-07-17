import type { Metadata } from 'next'
import { Timestamp } from 'firebase-admin/firestore'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { adminDb } from '@/lib/firebase-admin'
import { BUSINESS_TZ } from '@/lib/utils'
import { normalizeAppointmentType } from '@/lib/commercial'
import { TodayList, type TodayAppointment } from '@/components/admin/TodayList'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Hoy' }

async function getTodayAppointments(): Promise<{ accepted: TodayAppointment[]; pending: TodayAppointment[]; error: boolean }> {
  // Rango del día en CDMX (mismo criterio que acceptedToday del dashboard,
  // pero anclado a la zona de negocio en lugar del reloj del servidor).
  const now      = new Date()
  const todayKey = formatInTimeZone(now, BUSINESS_TZ, 'yyyy-MM-dd')
  const dayStart = fromZonedTime(`${todayKey}T00:00:00`, BUSINESS_TZ)
  const nextKey  = formatInTimeZone(new Date(dayStart.getTime() + 36 * 60 * 60 * 1000), BUSINESS_TZ, 'yyyy-MM-dd')
  const dayEnd   = fromZonedTime(`${nextKey}T00:00:00`, BUSINESS_TZ)

  try {
    // Misma forma de query que el dashboard (status in + rango de slotDatetime
    // + orderBy): reusa el índice compuesto ya desplegado. El split
    // aceptadas/pendientes se hace en memoria para no requerir índices nuevos.
    const snap = await adminDb.collection('appointments')
      .where('status', 'in', ['pending', 'accepted'])
      .where('slotDatetime', '>=', Timestamp.fromDate(dayStart))
      .where('slotDatetime', '<',  Timestamp.fromDate(dayEnd))
      .orderBy('slotDatetime')
      .get()

    const all = snap.docs.map(doc => {
      const d = doc.data()
      return {
        id:                doc.id,
        name:              String(d.name ?? ''),
        phone:             String(d.phone ?? ''),
        slotDatetime:      (d.slotDatetime as Timestamp).toDate().toISOString(),
        appointmentType:   normalizeAppointmentType(d.appointmentType),
        status:            d.status as 'pending' | 'accepted',
        clientConfirmed:   d.clientConfirmed === true,
        hasIdentification: Boolean(d.identificationUrl),
        guestCount:        typeof d.guestCount === 'number' ? d.guestCount : 0,
        guestsAllVerified: d.guestsAllVerified === true,
        hasMeetingUrl:     Boolean(String(d.meetingUrl ?? '').trim()),
        attended:          typeof d.attended === 'boolean' ? d.attended : null,
      } satisfies TodayAppointment
    })

    return {
      accepted: all.filter(a => a.status === 'accepted'),
      pending:  all.filter(a => a.status === 'pending'),
      error:    false,
    }
  } catch (err) {
    // Un fallo de la query no debe tumbar la hoja del día completa.
    console.error('getTodayAppointments failed, rendering empty list:', err)
    return { accepted: [], pending: [], error: true }
  }
}

export default async function HoyPage() {
  const { accepted, pending, error } = await getTodayAppointments()
  const dayLabel = formatInTimeZone(new Date(), BUSINESS_TZ, "EEEE d 'de' MMMM", { locale: es })
  const dayTitle = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)

  return (
    <div className="space-y-6">
      <div>
        <p className="h-eyebrow mb-2">Operación</p>
        <h1 className="font-serif text-display-sm font-light tracking-tight text-ink">Hoy</h1>
        <p className="mt-1 text-sm text-ink-muted">
          <span className="text-ink">{dayTitle}</span>
          {!error && (
            <>
              {' · '}{accepted.length} confirmada{accepted.length === 1 ? '' : 's'}
              {pending.length > 0 && ` · ${pending.length} por decidir`}
            </>
          )}
        </p>
      </div>
      <TodayList accepted={accepted} pending={pending} error={error} />
    </div>
  )
}
