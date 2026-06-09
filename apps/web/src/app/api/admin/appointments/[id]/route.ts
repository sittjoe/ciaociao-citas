import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'
import { getCommercialPriority } from '@/lib/commercial'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const snap = await adminDb.collection('appointments').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const d = snap.data()!
    const [historyByEmail, historyByPhone] = await Promise.all([
      adminDb
        .collection('appointments')
        .where('email', '==', String(d.email ?? '').toLowerCase().trim())
        .limit(12)
        .get(),
      adminDb
        .collection('appointments')
        .where('phone', '==', String(d.phone ?? '').trim())
        .limit(12)
        .get(),
    ])
    const historyDocs = Array.from(
      new Map([...historyByEmail.docs, ...historyByPhone.docs].map(doc => [doc.id, doc])).values(),
    )

    const customerHistory = historyDocs
      .filter(doc => doc.id !== snap.id)
      .sort((a, b) => {
        const aTime = a.data().createdAt instanceof Timestamp ? a.data().createdAt.toMillis() : 0
        const bTime = b.data().createdAt instanceof Timestamp ? b.data().createdAt.toMillis() : 0
        return bTime - aTime
      })
      .slice(0, 5)
      .map(doc => {
        const item = doc.data()
        return {
          id: doc.id,
          name: item.name ?? '',
          status: item.status ?? '',
          slotDatetime: item.slotDatetime ? (item.slotDatetime as Timestamp).toDate().toISOString() : null,
          productType: item.productType ?? '',
          budgetRange: item.budgetRange ?? '',
          commercialStatus: item.commercialStatus ?? 'pending',
        }
      })

    return NextResponse.json({
      id: snap.id,
      slotId:           d.slotId,
      slotDatetime:     (d.slotDatetime as Timestamp)?.toDate().toISOString(),
      name:             d.name,
      email:            d.email,
      phone:            d.phone,
      notes:            d.notes ?? '',
      productType:      d.productType ?? '',
      budgetRange:      d.budgetRange ?? '',
      lookingFor:       d.lookingFor ?? '',
      commercialPriority: getCommercialPriority({
        productType: d.productType,
        budgetRange: d.budgetRange,
        lookingFor: d.lookingFor,
      }),
      commercialStatus: d.commercialStatus ?? 'pending',
      internalNote:     d.internalNote ?? '',
      followUpAt:       d.followUpAt ? (d.followUpAt as Timestamp)?.toDate().toISOString() : null,
      whatsapp:         d.whatsapp ?? false,
      status:           d.status,
      confirmationCode: d.confirmationCode,
      identificationUrl: d.identificationUrl,
      googleCalendarEventId: d.googleCalendarEventId ?? null,
      calendarSyncFailed:    d.calendarSyncFailed ?? false,
      decidedBy:        d.decidedBy ?? null,
      decidedAt:        d.decidedAt ? (d.decidedAt as Timestamp)?.toDate().toISOString() : null,
      adminNote:        d.adminNote ?? null,
      clientConfirmed:  d.clientConfirmed ?? false,
      clientConfirmedAt: d.clientConfirmedAt ? (d.clientConfirmedAt as Timestamp)?.toDate().toISOString() : null,
      createdAt:        (d.createdAt as Timestamp)?.toDate().toISOString(),
      updatedAt:        d.updatedAt ? (d.updatedAt as Timestamp)?.toDate().toISOString() : null,
      guestCount:       d.guestCount ?? 0,
      guestsAllVerified: d.guestsAllVerified ?? false,
      customerHistory,
    })
  } catch (err) {
    console.error(`GET /api/admin/appointments/${id}`, err)
    return NextResponse.json({ error: 'Error al obtener cita' }, { status: 500 })
  }
}
