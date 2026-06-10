import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'
import { logAppointmentEvent } from './appointment-events'
import { releaseSlotLockForAppointment } from './slot-locks'

export async function releaseExpiredHolds(limit = 50): Promise<number> {
  const now = Timestamp.now()
  const snap = await adminDb
    .collection('slots')
    .where('heldUntil', '<=', now)
    .limit(limit)
    .get()

  if (snap.empty) return 0

  let released = 0

  for (const slotDoc of snap.docs) {
    const result = await adminDb.runTransaction(async tx => {
      const freshSlotSnap = await tx.get(slotDoc.ref)
      if (!freshSlotSnap.exists) return { released: false, appointmentId: '', logEvent: false }
      const slot = freshSlotSnap.data()!
      if (slot.available !== false || !slot.bookedBy) return { released: false, appointmentId: '', logEvent: false }
      const heldUntil = slot.heldUntil as Timestamp | undefined
      if (!heldUntil || heldUntil.toMillis() > Date.now()) return { released: false, appointmentId: '', logEvent: false }

      const appointmentId = String(slot.bookedBy)
      const apptRef = adminDb.collection('appointments').doc(appointmentId)
      const apptSnap = await tx.get(apptRef)
      const apptStatus = apptSnap.exists ? apptSnap.data()?.status : null

      if (apptStatus === 'accepted') {
        tx.update(slotDoc.ref, { heldUntil: null })
        return { released: false, appointmentId: '', logEvent: false }
      }

      tx.update(slotDoc.ref, {
        available: true,
        heldUntil: null,
        bookedBy: null,
      })
      if (apptSnap.exists && apptStatus === 'pending') {
        tx.update(apptRef, {
          status: 'cancelled',
          expiredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      if (slot.datetime) await releaseSlotLockForAppointment(tx, slot.datetime as Timestamp, appointmentId)
      return { released: true, appointmentId, logEvent: apptSnap.exists && apptStatus === 'pending' }
    })

    if (result.released) {
      released++
      if (result.logEvent) await logAppointmentEvent({
        appointmentId: result.appointmentId,
        action: 'cancelled',
        actor: 'system',
        summary: 'Cita cancelada por hold expirado',
      }).catch(() => {})
    }
  }

  return released
}
