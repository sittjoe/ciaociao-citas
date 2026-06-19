import { NextResponse } from 'next/server'
import { appointmentDecisionSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { applyAppointmentDecision } from '@/lib/appointment-decision'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = appointmentDecisionSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { action, reason, meetingUrl, meetingProvider, meetingInstructions } = parsed.data
  const result = await applyAppointmentDecision({
    id, action, adminEmail: admin.email,
    reason, meetingUrl, meetingProvider, meetingInstructions,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({
    ok: true,
    googleCalendarEventId: result.googleCalendarEventId ?? null,
    ...(result.calendarSyncFailed ? { calendarSyncFailed: true } : {}),
  })
}
