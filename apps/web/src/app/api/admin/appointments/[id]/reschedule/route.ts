import { NextResponse, after } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'
import { rescheduleSchema } from '@/lib/schemas'
import { updateAppointmentCalendarEvent } from '@/lib/google-calendar'
import { sendRescheduleNotice, sendCalendarError } from '@/lib/email'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = rescheduleSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { newSlotId } = parsed.data

  try {
    let updatedAppt: Appointment | null = null

    await adminDb.runTransaction(async tx => {
      const apptRef    = adminDb.collection('appointments').doc(id)
      const newSlotRef = adminDb.collection('slots').doc(newSlotId)

      const [apptSnap, newSlotSnap] = await Promise.all([tx.get(apptRef), tx.get(newSlotRef)])

      if (!apptSnap.exists)    throw new Error('APPT_NOT_FOUND')
      if (!newSlotSnap.exists) throw new Error('SLOT_NOT_FOUND')

      const apptData    = apptSnap.data()!
      const newSlotData = newSlotSnap.data()!

      if (apptData.status !== 'accepted') throw new Error('NOT_ACCEPTED')
      if (!newSlotData.available)         throw new Error('SLOT_UNAVAILABLE')

      const oldSlotRef = adminDb.collection('slots').doc(apptData.slotId)
      const newDatetime = (newSlotData.datetime as Timestamp).toDate()

      // Swap slots
      tx.update(oldSlotRef, { available: true, bookedBy: null, heldUntil: null })
      tx.update(newSlotRef, { available: false, bookedBy: id, heldUntil: null })

      // Update appointment
      tx.update(apptRef, {
        slotId:       newSlotId,
        slotDatetime: newSlotData.datetime,
        updatedAt:    FieldValue.serverTimestamp(),
        rescheduledBy: admin.email,
        calendarSyncFailed: false,
      })

      updatedAppt = {
        id,
        slotId:       newSlotId,
        slotDatetime: newDatetime,
        name:         apptData.name,
        email:        apptData.email,
        phone:        apptData.phone,
        notes:        apptData.notes,
        identificationUrl: apptData.identificationUrl,
        status:       'accepted',
        confirmationCode: apptData.confirmationCode,
        cancelToken:  apptData.cancelToken,
        reminder24Sent: apptData.reminder24Sent ?? false,
        reminder2Sent:  apptData.reminder2Sent ?? false,
        googleCalendarEventId: apptData.googleCalendarEventId ?? null,
        createdAt:    (apptData.createdAt as Timestamp).toDate(),
      }
    })

    after(sendRescheduleNotice(updatedAppt!).catch(err =>
      console.error('Reschedule email failed (non-fatal):', err)
    ))

    try {
      await updateAppointmentCalendarEvent(updatedAppt!)
    } catch (err) {
      console.error('GCal update failed for reschedule (non-fatal):', err)
      await adminDb.collection('appointments').doc(id).update({ calendarSyncFailed: true }).catch(() => {})
      after(sendCalendarError(updatedAppt!, err instanceof Error ? err.message : String(err)).catch(() => {}))
      return NextResponse.json({ ok: true, calendarSyncFailed: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'APPT_NOT_FOUND')    return NextResponse.json({ error: 'Cita no encontrada' },        { status: 404 })
    if (msg === 'SLOT_NOT_FOUND')    return NextResponse.json({ error: 'Slot no encontrado' },         { status: 404 })
    if (msg === 'NOT_ACCEPTED')      return NextResponse.json({ error: 'Solo se reagendan citas aceptadas' }, { status: 409 })
    if (msg === 'SLOT_UNAVAILABLE')  return NextResponse.json({ error: 'El slot ya no está disponible' }, { status: 409 })
    console.error(`POST /api/admin/appointments/${id}/reschedule`, err)
    return NextResponse.json({ error: 'Error al reagendar' }, { status: 500 })
  }
}
