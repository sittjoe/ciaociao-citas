import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { requireAdminSession } from '@/lib/admin-auth'
import { BUSINESS_TZ } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 90

/**
 * GET /api/admin/blocked-dates/impact?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Vista previa (solo lectura) del impacto de bloquear un rango de fechas:
 * cuántos slots LIBRES hay (candidatos a eliminarse), cuántos están OCUPADOS
 * y qué citas pending/accepted caen en esos días. No modifica nada — la
 * decisión de eliminar horarios se toma en el POST de /api/admin/blocked-dates.
 */
export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? searchParams.get('date')
  const to   = searchParams.get('to') ?? from

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  }
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `El rango no puede superar ${MAX_RANGE_DAYS} días` }, { status: 422 })
  }

  // Día calendario CDMX completo, mismo patrón que GET /api/admin/slots.
  const start = Timestamp.fromDate(fromZonedTime(`${from}T00:00:00`, BUSINESS_TZ))
  const end   = Timestamp.fromDate(fromZonedTime(`${to}T23:59:59`, BUSINESS_TZ))

  try {
    const [slotsSnap, apptsSnap] = await Promise.all([
      adminDb.collection('slots')
        .orderBy('datetime')
        .where('datetime', '>=', start)
        .where('datetime', '<=', end)
        .limit(1000)
        .get(),
      adminDb.collection('appointments')
        .orderBy('slotDatetime')
        .where('slotDatetime', '>=', start)
        .where('slotDatetime', '<=', end)
        .limit(500)
        .get(),
    ])

    // Libre = available === true (un hold o reserva pone available en false).
    let freeSlots = 0
    let occupiedSlots = 0
    for (const doc of slotsSnap.docs) {
      if (doc.data().available === true) freeSlots++
      else occupiedSlots++
    }

    // El filtro de estatus va en memoria: rango sobre slotDatetime + `in` sobre
    // status pediría un índice compuesto nuevo, y el rango es de días (pocos docs).
    const appointments = apptsSnap.docs
      .filter(doc => {
        const status = String(doc.data().status ?? '')
        return status === 'pending' || status === 'accepted'
      })
      .map(doc => {
        const d = doc.data()
        return {
          id:       doc.id,
          name:     String(d.name ?? ''),
          datetime: (d.slotDatetime as Timestamp).toDate().toISOString(),
          status:   String(d.status),
        }
      })

    return NextResponse.json({ from, to, freeSlots, occupiedSlots, appointments })
  } catch (err) {
    console.error('GET /api/admin/blocked-dates/impact', err)
    return NextResponse.json({ error: 'Error al calcular el impacto' }, { status: 500 })
  }
}
