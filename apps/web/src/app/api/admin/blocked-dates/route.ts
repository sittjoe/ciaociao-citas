import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { blockDatesSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { listBlockedDates } from '@/lib/blocked-dates'
import { sanitize } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 90

function* eachDay(from: string, to: string): Generator<string> {
  // Iterate calendar days as strings via UTC math (no DST drift on date-only keys)
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  for (let d = start; d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    yield d.toISOString().slice(0, 10)
  }
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.json({ blockedDates: await listBlockedDates() })
}

export async function POST(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = blockDatesSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos' }, { status: 422 })
  }

  const days = [...eachDay(parsed.data.from, parsed.data.to)]
  if (days.length > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `El rango no puede superar ${MAX_RANGE_DAYS} días` }, { status: 422 })
  }

  const reason = sanitize(parsed.data.reason ?? '')
  const batch = adminDb.batch()
  for (const date of days) {
    batch.set(adminDb.collection('blockedDates').doc(date), {
      date, reason, createdBy: admin.email, createdAt: new Date(),
    })
  }
  await batch.commit()

  await adminDb.collection('auditLog').add({
    action: 'dates_blocked', from: parsed.data.from, to: parsed.data.to, count: days.length,
    actorEmail: admin.email, ts: new Date(),
  }).catch(() => {})

  return NextResponse.json({ ok: true, blocked: days.length })
}

export async function DELETE(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = new URL(request.url).searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }
  await adminDb.collection('blockedDates').doc(date).delete()
  await adminDb.collection('auditLog').add({
    action: 'date_unblocked', date, actorEmail: admin.email, ts: new Date(),
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
