import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { retryEmailOutbox, sendReminder, sendReminder24Confirm, sendGuestReminder } from '@/lib/email'
import {
  sendDailyTeamDigest,
  sendPostVisitThanks,
  sendPostVisitRescue,
  sendWaitlistSlotOpen,
  type DigestTodayRow,
  type DigestUnconfirmedRow,
  type DigestPendingRow,
} from '@/lib/email-daily'
import { expirePendingGuests } from '@/lib/guests'
import { cleanupOrphanedIdentifications } from '@/lib/storage-cleanup'
import { retryFailedCalendarSyncs } from '@/lib/google-calendar'
import { formatWhatsAppUrl, appointmentTypeLabels, normalizeAppointmentType, isVideoEngagement } from '@/lib/commercial'
import { getBlockedDateSet, businessDateKey } from '@/lib/blocked-dates'
import { BUSINESS_TZ, formatTime } from '@/lib/utils'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

// Resend permite 5 req/s; los bloques que mandan en lote pausan entre envíos.
const EMAIL_PAUSE_MS = 250
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Etiqueta corta CDMX para listas del digest, p.ej. "jue 17 de jul · 11:00".
function shortDayLabel(d: Date): string {
  return formatInTimeZone(d, BUSINESS_TZ, "EEE d 'de' MMM · HH:mm", { locale: es })
}

