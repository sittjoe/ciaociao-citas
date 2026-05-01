import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { mapGuest } from '@/lib/guests'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const snap = await adminDb
    .collection('appointments')
    .doc(id)
    .collection('guests')
    .orderBy('invitedAt', 'asc')
    .get()

  const guests = snap.docs.map(doc => {
    const g = mapGuest(doc.id, doc.data())
    return {
      id:                g.id,
      name:              g.name,
      email:             g.email,
      status:            g.status,
      identificationUrl: g.identificationUrl,
      verifiedAt:        g.verifiedAt?.toISOString()  ?? null,
      expiredAt:         g.expiredAt?.toISOString()   ?? null,
      excludedAt:        g.excludedAt?.toISOString()  ?? null,
      excludedBy:        g.excludedBy,
    }
  })

  return NextResponse.json({ guests })
}
