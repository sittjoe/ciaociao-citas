import type { Timestamp } from 'firebase/firestore'

export type SlotStatus = 'available' | 'held' | 'booked'
export type AppointmentStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'
export type GuestStatus = 'pending' | 'verified' | 'expired' | 'excluded'

export interface Guest {
  id: string
  appointmentId: string
  name: string
  email: string
  status: GuestStatus
  verifyToken: string
  identificationUrl: string | null
  invitedAt: Date
  verifiedAt: Date | null
  expiredAt: Date | null
  excludedAt: Date | null
  excludedBy: string | null
  reminder48Sent: boolean
  reminder24Sent: boolean
}

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
  calendarSyncFailed?: boolean | null
  decidedBy?: string | null
  decidedAt?: Date | null
  adminNote?: string | null
  clientConfirmed?: boolean
  clientConfirmedAt?: Date | null
  autoCancelledAt?: Date | null
  guestCount?: number
  guestsAllVerified?: boolean
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
