import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'
import { getCommercialPriority, normalizeAppointmentType } from '@/lib/commercial'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status   = searchParams.get('status')     // pending|accepted|rejected|cancelled
  const search   = searchParams.get('search')     // name/email/phone
  const productType = searchParams.get('productType')
  const appointmentType = searchParams.get('appointmentType')
  const budgetRange = searchParams.get('budgetRange')
  const priority = searchParams.get('priority')
  const commercialStatus = searchParams.get('commercialStatus')
  const dateFrom = searchParams.get('dateFrom')   // ISO
  const dateTo   = searchParams.get('dateTo')     // ISO
  const cursor   = searchParams.get('cursor')     // doc ID
  const limit    = Math.min(Number(searchParams.get('limit') ?? '20'), 500)

  try {
    // Firestore: a range filter requires orderBy on the same field first.
    // When dateFrom/dateTo are present we order by slotDatetime; otherwise createdAt.
    let query = (
      dateFrom || dateTo
        ? adminDb.collection('appointments').orderBy('slotDatetime', 'asc')
        : adminDb.collection('appointments').orderBy('createdAt', 'desc')
    ) as FirebaseFirestore.Query

    if (status) {
      query = query.where('status', '==', status)
    }
    if (dateFrom) {
      query = query.where('slotDatetime', '>=', Timestamp.fromDate(new Date(dateFrom)))
    }
    if (dateTo) {
      query = query.where('slotDatetime', '<',  Timestamp.fromDate(new Date(dateTo)))
    }
    if (cursor) {
      const cursorDoc = await adminDb.collection('appointments').doc(cursor).get()
      if (cursorDoc.exists) query = query.startAfter(cursorDoc)
    }

    const hasClientFilters = Boolean(search || productType || appointmentType || budgetRange || priority || commercialStatus)
    query = query.limit(hasClientFilters ? 500 : limit + 1)

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
          String(d.confirmationCode ?? '').toLowerCase().includes(q) ||
          String(d.productType ?? '').toLowerCase().includes(q) ||
          String(d.budgetRange ?? '').toLowerCase().includes(q) ||
          String(d.lookingFor ?? '').toLowerCase().includes(q)
        )
      })
    }
    if (priority) {
      docs = docs.filter(doc => {
        const d = doc.data()
        return getCommercialPriority({
          productType: d.productType,
          budgetRange: d.budgetRange,
          lookingFor: d.lookingFor,
        }) === priority
      })
    }
    if (productType) {
      docs = docs.filter(doc => String(doc.data().productType ?? '') === productType)
    }
    if (appointmentType) {
      docs = docs.filter(doc => normalizeAppointmentType(doc.data().appointmentType) === appointmentType)
    }
    if (budgetRange) {
      docs = docs.filter(doc => String(doc.data().budgetRange ?? '') === budgetRange)
    }
    if (commercialStatus === 'pending') {
      docs = docs.filter(doc => {
        const d = doc.data()
        return !d.commercialStatus || d.commercialStatus === 'pending'
      })
    } else if (commercialStatus) {
      docs = docs.filter(doc => String(doc.data().commercialStatus ?? '') === commercialStatus)
    }

    const hasMore    = !hasClientFilters && docs.length > limit
    const resultDocs = hasMore ? docs.slice(0, limit) : docs
    const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null

    const appointments = resultDocs.map(doc => {
      const d = doc.data()
      return {
        id:               doc.id,
        slotId:           d.slotId,
        slotDatetime:     (d.slotDatetime as Timestamp)?.toDate().toISOString(),
        appointmentType:  normalizeAppointmentType(d.appointmentType),
        name:             d.name,
        email:            d.email,
        phone:            d.phone,
        notes:            d.notes ?? '',
        productType:      d.productType ?? '',
        budgetRange:      d.budgetRange ?? '',
        lookingFor:       d.lookingFor ?? '',
        engagementBrief:  d.engagementBrief ?? {},
        commercialPriority: getCommercialPriority({
          productType: d.productType,
          budgetRange: d.budgetRange,
          lookingFor: d.lookingFor,
        }),
        commercialStatus: d.commercialStatus ?? 'pending',
        internalNote:     d.internalNote ?? '',
        followUpAt:       d.followUpAt ? (d.followUpAt as Timestamp)?.toDate().toISOString() : null,
        meetingUrl:       d.meetingUrl ?? null,
        meetingProvider:  d.meetingProvider ?? null,
        meetingInstructions: d.meetingInstructions ?? null,
        whatsapp:         d.whatsapp ?? false,
        status:           d.status,
        confirmationCode: d.confirmationCode,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
        calendarSyncFailed: d.calendarSyncFailed ?? false,
        decidedBy:        d.decidedBy ?? null,
        decidedAt:        d.decidedAt ? (d.decidedAt as Timestamp)?.toDate().toISOString() : null,
        adminNote:        d.adminNote ?? null,
        clientConfirmed:  d.clientConfirmed ?? false,
        clientConfirmedAt: d.clientConfirmedAt ? (d.clientConfirmedAt as Timestamp)?.toDate().toISOString() : null,
        attended:         d.attended ?? null,
        attendedAt:       d.attendedAt ? (d.attendedAt as Timestamp)?.toDate().toISOString() : null,
        createdAt:        (d.createdAt as Timestamp)?.toDate().toISOString(),
        updatedAt:        (d.updatedAt as Timestamp)?.toDate().toISOString(),
        identificationUrl: d.identificationUrl,
        guestCount:          d.guestCount ?? 0,
        guestsAllVerified:   d.guestsAllVerified ?? false,
      }
    })

    return NextResponse.json({ appointments, nextCursor })
  } catch (err) {
    console.error('GET /api/admin/appointments', err)
    return NextResponse.json({ error: 'Error al obtener citas' }, { status: 500 })
  }
}
