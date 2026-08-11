import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { adminDb } from './firebase-admin'
import { sendStatusUpdate, syncScheduledReminderEmails, sendCalendarError } from './email'
import { createAppointmentCalendarEvent } from './google-calendar'
import { createSlotLock } from './slot-locks'
import { releaseExpiredHolds } from './holds'
import { logAppointmentEvent } from './appointment-events'
import { getBlockedDateSet, businessDateKey } from './blocked-dates'
import { generateCode, phoneDigits, sanitize, BUSINESS_TZ } from './utils'
import { mapAppointment } from './appointment-decision'
import type { AppointmentType } from '@/types'

/* ============================================================
   Cita creada a mano por el equipo (clienta frecuente por WhatsApp)
   ============================================================
   Nace ACEPTADA porque el acuerdo ya se cerró en el chat: el correo de confirmación
   con su fecha, su código y el .ics sale de inmediato, y los recordatorios de 24h y 2h
   quedan programados igual que en cualquier otra cita.

   Por qué NO se reusa applyAppointmentDecision: esa función exige identificación para
   aceptar una cita de showroom (`MISSING_IDENTIFICATION`) y aquí, a propósito, no la hay.
   Lo que sí se reusa, literalmente, es todo lo que viene DESPUÉS de aceptar —correo,
   bitácora, recordatorios programados y alta en Google Calendar— para que una cita creada
   a mano sea indistinguible de una aceptada por el flujo normal.

   Diferencias deliberadas con /api/booking (el flujo público):
   · sin identificación, sin brief de preferencias y sin invitados;
   · no la frena la pausa de agenda ni el límite por IP: quien la crea ya está autenticado;
   · un día bloqueado NO la impide, pero se devuelve un aviso para que el equipo lo vea.
     Bloquearla sería tratar al dueño como al público: si agenda en un día bloqueado suele
     ser una excepción decidida, no un error — pero conviene que lo sepa. */

export interface ManualAppointmentResult {
  ok: true
  id: string
  confirmationCode: string
  slotDatetime: Date
  /** El día está bloqueado en la agenda: la cita se creó igual, pero hay que avisarlo. */
  blockedDateWarning?: string
  /** El alta en Google Calendar falló; la cita existe y el correo salió. */
  calendarSyncFailed?: boolean
}

export type ManualAppointmentOutcome =
  | ManualAppointmentResult
  | { ok: false; status: number; error: string }

