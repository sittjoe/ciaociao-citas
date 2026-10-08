import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'
import { logAppointmentEvent } from './appointment-events'
import { slotLockRef } from './slot-locks'
import { liberarSlotDeCita } from './slot-release'
import { mapAppointment } from './appointment-decision'
import { sendPendingRequestAlert, sendRequestExpiredNotices } from './email'
import type { Appointment } from '@/types'

/*
 * «Holds» de horarios: `slots.heldUntil` es el siguiente momento en que el
 * barrido debe revisar ese horario. El barrido corre al abrir /api/slots, en
 * cada reserva, en cada alta manual y en el cron de /api/reminders.
 *
 * ANTES (bug, jul-2026): a los 30 min, una solicitud `pending` se cancelaba
 * sola y nadie se enteraba —ni la clienta ni el equipo—. Pero en este sistema
 * una cita `pending` SIEMPRE es una solicitud que la clienta ya envió completa
 * (la cita se crea en el mismo POST que sube sus datos e identificación); la
 * espera es del equipo, no un formulario abandonado.
 *
 * AHORA:
 *  - Solicitud enviada (`pending`) y su horario aún no llega: NO se cancela.
 *    Si lleva ≥20 min sin atender se avisa al equipo (una vez) y el horario se
 *    sigue apartando hasta la hora de la cita.
 *  - Solicitud enviada cuyo horario ya llegó sin que nadie la atendiera: se
 *    cancela y se avisa a la clienta y al equipo (nunca en silencio).
 *  - Hold huérfano (la cita no existe, o ya está cancelada/rechazada): se
 *    libera el horario. Es el único «hold temporal» que existe: un horario
 *    apartado sin solicitud viva detrás.
 *  - Cita aceptada: se limpia el hold.
 */

/** Tiempo tras el cual una solicitud sin atender dispara el aviso al equipo. */
export const PENDING_ALERT_AFTER_MS = 20 * 60 * 1000

export interface HoldSweepResult {
  /** Holds huérfanos liberados (cita inexistente, cancelada o rechazada). */
  released: number
  /** Solicitudes de >20 min sin atender que generaron aviso al equipo. */
  alerted: number
  /** Solicitudes cuyo horario llegó sin respuesta: canceladas y notificadas. */
  expired: number
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'released' }
  | { kind: 'stale'; appt: Appointment; minutes: number }
  | { kind: 'expired'; appt: Appointment }

export async function releaseExpiredHolds(limit = 50): Promise<HoldSweepResult> {
  const result: HoldSweepResult = { released: 0, alerted: 0, expired: 0 }
  const now = Timestamp.now()
  const snap = await adminDb
    .collection('slots')
    .where('heldUntil', '<=', now)
    .limit(limit)
    .get()

  if (snap.empty) return result

  for (const slotDoc of snap.docs) {
    let outcome: Outcome
    try {
      outcome = await adminDb.runTransaction(async (tx): Promise<Outcome> => {
        // Firestore exige TODAS las lecturas antes de cualquier escritura en una
        // transacción: por eso el lock se lee AQUÍ arriba y su borrado se decide
        // con este snapshot (leerlo después de los update tira la transacción y
        // tumbaba /api/slots completo mientras existiera un hold expirado).
        const freshSlotSnap = await tx.get(slotDoc.ref)
        if (!freshSlotSnap.exists) return { kind: 'none' }
        const slot = freshSlotSnap.data()!
        const heldUntil = slot.heldUntil as Timestamp | undefined | null
        if (!heldUntil || heldUntil.toMillis() > Date.now()) return { kind: 'none' }
        if (slot.available !== false || !slot.bookedBy) {
          // Hold colgado en un horario libre: se limpia para que no vuelva a
          // salir en cada barrido (antes ocupaba el `limit` para siempre).
          tx.update(slotDoc.ref, { heldUntil: null })
          return { kind: 'none' }
        }

        const appointmentId = String(slot.bookedBy)
        const apptRef = adminDb.collection('appointments').doc(appointmentId)
        const apptSnap = await tx.get(apptRef)
        const apptData = apptSnap.exists ? apptSnap.data()! : undefined
        const apptStatus = apptData?.status ?? null

        let lockRef: FirebaseFirestore.DocumentReference | null = null
        let lockDeletable = false
        if (slot.datetime) {
          lockRef = slotLockRef(slot.datetime as Timestamp)
          const lockSnap = await tx.get(lockRef)
          lockDeletable = !lockSnap.exists || lockSnap.data()?.appointmentId === appointmentId
        }

        if (apptStatus === 'accepted') {
          tx.update(slotDoc.ref, { heldUntil: null })
          return { kind: 'none' }
        }

        if (apptStatus === 'pending' && apptData) {
          const slotMs = apptData.slotDatetime instanceof Timestamp
            ? apptData.slotDatetime.toMillis()
            : (slot.datetime as Timestamp | undefined)?.toMillis() ?? 0

          if (slotMs > Date.now()) {
            // La clienta YA envió su solicitud: el horario se le sigue
            // apartando hasta la hora de la cita (próxima revisión).
            tx.update(slotDoc.ref, { heldUntil: Timestamp.fromMillis(slotMs) })
            if (apptData.pendingAlertSentAt) return { kind: 'none' }
            tx.update(apptRef, { pendingAlertSentAt: FieldValue.serverTimestamp() })
            const createdMs = apptData.createdAt instanceof Timestamp ? apptData.createdAt.toMillis() : Date.now()
            return {
              kind: 'stale',
              appt: mapAppointment(appointmentId, apptData),
              minutes: Math.max(20, Math.round((Date.now() - createdMs) / 60_000)),
            }
          }

          // El horario llegó y nadie la atendió: se cancela, pero avisando.
          liberarSlotDeCita(tx, slotDoc.ref, apptData)
          tx.update(apptRef, {
            status: 'cancelled',
            cancelReason: 'expired_unattended',
            expiredAt: FieldValue.serverTimestamp(),
            scheduledEmails: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          })
          if (lockRef && lockDeletable) tx.delete(lockRef)
          return { kind: 'expired', appt: mapAppointment(appointmentId, apptData, 'cancelled') }
        }

        // Hold huérfano: la cita no existe o ya está cancelada/rechazada.
        tx.update(slotDoc.ref, { available: true, heldUntil: null, bookedBy: null })
        if (lockRef && lockDeletable) tx.delete(lockRef)
        return { kind: 'released' }
      })
    } catch (err) {
      // Un horario problemático no debe tumbar el barrido (ni /api/slots).
      console.error(`releaseExpiredHolds: slot ${slotDoc.id} failed:`, err)
      continue
    }

    if (outcome.kind === 'released') {
      result.released++
    } else if (outcome.kind === 'stale') {
      result.alerted++
      await sendPendingRequestAlert(outcome.appt, outcome.minutes)
        .catch(err => console.error(`Aviso de solicitud sin atender falló (${outcome.appt.id}):`, err))
    } else if (outcome.kind === 'expired') {
      result.expired++
      await logAppointmentEvent({
        appointmentId: outcome.appt.id,
        action: 'cancelled',
        actor: 'system',
        summary: 'Solicitud cancelada: llegó su horario sin que el equipo la atendiera (se avisó a la clienta y al equipo)',
      }).catch(() => {})
      await sendRequestExpiredNotices(outcome.appt)
        .catch(err => console.error(`Aviso de solicitud expirada falló (${outcome.appt.id}):`, err))
    }
  }

  return result
}
