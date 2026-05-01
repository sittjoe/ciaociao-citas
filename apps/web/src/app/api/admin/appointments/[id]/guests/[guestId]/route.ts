import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { adminGuestActionSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { recomputeGuestsAllVerified } from '@/lib/guests'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, guestId } = await params

  const parsed = adminGuestActionSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const { action } = parsed.data

  const guestRef = adminDb
    .collection('appointments')
    .doc(id)
    .collection('guests')
    .doc(guestId)

  const guestSnap = await guestRef.get()
  if (!guestSnap.exists) {
    return NextResponse.json({ error: 'Invitado no encontrado' }, { status: 404 })
  }

  if (action === 'verify') {
    await guestRef.update({
      status: 'verified',
      verifiedAt: FieldValue.serverTimestamp(),
    })
  } else {
    await guestRef.update({
      status: 'excluded',
      excludedAt: FieldValue.serverTimestamp(),
      excludedBy: admin.email,
    })
  }

  await recomputeGuestsAllVerified(id)

  return NextResponse.json({ ok: true })
}
