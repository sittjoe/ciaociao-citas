import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { blockDatesSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { listBlockedDates } from '@/lib/blocked-dates'
import { deleteSlotById } from '@/lib/slot-delete'
import { BUSINESS_TZ, sanitize } from '@/lib/utils'

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

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const parsed = blockDatesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos' }, { status: 422 })
  }
  // Flag fuera del schema compartido: si viene true, tras bloquear se eliminan
  // los slots LIBRES del rango. Las citas existentes jamás se tocan aquí.
  const deleteFreeSlots = body?.deleteFreeSlots === true

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

  // Limpieza opcional: eliminar los horarios LIBRES del rango recién bloqueado.
  // Va DESPUÉS del commit para que un fallo aquí nunca deje fechas sin bloquear.
  // deleteSlotById re-verifica sus guardas (slot con reserva o cita activa → skip),
  // así que una reserva que entre en la ventana entre lecturas queda protegida.
  let slotsDeleted = 0
  let slotsSkipped = 0
  if (deleteFreeSlots) {
    try {
      const start = Timestamp.fromDate(fromZonedTime(`${parsed.data.from}T00:00:00`, BUSINESS_TZ))
      const end   = Timestamp.fromDate(fromZonedTime(`${parsed.data.to}T23:59:59`, BUSINESS_TZ))
      const snap = await adminDb.collection('slots')
        .orderBy('datetime')
        .where('datetime', '>=', start)
        .where('datetime', '<=', end)
        .limit(1000)
        .get()
      for (const doc of snap.docs) {
        // available !== true = reserva o hold en curso: ni se intenta.
        if (doc.data().available !== true) continue
        const result = await deleteSlotById(doc.id, admin.email)
        if (result.ok) slotsDeleted++
        else slotsSkipped++
      }
    } catch (err) {
      console.error('POST /api/admin/blocked-dates cleanup', err)
    }
  }

  await adminDb.collection('auditLog').add({
    action: 'dates_blocked', from: parsed.data.from, to: parsed.data.to, count: days.length,
    slotsDeleted, actorEmail: admin.email, ts: new Date(),
  }).catch(() => {})

  return NextResponse.json({ ok: true, blocked: days.length, slotsDeleted, slotsSkipped })
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
