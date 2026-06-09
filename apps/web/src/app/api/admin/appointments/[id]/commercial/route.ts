import { NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { commercialUpdateSchema } from '@/lib/schemas'
import { sanitize } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = commercialUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { commercialStatus, internalNote, followUpAt } = parsed.data
  const followUpDate = followUpAt ? new Date(followUpAt) : null
  if (followUpDate && Number.isNaN(followUpDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de follow-up inválida' }, { status: 422 })
  }

  try {
    const ref = adminDb.collection('appointments').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })

    await ref.update({
      commercialStatus,
      internalNote: sanitize(internalNote ?? ''),
      followUpAt: followUpDate ? Timestamp.fromDate(followUpDate) : FieldValue.delete(),
      commercialUpdatedBy: admin.email,
      commercialUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`PATCH /api/admin/appointments/${id}/commercial`, err)
    return NextResponse.json({ error: 'Error al actualizar seguimiento' }, { status: 500 })
  }
}
