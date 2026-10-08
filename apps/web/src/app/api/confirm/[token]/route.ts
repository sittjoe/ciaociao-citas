import { NextResponse } from 'next/server'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'
import { NO_STORE_HEADERS } from '@/lib/reserva-access'
import { confirmAppointment, isConfirmTokenShape, isSameOriginRequest } from '@/lib/appointment-confirm'

export const dynamic = 'force-dynamic'

/**
 * Solo POST. No hay GET a propósito: los escáneres de enlaces de los correos
 * abren los links por su cuenta, así que abrir una URL nunca debe confirmar.
 * Next responde 405 a cualquier otro método.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

  if (!isConfirmTokenShape(token)) {
    return json({ error: 'Enlace inválido' }, 404)
  }
  if (!isSameOriginRequest(request)) {
    return json({ error: 'Solicitud no permitida' }, 403)
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return json({ error: 'Solicitud no válida' }, 415)
  }
  const body = await request.json().catch(() => null) as { token?: unknown } | null
  if (!body || body.token !== token) {
    return json({ error: 'Solicitud no válida' }, 400)
  }

  const ip = requestIp(request)
  if (await checkPublicRateLimit({ key: `confirm:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 20 })) {
    return json({ error: 'Demasiados intentos. Intenta más tarde.' }, 429)
  }

  try {
    const result = await confirmAppointment(token)
    switch (result.state) {
      case 'confirmed':
      case 'already': {
        const { state, ...summary } = result
        return json({ ok: true, alreadyConfirmed: state === 'already', ...summary })
      }
      case 'invalid':
        return json({ error: 'Enlace inválido' }, 404)
      case 'past':
        return json({ state: 'past', error: 'La hora de esta cita ya pasó.' }, 409)
      case 'cancelled':
        return json({ state: 'cancelled', error: 'Esta cita fue cancelada.' }, 409)
      case 'rejected':
        return json({ state: 'rejected', error: 'Esta solicitud no fue aprobada.' }, 409)
      case 'awaiting_team':
        return json({ state: 'awaiting_team', error: 'Tu cita aún está en revisión por nuestro equipo.' }, 409)
      default:
        return json({ state: 'unavailable', error: 'No se puede confirmar esta cita.' }, 409)
    }
  } catch (err) {
    console.error('POST /api/confirm', err)
    return json({ error: 'No pudimos confirmar tu cita. Intenta de nuevo en un momento.' }, 500)
  }
}
