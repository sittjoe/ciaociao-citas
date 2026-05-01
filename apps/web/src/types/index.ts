import type { Timestamp } from 'firebase/firestore'

export type SlotStatus = 'available' | 'held' | 'booked'
export type AppointmentStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export interface Slot {
  id: string
  datetime: Date
  available: boolean
  heldUntil?: Date | null
  bookedBy?: string | null
  createdAt: Date
}

export interface Appointment {
  id: string
  slotId: string
  slotDatetime: Date
  name: string
  email: string
  phone: string
  notes?: string
  identificationUrl: string
  status: AppointmentStatus
  confirmationCode: string
  cancelToken: string
  reminder24Sent: boolean
  reminder2Sent: boolean
  googleCalendarEventId?: string | null
  createdAt: Date
  updatedAt?: Date
}

export interface BookingFormData {
  name: string
  email: string
  phone: string
  notes?: string
  idFile: File
}

export interface SlotsByDate {
  [date: string]: Slot[]
}

export interface AdminStats {
  totalPending: number
  totalAccepted: number
  totalRejected: number
  acceptedToday: number
  upcomingSlots: number
  nextAppointments: Appointment[]
}
