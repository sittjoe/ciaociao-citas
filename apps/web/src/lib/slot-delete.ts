import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

/**
 * Borrado de un slot con sus guardas de seguridad, compartido por la ruta de
 * borrado individual (DELETE /api/admin/slots?id=) y la de lote
 * (POST /api/admin/slots/batch). Tener una sola implementación evita que el
 * borrado masivo se salte una protección del individual.
 *
 * NUNCA borra un slot con reserva: ni el marcado como no disponible, ni el que
 * tenga una cita pending/accepted apuntándole. Cada borrado deja auditoría.
 */
export type SlotDeleteCode = 'not_found' | 'booked' | 'active_appointment' | 'error'

export type SlotDeleteResult =
  | { ok: true }
  | { ok: false; code: SlotDeleteCode; error: string }

export async function deleteSlotById(slotId: string, actorEmail: string): Promise<SlotDeleteResult> {
  try {
    const slotRef  = adminDb.collection('slots').doc(slotId)
    const slotSnap = await slotRef.get()
    if (!slotSnap.exists) {
      return { ok: false, code: 'not_found', error: 'Slot no encontrado' }
    }

    const data = slotSnap.data()!
    if (!data.available) {
      return { ok: false, code: 'booked', error: 'No se puede eliminar un slot con reserva' }
    }

    const activeAppts = await adminDb
      .collection('appointments')
      .where('slotId', '==', slotId)
      .where('status', 'in', ['pending', 'accepted'])
      .limit(1)
      .get()
    if (!activeAppts.empty) {
      return { ok: false, code: 'active_appointment', error: 'No se puede eliminar un slot con reserva activa' }
    }

    await slotRef.delete()
    await adminDb.collection('auditLog').add({
      action: 'slot_deleted',
      slotId,
      slotDatetime: data.datetime ? (data.datetime as Timestamp).toDate().toISOString() : null,
      actorEmail,
      ts: new Date(),
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    console.error('deleteSlotById', slotId, err)
    return { ok: false, code: 'error', error: 'Error al eliminar slot' }
  }
}
