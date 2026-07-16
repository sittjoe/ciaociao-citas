import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { getSlotScheduleConfig, sanitizeSlotSchedule, type SlotSchedule } from '@/lib/slot-schedule'

export const dynamic = 'force-dynamic'

// Normalmente hay 1 (showroom) y a lo sumo 1 más (video). Un tope bajo acota
// el documento de config y el trabajo del generador.
const MAX_SCHEDULES = 6

// GET — horario recurrente vigente (defaults incluidos si no hay doc en Firestore)
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const config = await getSlotScheduleConfig()
    return NextResponse.json({
      schedules: config.schedules,
      source: config.fromFirestore ? 'firestore' : 'default',
    })
  } catch (err) {
    console.error('GET /api/admin/slot-schedule', err)
    return NextResponse.json({ error: 'Error al obtener el horario' }, { status: 500 })
  }
}

// PUT — guarda { schedules } en config/slotSchedule, validando con la MISMA
// sanitización con la que luego se lee (sanitizeSlotSchedule de lib/slot-schedule).
export async function PUT(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { schedules?: unknown } | null
  const raw = Array.isArray(body?.schedules) ? body!.schedules : null
  if (!raw || raw.length === 0) {
    return NextResponse.json({ error: 'Se requiere al menos un horario' }, { status: 422 })
  }
  if (raw.length > MAX_SCHEDULES) {
    return NextResponse.json({ error: `Máximo ${MAX_SCHEDULES} horarios` }, { status: 422 })
  }

  const schedules: SlotSchedule[] = []
  for (const item of raw) {
    const clean = sanitizeSlotSchedule(item)
    if (!clean) {
      return NextResponse.json(
        { error: 'Horario inválido: revisa que tenga al menos un día, horas en formato HH:MM y horizonte de 1 a 90 días' },
        { status: 422 },
      )
    }
    schedules.push(clean)
  }

  try {
    await adminDb.collection('config').doc('slotSchedule').set({
      schedules,
      updatedBy: admin.email,
      updatedAt: new Date(),
    })
    await adminDb.collection('auditLog').add({
      action: 'slot_schedule_updated', schedules: schedules.length,
      actorEmail: admin.email, ts: new Date(),
    }).catch(() => {})

    return NextResponse.json({ ok: true, schedules })
  } catch (err) {
    console.error('PUT /api/admin/slot-schedule', err)
    return NextResponse.json({ error: 'Error al guardar el horario' }, { status: 500 })
  }
}
