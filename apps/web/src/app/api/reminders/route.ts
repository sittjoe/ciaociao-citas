import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendReminder } from '@/lib/email'
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

    return NextResponse.json({ sent24, sent2, errors })
  } catch (err) {
    console.error('GET /api/reminders', err)
    return NextResponse.json({ error: 'Error en reminders' }, { status: 500 })
  }
}
