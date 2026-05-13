import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendReminder, sendReminder24Confirm, sendGuestReminder } from '@/lib/email'
import { expirePendingGuests } from '@/lib/guests'
import { sendAppointmentSms } from '@/lib/sms'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { formatDate, formatTime } from '@/lib/utils'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

// Local optional preferences shape (kept local — Agente 8 may extend the
// Appointment type with this contract). Defaults to false for both channels.
type ApptNotifPrefs = { sms?: boolean; whatsapp?: boolean } | undefined

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'

/**
 * Fire SMS + WhatsApp notifications in parallel with the email reminder.
 * Each channel is wrapped in its own try/catch so a failure in one channel
 * never blocks the others or the surrounding cron flow.
 */
async function fanOutPhoneReminder(
  appt: Appointment,
  prefs: ApptNotifPrefs,
  errors: string[],
): Promise<void> {
  const wantsSms = prefs?.sms === true
  const wantsWa = prefs?.whatsapp === true
  if (!wantsSms && !wantsWa) return

  const phone = appt.phone
  if (!phone) return

  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)
  const url = `${SITE_URL}/confirmar/${appt.cancelToken}`

  const tasks: Promise<unknown>[] = []
  if (wantsSms) {
    tasks.push(
      sendAppointmentSms({
        to: phone,
        template: 'reminder_24h',
        appointment: { name: appt.name, date: dateStr, time: timeStr, url, code: appt.confirmationCode },
      })
        .then(r => {
          if (!r.ok) errors.push(`24h SMS skip/fail for ${appt.id}: ${r.error}`)
        })
        .catch(err => {
          errors.push(`24h SMS threw for ${appt.id}: ${err}`)
        }),
    )
  }
  if (wantsWa) {
    tasks.push(
      sendWhatsAppMessage({
        to: phone,
        template: 'reminder_24h',
        vars: { name: appt.name, date: dateStr, time: timeStr, url, code: appt.confirmationCode },
      })
        .then(r => {
          if (!r.ok) errors.push(`24h WhatsApp skip/fail for ${appt.id}: ${r.error}`)
        })
        .catch(err => {
          errors.push(`24h WhatsApp threw for ${appt.id}: ${err}`)
        }),
    )
  }
  await Promise.all(tasks)
}

// Called by Vercel cron daily at 8am CST (see vercel.json: "0 14 * * *")
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
        name: d.name,
        email: d.email,
        phone: d.phone,
        notes: d.notes,
        identificationUrl: d.identificationUrl,
        status: d.status,
        confirmationCode: d.confirmationCode,
        cancelToken: d.cancelToken,
        reminder24Sent: d.reminder24Sent,
        reminder2Sent: d.reminder2Sent,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
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
      // SMS + WhatsApp fan-out (fire-and-forget per channel; opt-in via prefs).
      // We do NOT roll back reminder24Sent if these fail — email is the source of truth.
      const prefs = (d.preferences ?? d.notificationPreferences) as ApptNotifPrefs
      try {
        await fanOutPhoneReminder(appt, prefs, errors)
      } catch (err) {
        errors.push(`24h phone fan-out failed for ${doc.id}: ${err}`)
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
        name: d.name,
        email: d.email,
        phone: d.phone,
        notes: d.notes,
        identificationUrl: d.identificationUrl,
        status: d.status,
        confirmationCode: d.confirmationCode,
        cancelToken: d.cancelToken,
        reminder24Sent: d.reminder24Sent,
        reminder2Sent: d.reminder2Sent,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
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
        name: apptData.name,
        email: apptData.email,
        phone: apptData.phone,
        notes: apptData.notes,
        identificationUrl: apptData.identificationUrl,
        status: apptData.status,
        confirmationCode: apptData.confirmationCode,
        cancelToken: apptData.cancelToken,
        reminder24Sent: apptData.reminder24Sent ?? false,
        reminder2Sent: apptData.reminder2Sent ?? false,
        googleCalendarEventId: apptData.googleCalendarEventId ?? null,
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
        name: apptData.name,
        email: apptData.email,
        phone: apptData.phone,
        notes: apptData.notes,
        identificationUrl: apptData.identificationUrl,
        status: apptData.status,
        confirmationCode: apptData.confirmationCode,
        cancelToken: apptData.cancelToken,
        reminder24Sent: apptData.reminder24Sent ?? false,
        reminder2Sent: apptData.reminder2Sent ?? false,
        googleCalendarEventId: apptData.googleCalendarEventId ?? null,
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

    return NextResponse.json({ sent24, sent2, sentGuest48, sentGuest24, expiredCount, errors })
  } catch (err) {
    console.error('GET /api/reminders', err)
    return NextResponse.json({ error: 'Error en reminders' }, { status: 500 })
  }
}
