import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendReminder, sendGuestReminder } from '@/lib/email'
import { expirePendingGuests } from '@/lib/guests'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

// Called by Vercel cron every hour (see vercel.json: "0 * * * *")
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now    = new Date()
  let sent24   = 0
  let sent2    = 0
  const errors: string[] = []

  try {
    // 24-hour reminders: appointments starting between 23h and 25h from now
    const from24 = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const to24   = new Date(now.getTime() + 25 * 60 * 60 * 1000)

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
        name:  d.name,
        email: d.email,
        phone: d.phone,
        notes: d.notes,
        identificationUrl: d.identificationUrl,
        status: d.status,
        confirmationCode: d.confirmationCode,
        cancelToken: d.cancelToken,
        reminder24Sent: d.reminder24Sent,
        reminder2Sent:  d.reminder2Sent,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
        createdAt: (d.createdAt as Timestamp).toDate(),
      }
      // Mark before send to ensure idempotency
      await doc.ref.update({ reminder24Sent: true, updatedAt: FieldValue.serverTimestamp() })
      try {
        await sendReminder(appt, 24)
        sent24++
      } catch (err) {
        // Rollback flag so it retries next run
        await doc.ref.update({ reminder24Sent: false })
        errors.push(`24h reminder failed for ${doc.id}: ${err}`)
      }
    }

    // 2-hour reminders: appointments starting between 1h45m and 2h15m from now
    const from2 = new Date(now.getTime() + 105 * 60 * 1000)
    const to2   = new Date(now.getTime() + 135 * 60 * 1000)

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
        name:  d.name,
        email: d.email,
        phone: d.phone,
        notes: d.notes,
        identificationUrl: d.identificationUrl,
        status: d.status,
        confirmationCode: d.confirmationCode,
        cancelToken: d.cancelToken,
        reminder24Sent: d.reminder24Sent,
        reminder2Sent:  d.reminder2Sent,
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

    // Guest reminders — 48h window: guests with pending status whose appointment is 47h–49h from now
    let sentGuest48  = 0
    let sentGuest24  = 0
    let expiredCount = 0

    const from48g = new Date(now.getTime() + 47 * 60 * 60 * 1000)
    const to48g   = new Date(now.getTime() + 49 * 60 * 60 * 1000)

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

    // Guest reminders — 24h window: also expire pending guests past the deadline
    const from24g = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const to24g   = new Date(now.getTime() + 25 * 60 * 60 * 1000)

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

    // Expire guests whose deadline (slotDatetime - 24h) has passed
    const expiryBefore = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    try {
      expiredCount = await expirePendingGuests(expiryBefore)
    } catch (err) {
      errors.push(`Guest expiration failed: ${err}`)
    }

    return NextResponse.json({ sent24, sent2, sentGuest48, sentGuest24, expiredCount, errors })
  } catch (err) {
    console.error('GET /api/reminders', err)
    return NextResponse.json({ error: 'Error en reminders' }, { status: 500 })
  }
}
