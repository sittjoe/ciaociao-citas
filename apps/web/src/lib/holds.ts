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
    if (!apptSnap.exists || apptSnap.data()?.status !== 'pending') continue

    batch.update(slotDoc.ref, {
      available: true,
      heldUntil: null,
      bookedBy: null,
    })
    batch.update(apptRef, {
      status: 'cancelled',
      expiredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    released++
  }

  if (released > 0) await batch.commit()
  return released
}
