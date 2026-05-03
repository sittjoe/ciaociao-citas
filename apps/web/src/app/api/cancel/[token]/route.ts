import { NextResponse, after } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { deleteAppointmentCalendarEvent } from '@/lib/google-calendar'
import { sendCancellationEmail } from '@/lib/email'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  try {
    const snap = await adminDb
      .collection('appointments')
      .where('cancelToken', '==', token)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Token no encontrado' }, { status: 404 })
    }

    const doc  = snap.docs[0]
    const data = doc.data()

    if (data.status === 'cancelled') {
      return NextResponse.json({ error: 'Esta cita ya fue cancelada' }, { status: 409 })
    }
    if (data.status === 'rejected') {
      return NextResponse.json({ error: 'Esta cita ya fue rechazada' }, { status: 409 })
    }

    const appointment: Appointment = {
      id: doc.id,
      slotId: data.slotId,
      slotDatetime: (data.slotDatetime as Timestamp).toDate(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      identificationUrl: data.identificationUrl,
      status: 'cancelled',
      confirmationCode: data.confirmationCode,
      cancelToken: data.cancelToken,
      reminder24Sent: data.reminder24Sent ?? false,
      reminder2Sent: data.reminder2Sent ?? false,
      googleCalendarEventId: null,
      createdAt: (data.createdAt as Timestamp).toDate(),
    }

    if (data.status === 'accepted' && data.googleCalendarEventId) {
      try {
        await deleteAppointmentCalendarEvent({ ...appointment, googleCalendarEventId: data.googleCalendarEventId })
      } catch (err) {
        console.error('Google Calendar delete failed:', err)
        return NextResponse.json({ error: 'No se pudo cancelar el evento en Google Calendar' }, { status: 502 })
      }
    }

    const slotRef = adminDb.collection('slots').doc(data.slotId)
    await adminDb.runTransaction(async tx => {
      tx.update(doc.ref, {
        status:    'cancelled',
        googleCalendarEventId: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(slotRef, {
        available: true,
        heldUntil: null,
        bookedBy:  null,
      })
    })

    after(sendCancellationEmail(appointment).catch(err =>
      console.error('Cancellation email failed (non-fatal):', err)
    ))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`POST /api/cancel/${token}`, err)
    return NextResponse.json({ error: 'Error al cancelar la cita' }, { status: 500 })
  }
}
