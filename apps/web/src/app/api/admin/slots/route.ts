import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { bulkSlotsSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { BUSINESS_TZ } from '@/lib/utils'

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
    }
    if (dateTo) {
      query = query.where('datetime', '<=', Timestamp.fromDate(fromZonedTime(`${dateTo}T23:59:59`, BUSINESS_TZ)))
    } else {
      // Default: 60 days ahead
      const end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      query = query.where('datetime', '<=', Timestamp.fromDate(end))
    }

    const snap  = await query.get()
    const slots = snap.docs.map(doc => {
      const d = doc.data()
      return {
        id:        doc.id,
        datetime:  (d.datetime as Timestamp).toDate().toISOString(),
        available: d.available as boolean,
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

  const { dates, times } = parsed.data

  try {
    const batch    = adminDb.batch()
    let   created  = 0
    const skipped: string[] = []

    for (const date of dates) {
      for (const time of times) {
        const dt = fromZonedTime(`${date}T${time}:00`, BUSINESS_TZ)
        if (isNaN(dt.getTime())) { skipped.push(`${date}T${time}`); continue }

        // Skip past slots
        if (dt <= new Date()) { skipped.push(`${date}T${time}`); continue }

        const ref = adminDb.collection('slots').doc()
        batch.set(ref, {
          datetime:  Timestamp.fromDate(dt),
          available: true,
          heldUntil: null,
          bookedBy:  null,
          createdAt: FieldValue.serverTimestamp(),
        })
        created++
      }
    }

    await batch.commit()
    return NextResponse.json({ created, skipped })
  } catch (err) {
    console.error('POST /api/admin/slots', err)
    return NextResponse.json({ error: 'Error al crear slots' }, { status: 500 })
  }
}

// DELETE — remove a single slot
export async function DELETE(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slotId = searchParams.get('id')
  if (!slotId) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  try {
    const slotRef  = adminDb.collection('slots').doc(slotId)
    const slotSnap = await slotRef.get()
    if (!slotSnap.exists) {
      return NextResponse.json({ error: 'Slot no encontrado' }, { status: 404 })
    }
    const data = slotSnap.data()!
    if (!data.available) {
      return NextResponse.json({ error: 'No se puede eliminar un slot con reserva' }, { status: 409 })
    }
    await slotRef.delete()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/admin/slots', err)
    return NextResponse.json({ error: 'Error al eliminar slot' }, { status: 500 })
  }
}
