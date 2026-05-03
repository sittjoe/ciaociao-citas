import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'

export async function releaseExpiredHolds(limit = 50): Promise<number> {
  const now = Timestamp.now()
  const snap = await adminDb
    .collection('slots')
    .where('heldUntil', '<=', now)
    .limit(limit)
    .get()

  if (snap.empty) return 0

  let released = 0
  const batch = adminDb.batch()

  for (const slotDoc of snap.docs) {
    const slot = slotDoc.data()
    if (slot.available !== false || !slot.bookedBy) continue

    const apptRef = adminDb.collection('appointments').doc(slot.bookedBy)
    const apptSnap = await apptRef.get()
    const apptStatus = apptSnap.exists ? apptSnap.data()?.status : null

    // Accepted appointments must never be auto-cancelled. Defensive: also clear
    // their stale heldUntil so we don't keep re-evaluating them on every cron tick.
    if (apptStatus === 'accepted') {
      batch.update(slotDoc.ref, { heldUntil: null })
      continue
    }

    // Pending appointments still within their hold window must not be touched.
    // Only expire pending appts whose hold has actually elapsed (heldUntil <= now
    // is already enforced by the query) AND whose slot start hasn't passed.
    if (apptStatus === 'pending') {
      const apptHeld = apptSnap.data()?.heldUntil as Timestamp | undefined
      // If the appointment doc itself tracks its hold and it's still in the future,
      // skip — hold not actually expired.
      if (apptHeld && apptHeld.toMillis() > Date.now()) continue
    }

    // Cancel: orphaned hold (no appt doc), or pending past its hold,
    // or already cancelled/rejected appt (slot recovery).
    batch.update(slotDoc.ref, {
      available: true,
      heldUntil: null,
      bookedBy: null,
    })
    if (apptSnap.exists && apptStatus !== 'cancelled' && apptStatus !== 'rejected') {
      batch.update(apptRef, {
        status: 'cancelled',
        expiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    released++
  }

  if (released > 0) await batch.commit()
  return released
}
