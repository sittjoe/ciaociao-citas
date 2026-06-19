import { adminDb } from './firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendStatusUpdate, sendCalendarError } from './email'
import { createAppointmentCalendarEvent } from './google-calendar'
import { releaseSlotLock } from './slot-locks'
import { normalizeAppointmentType } from './commercial'
import { logAppointmentEvent } from './appointment-events'
import { sanitize } from './utils'
import type { Appointment, AppointmentStatus } from '@/types'

export type DecisionAction = 'accept' | 'reject'

export interface DecisionResult {
  ok: boolean
  /** HTTP status to use when ok === false */
  status: number
  error?: string
  calendarSyncFailed?: boolean
  googleCalendarEventId?: string | null
}

export function mapAppointment(
  id: string,
  data: FirebaseFirestore.DocumentData,
  status?: AppointmentStatus,
): Appointment {
  return {
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
    identificationUrl: data.identificationUrl,
    status: status ?? data.status,
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
}

/**
 * Accept or reject a single appointment: state transition + slot bookkeeping
 * in a transaction, then calendar sync, audit log and status email. Shared by
 * the single-decision route and the batch route so both behave identically.
 *
 * Side effects (email, log) are awaited best-effort; failures don't roll back
 * the decision. Returns a structured result instead of throwing so the batch
 * caller can aggregate per-appointment outcomes.
 */
export async function applyAppointmentDecision(opts: {
  id: string
  action: DecisionAction
  adminEmail: string
  reason?: string
  meetingUrl?: string
  meetingProvider?: string
  meetingInstructions?: string
}): Promise<DecisionResult> {
  const { id, action, adminEmail, reason } = opts
  const cleanMeetingUrl = sanitize(opts.meetingUrl ?? '')
  const cleanMeetingProvider = sanitize(opts.meetingProvider ?? '')
  const cleanMeetingInstructions = sanitize(opts.meetingInstructions ?? '')

  let appointment: Appointment | null = null

  try {
    const apptRef = adminDb.collection('appointments').doc(id)
    const apptSnap = await apptRef.get()
    if (!apptSnap.exists) return { ok: false, status: 404, error: 'Cita no encontrada' }
    if (apptSnap.data()!.status !== 'pending') {
      return { ok: false, status: 409, error: 'Esta cita ya fue procesada' }
    }

    await adminDb.runTransaction(async tx => {
      const freshSnap = await tx.get(apptRef)
      if (!freshSnap.exists) throw new Error('NOT_FOUND')
      const freshData = freshSnap.data()!
      if (freshData.status !== 'pending') throw new Error('ALREADY_PROCESSED')

      const newStatus = action === 'accept' ? 'accepted' : 'rejected'
      const appointmentType = normalizeAppointmentType(freshData.appointmentType)
      if (action === 'accept' && appointmentType === 'showroom' && !freshData.identificationUrl) {
        throw new Error('MISSING_IDENTIFICATION')
      }
      tx.update(apptRef, {
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
        decidedAt: FieldValue.serverTimestamp(),
        decidedBy: adminEmail,
        ...(reason ? { adminNote: reason } : {}),
        ...(action === 'accept' ? { clientConfirmed: false } : {}),
        ...(action === 'accept' && appointmentType === 'video_engagement_rings' ? {
          meetingUrl: cleanMeetingUrl,
          meetingProvider: cleanMeetingProvider,
          meetingInstructions: cleanMeetingInstructions,
        } : {}),
      })

      if (action === 'accept') {
        // Clear heldUntil so releaseExpiredHolds never reclaims this slot.
        tx.update(adminDb.collection('slots').doc(freshData.slotId), { heldUntil: null })
      } else {
        tx.update(adminDb.collection('slots').doc(freshData.slotId), {
          available: true, heldUntil: null, bookedBy: null,
        })
        releaseSlotLock(tx, freshData.slotDatetime as Timestamp)
      }

      appointment = mapAppointment(id, freshData, newStatus)
      if (action === 'accept' && appointmentType === 'video_engagement_rings') {
        appointment.meetingUrl = cleanMeetingUrl
        appointment.meetingProvider = cleanMeetingProvider
        appointment.meetingInstructions = cleanMeetingInstructions
      }
    })

    await sendStatusUpdate(appointment!, action, reason)
      .catch(err => console.error('Status email failed (non-fatal):', err))
    await logAppointmentEvent({
      appointmentId: id,
      action: 'decision',
      actor: adminEmail,
      summary: action === 'accept' ? 'Cita aceptada' : 'Cita rechazada',
      metadata: { action, reason: reason ?? '' },
    }).catch(err => console.error('Appointment event log failed:', err))

    if (action === 'accept') {
      try {
        const googleCalendarEventId = await createAppointmentCalendarEvent(appointment!)
        await adminDb.collection('appointments').doc(id).update({ googleCalendarEventId })
        return { ok: true, status: 200, googleCalendarEventId }
      } catch (err) {
        console.error('Google Calendar create failed (non-fatal):', err)
        await adminDb.collection('appointments').doc(id).update({ calendarSyncFailed: true }).catch(() => {})
        await sendCalendarError(appointment!, err instanceof Error ? err.message : String(err)).catch(() => {})
        return { ok: true, status: 200, googleCalendarEventId: null, calendarSyncFailed: true }
      }
    }

    return { ok: true, status: 200 }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'NOT_FOUND') return { ok: false, status: 404, error: 'Cita no encontrada' }
    if (msg === 'ALREADY_PROCESSED') return { ok: false, status: 409, error: 'Esta cita ya fue procesada' }
    if (msg === 'MISSING_IDENTIFICATION') {
      return { ok: false, status: 422, error: 'La cita de showroom necesita identificación antes de aceptarse.' }
    }
    console.error(`applyAppointmentDecision(${id})`, err)
    return { ok: false, status: 500, error: 'Error al procesar la decisión' }
  }
}
