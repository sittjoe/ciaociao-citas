import { NextResponse } from 'next/server'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'
import { agendaPauseRef } from '@/lib/agenda-pause'
import { sanitize } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// GET — estado actual de la pausa (lectura directa, sin fail-open: el admin
// debe ver un error si Firestore falla, no un falso "agenda activa").
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const snap = await agendaPauseRef().get()
    const data = snap.exists ? snap.data()! : {}
    return NextResponse.json({
      paused: data.paused === true,
      reason: String(data.reason ?? ''),
    })
  } catch (err) {
    console.error('GET /api/admin/agenda-pause', err)
    return NextResponse.json({ error: 'Error al leer el estado de la agenda' }, { status: 500 })
  }
}

const putSchema = z.object({
  paused: z.boolean(),
  reason: z.string().max(300).optional(),
})

// PUT — pausar o reanudar la agenda
export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body   = await request.json().catch(() => null)
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 422 })
  }

  try {
    await agendaPauseRef().set({
      paused:    parsed.data.paused,
      reason:    sanitize(parsed.data.reason ?? ''),
      updatedBy: session.email,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return NextResponse.json({ ok: true, paused: parsed.data.paused })
  } catch (err) {
    console.error('PUT /api/admin/agenda-pause', err)
    return NextResponse.json({ error: 'Error al actualizar el estado de la agenda' }, { status: 500 })
  }
}
