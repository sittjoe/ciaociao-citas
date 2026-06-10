import { NextResponse, after } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { commercialUpdateSchema } from '@/lib/schemas'
import { sanitize } from '@/lib/utils'
import { sendStatusUpdate } from '@/lib/email'
import { updateAppointmentCalendarEvent } from '@/lib/google-calendar'
import { isVideoEngagement, normalizeAppointmentType } from '@/lib/commercial'
import { logAppointmentEvent } from '@/lib/appointment-events'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = commercialUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { commercialStatus, internalNote, followUpAt, meetingUrl, meetingProvider, meetingInstructions } = parsed.data
  const followUpDate = followUpAt ? new Date(followUpAt) : null
  const cleanMeetingUrl = sanitize(meetingUrl ?? '')
  const cleanMeetingProvider = sanitize(meetingProvider ?? '')
  const cleanMeetingInstructions = sanitize(meetingInstructions ?? '')
  if (followUpDate && Number.isNaN(followUpDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de follow-up inválida' }, { status: 422 })
  }

  try {
    const ref = adminDb.collection('appointments').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    const data = snap.data()!

    await ref.update({
      commercialStatus,
      internalNote: sanitize(internalNote ?? ''),
      followUpAt: followUpDate ? Timestamp.fromDate(followUpDate) : FieldValue.delete(),
      meetingUrl: cleanMeetingUrl,
      meetingProvider: cleanMeetingProvider,
      meetingInstructions: cleanMeetingInstructions,
      commercialUpdatedBy: admin.email,
      commercialUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const meetingChanged = cleanMeetingUrl !== String(data.meetingUrl ?? '')
      || cleanMeetingProvider !== String(data.meetingProvider ?? '')
      || cleanMeetingInstructions !== String(data.meetingInstructions ?? '')
    if (meetingChanged && cleanMeetingUrl && data.status === 'accepted' && isVideoEngagement(data.appointmentType)) {
      const updatedAppointment: Appointment = {
        id,
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
        identificationUrl: data.identificationUrl ?? null,
        status: data.status,
        confirmationCode: data.confirmationCode,
        cancelToken: data.cancelToken,
        reminder24Sent: data.reminder24Sent ?? false,
        reminder2Sent: data.reminder2Sent ?? false,
        googleCalendarEventId: data.googleCalendarEventId ?? null,
        meetingUrl: cleanMeetingUrl,
        meetingProvider: cleanMeetingProvider,
        meetingInstructions: cleanMeetingInstructions,
        createdAt: (data.createdAt as Timestamp).toDate(),
      }
      after(sendStatusUpdate(updatedAppointment, 'accept').catch(err =>
        console.error('Meeting link email failed (non-fatal):', err)
      ))
      after(updateAppointmentCalendarEvent(updatedAppointment).catch(err => {
        console.error('Meeting link calendar update failed (non-fatal):', err)
        return ref.update({ calendarSyncFailed: true }).catch(() => {})
      }))
    }
    after(logAppointmentEvent({
      appointmentId: id,
      action: meetingChanged ? 'meeting_updated' : 'commercial_updated',
      actor: admin.email,
      summary: meetingChanged ? 'Datos de videollamada actualizados' : 'Seguimiento comercial actualizado',
      metadata: {
        commercialStatus,
        hasMeetingUrl: Boolean(cleanMeetingUrl),
      },
    }).catch(err => console.error('Appointment event log failed:', err)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`PATCH /api/admin/appointments/${id}/commercial`, err)
    return NextResponse.json({ error: 'Error al actualizar seguimiento' }, { status: 500 })
  }
}
