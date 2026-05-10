import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'

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
    return NextResponse.json({
      id: snap.id,
      slotId:           d.slotId,
      slotDatetime:     (d.slotDatetime as Timestamp)?.toDate().toISOString(),
      name:             d.name,
      email:            d.email,
      phone:            d.phone,
      notes:            d.notes ?? '',
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
    })
  } catch (err) {
    console.error(`GET /api/admin/appointments/${id}`, err)
    return NextResponse.json({ error: 'Error al obtener cita' }, { status: 500 })
  }
}
