import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { sendReservationRecovery } from '@/lib/email'
import { mapAppointmentForEmail } from '@/lib/appointment-email'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; code?: string }
    const email = body.email?.trim().toLowerCase()
    const code = body.code?.trim().toUpperCase()

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Correo inválido' }, { status: 422 })
    }

    let query = adminDb.collection('appointments').where('email', '==', email).limit(5)
    if (code) query = adminDb.collection('appointments').where('email', '==', email).where('confirmationCode', '==', code).limit(1)

    const snap = await query.get()
    for (const doc of snap.docs) {
      await sendReservationRecovery(mapAppointmentForEmail(doc.id, doc.data())).catch(err => {
        console.error('Recovery email failed:', err)
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Si encontramos una cita con ese correo, te enviamos el link para consultarla.',
    })
  } catch (err) {
    console.error('POST /api/reserva/recovery', err)
    return NextResponse.json({ error: 'No pudimos procesar la solicitud' }, { status: 500 })
  }
}
