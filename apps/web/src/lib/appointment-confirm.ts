import { FieldValue, type DocumentData, type QueryDocumentSnapshot, type Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'
import { formatDate, formatTime12 } from './utils'
import { reservaPath } from './reserva-access'

/**
 * Confirmación de asistencia de la clienta (/confirmar/[token]).
 *
 * Los escáneres de enlaces de los correos (Outlook Safe Links, Gmail,
 * antivirus) ABREN los links solos. Por eso:
 *  - getConfirmation() solo LEE: la página GET muestra la cita y un botón.
 *  - confirmAppointment() es lo único que escribe, y solo lo llama el POST de
 *    /api/confirm/[token] (con comprobación de origen y token en el cuerpo).
 */

/** cancelToken: lo genera generateCode (A-Z sin I/O, 2-9) con ≥16 caracteres. */
export function isConfirmTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(token)
}

export interface ConfirmSummary {
  name:     string
  dateStr:  string   // «jueves 9 de octubre, 2026» en CDMX
  timeStr:  string   // «1:00 pm» en CDMX
  code:     string
  /** Enlace a /reserva firmado (cae a la puerta del correo si no hay secreto). */
  reservaHref: string
}

export type ConfirmView =
  | ({ state: 'pending_client' } & ConfirmSummary)   // aceptada, falta que la clienta confirme
  | ({ state: 'already' } & ConfirmSummary)          // ya estaba confirmada
  | ({ state: 'past' } & ConfirmSummary)             // la hora de la cita ya pasó
  | { state: 'cancelled' }
  | { state: 'rejected' }
  | { state: 'awaiting_team' }                         // pending: el equipo aún no la aprueba
  | { state: 'unavailable' }                           // cualquier otro estado
  | { state: 'invalid' }                               // token mal formado o inexistente

export type ConfirmResult =
  | ({ state: 'confirmed' } & ConfirmSummary)
  | Exclude<ConfirmView, { state: 'pending_client' }>

type DocSnap = QueryDocumentSnapshot

async function findByToken(token: string): Promise<DocSnap | null> {
  if (!isConfirmTokenShape(token)) return null
  const snap = await adminDb
    .collection('appointments')
    .where('cancelToken', '==', token)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0]
}

function summaryOf(data: DocumentData): ConfirmSummary {
  const when = (data.slotDatetime as Timestamp).toDate()
  const code = String(data.confirmationCode ?? '')
  return {
    name:        String(data.name ?? '').trim(),
    dateStr:     formatDate(when),
    timeStr:     formatTime12(when),
    code,
    reservaHref: reservaPath(code),
  }
}

function viewOf(data: DocumentData, nowMs: number): ConfirmView {
  if (data.status === 'cancelled') return { state: 'cancelled' }
  if (data.status === 'rejected')  return { state: 'rejected' }
  if (data.status === 'pending')   return { state: 'awaiting_team' }
  if (data.status !== 'accepted')  return { state: 'unavailable' }

  const summary = summaryOf(data)
  if (data.clientConfirmed === true) return { state: 'already', ...summary }
  const slotMs = (data.slotDatetime as Timestamp).toDate().getTime()
  if (Number.isFinite(slotMs) && slotMs <= nowMs) return { state: 'past', ...summary }
  return { state: 'pending_client', ...summary }
}

/** Solo lectura. Nunca escribe: la usa la página GET. */
export async function getConfirmation(token: string, nowMs = Date.now()): Promise<ConfirmView> {
  const doc = await findByToken(token)
  if (!doc) return { state: 'invalid' }
  return viewOf(doc.data(), nowMs)
}

/** Idempotente: si ya estaba confirmada no vuelve a escribir. */
export async function confirmAppointment(token: string, nowMs = Date.now()): Promise<ConfirmResult> {
  const doc = await findByToken(token)
  if (!doc) return { state: 'invalid' }
  const view = viewOf(doc.data(), nowMs)
  if (view.state !== 'pending_client') return view

  await doc.ref.update({
    clientConfirmed:   true,
    clientConfirmedAt: FieldValue.serverTimestamp(),
    updatedAt:         FieldValue.serverTimestamp(),
  })
  const { state: _state, ...summary } = view
  return { state: 'confirmed', ...summary }
}

/**
 * CSRF razonable para un POST público: si el navegador manda Origin (todos
 * los modernos lo hacen en fetch POST) debe ser el mismo host; si no hay
 * Origin, se rechaza un Sec-Fetch-Site cruzado. El handler exige además JSON
 * con el token en el cuerpo, lo que fuerza preflight CORS desde otro origen.
 */
export function isSameOriginRequest(request: Request): boolean {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
    .split(',')[0].trim().toLowerCase()
  const origin = request.headers.get('origin')
  if (origin) {
    if (origin === 'null') return false
    try {
      const originHost = new URL(origin).host.toLowerCase()
      const ownHost = host || new URL(request.url).host.toLowerCase()
      return originHost === ownHost
    } catch {
      return false
    }
  }
  const site = request.headers.get('sec-fetch-site')
  return !site || site === 'same-origin' || site === 'none'
}
