import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'

export type AppointmentEventAction =
  | 'booking_created'
  | 'decision'
  | 'commercial_updated'
  | 'meeting_updated'
  | 'rescheduled'
  | 'cancelled'
  | 'email_resent'

export async function logAppointmentEvent(params: {
  appointmentId: string
  action: AppointmentEventAction
  actor: string
  summary: string
  metadata?: Record<string, unknown>
}) {
  await adminDb
    .collection('appointments')
    .doc(params.appointmentId)
    .collection('events')
    .add({
      action: params.action,
      actor: params.actor,
      summary: params.summary,
      metadata: params.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    })
}
