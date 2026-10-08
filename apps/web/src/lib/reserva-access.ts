import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Acceso privado a /reserva/[code].
 *
 * El código de confirmación (8 caracteres) es corto y se comparte con
 * facilidad, así que por sí solo NO da acceso a los datos de la cita. Hay dos
 * credenciales válidas, ambas verificadas en el servidor:
 *
 *  1. Enlace firmado: /reserva/CODE?t=<HMAC(code)>. Es el que llevan todos los
 *     correos nuevos. Al abrirlo, /api/reserva/CODE/entrar emite la cookie (2)
 *     y redirige a la URL limpia (sin la firma en el historial).
 *  2. Cookie httpOnly firmada con alcance a ese código y vida de 30 días. Se
 *     emite al abrir un enlace firmado o al pasar la «puerta» del correo
 *     (enlaces viejos o compartidos sin firma).
 *
 * Secreto: RESERVA_LINK_SECRET (≥32 caracteres). Si no existe se deriva una
 * clave de SESSION_SECRET con separación de dominio, para que un despliegue
 * sin la variable nueva no rompa los correos ni la puerta. La verificación
 * acepta cualquiera de las dos claves disponibles, así que crear la variable
 * después no invalida los enlaces ya enviados con la clave derivada. Sin
 * ninguna de las dos, todo falla cerrado: los enlaces salen sin firma (caen a
 * la puerta) y la puerta responde «no disponible» en lugar de abrir.
 */

export const RESERVA_COOKIE_PREFIX = 'cc_rsv_'
export const RESERVA_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60
const MIN_PRIMARY_SECRET_LENGTH = 32
const DERIVATION_LABEL = 'ciaociao/reserva-access/v1'

/** Códigos válidos: los genera generateCode (A-Z sin I/O, 2-9); tolera históricos A-Z0-9. */
export function normalizeReservaCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let decoded = raw
  try { decoded = decodeURIComponent(raw) } catch { /* se valida abajo */ }
  const code = decoded.trim().toUpperCase()
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null
}

/** Claves activas: la primera firma, todas verifican. Vacío = fallar cerrado. */
export function getReservaKeys(): Buffer[] {
  const keys: Buffer[] = []
  const primary = process.env.RESERVA_LINK_SECRET?.trim()
  if (primary && primary.length >= MIN_PRIMARY_SECRET_LENGTH) {
    keys.push(Buffer.from(primary, 'utf8'))
  }
  const session = process.env.SESSION_SECRET?.trim()
  if (session) {
    keys.push(createHmac('sha256', session).update(DERIVATION_LABEL).digest())
  }
  return keys
}

export function isReservaAccessConfigured(): boolean {
  return getReservaKeys().length > 0
}

function mac(key: Buffer, message: string): Buffer {
  return createHmac('sha256', key).update(message).digest()
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

function decodeB64url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) return null
  return Buffer.from(value, 'base64url')
}

const linkMessage   = (code: string) => `reserva-link|v1|${code}`
const cookieMessage = (code: string, exp: number) => `reserva-cookie|v1|${code}|${exp}`

/** Firma del enlace (sin caducidad: los correos viejos deben seguir abriendo). */
export function signReservaLinkToken(rawCode: string): string | null {
  const code = normalizeReservaCode(rawCode)
  const [key] = getReservaKeys()
  if (!code || !key) return null
  return mac(key, linkMessage(code)).toString('base64url')
}

export function verifyReservaLinkToken(rawCode: string, token: unknown): boolean {
  const code = normalizeReservaCode(rawCode)
  if (!code || typeof token !== 'string') return false
  const given = decodeB64url(token)
  if (!given) return false
  let ok = false
  // Se recorren todas las claves (sin cortocircuito) para no filtrar cuál coincide.
  for (const key of getReservaKeys()) {
    if (safeEqual(given, mac(key, linkMessage(code)))) ok = true
  }
  return ok
}

/** Ruta relativa para la clienta. Sin secreto, cae a la ruta sin firma (puerta). */
export function reservaPath(rawCode: string): string {
  const code = normalizeReservaCode(rawCode) ?? encodeURIComponent(String(rawCode))
  const token = signReservaLinkToken(code)
  return token ? `/reserva/${code}?t=${token}` : `/reserva/${code}`
}

export function reservaUrl(site: string, rawCode: string): string {
  return `${site.replace(/\/+$/, '')}${reservaPath(rawCode)}`
}

export function reservaCookieName(code: string): string {
  return `${RESERVA_COOKIE_PREFIX}${code}`
}

export function signReservaCookie(rawCode: string, nowMs = Date.now()): string | null {
  const code = normalizeReservaCode(rawCode)
  const [key] = getReservaKeys()
  if (!code || !key) return null
  const exp = nowMs + RESERVA_COOKIE_MAX_AGE_S * 1000
  return `${exp}.${mac(key, cookieMessage(code, exp)).toString('base64url')}`
}

export function verifyReservaCookie(rawCode: string, value: unknown, nowMs = Date.now()): boolean {
  const code = normalizeReservaCode(rawCode)
  if (!code || typeof value !== 'string') return false
  const parts = value.split('.')
  if (parts.length !== 2) return false
  const [expStr, sig] = parts
  if (!/^\d{10,16}$/.test(expStr)) return false
  const exp = Number(expStr)
  if (!Number.isSafeInteger(exp) || exp <= nowMs) return false
  // Una cookie con caducidad más allá de la vida máxima no la emitimos nosotros.
  if (exp - nowMs > RESERVA_COOKIE_MAX_AGE_S * 1000 + 60_000) return false
  const given = decodeB64url(sig)
  if (!given) return false
  let ok = false
  for (const key of getReservaKeys()) {
    if (safeEqual(given, mac(key, cookieMessage(code, exp)))) ok = true
  }
  return ok
}

/** Lee una cookie del encabezado Cookie (route handlers reciben Request). */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) {
      const raw = part.slice(idx + 1).trim()
      try { return decodeURIComponent(raw) } catch { return raw }
    }
  }
  return undefined
}

/** ¿La petición trae una cookie válida para este código? (APIs de la reserva) */
export function hasReservaAccess(request: Request, rawCode: unknown): boolean {
  const code = normalizeReservaCode(rawCode)
  if (!code) return false
  const value = readCookie(request.headers.get('cookie'), reservaCookieName(code))
  return verifyReservaCookie(code, value)
}

export function reservaCookieOptions() {
  return {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax' as const,
    path:     '/',
    maxAge:   RESERVA_COOKIE_MAX_AGE_S,
  }
}

/** Correo normalizado: NFKC, sin espacios, minúsculas. */
export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : ''
}

const DUMMY_EMAIL_HASH = createHash('sha256').update('\u0000no-reservation\u0000').digest()

/**
 * Compara el correo escrito con el de la cita en tiempo constante (sobre el
 * hash, así la longitud no importa). Sin correo guardado se compara contra un
 * hash ficticio para que el costo sea el mismo y nunca coincida.
 */
export function emailMatches(input: unknown, stored: unknown): boolean {
  const a = normalizeEmail(input)
  const b = normalizeEmail(stored)
  const ha = createHash('sha256').update(a).digest()
  const hb = b ? createHash('sha256').update(b).digest() : DUMMY_EMAIL_HASH
  const equal = timingSafeEqual(ha, hb)
  return equal && a.length > 0 && b.length > 0
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag':  'noindex, nofollow',
} as const
