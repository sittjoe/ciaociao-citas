import { NextResponse, after } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { updateAppointmentCalendarEvent } from '@/lib/google-calendar'
import { sendRescheduleNotice, sendCalendarError, syncScheduledReminderEmails, cancelScheduledReminderEmails } from '@/lib/email'
import { createSlotLock, releaseSlotLock, slotLockRef } from '@/lib/slot-locks'
import { normalizeAppointmentType } from '@/lib/commercial'
import { logAppointmentEvent } from '@/lib/appointment-events'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

/** La clienta puede mover su cita hasta 12 horas antes del horario actual. */
const MIN_HOURS_BEFORE = 12

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  // Tokens are generated with at least 16 chars (generateCode); anything
  // shorter is noise — reject before touching Firestore. (Same gate as cancel.)
  if (!token || token.length < 16 || token.length > 64) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }
  const ip = requestIp(request)
  if (await checkPublicRateLimit({ key: `reschedule:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 10 })) {
    return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
  }

  let newSlotId = ''
  try {
    const body = await request.json() as { newSlotId?: unknown }
    if (typeof body.newSlotId === 'string') newSlotId = body.newSlotId.trim()
  } catch {
    // body inválido → cae en la validación de abajo
  }
  if (!newSlotId || newSlotId.length > 128) {
    return NextResponse.json({ error: 'Horario inválido' }, { status: 400 })
  }

  try {
    const snap = await adminDb
      .collection('appointments')
      .where('cancelToken', '==', token)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Token no encontrado' }, { status: 404 })
    }

    const doc = snap.docs[0]

    let updatedAppt: Appointment | null = null
    let previousSlotId = ''
    let wasAccepted = false
    let previousScheduledEmails: unknown = null

    await adminDb.runTransaction(async tx => {
      const apptRef    = doc.ref
      const newSlotRef = adminDb.collection('slots').doc(newSlotId)

      // ── LECTURAS: todas ANTES de cualquier escritura (ver lib/holds.ts) ──
      const [apptSnap, newSlotSnap] = await Promise.all([tx.get(apptRef), tx.get(newSlotRef)])

      if (!apptSnap.exists)    throw new Error('APPT_NOT_FOUND')
      if (!newSlotSnap.exists) throw new Error('SLOT_NOT_FOUND')

      const apptData    = apptSnap.data()!
      const newSlotData = newSlotSnap.data()!

      if (apptData.status !== 'pending' && apptData.status !== 'accepted') {
        throw new Error('NOT_RESCHEDULABLE')
      }

      const oldDatetime = apptData.slotDatetime as Timestamp
      if (oldDatetime.toMillis() - Date.now() < MIN_HOURS_BEFORE * 60 * 60 * 1000) {
        throw new Error('TOO_LATE')
      }

      if (apptData.slotId === newSlotId) throw new Error('SAME_SLOT')
      if (!newSlotData.available)        throw new Error('SLOT_UNAVAILABLE')
      if (normalizeAppointmentType(newSlotData.slotType) !== normalizeAppointmentType(apptData.appointmentType)) {
        throw new Error('SLOT_TYPE_MISMATCH')
      }

      const newDatetimeTs = newSlotData.datetime as Timestamp
      const newDatetime   = newDatetimeTs.toDate()
      if (newDatetime <= new Date()) throw new Error('SLOT_UNAVAILABLE')

      const oldSlotRef = adminDb.collection('slots').doc(apptData.slotId)
      const existingDatetimeQuery = adminDb
        .collection('appointments')
        .where('slotDatetime', '==', newDatetimeTs)
        .where('status', 'in', ['pending', 'accepted'])
        .limit(2)

      const [oldSlotSnap, newLockSnap, existingDatetimeSnap] = await Promise.all([
        tx.get(oldSlotRef),
        tx.get(slotLockRef(newDatetimeTs)),
        tx.get(existingDatetimeQuery),
      ])

      if (newLockSnap.exists) throw new Error('SLOT_UNAVAILABLE')
      if (existingDatetimeSnap.docs.some(d => d.id !== doc.id)) throw new Error('SLOT_UNAVAILABLE')

      // ── ESCRITURAS ──
      releaseSlotLock(tx, oldDatetime)
      createSlotLock(tx, newDatetimeTs, doc.id)
      if (oldSlotSnap.exists) {
        tx.update(oldSlotRef, { available: true, bookedBy: null, heldUntil: null })
      }
      tx.update(newSlotRef, { available: false, bookedBy: doc.id, heldUntil: null })

      tx.update(apptRef, {
        slotId:       newSlotId,
        slotDatetime: newDatetimeTs,
        updatedAt:    FieldValue.serverTimestamp(),
        rescheduledBy: 'client',
        calendarSyncFailed: false,
        reminder24Sent: false,
        reminder2Sent:  false,
        clientConfirmed: false,
        clientConfirmedAt: FieldValue.delete(),
        scheduledEmails: FieldValue.delete(),
      })

      previousSlotId = apptData.slotId
      wasAccepted    = apptData.status === 'accepted'
      previousScheduledEmails = apptData.scheduledEmails ?? null

      updatedAppt = {
        id:           doc.id,
        slotId:       newSlotId,
        slotDatetime: newDatetime,
        appointmentType: normalizeAppointmentType(apptData.appointmentType),
        name:         apptData.name,
        email:        apptData.email,
        phone:        apptData.phone,
        notes:        apptData.notes,
        productType:  apptData.productType,
        budgetRange:  apptData.budgetRange,
        lookingFor:   apptData.lookingFor,
        engagementBrief: apptData.engagementBrief ?? {},
        identificationUrl: apptData.identificationUrl,
        // Si estaba accepted se MANTIENE accepted; pending sigue pending.
        status:       apptData.status,
        confirmationCode: apptData.confirmationCode,
        cancelToken:  apptData.cancelToken,
        reminder24Sent: false,
        reminder2Sent:  false,
        googleCalendarEventId: apptData.googleCalendarEventId ?? null,
        meetingUrl: apptData.meetingUrl ?? null,
        meetingProvider: apptData.meetingProvider ?? null,
        meetingInstructions: apptData.meetingInstructions ?? null,
        createdAt:    (apptData.createdAt as Timestamp).toDate(),
      }
    })

    // Cancela en Resend los recordatorios programados del horario anterior y,
    // si la cita sigue aceptada, programa los del nuevo horario (los ids se
    // guardan en el doc). Nunca lanza; el .catch es cinturón y tirantes.
    after((async () => {
      if (wasAccepted) {
        await syncScheduledReminderEmails(updatedAppt!, previousScheduledEmails)
      } else {
        await cancelScheduledReminderEmails(previousScheduledEmails)
      }
    })().catch(err => console.error('Scheduled reminders resync failed (non-fatal):', err)))
    after(sendRescheduleNotice(updatedAppt!).catch(err =>
      console.error('Reschedule email failed (non-fatal):', err)
    ))
    after(logAppointmentEvent({
      appointmentId: doc.id,
      action: 'rescheduled',
      actor: 'client',
      summary: 'Cita reagendada por la clienta desde su página de estado',
      metadata: { newSlotId, previousSlotId },
    }).catch(err => console.error('Appointment event log failed:', err)))

    let calendarSyncFailed = false
    // Solo las citas aceptadas tienen evento en el calendario; para una
    // pendiente crearlo aquí lo inventaría antes de la decisión del equipo.
    if (wasAccepted) {
      try {
        await updateAppointmentCalendarEvent(updatedAppt!)
      } catch (err) {
        console.error('GCal update failed for client reschedule (non-fatal):', err)
        calendarSyncFailed = true
        await doc.ref.update({ calendarSyncFailed: true }).catch(() => {})
        after(sendCalendarError(updatedAppt!, err instanceof Error ? err.message : String(err)).catch(() => {}))
      }
    }

    const appt = updatedAppt! as Appointment
    return NextResponse.json({
      ok: true,
      ...(calendarSyncFailed ? { calendarSyncFailed: true } : {}),
      appointment: {
        id:               appt.id,
        status:           appt.status,
        slotId:           appt.slotId,
        slotDatetime:     appt.slotDatetime.toISOString(),
        confirmationCode: appt.confirmationCode,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'APPT_NOT_FOUND')     return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    if (msg === 'SLOT_NOT_FOUND')     return NextResponse.json({ error: 'El horario seleccionado ya no existe' }, { status: 404 })
    if (msg === 'NOT_RESCHEDULABLE')  return NextResponse.json({ error: 'Esta cita ya no se puede reagendar' }, { status: 409 })
    if (msg === 'TOO_LATE')           return NextResponse.json({ error: 'Los cambios se aceptan hasta 12 horas antes de tu cita. Escríbenos y con gusto te ayudamos.' }, { status: 409 })
    if (msg === 'SAME_SLOT')          return NextResponse.json({ error: 'Ese ya es el horario de tu cita' }, { status: 409 })
    if (msg === 'SLOT_UNAVAILABLE')   return NextResponse.json({ error: 'El horario ya no está disponible' }, { status: 409 })
    if (msg === 'SLOT_TYPE_MISMATCH') return NextResponse.json({ error: 'El horario no corresponde al tipo de cita' }, { status: 409 })
    // tx.create sobre un lock existente → ALREADY_EXISTS (gRPC code 6)
    if (typeof (err as { code?: unknown })?.code === 'number' && (err as { code?: number }).code === 6) {
      return NextResponse.json({ error: 'El horario ya no está disponible' }, { status: 409 })
    }
    console.error('POST /api/reschedule/[token]', err)
    return NextResponse.json({ error: 'Error al reagendar la cita' }, { status: 500 })
  }
}