export async function createManualAppointment(opts: {
  adminEmail: string
  appointmentType: AppointmentType
  name: string
  email: string
  phone: string
  notes?: string
  /** Horario ya publicado y libre. Excluyente con date+time. */
  slotId?: string
  /** Hora de pared de CDMX. Excluyente con slotId. */
  date?: string
  time?: string
  /** Solo para video consulta: el enlace se guarda al crear, no después (ver schemas.ts). */
  meetingUrl?: string
  meetingInstructions?: string
}): Promise<ManualAppointmentOutcome> {
  const { adminEmail, appointmentType, name, email, phone, notes, slotId, date, time,
          meetingUrl, meetingInstructions } = opts
  const esVideo = appointmentType === 'video_engagement_rings'

  // Un hold vencido de una reserva pública abandonada no debe estorbar al equipo.
  await releaseExpiredHolds().catch(() => {})

  const confirmationCode = generateCode(8)
  const cancelToken      = generateCode(32)
  const apptRef          = adminDb.collection('appointments').doc()
  const appointmentId    = apptRef.id

  // Falla abierta (conjunto vacío) igual que en /api/booking: un tropiezo leyendo
  // los días bloqueados nunca debe impedir agendar.
  const blockedDates = await getBlockedDateSet().catch(() => new Set<string>())

  let slotDatetime: Date | null = null
  let slotRefId = ''
  let blockedDateWarning: string | undefined

  try {
    await adminDb.runTransaction(async tx => {
      /* ---------- TODAS LAS LECTURAS PRIMERO ----------
         Firestore prohíbe leer después de escribir dentro de una transacción, y esa
         regla ya tumbó /api/slots en producción una vez. No mover nada de aquí abajo. */
      // Firestore reintenta las transacciones solo: todo lo que este cuerpo escriba
      // en variables de FUERA tiene que recalcularse desde cero en cada intento, o el
      // segundo intento arrastra la conclusión del primero.
      blockedDateWarning = undefined

      const usaHorarioPublicado = Boolean(slotId)
      let slotRef: FirebaseFirestore.DocumentReference
      // ¿el horario ya existe como documento, o hay que crearlo?
      let horarioNuevo = false

      if (usaHorarioPublicado) {
        slotRef = adminDb.collection('slots').doc(slotId!)
        const slotSnap = await tx.get(slotRef)
        if (!slotSnap.exists) throw new Error('SLOT_NOT_FOUND')
        const slotData = slotSnap.data()!
        slotDatetime = (slotData.datetime as Timestamp).toDate()
        if (!slotData.available) throw new Error('SLOT_UNAVAILABLE')
        if (String(slotData.slotType ?? 'showroom') !== appointmentType) {
          throw new Error('SLOT_TYPE_MISMATCH')
        }
      } else {
        const dt = fromZonedTime(`${date}T${time}:00`, BUSINESS_TZ)
        if (isNaN(dt.getTime())) throw new Error('BAD_DATETIME')
        slotDatetime = dt

        /* El id del horario es el epoch ms de su datetime. NO es cosmético: el generador
           semanal (lib/slot-generator, detrás del botón «Publicar semanas») deduplica
           SOLO por id, no por una consulta de datetime. Con un id aleatorio, la siguiente
           publicación creaba un SEGUNDO documento para ese mismo minuto marcado libre: el
           público lo veía disponible, llenaba todo el formulario, subía su identificación
           y hasta el final chocaba — y el duplicado se quedaba ahí para la siguiente. */
        const canonicalRef  = adminDb.collection('slots').doc(String(dt.getTime()))
        const canonicalSnap = await tx.get(canonicalRef)

        if (canonicalSnap.exists) {
          slotRef = canonicalRef
          if (!canonicalSnap.data()!.available) throw new Error('SLOT_UNAVAILABLE')
        } else {
          /* Si ya hay un horario a esa misma hora con otro id (los creados por esta
             misma función antes del fix), se REUSA en vez de crear otro. Creando uno
             nuevo a ciegas quedaban dos documentos para el mismo minuto. */
          const mismaHora = await tx.get(
            adminDb.collection('slots')
              .where('datetime', '==', Timestamp.fromDate(dt))
              .limit(1),
          )
          if (mismaHora.empty) {
            slotRef = canonicalRef
            horarioNuevo = true
          } else {
            slotRef = mismaHora.docs[0].ref
            if (!mismaHora.docs[0].data().available) throw new Error('SLOT_UNAVAILABLE')
          }
        }
      }
      slotRefId = slotRef.id

      if (slotDatetime <= new Date()) throw new Error('SLOT_IN_PAST')

      // Choque con otra cita viva a la misma hora. La lectura entra en el snapshot de la
      // transacción, así que dos altas simultáneas no se pueden colar las dos.
      const chocaQuery = adminDb
        .collection('appointments')
        .where('slotDatetime', '==', Timestamp.fromDate(slotDatetime))
        .where('status', 'in', ['pending', 'accepted'])
        .limit(1)
      const chocaSnap = await tx.get(chocaQuery)
      if (!chocaSnap.empty) throw new Error('SLOT_TAKEN')

      if (blockedDates.has(businessDateKey(slotDatetime))) {
        blockedDateWarning = 'Ese día está bloqueado en la agenda. La cita se creó de todos modos.'
      }

      /* ---------- A PARTIR DE AQUÍ, SOLO ESCRITURAS ---------- */

      // Candado por minuto exacto: tx.create truena si ya existe, que es justo la
      // protección contra dos citas a la misma hora por caminos distintos.
      createSlotLock(tx, slotDatetime, appointmentId)

      if (!horarioNuevo) {
        // Horario que ya existía (publicado, o uno de la misma hora que se reusa):
        // se marca ocupado para que no aparezca libre en el calendario público.
        tx.update(slotRef, { available: false, heldUntil: null, bookedBy: appointmentId })
      } else {
        // Hora libre sin horario previo: se crea ya ocupado.
        tx.set(slotRef, {
          datetime:  Timestamp.fromDate(slotDatetime),
          available: false,
          slotType:  appointmentType,
          heldUntil: null,
          bookedBy:  appointmentId,
          createdAt: FieldValue.serverTimestamp(),
          createdVia: 'manual_admin',
        })
      }

      tx.set(apptRef, {
        slotId:       slotRef.id,
        slotDatetime: Timestamp.fromDate(slotDatetime),
        appointmentType,
        name:         sanitize(name),
        email:        email.toLowerCase().trim(),
        phone:        phone.trim(),
        phoneDigits:  phoneDigits(phone),
        notes:        sanitize(notes ?? ''),
        productType:  '',
        budgetRange:  '',
        lookingFor:   '',
        whatsapp:     true,          // por definición: la clienta escribió por WhatsApp
        ...(esVideo ? {
          meetingUrl:          (meetingUrl ?? '').trim() || null,
          meetingInstructions: sanitize(meetingInstructions ?? ''),
        } : {}),
        identificationUrl: null,     // a propósito: se omite en el alta manual
        status:            'accepted',
        confirmationCode,
        cancelToken,
        reminder24Sent:    false,
        reminder2Sent:     false,
        guestCount:        0,
        guestsAllVerified: true,
        clientConfirmed:   false,
        decidedBy:         adminEmail,
        decidedAt:         FieldValue.serverTimestamp(),
        createdVia:        'manual_admin',
        createdAt:         FieldValue.serverTimestamp(),
        updatedAt:         FieldValue.serverTimestamp(),
      })
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'SLOT_NOT_FOUND')     return { ok: false, status: 404, error: 'Ese horario ya no existe.' }
    if (msg === 'SLOT_UNAVAILABLE')   return { ok: false, status: 409, error: 'Ese horario ya está ocupado.' }
    if (msg === 'SLOT_TYPE_MISMATCH') return { ok: false, status: 409, error: 'Ese horario es de otro tipo de cita.' }
    if (msg === 'SLOT_IN_PAST')       return { ok: false, status: 422, error: 'Esa fecha y hora ya pasaron.' }
    if (msg === 'BAD_DATETIME')       return { ok: false, status: 422, error: 'Fecha u hora inválida.' }
    if (msg === 'SLOT_TAKEN')         return { ok: false, status: 409, error: 'Ya hay una cita a esa hora.' }
    // El candado por minuto (tx.create) truena con ALREADY_EXISTS cuando otra cita
    // ganó la carrera; para quien opera es lo mismo que "ya hay una cita a esa hora".
    // Se mira el CÓDIGO gRPC (6 = ALREADY_EXISTS) además del texto, igual que
    // /api/booking: el mensaje cambia entre versiones del SDK, el código no.
    if ((err as { code?: unknown })?.code === 6 || /ALREADY_EXISTS|already exists/i.test(msg)) {
      return { ok: false, status: 409, error: 'Ya hay una cita a esa hora.' }
    }
    console.error('createManualAppointment', err)
    return { ok: false, status: 500, error: 'No se pudo crear la cita.' }
  }

  const appointment = mapAppointment(appointmentId, {
    slotId: slotRefId,
    slotDatetime: Timestamp.fromDate(slotDatetime!),
    appointmentType,
    name: sanitize(name),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    notes: sanitize(notes ?? ''),
    identificationUrl: null,
    confirmationCode,
    cancelToken,
    reminder24Sent: false,
    reminder2Sent: false,
    createdAt: Timestamp.now(),
    ...(esVideo ? {
      meetingUrl:          (meetingUrl ?? '').trim() || null,
      meetingInstructions: sanitize(meetingInstructions ?? ''),
    } : {}),
  }, 'accepted')

  /* Todo lo que sigue es "mejor esfuerzo": la cita YA existe y es válida. Si el correo o
     el calendario fallan, no se tira la cita — se reporta y el equipo reenvía desde la
     ficha, que ya tiene ese botón. */
  await sendStatusUpdate(appointment, 'accept')
    .catch(err => console.error('Correo de confirmación falló (no fatal):', err))

  await logAppointmentEvent({
    appointmentId,
    action: 'booking_created',
    actor: adminEmail,
    summary: 'Cita creada a mano por el equipo',
    metadata: {
      origen: 'manual_admin',
      horario: slotId ? 'publicado' : 'hora libre',
      diaBloqueado: Boolean(blockedDateWarning),
    },
  }).catch(err => console.error('Bitácora de la cita falló:', err))

  await syncScheduledReminderEmails(appointment).catch(() => {})

  let calendarSyncFailed: boolean | undefined
  try {
    const googleCalendarEventId = await createAppointmentCalendarEvent(appointment)
    await adminDb.collection('appointments').doc(appointmentId).update({ googleCalendarEventId })
  } catch (err) {
    console.error('Google Calendar falló (no fatal):', err)
    calendarSyncFailed = true
    await adminDb.collection('appointments').doc(appointmentId)
      .update({ calendarSyncFailed: true }).catch(() => {})
    await sendCalendarError(appointment, err instanceof Error ? err.message : String(err)).catch(() => {})
  }

  return {
    ok: true,
    id: appointmentId,
    confirmationCode,
    slotDatetime: slotDatetime!,
    ...(blockedDateWarning ? { blockedDateWarning } : {}),
    ...(calendarSyncFailed ? { calendarSyncFailed } : {}),
  }
}
