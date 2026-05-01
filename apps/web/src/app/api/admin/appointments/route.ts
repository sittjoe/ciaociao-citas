import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status   = searchParams.get('status')     // pending|accepted|rejected|cancelled
  const search   = searchParams.get('search')     // name/email/phone
  const dateFrom = searchParams.get('dateFrom')   // ISO
  const dateTo   = searchParams.get('dateTo')     // ISO
  const cursor   = searchParams.get('cursor')     // doc ID
  const limit    = Math.min(Number(searchParams.get('limit') ?? '20'), 100)

  try {
    let query = adminDb.collection('appointments').orderBy('createdAt', 'desc') as FirebaseFirestore.Query

    if (status) {
      query = query.where('status', '==', status)
    }
    if (dateFrom) {
      query = query.where('slotDatetime', '>=', Timestamp.fromDate(new Date(dateFrom)))
    }
    if (dateTo) {
      query = query.where('slotDatetime', '<=', Timestamp.fromDate(new Date(dateTo)))
    }
    if (cursor) {
      const cursorDoc = await adminDb.collection('appointments').doc(cursor).get()
      if (cursorDoc.exists) query = query.startAfter(cursorDoc)
    }

    query = query.limit(limit + 1)

    const snap  = await query.get()
    let   docs  = snap.docs

    // Client-side search filter (Firestore doesn't support full-text)
    if (search) {
      const q = search.toLowerCase()
      docs = docs.filter(doc => {
        const d = doc.data()
        return (
          String(d.name  ?? '').toLowerCase().includes(q) ||
          String(d.email ?? '').toLowerCase().includes(q) ||
          String(d.phone ?? '').toLowerCase().includes(q) ||
          String(d.confirmationCode ?? '').toLowerCase().includes(q)
        )
      })
    }

    const hasMore    = docs.length > limit
    const resultDocs = hasMore ? docs.slice(0, limit) : docs
    const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null

    const appointments = resultDocs.map(doc => {
      const d = doc.data()
      return {
        id:               doc.id,
        slotId:           d.slotId,
        slotDatetime:     (d.slotDatetime as Timestamp)?.toDate().toISOString(),
        name:             d.name,
        email:            d.email,
        phone:            d.phone,
        notes:            d.notes ?? '',
        whatsapp:         d.whatsapp ?? false,
        status:           d.status,
        confirmationCode: d.confirmationCode,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
        calendarSyncFailed: d.calendarSyncFailed ?? false,
        decidedBy:        d.decidedBy ?? null,
        decidedAt:        d.decidedAt ? (d.decidedAt as Timestamp)?.toDate().toISOString() : null,
        adminNote:        d.adminNote ?? null,
        createdAt:        (d.createdAt as Timestamp)?.toDate().toISOString(),
        updatedAt:        (d.updatedAt as Timestamp)?.toDate().toISOString(),
        identificationUrl: d.identificationUrl,
      }
    })

    return NextResponse.json({ appointments, nextCursor })
  } catch (err) {
    console.error('GET /api/admin/appointments', err)
    return NextResponse.json({ error: 'Error al obtener citas' }, { status: 500 })
  }
}
