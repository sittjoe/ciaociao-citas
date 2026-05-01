import { NextResponse, after } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { appointmentDecisionSchema } from '@/lib/schemas'
import { sendStatusUpdate, sendCalendarError } from '@/lib/email'
import { requireAdminSession } from '@/lib/admin-auth'
import { createAppointmentCalendarEvent } from '@/lib/google-calendar'
import type { Appointment, AppointmentStatus } from '@/types'

export const dynamic = 'force-dynamic'

function mapAppointment(id: string, data: FirebaseFirestore.DocumentData, status?: AppointmentStatus): Appointment {
  return {
    id,
    slotId: data.slotId,
    slotDatetime: (data.slotDatetime as Timestamp).toDate(),
    name: data.name,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    identificationUrl: data.identificationUrl,
    status: status ?? data.status,
    confirmationCode: data.confirmationCode,
    cancelToken: data.cancelToken,
    reminder24Sent: data.reminder24Sent ?? false,
    reminder2Sent: data.reminder2Sent ?? false,
    googleCalendarEventId: data.googleCalendarEventId ?? null,
    createdAt: (data.createdAt as Timestamp).toDate(),
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = appointmentDecisionSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { action, reason } = parsed.data

  let appointment: Appointment | null = null
  let googleCalendarEventId: string | null = null

  try {
    const apptRef = adminDb.collection('appointments').doc(id)
    const apptSnap = await apptRef.get()
    if (!apptSnap.exists) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })

    const apptData = apptSnap.data()!
    if (apptData.status !== 'pending') {
      return NextResponse.json({ error: 'Esta cita ya fue procesada' }, { status: 409 })
    }

    appointment = mapAppointment(id, apptData, action === 'accept' ? 'accepted' : 'rejected')

    await adminDb.runTransaction(async tx => {
      const freshSnap = await tx.get(apptRef)
      if (!freshSnap.exists) throw new Error('NOT_FOUND')
      const freshData = freshSnap.data()!
      if (freshData.status !== 'pending') throw new Error('ALREADY_PROCESSED')

      const newStatus = action === 'accept' ? 'accepted' : 'rejected'
      tx.update(apptRef, {
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
        decidedAt: FieldValue.serverTimestamp(),
        decidedBy: admin.email,
        ...(reason ? { adminNote: reason } : {}),
      })

      if (action === 'reject') {
        tx.update(adminDb.collection('slots').doc(freshData.slotId), {
          available: true,
          heldUntil: null,
          bookedBy: null,
        })
      }

      appointment = mapAppointment(id, freshData, newStatus)
    })

    after(sendStatusUpdate(appointment!, action, reason).catch(err =>
      console.error('Status email failed (non-fatal):', err)
    ))

    if (action === 'accept') {
      try {
        googleCalendarEventId = await createAppointmentCalendarEvent(appointment!)
        await adminDb.collection('appointments').doc(id).update({ googleCalendarEventId })
      } catch (err) {
        console.error('Google Calendar create failed (non-fatal):', err)
        await adminDb.collection('appointments').doc(id).update({ calendarSyncFailed: true }).catch(() => {})
        after(sendCalendarError(appointment!, err instanceof Error ? err.message : String(err)).catch(() => {}))
        return NextResponse.json({ ok: true, googleCalendarEventId: null, calendarSyncFailed: true })
      }
    }

    return NextResponse.json({ ok: true, googleCalendarEventId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    if (msg === 'ALREADY_PROCESSED') return NextResponse.json({ error: 'Esta cita ya fue procesada' }, { status: 409 })
    console.error(`POST /api/admin/appointments/${id}/decision`, err)
    return NextResponse.json({ error: 'Error al procesar la decisión' }, { status: 500 })
  }
}