// Called by Vercel cron daily at 8am CST (see vercel.json: "0 14 * * *")
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let sent24        = 0
  let sent2         = 0
  const errors: string[] = []

  try {
    // 24h confirmation reminders: appointments 12–36h from now (covers all of tomorrow for daily cron)
    const from24 = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const to24   = new Date(now.getTime() + 36 * 60 * 60 * 1000)

    const snap24 = await adminDb
      .collection('appointments')
      .where('status', '==', 'accepted')
      .where('slotDatetime', '>=', Timestamp.fromDate(from24))
      .where('slotDatetime', '<=', Timestamp.fromDate(to24))
      .where('reminder24Sent', '==', false)
      .get()

    for (const doc of snap24.docs) {
      const d = doc.data()
      const appt: Appointment = {
        id: doc.id,
        slotId: d.slotId,
        slotDatetime: (d.slotDatetime as Timestamp).toDate(),
        appointmentType: normalizeAppointmentType(d.appointmentType),
        name: d.name,
        email: d.email,
        phone: d.phone,
        notes: d.notes,
        productType: d.productType,
        budgetRange: d.budgetRange,
        lookingFor: d.lookingFor,
        engagementBrief: d.engagementBrief ?? {},
        identificationUrl: d.identificationUrl,
        status: d.status,
        confirmationCode: d.confirmationCode,
        cancelToken: d.cancelToken,
        reminder24Sent: d.reminder24Sent,
        reminder2Sent: d.reminder2Sent,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
        meetingUrl: d.meetingUrl ?? null,
        meetingProvider: d.meetingProvider ?? null,
        meetingInstructions: d.meetingInstructions ?? null,
        createdAt: (d.createdAt as Timestamp).toDate(),
      }
      // Mark before send for idempotency; rollback on failure so the next cron retries
      await doc.ref.update({ reminder24Sent: true, updatedAt: FieldValue.serverTimestamp() })
      try {
        await sendReminder24Confirm(appt)
        sent24++
      } catch (err) {
        await doc.ref.update({ reminder24Sent: false })
        errors.push(`24h reminder failed for ${doc.id}: ${err}`)
      }
    }

    // 2h reminders: appointments 1h–12h from now (covers all confirmed same-day appointments for daily cron)
    const from2 = new Date(now.getTime() +  1 * 60 * 60 * 1000)
    const to2   = new Date(now.getTime() + 12 * 60 * 60 * 1000)

    const snap2 = await adminDb
      .collection('appointments')
      .where('status', '==', 'accepted')
      .where('slotDatetime', '>=', Timestamp.fromDate(from2))
      .where('slotDatetime', '<=', Timestamp.fromDate(to2))
      .where('reminder2Sent', '==', false)
      .get()

    for (const doc of snap2.docs) {
      const d = doc.data()
      const appt: Appointment = {
        id: doc.id,
        slotId: d.slotId,
        slotDatetime: (d.slotDatetime as Timestamp).toDate(),
        appointmentType: normalizeAppointmentType(d.appointmentType),
        name: d.name,
        email: d.email,
        phone: d.phone,
        notes: d.notes,
        productType: d.productType,
        budgetRange: d.budgetRange,
        lookingFor: d.lookingFor,
        engagementBrief: d.engagementBrief ?? {},
        identificationUrl: d.identificationUrl,
        status: d.status,
        confirmationCode: d.confirmationCode,
        cancelToken: d.cancelToken,
        reminder24Sent: d.reminder24Sent,
        reminder2Sent: d.reminder2Sent,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
        meetingUrl: d.meetingUrl ?? null,
        meetingProvider: d.meetingProvider ?? null,
        meetingInstructions: d.meetingInstructions ?? null,
        createdAt: (d.createdAt as Timestamp).toDate(),
      }
      await doc.ref.update({ reminder2Sent: true, updatedAt: FieldValue.serverTimestamp() })
      try {
        await sendReminder(appt, 2)
        sent2++
      } catch (err) {
        await doc.ref.update({ reminder2Sent: false })
        errors.push(`2h reminder failed for ${doc.id}: ${err}`)
      }
    }

    // Guest reminders — 48h window: 47h–49h from now
    let sentGuest48  = 0
    let sentGuest24  = 0
    let expiredCount = 0
    let idCleanup: Awaited<ReturnType<typeof cleanupOrphanedIdentifications>> | null = null
    let emailRetry: Awaited<ReturnType<typeof retryEmailOutbox>> | null = null

    const from48g = new Date(now.getTime() + 36 * 60 * 60 * 1000)
    const to48g   = new Date(now.getTime() + 60 * 60 * 60 * 1000)

    const appts48 = await adminDb
      .collection('appointments')
      .where('status', '==', 'accepted')
      .where('slotDatetime', '>=', Timestamp.fromDate(from48g))
      .where('slotDatetime', '<=', Timestamp.fromDate(to48g))
      .get()

    for (const apptDoc of appts48.docs) {
      const apptData = apptDoc.data()
      const slotDatetime = (apptData.slotDatetime as Timestamp).toDate()
      const apptForEmail: Appointment = {
        id: apptDoc.id,
        slotId: apptData.slotId,
        slotDatetime,
        appointmentType: normalizeAppointmentType(apptData.appointmentType),
        name: apptData.name,
        email: apptData.email,
        phone: apptData.phone,
        notes: apptData.notes,
        productType: apptData.productType,
        budgetRange: apptData.budgetRange,
        lookingFor: apptData.lookingFor,
        engagementBrief: apptData.engagementBrief ?? {},
        identificationUrl: apptData.identificationUrl,
        status: apptData.status,
        confirmationCode: apptData.confirmationCode,
        cancelToken: apptData.cancelToken,
        reminder24Sent: apptData.reminder24Sent ?? false,
        reminder2Sent: apptData.reminder2Sent ?? false,
        googleCalendarEventId: apptData.googleCalendarEventId ?? null,
        meetingUrl: apptData.meetingUrl ?? null,
        meetingProvider: apptData.meetingProvider ?? null,
        meetingInstructions: apptData.meetingInstructions ?? null,
        createdAt: (apptData.createdAt as Timestamp).toDate(),
      }

      const guestsSnap = await apptDoc.ref
        .collection('guests')
        .where('status', '==', 'pending')
        .where('reminder48Sent', '==', false)
        .get()

      for (const gDoc of guestsSnap.docs) {
        const gData = gDoc.data()
        await gDoc.ref.update({ reminder48Sent: true })
        try {
          await sendGuestReminder({
            guest: { name: gData.name, email: gData.email, verifyToken: gData.verifyToken },
            appointment: apptForEmail,
            hoursAhead: 48,
          })
          sentGuest48++
        } catch (err) {
          await gDoc.ref.update({ reminder48Sent: false })
          errors.push(`48h guest reminder failed for ${gDoc.id}: ${err}`)
        }
      }
    }

    // Expire guests whose verification deadline (slotDatetime - 24h) has already passed.
    // Run BEFORE sending 24h reminders so expired guests are skipped by the pending query.
    const expiryBefore = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    try {
      expiredCount = await expirePendingGuests(expiryBefore)
    } catch (err) {
      errors.push(`Guest expiration failed: ${err}`)
    }

    // Guest reminders — 24h window: 23h–25h from now (runs after expiration so expired guests are excluded)
    const from24g = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const to24g   = new Date(now.getTime() + 36 * 60 * 60 * 1000)

    const appts24g = await adminDb
      .collection('appointments')
      .where('status', '==', 'accepted')
      .where('slotDatetime', '>=', Timestamp.fromDate(from24g))
      .where('slotDatetime', '<=', Timestamp.fromDate(to24g))
      .get()

    for (const apptDoc of appts24g.docs) {
      const apptData = apptDoc.data()
      const slotDatetime = (apptData.slotDatetime as Timestamp).toDate()
      const apptForEmail: Appointment = {
        id: apptDoc.id,
        slotId: apptData.slotId,
        slotDatetime,
        appointmentType: normalizeAppointmentType(apptData.appointmentType),
        name: apptData.name,
        email: apptData.email,
        phone: apptData.phone,
        notes: apptData.notes,
        productType: apptData.productType,
        budgetRange: apptData.budgetRange,
        lookingFor: apptData.lookingFor,
        engagementBrief: apptData.engagementBrief ?? {},
        identificationUrl: apptData.identificationUrl,
        status: apptData.status,
        confirmationCode: apptData.confirmationCode,
        cancelToken: apptData.cancelToken,
        reminder24Sent: apptData.reminder24Sent ?? false,
        reminder2Sent: apptData.reminder2Sent ?? false,
        googleCalendarEventId: apptData.googleCalendarEventId ?? null,
        meetingUrl: apptData.meetingUrl ?? null,
        meetingProvider: apptData.meetingProvider ?? null,
        meetingInstructions: apptData.meetingInstructions ?? null,
        createdAt: (apptData.createdAt as Timestamp).toDate(),
      }

      const guestsSnap = await apptDoc.ref
        .collection('guests')
        .where('status', '==', 'pending')
        .where('reminder24Sent', '==', false)
        .get()

      for (const gDoc of guestsSnap.docs) {
        const gData = gDoc.data()
        await gDoc.ref.update({ reminder24Sent: true })
        try {
          await sendGuestReminder({
            guest: { name: gData.name, email: gData.email, verifyToken: gData.verifyToken },
            appointment: apptForEmail,
            hoursAhead: 24,
          })
          sentGuest24++
        } catch (err) {
          await gDoc.ref.update({ reminder24Sent: false })
          errors.push(`24h guest reminder failed for ${gDoc.id}: ${err}`)
        }
      }
    }

    // ————————————————————————————————————————————————————————————————
    // Bloques diarios enriquecidos. Cada uno con su propio try/catch para
    // que un fallo no tumbe a los demás, y con flags/documentos de control
    // idempotentes (el cron puede reejecutarse a mano sin duplicar correos).
    // Corren ANTES de retryEmailOutbox para que un envío fallido tenga un
    // primer reintento dentro de esta misma corrida.
    // ————————————————————————————————————————————————————————————————

    // Fronteras del día en CDMX (mismo criterio que admin/hoy; CDMX es UTC-6
    // fijo, pero se recalcula la clave del día para no depender de eso).
    const todayKey      = formatInTimeZone(now, BUSINESS_TZ, 'yyyy-MM-dd')
    const dayStart      = fromZonedTime(`${todayKey}T00:00:00`, BUSINESS_TZ)
    const tomorrowKey   = formatInTimeZone(new Date(dayStart.getTime() + 36 * 3_600_000), BUSINESS_TZ, 'yyyy-MM-dd')
    const tomorrowStart = fromZonedTime(`${tomorrowKey}T00:00:00`, BUSINESS_TZ)
    const yesterdayKey  = formatInTimeZone(new Date(dayStart.getTime() - 12 * 3_600_000), BUSINESS_TZ, 'yyyy-MM-dd')
    const yesterdayStart = fromZonedTime(`${yesterdayKey}T00:00:00`, BUSINESS_TZ)
    // Horizonte del digest: hoy + próximos 2 días.
    const horizonKey    = formatInTimeZone(new Date(dayStart.getTime() + 84 * 3_600_000), BUSINESS_TZ, 'yyyy-MM-dd')
    const horizonEnd    = fromZonedTime(`${horizonKey}T00:00:00`, BUSINESS_TZ)

    // ——— 1. Digest matutino al equipo ———
    const digest: { sent: boolean; recipients: number; skipped: string | null } = { sent: false, recipients: 0, skipped: null }
    try {
      // Una sola query (misma forma e índice que admin/hoy: status in + rango
      // de slotDatetime + orderBy); el split por sección se hace en memoria.
      const digestSnap = await adminDb
        .collection('appointments')
        .where('status', 'in', ['pending', 'accepted'])
        .where('slotDatetime', '>=', Timestamp.fromDate(dayStart))
        .where('slotDatetime', '<', Timestamp.fromDate(horizonEnd))
        .orderBy('slotDatetime')
        .get()

      const today: DigestTodayRow[] = []
      const unconfirmed: DigestUnconfirmedRow[] = []
      const pending: DigestPendingRow[] = []

      for (const doc of digestSnap.docs) {
        const d = doc.data()
        const dt = (d.slotDatetime as Timestamp).toDate()
        const type = normalizeAppointmentType(d.appointmentType)
        const name = String(d.name ?? '')
        if (d.status === 'pending') {
          pending.push({ id: doc.id, dateLabel: shortDayLabel(dt), name, typeLabel: appointmentTypeLabels[type] })
        } else if (dt < tomorrowStart) {
          today.push({
            time: formatTime(dt),
            name,
            typeLabel: appointmentTypeLabels[type],
            isVideo: isVideoEngagement(type),
            clientConfirmed: d.clientConfirmed === true,
            hasIdentification: Boolean(d.identificationUrl),
          })
        } else if (d.clientConfirmed !== true) {
          unconfirmed.push({
            dateLabel: shortDayLabel(dt),
            name,
            typeLabel: appointmentTypeLabels[type],
            whatsappUrl: formatWhatsAppUrl(String(d.phone ?? ''), name),
          })
        }
      }

      if (today.length + unconfirmed.length + pending.length === 0) {
        digest.skipped = 'sin_contenido'
      } else {
        // Documento de control por día: create() falla si ya existe, así una
        // reejecución manual del cron no duplica el digest.
        const controlRef = adminDb.collection('dailyDigest').doc(todayKey)
        try {
          await controlRef.create({
            status: 'sending',
            counts: { today: today.length, unconfirmed: unconfirmed.length, pending: pending.length },
            createdAt: FieldValue.serverTimestamp(),
          })
        } catch (err) {
          if ((err as { code?: number }).code === 6) { // ALREADY_EXISTS
            digest.skipped = 'ya_enviado'
          } else {
            throw err
          }
        }
        if (!digest.skipped) {
          const dayLabelRaw = formatInTimeZone(now, BUSINESS_TZ, "EEEE d 'de' MMMM", { locale: es })
          const dayLabel = dayLabelRaw.charAt(0).toUpperCase() + dayLabelRaw.slice(1)
          const result = await sendDailyTeamDigest({ dayLabel, dateKey: todayKey, today, unconfirmed, pending })
          digest.sent = result.sent
          digest.recipients = result.recipients
          await controlRef.update({
            status: result.sent ? 'sent' : 'no_recipients',
            recipients: result.recipients,
            sentAt: FieldValue.serverTimestamp(),
          }).catch(() => {})
        }
      }
    } catch (err) {
      errors.push(`Digest matutino failed: ${err}`)
    }

    // ——— 2. Post-cita (citas de AYER con asistencia registrada) ———
    let postVisitThanks = 0
    let postVisitRescue = 0
    try {
      // Misma forma de query (status == + rango) que ya usa este cron; el
      // filtro por attended/postVisitEmailSent va en memoria porque los docs
      // viejos no tienen esos campos y una igualdad en Firestore los omitiría.
      const snapYesterday = await adminDb
        .collection('appointments')
        .where('status', '==', 'accepted')
        .where('slotDatetime', '>=', Timestamp.fromDate(yesterdayStart))
        .where('slotDatetime', '<', Timestamp.fromDate(dayStart))
        .get()

      const candidates = snapYesterday.docs
        .filter(doc => {
          const d = doc.data()
          return typeof d.attended === 'boolean' && d.postVisitEmailSent !== true
        })
        .slice(0, 20) // máx ~20 por corrida; el resto queda para la siguiente

      for (const doc of candidates) {
        const d = doc.data()
        const email = String(d.email ?? '').trim()
        if (!email) continue
        // Flag antes de enviar (patrón reminder24Sent); rollback si falla para
        // que la siguiente corrida lo reintente.
        await doc.ref.update({ postVisitEmailSent: true, updatedAt: FieldValue.serverTimestamp() })
        try {
          if (d.attended === true) {
            await sendPostVisitThanks({
              appointmentId: doc.id,
              name: String(d.name ?? ''),
              email,
              isVideo: isVideoEngagement(d.appointmentType),
            })
            postVisitThanks++
          } else {
            await sendPostVisitRescue({
              appointmentId: doc.id,
              name: String(d.name ?? ''),
              email,
              confirmationCode: String(d.confirmationCode ?? ''),
              isVideo: isVideoEngagement(d.appointmentType),
            })
            postVisitRescue++
          }
        } catch (err) {
          await doc.ref.update({ postVisitEmailSent: false })
          errors.push(`Post-cita failed for ${doc.id}: ${err}`)
        }
        await sleep(EMAIL_PAUSE_MS)
      }
    } catch (err) {
      errors.push(`Post-cita block failed: ${err}`)
    }

    // ——— 3. Waitlist viva ———
    let waitlistNotified = 0
    try {
      const wlSnap = await adminDb
        .collection('availabilityWaitlist')
        .where('status', '==', 'new')
        .limit(60)
        .get()

      if (!wlSnap.empty) {
        // Slots realmente reservables: disponibles, futuros y fuera de fechas
        // bloqueadas (mismos filtros que el /api/slots público).
        const slotsEnd = new Date(now.getTime() + 45 * 86_400_000)
        const [slotsSnap, blocked] = await Promise.all([
          adminDb
            .collection('slots')
            .where('available', '==', true)
            .where('datetime', '>=', Timestamp.fromDate(now))
            .where('datetime', '<', Timestamp.fromDate(slotsEnd))
            .orderBy('datetime')
            .limit(200)
            .get(),
          getBlockedDateSet(),
        ])
        const openSlots = slotsSnap.docs
          .map(doc => {
            const s = doc.data()
            return { datetime: (s.datetime as Timestamp).toDate(), slotType: normalizeAppointmentType(s.slotType) }
          })
          .filter(s => !blocked.has(businessDateKey(s.datetime)))

        let attempts = 0
        for (const doc of wlSnap.docs) {
          if (attempts >= 20) break // máx ~20 por corrida
          const d = doc.data()
          const email = String(d.email ?? '').trim()
          if (!email) continue
          const type = normalizeAppointmentType(d.appointmentType)
          // El formulario actual no captura fecha deseada, pero si el doc la
          // trae (entradas creadas a mano / versiones futuras) se respeta.
          const desiredKey = d.desiredDate instanceof Timestamp
            ? businessDateKey(d.desiredDate.toDate())
            : (typeof d.desiredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.desiredDate) ? d.desiredDate : null)
          const match = openSlots.find(s =>
            s.slotType === type && (!desiredKey || businessDateKey(s.datetime) === desiredKey))
          if (!match) continue

          attempts++
          // Marcar antes de enviar; rollback si falla (patrón reminder24Sent).
          // status 'notified' también la saca de la lista de "problemas" del panel.
          await doc.ref.update({
            status: 'notified',
            notified: true,
            notifiedAt: FieldValue.serverTimestamp(),
            notifiedSlotDatetime: Timestamp.fromDate(match.datetime),
            updatedAt: FieldValue.serverTimestamp(),
          })
          try {
            await sendWaitlistSlotOpen({
              entryId: doc.id,
              name: String(d.name ?? ''),
              email,
              appointmentType: type,
              slotDatetime: match.datetime,
            })
            waitlistNotified++
          } catch (err) {
            await doc.ref.update({
              status: 'new',
              notified: false,
              notifiedAt: FieldValue.delete(),
              notifiedSlotDatetime: FieldValue.delete(),
            })
            errors.push(`Waitlist notify failed for ${doc.id}: ${err}`)
          }
          await sleep(EMAIL_PAUSE_MS)
        }
      }
    } catch (err) {
      errors.push(`Waitlist block failed: ${err}`)
    }

    try {
      idCleanup = await cleanupOrphanedIdentifications()
    } catch (err) {
      errors.push(`ID cleanup failed: ${err}`)
    }

    try {
      emailRetry = await retryEmailOutbox()
    } catch (err) {
      errors.push(`Email retry failed: ${err}`)
    }

    let calendarRetry: Awaited<ReturnType<typeof retryFailedCalendarSyncs>> | null = null
    try {
      calendarRetry = await retryFailedCalendarSyncs()
      errors.push(...calendarRetry.errors.map(e => `Calendar retry: ${e}`))
    } catch (err) {
      errors.push(`Calendar retry failed: ${err}`)
    }

    await adminDb.collection('maintenanceRuns').add({
      type: 'daily_reminders',
      sent24,
      sent2,
      sentGuest48,
      sentGuest24,
      expiredCount,
      digest,
      postVisitThanks,
      postVisitRescue,
      waitlistNotified,
      idCleanup,
      emailRetry,
      calendarRetry,
      errors,
      ok: errors.length === 0,
      createdAt: Timestamp.now(),
    }).catch(err => {
      console.error('Unable to record reminders maintenance run:', err)
    })

    return NextResponse.json({ sent24, sent2, sentGuest48, sentGuest24, expiredCount, digest, postVisitThanks, postVisitRescue, waitlistNotified, idCleanup, emailRetry, calendarRetry, errors })
  } catch (err) {
    console.error('GET /api/reminders', err)
    return NextResponse.json({ error: 'Error en reminders' }, { status: 500 })
  }
}
