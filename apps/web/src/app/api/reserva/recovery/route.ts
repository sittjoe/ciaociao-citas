import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { sendReservationRecovery } from '@/lib/email'
import { mapAppointmentForEmail } from '@/lib/appointment-email'
import { phoneDigits } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; phone?: string; code?: string }
    const email = body.email?.trim().toLowerCase()
    const phone = body.phone?.trim()
    const digits = phoneDigits(phone)
    const code = body.code?.trim().toUpperCase()

    const hasValidEmail = Boolean(email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    const hasValidPhone = digits.length >= 8

    if (!hasValidEmail && !hasValidPhone) {
      return NextResponse.json({ error: 'Escribe un correo válido o teléfono con al menos 8 dígitos' }, { status: 422 })
    }

    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = []
    if (code) {
      const snap = await adminDb.collection('appointments').where('confirmationCode', '==', code).limit(1).get()
      docs = snap.docs.filter(doc => {
        const data = doc.data()
        return (hasValidEmail && String(data.email ?? '').toLowerCase() === email)
          || (hasValidPhone && (String(data.phoneDigits ?? '') === digits || phoneDigits(String(data.phone ?? '')) === digits))
      })
    } else if (hasValidEmail) {
      const snap = await adminDb.collection('appointments').where('email', '==', email).limit(5).get()
      docs = snap.docs
    } else {
      const snap = await adminDb.collection('appointments').where('phoneDigits', '==', digits).limit(5).get()
      docs = snap.docs
      if (docs.length === 0 && phone) {
        const fallback = await adminDb.collection('appointments').where('phone', '==', phone).limit(5).get()
        docs = fallback.docs
      }
    }

    for (const doc of docs) {
      await sendReservationRecovery(mapAppointmentForEmail(doc.id, doc.data())).catch(err => {
        console.error('Recovery email failed:', err)
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Si encontramos una cita con esos datos, te enviamos el link para consultarla.',
    })
  } catch (err) {
    console.error('POST /api/reserva/recovery', err)
    return NextResponse.json({ error: 'No pudimos procesar la solicitud' }, { status: 500 })
  }
}
