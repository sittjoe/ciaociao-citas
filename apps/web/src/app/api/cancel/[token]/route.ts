import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  try {
    const snap = await adminDb
      .collection('appointments')
      .where('cancelToken', '==', token)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Token no encontrado' }, { status: 404 })
    }

    const doc  = snap.docs[0]
    const data = doc.data()

    if (data.status === 'cancelled') {
      return NextResponse.json({ error: 'Esta cita ya fue cancelada' }, { status: 409 })
    }
    if (data.status === 'rejected') {
      return NextResponse.json({ error: 'Esta cita ya fue rechazada' }, { status: 409 })
    }

    const slotRef = adminDb.collection('slots').doc(data.slotId)

    await adminDb.runTransaction(async tx => {
      tx.update(doc.ref, {
        status:    'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(slotRef, {
        available: true,
        heldUntil: null,
        bookedBy:  null,
      })
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`POST /api/cancel/${token}`, err)
    return NextResponse.json({ error: 'Error al cancelar la cita' }, { status: 500 })
  }
}
