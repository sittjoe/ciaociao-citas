import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-auth'
import { getActiveAdminEmails, isEmailConfigured } from '@/lib/email'
import { getGoogleCalendarConfigStatus } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const adminRecipients = await getActiveAdminEmails()
  const googleCalendar = getGoogleCalendarConfigStatus()

  return NextResponse.json({
    email: {
      configured: isEmailConfigured(),
      adminRecipients,
    },
    googleCalendar,
  })
}
