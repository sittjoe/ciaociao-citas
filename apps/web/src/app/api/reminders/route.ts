import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendReminder, sendReminder24Confirm, sendAutoCancellation, sendGuestReminder } from '@/lib/email'
import { deleteAppointmentCalendarEvent } from '@/lib/google-calendar'
import { expirePendingGuests } from '@/lib/guests'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

// Called by Vercel cron daily at 8am CST (see vercel.json: "0 14 * * *")
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let autoCancelled = 0
  let sent24        = 0
  let sent2         = 0
  const errors: string[] = []

  try {
    // Auto-cancel: accepted appointments within the next 12h that were NOT confirmed.
    // Daily cron at 8am CST cancels all unconfirmed same-day appointments in one pass.
    // Guarded by reminder24Sent == true so clients who never received the warning are never auto-cancelled.
    const toAC = new Date(now.getTime() + 12 * 60 * 60 * 1000)

    const snapAC = await adminDb
      .collection('appointments')
      .where('status', '==', 'accepted')
      .where('clientConfirmed', '==', false)
      .where('reminder24Sent', '==', true)
      .where('slotDatetime', '>=', Timestamp.fromDate(now))
      .where('slotDatetime', '<=', Timestamp.fromDate(toAC))
      .get()

    for (const doc of snapAC.docs) {
      try {
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
          status: 'cancelled',
          confirmationCode: d.confirmationCode,
          cancelToken: d.cancelToken,
          reminder24Sent: d.reminder24Sent ?? true,
          reminder2Sent: d.reminder2Sent ?? false,
          googleCalendarEventId: d.googleCalendarEventId ?? null,
          createdAt: (d.createdAt as Timestamp).toDate(),
        }

        if (d.googleCalendarEventId) {
          try {
            await deleteAppointmentCalendarEvent({ ...appt, googleCalendarEventId: d.googleCalendarEventId })
          } catch (err) {
            errors.push(`Auto-cancel calendar delete failed for ${doc.id}: ${err}`)
          }
        }

        await adminDb.runTransaction(async tx => {
          const fresh = await tx.get(doc.ref)
          if (!fresh.exists) return
          const fd = fresh.data()!
          // Skip if another process already handled this appointment
          if (fd.status !== 'accepted' || fd.clientConfirmed !== false) return
          tx.update(doc.ref, {
            status: 'cancelled',
            autoCancelledAt: FieldValue.serverTimestamp(),
            googleCalendarEventId: null,
            updatedAt: FieldValue.serverTimestamp(),
          })
          tx.update(adminDb.collection('slots').doc(fd.slotId), {
            available: true,
            heldUntil: null,
            bookedBy: null,
          })
        })

        try {
          await sendAutoCancellation(appt)
        } catch (err) {
          errors.push(`Auto-cancel email failed for ${doc.id}: ${err}`)
        }

        autoCancelled++
      } catch (err) {
        errors.push(`Auto-cancel failed for ${doc.id}: ${err}`)
      }
    }

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

    // Guest reminders — 48h window: 36h–60h from now (covers day after tomorrow for daily cron)
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

    // Guest reminders — 24h window: 12h–36h from now (covers tomorrow for daily cron)
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

    return NextResponse.json({ autoCancelled, sent24, sent2, sentGuest48, sentGuest24, expiredCount, errors })
  } catch (err) {
    console.error('GET /api/reminders', err)
    return NextResponse.json({ error: 'Error en reminders' }, { status: 500 })
  }
}
