import { adminDb } from './firebase-admin'

/**
 * Pausa global de la agenda — doc config/agendaPause {paused, reason}.
 * Cuando está pausada, el /api/slots público no ofrece horarios y /api/booking
 * rechaza nuevas reservas. No afecta al panel admin ni a citas ya creadas.
 */

export interface AgendaPauseState {
  paused: boolean
  reason: string
}

export function agendaPauseRef(): FirebaseFirestore.DocumentReference {
  return adminDb.collection('config').doc('agendaPause')
}

/**
 * Estado actual de la pausa. FAIL-OPEN por diseño (mismo criterio que
 * getBlockedDateSet): si la lectura falla se asume agenda activa, para que un
 * bug de esta feature jamás tumbe el flujo público de reservas.
 */
export async function getAgendaPause(): Promise<AgendaPauseState> {
  try {
    const snap = await agendaPauseRef().get()
    if (!snap.exists) return { paused: false, reason: '' }
    const data = snap.data()!
    return { paused: data.paused === true, reason: String(data.reason ?? '') }
  } catch (err) {
    console.error('getAgendaPause failed (failing open):', err)
    return { paused: false, reason: '' }
  }
}
