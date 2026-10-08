import type { Metadata } from 'next'
import { Timestamp } from 'firebase-admin/firestore'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { adminDb } from '@/lib/firebase-admin'
import { BUSINESS_TZ } from '@/lib/utils'
import { normalizeAppointmentType } from '@/lib/commercial'
import { nextDayKeys } from '@/lib/agenda'
import { AgendaBoard, type AgendaAppointment } from '@/components/admin/AgendaBoard'
import { PendingInbox } from '@/components/admin/PendingInbox'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Agenda' }

const AGENDA_DAYS = 7

async function getWeekAppointments(dayKeys: string[]): Promise<{ items: AgendaAppointment[]; error: boolean }> {
  // Rango en días de CDMX (no del reloj del servidor): de hoy 00:00 al
  // inicio del día siguiente al último de la tira.
  const rangeStart = fromZonedTime(`${dayKeys[0]}T00:00:00`, BUSINESS_TZ)
  const [afterLast] = nextDayKeys(dayKeys[dayKeys.length - 1], 2).slice(1)
  const rangeEnd = fromZonedTime(`${afterLast}T00:00:00`, BUSINESS_TZ)

  try {
    // Misma forma de query que antes (status in + rango de slotDatetime +
    // orderBy): reusa el índice compuesto ya desplegado, solo con un rango
    // más amplio.
    const snap = await adminDb.collection('appointments')
      .where('status', 'in', ['pending', 'accepted'])
      .where('slotDatetime', '>=', Timestamp.fromDate(rangeStart))
      .where('slotDatetime', '<',  Timestamp.fromDate(rangeEnd))
      .orderBy('slotDatetime')
      .get()

    const items = snap.docs.map(doc => {
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
        productType:       String(d.productType ?? ''),
        budgetRange:       String(d.budgetRange ?? ''),
      } satisfies AgendaAppointment
    })
    return { items, error: false }
  } catch (err) {
    // Un fallo de la query no debe tumbar la agenda completa.
    console.error('getWeekAppointments failed, rendering empty agenda:', err)
    return { items: [], error: true }
  }
}

export default async function AgendaPage() {
  const now = new Date()
  const todayKey = formatInTimeZone(now, BUSINESS_TZ, 'yyyy-MM-dd')
  const dayKeys = nextDayKeys(todayKey, AGENDA_DAYS)
  const { items, error } = await getWeekAppointments(dayKeys)
  const dayLabel = formatInTimeZone(now, BUSINESS_TZ, "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-display-sm font-light tracking-tight text-ink">Agenda</h1>
        <p className="mt-1 text-sm text-ink-muted">{dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} · próximos {AGENDA_DAYS} días</p>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] xl:items-start">
        <AgendaBoard
          appointments={items}
          dayKeys={dayKeys}
          todayKey={todayKey}
          serverNowMs={now.getTime()}
          error={error}
        />
        <div className="order-first xl:order-none xl:sticky xl:top-8">
          <PendingInbox serverNowMs={now.getTime()} />
        </div>
      </div>
    </div>
  )
}
