import { Timestamp } from 'firebase-admin/firestore'
import type { Appointment } from '@/types'

export function mapAppointmentForEmail(id: string, data: FirebaseFirestore.DocumentData): Appointment {
  return {
    id,
    slotId: data.slotId,
    slotDatetime: (data.slotDatetime as Timestamp).toDate(),
    name: data.name,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    productType: data.productType,
    budgetRange: data.budgetRange,
    lookingFor: data.lookingFor,
    identificationUrl: data.identificationUrl,
    status: data.status,
    confirmationCode: data.confirmationCode,
    cancelToken: data.cancelToken,
    reminder24Sent: data.reminder24Sent ?? false,
    reminder2Sent: data.reminder2Sent ?? false,
    googleCalendarEventId: data.googleCalendarEventId ?? null,
    createdAt: (data.createdAt as Timestamp).toDate(),
  }
}
