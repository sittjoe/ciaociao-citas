import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-auth'
import { getActiveAdminEmails, isEmailConfigured } from '@/lib/email'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const adminRecipients = await getActiveAdminEmails()

  return NextResponse.json({
    email: {
      configured: isEmailConfigured(),
      adminRecipients,
    },
    googleCalendar: {
      configured: isGoogleCalendarConfigured(),
      calendarId: process.env.GOOGLE_CALENDAR_ID ? 'set' : 'missing',
    },
  })
}
