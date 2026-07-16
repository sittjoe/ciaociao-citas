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

// OJO: no agregar aquí helpers que hagan tx.get() — un get llamado después de
// un write dentro de la misma transacción lanza "reads before writes" y tumbó
// /api/slots en producción. Si necesitas verificar el lock, léelo con
// slotLockRef() ANTES de los writes del llamador y decide con ese snapshot.
