import { NextResponse } from 'next/server'
import {
  NO_STORE_HEADERS,
  normalizeReservaCode,
  reservaCookieName,
  reservaCookieOptions,
  signReservaCookie,
  verifyReservaLinkToken,
} from '@/lib/reserva-access'

export const dynamic = 'force-dynamic'

/**
 * Entrada de los enlaces firmados (/reserva/CODE?t=…): si la firma es válida
 * emite la cookie de acceso y, en cualquier caso, redirige a la URL limpia
 * /reserva/CODE (la firma no se queda en el historial). Una firma inválida
 * termina en la puerta del correo, nunca en los datos.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params
  const code = normalizeReservaCode(rawCode)
  const url = new URL(request.url)
  const target = new URL(code ? `/reserva/${code}` : '/reserva', url.origin)

  const res = NextResponse.redirect(target, { status: 303, headers: NO_STORE_HEADERS })
  if (code && verifyReservaLinkToken(code, url.searchParams.get('t'))) {
    const value = signReservaCookie(code)
    if (value) res.cookies.set(reservaCookieName(code), value, reservaCookieOptions())
  }
  return res
}
