/**
 * Server-side appointment helpers.
 *
 * Provides atomic Firestore transactions for the public booking flow and the
 * admin accept/reject flow, plus idempotency support for booking submissions
 * so a retried or double-clicked request never creates a duplicate cita.
 *
 * All errors thrown here are stable error CODES (English, UPPER_SNAKE) so the
 * callers (route handlers) can map them to localized Spanish messages.
 */

import { adminDb } from './firebase-admin'
import { FieldValue, Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore'
import type { Appointment, AppointmentStatus } from '@/types'

/** Stable error codes thrown by helpers in this module. */
export const AppointmentErrorCode = {
  SLOT_NOT_FOUND:      'SLOT_NOT_FOUND',
  SLOT_UNAVAILABLE:    'SLOT_UNAVAILABLE',
  APPT_NOT_FOUND:      'APPT_NOT_FOUND',
  ALREADY_PROCESSED:   'ALREADY_PROCESSED',
  GUESTS_TOO_LATE:     'GUESTS_TOO_LATE',
} as const

export type AppointmentErrorCodeT =
  (typeof AppointmentErrorCode)[keyof typeof AppointmentErrorCode]

/**
 * Map an error code to a Spanish, user-facing message.
 * Centralized so all surfaces show the same wording.
 */
export function spanishMessageForCode(code: string): string {
  switch (code) {
    case AppointmentErrorCode.SLOT_NOT_FOUND:
    case AppointmentErrorCode.SLOT_UNAVAILABLE:
      return 'Este horario ya fue reservado.'
    case AppointmentErrorCode.APPT_NOT_FOUND:
      return 'Cita no encontrada.'
    case AppointmentErrorCode.ALREADY_PROCESSED:
      return 'Cita ya procesada por otro administrador.'
    case AppointmentErrorCode.GUESTS_TOO_LATE:
      return 'No es posible agregar invitados a citas con menos de 24h de anticipación.'
    default:
      return 'Error al procesar la solicitud.'
  }
}

/* -------------------------------------------------------------------------- */
/* Admin: accept / reject                                                     */
/* -------------------------------------------------------------------------- */

export interface DecideAppointmentParams {
  appointmentId: string
  action: 'accept' | 'reject'
  adminEmail: string
  reason?: string | null
  /** Optional injected Firestore (for tests). Defaults to adminDb. */
  db?: Firestore
}

export interface DecideAppointmentResult {
  newStatus: 'accepted' | 'rejected'
  slotId: string
  apptData: FirebaseFirestore.DocumentData
}

/**
 * Atomically decide a pending appointment.
 *
 * The transaction re-reads both `appointments/{id}` and `slots/{slotId}`
 * inside the snapshot and validates invariants before writing. If two admins
 * accept at the same time, the second one's transaction will fail validation
 * and throw `ALREADY_PROCESSED`.
 */
export async function decideAppointment(
  params: DecideAppointmentParams
): Promise<DecideAppointmentResult> {
  const { appointmentId, action, adminEmail, reason } = params
  const db = params.db ?? adminDb

  const newStatus: 'accepted' | 'rejected' =
    action === 'accept' ? 'accepted' : 'rejected'

  return db.runTransaction(async tx => {
    const apptRef = db.collection('appointments').doc(appointmentId)
    const apptSnap = await tx.get(apptRef)
    if (!apptSnap.exists) throw new Error(AppointmentErrorCode.APPT_NOT_FOUND)

    const apptData = apptSnap.data()!
    if (apptData.status !== 'pending') {
      throw new Error(AppointmentErrorCode.ALREADY_PROCESSED)
    }

    const slotId: string = apptData.slotId
    const slotRef = db.collection('slots').doc(slotId)
    const slotSnap = await tx.get(slotRef)
    if (!slotSnap.exists) throw new Error(AppointmentErrorCode.SLOT_NOT_FOUND)

    const slotData = slotSnap.data()!

    if (action === 'accept') {
      // Slot must still be reserved for *this* appointment. If something
      // released the slot or rebooked it, refuse the accept.
      if (slotData.available === true || slotData.bookedBy !== appointmentId) {
        throw new Error(AppointmentErrorCode.SLOT_UNAVAILABLE)
      }
    }

    tx.update(apptRef, {
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: adminEmail,
      ...(reason ? { adminNote: reason } : {}),
      ...(action === 'accept' ? { clientConfirmed: false } : {}),
    })

    if (action === 'accept') {
      // Clear hold expiry; slot stays available:false, bookedBy preserved.
      tx.update(slotRef, { heldUntil: null })
    } else {
      tx.update(slotRef, {
        available: true,
        heldUntil: null,
        bookedBy: null,
      })
    }

    return { newStatus, slotId, apptData }
  })
}

/* -------------------------------------------------------------------------- */
/* Public booking: idempotent existing-key lookup                             */
/* -------------------------------------------------------------------------- */

export interface ExistingByIdempotencyKey {
  id: string
  confirmationCode: string
  slotId: string
}

/**
 * Look up an existing appointment by idempotency key.
 *
 * Returns the previously created appointment if a request with this key has
 * already been processed, or `null` otherwise. Designed to be called BEFORE
 * starting the booking transaction to short-circuit retries cheaply.
 *
 * For perfect concurrency safety, the booking transaction itself also
 * re-checks the key (see `findExistingByKeyInTx`).
 */
export async function findExistingByIdempotencyKey(
  idempotencyKey: string,
  db: Firestore = adminDb
): Promise<ExistingByIdempotencyKey | null> {
  const snap = await db
    .collection('appointments')
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(1)
    .get()

  if (snap.empty) return null
  const doc = snap.docs[0]
  const data = doc.data()
  return {
    id:               doc.id,
    confirmationCode: data.confirmationCode,
    slotId:           data.slotId,
  }
}

/**
 * Transaction-scoped variant of `findExistingByIdempotencyKey`.
 *
 * MUST be called as the FIRST read in a transaction so it participates in
 * the same snapshot as subsequent reads/writes. This is what makes two
 * concurrent submissions with the same key collapse to a single document.
 */
export async function findExistingByKeyInTx(
  tx: FirebaseFirestore.Transaction,
  idempotencyKey: string,
  db: Firestore = adminDb
): Promise<ExistingByIdempotencyKey | null> {
  const q = db
    .collection('appointments')
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(1)
  const snap = await tx.get(q)
  if (snap.empty) return null
  const doc = snap.docs[0]
  const data = doc.data()
  return {
    id:               doc.id,
    confirmationCode: data.confirmationCode,
    slotId:           data.slotId,
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Map a Firestore document to the application `Appointment` type. */
export function mapAppointmentDoc(
  id: string,
  data: FirebaseFirestore.DocumentData,
  statusOverride?: AppointmentStatus
): Appointment {
  return {
    id,
    slotId:                data.slotId,
    slotDatetime:          (data.slotDatetime as Timestamp).toDate(),
    name:                  data.name,
    email:                 data.email,
    phone:                 data.phone,
    notes:                 data.notes,
    identificationUrl:     data.identificationUrl,
    status:                statusOverride ?? data.status,
    confirmationCode:      data.confirmationCode,
    cancelToken:           data.cancelToken,
    reminder24Sent:        data.reminder24Sent ?? false,
    reminder2Sent:         data.reminder2Sent ?? false,
    googleCalendarEventId: data.googleCalendarEventId ?? null,
    calendarSyncFailed:    data.calendarSyncFailed ?? null,
    decidedBy:             data.decidedBy ?? null,
    decidedAt:             data.decidedAt
      ? (data.decidedAt as Timestamp).toDate()
      : null,
    adminNote:             data.adminNote ?? null,
    guestCount:            data.guestCount,
    guestsAllVerified:     data.guestsAllVerified,
    idempotencyKey:        data.idempotencyKey,
    createdAt:             (data.createdAt as Timestamp).toDate(),
  }
}

// Re-export refs helper for convenience / mockability.
export function appointmentDocRef(
  id: string,
  db: Firestore = adminDb
): DocumentReference {
  return db.collection('appointments').doc(id)
}
