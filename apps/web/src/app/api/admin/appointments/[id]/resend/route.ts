import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { mapAppointmentForEmail } from '@/lib/appointment-email'
import {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendStatusUpdate,
} from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  try {
    const snap = await adminDb.collection('appointments').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const data = snap.data()!
    const appt = mapAppointmentForEmail(snap.id, data)

    if (appt.status === 'pending') {
      const guestsSnap = await snap.ref.collection('guests').get()
      const guestNames = guestsSnap.docs.map(doc => String(doc.data().name ?? '')).filter(Boolean)
      await sendBookingConfirmation(appt, guestNames)
    } else if (appt.status === 'accepted') {
      await sendStatusUpdate(appt, 'accept')
    } else if (appt.status === 'rejected') {
      await sendStatusUpdate(appt, 'reject', data.adminNote)
    } else if (appt.status === 'cancelled') {
      await sendCancellationEmail(appt)
    }

    await adminDb.collection('auditLog').add({
      action: 'resend_appointment_email',
      appointmentId: id,
      status: appt.status,
      actorEmail: admin.email,
      ts: new Date(),
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`POST /api/admin/appointments/${id}/resend`, err)
    return NextResponse.json({ error: 'No se pudo reenviar el email' }, { status: 500 })
  }
}
