import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { bulkSlotsSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { deleteSlotById } from '@/lib/slot-delete'
import { BUSINESS_TZ } from '@/lib/utils'
import { normalizeAppointmentType } from '@/lib/commercial'
import { getBlockedDateSet } from '@/lib/blocked-dates'

export const dynamic = 'force-dynamic'

// GET — list all slots (admin view, no available filter)
export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')

  try {
    let query = adminDb.collection('slots').orderBy('datetime') as FirebaseFirestore.Query

    if (dateFrom) {
      query = query.where('datetime', '>=', Timestamp.fromDate(fromZonedTime(`${dateFrom}T00:00:00`, BUSINESS_TZ)))
    } else {
      query = query.where('datetime', '>=', Timestamp.fromDate(new Date()))
    }
    if (dateTo) {
      query = query.where('datetime', '<=', Timestamp.fromDate(fromZonedTime(`${dateTo}T23:59:59`, BUSINESS_TZ)))
    } else {
      // Default: 60 days ahead
      const end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      query = query.where('datetime', '<=', Timestamp.fromDate(end))
    }

    query = query.limit(500)

    const snap  = await query.get()
    const slots = snap.docs.map(doc => {
      const d = doc.data()
      return {
        id:        doc.id,
        datetime:  (d.datetime as Timestamp).toDate().toISOString(),
        available: d.available as boolean,
        slotType:  normalizeAppointmentType(d.slotType),
        bookedBy:  d.bookedBy ?? null,
        heldUntil: d.heldUntil ? (d.heldUntil as Timestamp).toDate().toISOString() : null,
      }
    })

    return NextResponse.json({ slots })
  } catch (err) {
    console.error('GET /api/admin/slots', err)
    return NextResponse.json({ error: 'Error al obtener slots' }, { status: 500 })
  }
}

// POST — bulk create slots (dates × times)
export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body   = await request.json()
  const parsed = bulkSlotsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { dates, times, slotType } = parsed.data

  try {
    const blockedDates = await getBlockedDateSet()
    let   created  = 0
    const skipped: string[] = []
    const seenDatetimes = new Set<number>()

    for (const date of dates) {
      if (blockedDates.has(date)) {
        for (const time of times) skipped.push(`${date}T${time}`)
        continue
      }
      for (const time of times) {
        const dt = fromZonedTime(`${date}T${time}:00`, BUSINESS_TZ)
        if (isNaN(dt.getTime())) { skipped.push(`${date}T${time}`); continue }

        // Skip past slots
        if (dt <= new Date()) { skipped.push(`${date}T${time}`); continue }
        const seenKey = dt.getTime()
        if (seenDatetimes.has(seenKey)) { skipped.push(`${date}T${time}`); continue }
        seenDatetimes.add(seenKey)

        const key = String(dt.getTime())
        const didCreate = await adminDb.runTransaction(async tx => {
          const duplicateQuery = adminDb
            .collection('slots')
            .where('datetime', '==', Timestamp.fromDate(dt))
            .limit(1)
          const duplicateSnap = await tx.get(duplicateQuery)
          if (!duplicateSnap.empty) return false
          const ref = adminDb.collection('slots').doc(key)
          const existing = await tx.get(ref)
          if (existing.exists) return false
          tx.create(ref, {
            datetime:  Timestamp.fromDate(dt),
            available: true,
            slotType,
            heldUntil: null,
            bookedBy:  null,
            createdAt: FieldValue.serverTimestamp(),
          })
          return true
        })
        if (!didCreate) { skipped.push(`${date}T${time}`); continue }
        created++
      }
    }

    return NextResponse.json({ created, skipped })
  } catch (err) {
    console.error('POST /api/admin/slots', err)
    return NextResponse.json({ error: 'Error al crear slots' }, { status: 500 })
  }
}

// DELETE — remove a single slot. La lógica y las guardas viven en deleteSlotById
// (compartidas con el borrado en lote) para que ninguna ruta se salte una protección.
export async function DELETE(request: Request) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slotId = searchParams.get('id')
  if (!slotId) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  const result = await deleteSlotById(slotId, session.email)
  if (result.ok) return NextResponse.json({ ok: true })

  const status = result.code === 'not_found' ? 404 : result.code === 'error' ? 500 : 409
  return NextResponse.json({ error: result.error }, { status })
}
