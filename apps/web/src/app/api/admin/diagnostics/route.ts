import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-auth'
import { getActiveAdminEmails, isEmailConfigured } from '@/lib/email'
import { getGoogleCalendarConfigStatus } from '@/lib/google-calendar'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { normalizeAppointmentType } from '@/lib/commercial'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const adminRecipients = await getActiveAdminEmails()
  const googleCalendar = getGoogleCalendarConfigStatus()
  const now = new Date()
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [failedEmails, upcomingSlots, videoAppts] = await Promise.all([
    adminDb.collection('emailOutbox').where('status', '==', 'failed').limit(50).get(),
    adminDb.collection('slots')
      .where('available', '==', true)
      .where('datetime', '>=', Timestamp.fromDate(now))
      .where('datetime', '<', Timestamp.fromDate(weekEnd))
      .limit(200)
      .get(),
    adminDb.collection('appointments')
      .where('status', '==', 'accepted')
      .where('appointmentType', '==', 'video_engagement_rings')
      .where('slotDatetime', '>=', Timestamp.fromDate(now))
      .orderBy('slotDatetime')
      .limit(50)
      .get(),
  ])
  const slotsByType = upcomingSlots.docs.reduce<Record<'showroom' | 'video_engagement_rings', number>>((acc, doc) => {
    acc[normalizeAppointmentType(doc.data().slotType)]++
    return acc
  }, { showroom: 0, video_engagement_rings: 0 })
  const videoMissingMeetingLink = videoAppts.docs.filter(doc => !String(doc.data().meetingUrl ?? '').trim()).length

  return NextResponse.json({
    email: {
      configured: isEmailConfigured(),
      adminRecipients,
      failedOutboxCount: failedEmails.size,
    },
    googleCalendar,
    availability: {
      next7Days: slotsByType,
    },
    appointments: {
      videoMissingMeetingLink,
    },
  })
}
