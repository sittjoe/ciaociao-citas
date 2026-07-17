import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { releaseExpiredHolds } from '@/lib/holds'
import { fromZonedTime } from 'date-fns-tz'
import { BUSINESS_TZ } from '@/lib/utils'
import { normalizeAppointmentType } from '@/lib/commercial'
import { getBlockedDateSet, businessDateKey } from '@/lib/blocked-dates'
import { getAgendaPause } from '@/lib/agenda-pause'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Agenda pausada por el equipo: no se ofrece ningún horario (fail-open:
    // si la lectura de la pausa falla, la agenda sigue operando normal).
    const pause = await getAgendaPause()
    if (pause.paused) {
      return NextResponse.json({ slots: [], paused: true })
    }

    await releaseExpiredHolds()

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM
    const year  = searchParams.get('year')
    const requestedType = normalizeAppointmentType(searchParams.get('appointmentType'))

    const now = new Date()
    let start: Date
    let end: Date

    if (month) {
      const match = /^(\d{4})-(\d{2})$/.exec(month)
      if (!match) {
        return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
      }
      const y = Number(match[1])
      const m = Number(match[2])
      if (m < 1 || m > 12) {
        return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
      }
      const nextY = m === 12 ? y + 1 : y
      const nextM = m === 12 ? 1 : m + 1
      start = fromZonedTime(`${month}-01T00:00:00`, BUSINESS_TZ)
      end   = fromZonedTime(`${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00`, BUSINESS_TZ)
    } else if (year) {
      const y = Number(year)
      if (!Number.isInteger(y) || y < 2000 || y > 2100) {
        return NextResponse.json({ error: 'Año inválido' }, { status: 400 })
      }
      start = fromZonedTime(`${y}-01-01T00:00:00`, BUSINESS_TZ)
      end   = fromZonedTime(`${y + 1}-01-01T00:00:00`, BUSINESS_TZ)
    } else {
      // Default: next 60 days
      start = now
      end   = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    }

    // Never return slots already in the past
    if (start < now) start = now

    const [snap, blocked] = await Promise.all([
      adminDb
        .collection('slots')
        .where('datetime', '>=', Timestamp.fromDate(start))
        .where('datetime', '<', Timestamp.fromDate(end))
        .where('available', '==', true)
        .orderBy('datetime')
        .get(),
      getBlockedDateSet(),
    ])

    const slots = snap.docs
      .map(doc => {
        const data = doc.data()
        const dt = (data.datetime as Timestamp).toDate()
        return {
          id:        doc.id,
          datetime:  dt.toISOString(),
          available: data.available as boolean,
          slotType:  normalizeAppointmentType(data.slotType),
          _dateKey:  businessDateKey(dt),
        }
      })
      .filter(slot => slot.slotType === requestedType && !blocked.has(slot._dateKey))
      .map(({ _dateKey, ...slot }) => slot) // eslint-disable-line @typescript-eslint/no-unused-vars

    return NextResponse.json({ slots })
  } catch (err) {
    console.error('GET /api/slots', err)
    return NextResponse.json({ error: 'Error al obtener horarios' }, { status: 500 })
  }
}
