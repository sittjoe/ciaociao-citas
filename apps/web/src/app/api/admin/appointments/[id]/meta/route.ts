import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-auth'
import { appointmentMetaSchema } from '@/lib/schemas'
import {
  updateAppointmentMeta,
  listNotesHistory,
  NotesErrorCode,
} from '@/lib/notes'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params
  try {
    const history = await listNotesHistory(id, 25)
    return NextResponse.json({
      history: history.map(h => ({
        id: h.id,
        notes: h.notes,
        updatedAt: h.updatedAt.toISOString(),
        updatedBy: h.updatedBy,
      })),
    })
  } catch (err) {
    console.error(`GET /api/admin/appointments/${id}/meta`, err)
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = appointmentMetaSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Parámetros inválidos', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const result = await updateAppointmentMeta({
      appointmentId: id,
      adminEmail: admin.email,
      tags: parsed.data.tags,
      type: parsed.data.type ?? null,
      internalNotes: parsed.data.internalNotes ?? undefined,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === NotesErrorCode.APPT_NOT_FOUND) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    console.error(`PATCH /api/admin/appointments/${id}/meta`, err)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }
}
