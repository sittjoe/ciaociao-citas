import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'

export function slotLockRef(slotDatetime: Date | Timestamp) {
  const millis = slotDatetime instanceof Timestamp ? slotDatetime.toMillis() : slotDatetime.getTime()
  return adminDb.collection('slotDatetimeLocks').doc(String(millis))
}

export function createSlotLock(
  tx: FirebaseFirestore.Transaction,
  slotDatetime: Date | Timestamp,
  appointmentId: string,
) {
  const timestamp = slotDatetime instanceof Timestamp ? slotDatetime : Timestamp.fromDate(slotDatetime)
  tx.create(slotLockRef(slotDatetime), {
    appointmentId,
    slotDatetime: timestamp,
    createdAt: FieldValue.serverTimestamp(),
  })
}

export function releaseSlotLock(
  txOrBatch: FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch,
  slotDatetime: Date | Timestamp,
) {
  txOrBatch.delete(slotLockRef(slotDatetime))
}

export async function releaseSlotLockForAppointment(
  tx: FirebaseFirestore.Transaction,
  slotDatetime: Date | Timestamp,
  appointmentId: string,
) {
  const ref = slotLockRef(slotDatetime)
  const snap = await tx.get(ref)
  if (!snap.exists || snap.data()?.appointmentId === appointmentId) {
    tx.delete(ref)
  }
}
