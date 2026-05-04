import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

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

    if (data.status !== 'accepted') {
      const msg =
        data.status === 'cancelled' ? 'Esta cita fue cancelada' :
        data.status === 'rejected'  ? 'Esta cita fue rechazada' :
        data.status === 'pending'   ? 'Esta cita aún no ha sido confirmada por el equipo' :
        'No se puede confirmar esta cita'
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    if (data.clientConfirmed === true) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true })
    }

    await doc.ref.update({
      clientConfirmed: true,
      clientConfirmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Return the confirmationCode so the page can link to /reserva/[code]
    const confirmationCode = (data.confirmationCode as string | undefined) ?? null
    const slotDatetime = data.slotDatetime
      ? (data.slotDatetime as Timestamp).toDate().toISOString()
      : null

    return NextResponse.json({ ok: true, alreadyConfirmed: false, confirmationCode, slotDatetime })
  } catch (err) {
    console.error(`POST /api/confirm/${token}`, err)
    return NextResponse.json({ error: 'Error al confirmar la cita' }, { status: 500 })
  }
}
