import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { sendReservationRecovery } from '@/lib/email'
import { mapAppointmentForEmail } from '@/lib/appointment-email'
import { phoneDigits } from '@/lib/utils'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

function slotMillis(data: FirebaseFirestore.DocumentData): number | null {
  const dt = data.slotDatetime
  return dt instanceof Timestamp ? dt.toMillis() : null
}

/** Vigente = pendiente o confirmada, con horario en el futuro. */
function isVigente(data: FirebaseFirestore.DocumentData, nowMs: number): boolean {
  const status = String(data.status ?? '')
  if (status !== 'pending' && status !== 'accepted') return false
  const ms = slotMillis(data)
  return ms !== null && ms > nowMs
}

export async function POST(request: Request) {
  try {
    const ip = requestIp(request)
    if (await checkPublicRateLimit({ key: `recovery:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 8 })) {
      return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
    }
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
    const identityKey = hasValidEmail ? email! : digits
    if (await checkPublicRateLimit({ key: `recovery:id:${identityKey}`, windowMs: 60 * 60 * 1000, max: 3 })) {
      return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
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

    // UN solo correo con las citas vigentes (pending/accepted futuras), no uno
    // por cada cita del historial. El estado vigente/pasado se filtra en
    // memoria para no exigir índices compuestos nuevos.
    if (docs.length > 0) {
      const nowMs = Date.now()
      const vigentes = docs.filter(doc => isVigente(doc.data(), nowMs))

      if (vigentes.length > 0) {
        // Búsquedas por teléfono pueden mezclar correos distintos: cada correo
        // recibe únicamente sus propias citas.
        const byEmail = new Map<string, Appointment[]>()
        for (const doc of vigentes) {
          const appt = mapAppointmentForEmail(doc.id, doc.data())
          const to = String(appt.email ?? '').trim().toLowerCase()
          if (!to) continue
          const list = byEmail.get(to) ?? []
          list.push(appt)
          byEmail.set(to, list)
        }
        for (const [to, appointments] of byEmail) {
          appointments.sort((a, b) => a.slotDatetime.getTime() - b.slotDatetime.getTime())
          await sendReservationRecovery({ to, appointments }).catch(err => {
            console.error('Recovery email failed:', err)
          })
        }
      } else {
        // Hay historial pero ninguna cita vigente: un aviso amable al correo
        // de la cita más reciente. La respuesta pública no revela nada.
        const latest = docs.reduce((best, doc) => {
          const at = slotMillis(doc.data()) ?? 0
          const bestAt = slotMillis(best.data()) ?? 0
          return at > bestAt ? doc : best
        })
        const to = String(latest.data().email ?? '').trim().toLowerCase()
        if (to) {
          await sendReservationRecovery({ to, appointments: [], name: String(latest.data().name ?? '') }).catch(err => {
            console.error('Recovery email failed:', err)
          })
        }
      }
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
