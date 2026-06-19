import { NextResponse } from 'next/server'
import { batchDecisionSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { applyAppointmentDecision } from '@/lib/appointment-decision'

export const dynamic = 'force-dynamic'

// Accept or reject many pending appointments in one call. Each is processed
// independently through the same logic as the single-decision route, so one
// failure (e.g. a showroom cita missing its ID) doesn't block the rest.
export async function POST(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = batchDecisionSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos' }, { status: 422 })
  }

  const { ids, action, reason } = parsed.data
  const uniqueIds = Array.from(new Set(ids))

  let succeeded = 0
  const failed: { id: string; error: string }[] = []

  for (const id of uniqueIds) {
    const result = await applyAppointmentDecision({ id, action, adminEmail: admin.email, reason })
    if (result.ok) succeeded++
    else failed.push({ id, error: result.error ?? 'Error' })
  }

  return NextResponse.json({ processed: uniqueIds.length, succeeded, failed })
}
