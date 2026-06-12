import { NextResponse, after } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { deleteAppointmentCalendarEvent } from '@/lib/google-calendar'
import { sendCancellationEmail } from '@/lib/email'
import { releaseSlotLock } from '@/lib/slot-locks'
import { normalizeAppointmentType } from '@/lib/commercial'
import { logAppointmentEvent } from '@/lib/appointment-events'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  // Tokens are generated with at least 16 chars (generateCode); anything
  // shorter is noise — reject before touching Firestore.
  if (!token || token.length < 16 || token.length > 64) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }
  const ip = requestIp(request)
  if (await checkPublicRateLimit({ key: `cancel:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 10 })) {
    return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
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
      appointmentType: normalizeAppointmentType(data.appointmentType),
      name: data.name,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      productType: data.productType,
      budgetRange: data.budgetRange,
      lookingFor: data.lookingFor,
      engagementBrief: data.engagementBrief ?? {},
      identificationUrl: data.identificationUrl,
      status: 'cancelled',
      confirmationCode: data.confirmationCode,
      cancelToken: data.cancelToken,
      reminder24Sent: data.reminder24Sent ?? false,
      reminder2Sent: data.reminder2Sent ?? false,
      googleCalendarEventId: data.googleCalendarEventId ?? null,
      meetingUrl: data.meetingUrl ?? null,
      meetingProvider: data.meetingProvider ?? null,
      meetingInstructions: data.meetingInstructions ?? null,
      createdAt: (data.createdAt as Timestamp).toDate(),
    }

    let calendarEventIdToDelete: string | null = null
    let cancelledWasAccepted = false

    await adminDb.runTransaction(async tx => {
      const fresh = await tx.get(doc.ref)
      if (!fresh.exists) throw new Error('NOT_FOUND')
      const freshData = fresh.data()!
      if (freshData.status === 'cancelled') throw new Error('ALREADY_CANCELLED')
      if (freshData.status === 'rejected') throw new Error('ALREADY_REJECTED')
      cancelledWasAccepted = freshData.status === 'accepted'
      calendarEventIdToDelete = freshData.googleCalendarEventId ?? null
      const slotRef = adminDb.collection('slots').doc(freshData.slotId)
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
      releaseSlotLock(tx, freshData.slotDatetime as Timestamp)
    })

    if (cancelledWasAccepted && calendarEventIdToDelete) {
      try {
        await deleteAppointmentCalendarEvent({ ...appointment, googleCalendarEventId: calendarEventIdToDelete })
      } catch (err) {
        console.error('Google Calendar delete failed:', err)
        await doc.ref.update({ calendarSyncFailed: true }).catch(() => {})
      }
    }

    after(sendCancellationEmail(appointment).catch(err =>
      console.error('Cancellation email failed (non-fatal):', err)
    ))
    after(logAppointmentEvent({
      appointmentId: doc.id,
      action: 'cancelled',
      actor: 'client',
      summary: 'Cita cancelada por el cliente',
    }).catch(err => console.error('Appointment event log failed:', err)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'ALREADY_CANCELLED') return NextResponse.json({ error: 'Esta cita ya fue cancelada' }, { status: 409 })
    if (msg === 'ALREADY_REJECTED') return NextResponse.json({ error: 'Esta cita ya fue rechazada' }, { status: 409 })
    console.error(`POST /api/cancel/${token}`, err)
    return NextResponse.json({ error: 'Error al cancelar la cita' }, { status: 500 })
  }
}
