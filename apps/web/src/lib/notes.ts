/**
 * Server-side helpers for appointment metadata (tags, type, internal notes)
 * and the audit trail for internal notes.
 *
 * Designed to extend Agente 7's `appointments.ts` without modifying its
 * existing exports.  All errors thrown are stable codes (UPPER_SNAKE) so the
 * route handlers can map them to Spanish messages.
 */

import { adminDb } from './firebase-admin'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { AppointmentNoteHistoryEntry, AppointmentType } from '@/types'

export const NotesErrorCode = {
  APPT_NOT_FOUND: 'APPT_NOT_FOUND',
} as const

export interface UpdateAppointmentMetaInput {
  appointmentId: string
  adminEmail: string
  tags?: string[] | null
  type?: AppointmentType | null
  internalNotes?: string | null
  /** Optional injected Firestore (for tests). */
  db?: Firestore
}

export interface UpdateAppointmentMetaResult {
  tags: string[]
  type: AppointmentType | null
  internalNotes: string
  internalNotesChanged: boolean
}

/** Normalize and deduplicate tags. Filters empties and trims aggressively. */
export function normalizeTags(input: readonly string[] | null | undefined): string[] {
  if (!input) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/**
 * Update tags/type/internalNotes for an appointment.
 *
 * When `internalNotes` changes, also append an entry to the
 * `appointments/{id}/notesHistory` subcollection so admins keep an audit
 * trail.  Empty/whitespace notes are stored as the empty string (not
 * appended to history).
 */
export async function updateAppointmentMeta(
  params: UpdateAppointmentMetaInput,
): Promise<UpdateAppointmentMetaResult> {
  const { appointmentId, adminEmail } = params
  const db = params.db ?? adminDb

  const apptRef = db.collection('appointments').doc(appointmentId)

  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(apptRef)
    if (!snap.exists) throw new Error(NotesErrorCode.APPT_NOT_FOUND)

    const data = snap.data()!
    const prevNotes: string = typeof data.internalNotes === 'string' ? data.internalNotes : ''
    const prevTags: string[] = Array.isArray(data.tags) ? data.tags : []
    const prevType: AppointmentType | null = data.type ?? null

    const nextTags = params.tags === undefined ? prevTags : normalizeTags(params.tags)
    const nextType: AppointmentType | null =
      params.type === undefined ? prevType : (params.type ?? null)

    let nextNotes = prevNotes
    let notesChanged = false
    if (params.internalNotes !== undefined) {
      const trimmed = (params.internalNotes ?? '').toString()
      nextNotes = trimmed
      notesChanged = trimmed !== prevNotes
    }

    const update: Record<string, unknown> = {
      tags: nextTags,
      type: nextType,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (notesChanged) {
      update.internalNotes = nextNotes
      update.internalNotesUpdatedAt = FieldValue.serverTimestamp()
      update.internalNotesUpdatedBy = adminEmail
    } else if (params.internalNotes !== undefined) {
      // Caller explicitly sent same value: still persist key but skip audit.
      update.internalNotes = nextNotes
    }

    tx.update(apptRef, update)

    if (notesChanged && nextNotes.trim().length > 0) {
      const histRef = apptRef.collection('notesHistory').doc()
      tx.set(histRef, {
        notes: nextNotes,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminEmail,
      })
    }

    return {
      tags: nextTags,
      type: nextType,
      internalNotes: nextNotes,
      internalNotesChanged: notesChanged,
    }
  })

  return result
}

/**
 * Read the most recent N notes history entries for an appointment.
 * Returned in descending chronological order.
 */
export async function listNotesHistory(
  appointmentId: string,
  limit = 20,
  db: Firestore = adminDb,
): Promise<AppointmentNoteHistoryEntry[]> {
  const snap = await db
    .collection('appointments')
    .doc(appointmentId)
    .collection('notesHistory')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()

  return snap.docs.map(doc => {
    const d = doc.data()
    return {
      id: doc.id,
      notes: typeof d.notes === 'string' ? d.notes : '',
      updatedAt: (d.updatedAt as Timestamp | undefined)?.toDate() ?? new Date(0),
      updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : 'sistema',
    }
  })
}

/* ------------------------------------------------------------------------ */
/* Client-initiated requests (reschedule / cancel)                          */
/* ------------------------------------------------------------------------ */

export interface ClientRequestParams {
  appointmentId: string
  action: 'reschedule' | 'cancel'
  reason?: string | null
  db?: Firestore
}

/**
 * Mark an appointment with a client-initiated request flag.
 *
 * - `reschedule` sets `rescheduleRequestedAt` so admins see it in the queue.
 * - `cancel` sets `cancelRequestedAt`.
 *
 * NOTE: We deliberately DO NOT mutate `status` here — admin still owns the
 * decision.  Agente 7's `decideAppointment` / cancel-token flow remain
 * authoritative for status transitions.  TODO(handoff/Agente 7+9): emit an
 * email/SMS to admins when a request lands.
 */
export async function createClientRequest(
  params: ClientRequestParams,
): Promise<void> {
  const db = params.db ?? adminDb
  const apptRef = db.collection('appointments').doc(params.appointmentId)

  await db.runTransaction(async tx => {
    const snap = await tx.get(apptRef)
    if (!snap.exists) throw new Error(NotesErrorCode.APPT_NOT_FOUND)

    const reason = (params.reason ?? '').toString().slice(0, 500)
    const field = params.action === 'reschedule'
      ? 'rescheduleRequestedAt'
      : 'cancelRequestedAt'

    tx.update(apptRef, {
      [field]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const reqRef = apptRef.collection('clientRequests').doc()
    tx.set(reqRef, {
      action: params.action,
      reason,
      requestedAt: FieldValue.serverTimestamp(),
    })
  })
}
