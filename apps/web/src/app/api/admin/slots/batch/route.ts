import { NextResponse } from 'next/server'
import { batchSlotsDeleteSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { deleteSlotById } from '@/lib/slot-delete'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — borra muchos slots en una sola llamada. Cada id se procesa de forma
// independiente con las MISMAS guardas del borrado individual (deleteSlotById),
// así un slot reservado no bloquea el resto: se salta y se reporta.
export async function POST(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = batchSlotsDeleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos' }, { status: 422 })
  }

  const uniqueIds = Array.from(new Set(parsed.data.ids))

  let deleted = 0
  const failed: { id: string; error: string }[] = []

  for (const id of uniqueIds) {
    const result = await deleteSlotById(id, admin.email)
    if (result.ok) deleted++
    else failed.push({ id, error: result.error })
  }

  return NextResponse.json({ processed: uniqueIds.length, deleted, failed })
}
