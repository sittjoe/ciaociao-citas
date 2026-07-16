import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { generateSlots } from '@/lib/slot-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_WEEKS = 4
const MAX_WEEKS = 8

// POST — publica los slots de las próximas N semanas según el horario
// recurrente (config/slotSchedule). Idempotente: los slots existentes o
// reservados se cuentan como `skipped`, nunca se pisan.
export async function POST(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { weeks?: unknown }
  const rawWeeks = body?.weeks === undefined ? DEFAULT_WEEKS : Number(body.weeks)
  if (!Number.isFinite(rawWeeks) || rawWeeks < 1) {
    return NextResponse.json({ error: 'Número de semanas inválido' }, { status: 422 })
  }
  const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.round(rawWeeks)))

  try {
    const { created, skipped, blockedDays } = await generateSlots({ horizonDays: weeks * 7 })

    await adminDb.collection('auditLog').add({
      action: 'slots_published', weeks, created, skipped, blockedDays,
      actorEmail: admin.email, ts: new Date(),
    }).catch(() => {})

    return NextResponse.json({ created, skipped, blockedDays, weeks })
  } catch (err) {
    console.error('POST /api/admin/slots/publish', err)
    return NextResponse.json({ error: 'Error al publicar horarios' }, { status: 500 })
  }
}
