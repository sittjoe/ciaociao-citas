import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'
import {
  NO_STORE_HEADERS,
  emailMatches,
  isReservaAccessConfigured,
  normalizeReservaCode,
  reservaCookieName,
  reservaCookieOptions,
  signReservaCookie,
} from '@/lib/reserva-access'

export const dynamic = 'force-dynamic'

// Un solo mensaje para «no existe el código» y «el correo no coincide»: la
// respuesta no debe revelar si una reserva existe.
const NEUTRAL_ERROR = 'No pudimos verificar esos datos. Revisa el correo con el que reservaste.'

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

/**
 * Puerta de /reserva/[code] para enlaces sin firma: la clienta escribe el
 * correo con el que reservó y, si coincide, recibe la cookie de acceso.
 * Límites: 5 intentos por IP+código cada 15 min y 20 por IP cada hora
 * (Firestore publicRateLimits, igual que el resto de rutas públicas).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params
  const code = normalizeReservaCode(rawCode)

  if (!isReservaAccessConfigured()) {
    console.error('reserva acceso: falta RESERVA_LINK_SECRET y SESSION_SECRET')
    return json({ error: 'La consulta no está disponible por el momento. Escríbenos y con gusto te ayudamos.' }, 503)
  }

  const ip = requestIp(request)
  try {
    const limited =
      await checkPublicRateLimit({ key: `rsv-access:ipc:${ip}:${code ?? 'invalid'}`, windowMs: 15 * 60 * 1000, max: 5 })
      || await checkPublicRateLimit({ key: `rsv-access:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 20 })
    if (limited) return json({ error: 'Demasiados intentos. Intenta más tarde.' }, 429)
  } catch (err) {
    // Sin poder contar intentos, no se verifica (fallar cerrado).
    console.error('reserva acceso: rate limit failed', err)
    return json({ error: 'No pudimos procesar la solicitud' }, 500)
  }

  let email: unknown = ''
  try {
    const body = await request.json() as { email?: unknown }
    email = body.email
  } catch {
    // cuerpo inválido → cae en la verificación neutra
  }

  try {
    let storedEmail: unknown = ''
    if (code) {
      const snap = await adminDb
        .collection('appointments')
        .where('confirmationCode', '==', code)
        .limit(1)
        .get()
      if (!snap.empty) storedEmail = snap.docs[0].data().email
    }

    // Se compara siempre (aunque no exista la cita) para no variar el tiempo.
    const ok = emailMatches(email, storedEmail) && Boolean(code)
    if (!ok) return json({ error: NEUTRAL_ERROR }, 403)

    const value = signReservaCookie(code!)
    if (!value) return json({ error: NEUTRAL_ERROR }, 403)

    const res = json({ ok: true }, 200)
    res.cookies.set(reservaCookieName(code!), value, reservaCookieOptions())
    return res
  } catch (err) {
    console.error('POST /api/reserva/[code]/acceso', err)
    return json({ error: 'No pudimos procesar la solicitud' }, 500)
  }
}
