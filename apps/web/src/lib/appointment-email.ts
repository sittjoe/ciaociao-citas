import { Timestamp } from 'firebase-admin/firestore'
import { normalizeAppointmentType } from '@/lib/commercial'
import type { Appointment } from '@/types'

export function mapAppointmentForEmail(id: string, data: FirebaseFirestore.DocumentData): Appointment {
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
    status: data.status,
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
