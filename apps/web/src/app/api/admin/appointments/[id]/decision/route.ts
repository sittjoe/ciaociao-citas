import { NextResponse, after } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { appointmentDecisionSchema } from '@/lib/schemas'
import { sendStatusUpdate, sendCalendarError } from '@/lib/email'
import { requireAdminSession } from '@/lib/admin-auth'
import { createAppointmentCalendarEvent } from '@/lib/google-calendar'
import {
  decideAppointment,
  mapAppointmentDoc,
  AppointmentErrorCode,
  spanishMessageForCode,
} from '@/lib/appointments'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

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

  let googleCalendarEventId: string | null = null

  try {
    // Atomic transaction: validates appointment is still pending AND the
    // slot is still reserved for this appointment, then updates both.
    // If two admins click "accept" at once, only one wins; the other gets
    // ALREADY_PROCESSED.
    const { newStatus, apptData } = await decideAppointment({
      appointmentId: id,
      action,
      adminEmail: admin.email,
      reason: reason ?? null,
    })

    const appointment: Appointment = mapAppointmentDoc(id, apptData, newStatus)

    after(sendStatusUpdate(appointment, action, reason).catch(err =>
      console.error('Status email failed (non-fatal):', err)
    ))

    if (action === 'accept') {
      try {
        googleCalendarEventId = await createAppointmentCalendarEvent(appointment)
        await adminDb.collection('appointments').doc(id).update({ googleCalendarEventId })
      } catch (err) {
        console.error('Google Calendar create failed (non-fatal):', err)
        await adminDb.collection('appointments').doc(id).update({ calendarSyncFailed: true }).catch(() => {})
        after(sendCalendarError(appointment, err instanceof Error ? err.message : String(err)).catch(() => {}))
        return NextResponse.json({ ok: true, googleCalendarEventId: null, calendarSyncFailed: true })
      }
    }

    return NextResponse.json({ ok: true, googleCalendarEventId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === AppointmentErrorCode.APPT_NOT_FOUND) {
      return NextResponse.json({ error: spanishMessageForCode(msg) }, { status: 404 })
    }
    if (msg === AppointmentErrorCode.ALREADY_PROCESSED) {
      return NextResponse.json({ error: spanishMessageForCode(msg) }, { status: 409 })
    }
    if (msg === AppointmentErrorCode.SLOT_NOT_FOUND ||
        msg === AppointmentErrorCode.SLOT_UNAVAILABLE) {
      return NextResponse.json({ error: spanishMessageForCode(msg) }, { status: 409 })
    }
    console.error(`POST /api/admin/appointments/${id}/decision`, err)
    return NextResponse.json({ error: 'Error al procesar la decisión' }, { status: 500 })
  }
}
