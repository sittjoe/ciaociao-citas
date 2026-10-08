import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESERVA_COOKIE_MAX_AGE_S,
  emailMatches,
  hasReservaAccess,
  isReservaAccessConfigured,
  normalizeReservaCode,
  reservaCookieName,
  reservaPath,
  reservaUrl,
  signReservaCookie,
  signReservaLinkToken,
  verifyReservaCookie,
  verifyReservaLinkToken,
} from './reserva-access'

const PRIMARY = 'p'.repeat(40)

describe('reserva-access: enlace firmado', () => {
  beforeEach(() => {
    vi.stubEnv('RESERVA_LINK_SECRET', PRIMARY)
    vi.stubEnv('SESSION_SECRET', 'session-secret')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('firma y verifica el código (sin importar mayúsculas)', () => {
    const t = signReservaLinkToken('abcd2345')!
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(verifyReservaLinkToken('ABCD2345', t)).toBe(true)
    expect(verifyReservaLinkToken('abcd2345', t)).toBe(true)
  })

  it('rechaza firma de otro código, alterada, vacía o con basura', () => {
    const t = signReservaLinkToken('ABCD2345')!
    expect(verifyReservaLinkToken('ABCD2346', t)).toBe(false)
    const flipped = (t[0] === 'A' ? 'B' : 'A') + t.slice(1)
    expect(verifyReservaLinkToken('ABCD2345', flipped)).toBe(false)
    expect(verifyReservaLinkToken('ABCD2345', t.slice(0, 20))).toBe(false)
    expect(verifyReservaLinkToken('ABCD2345', '')).toBe(false)
    expect(verifyReservaLinkToken('ABCD2345', undefined)).toBe(false)
    expect(verifyReservaLinkToken('ABCD2345', 'x'.repeat(500))).toBe(false)
    expect(verifyReservaLinkToken('../etc', t)).toBe(false)
  })

  it('reservaPath/reservaUrl llevan la firma', () => {
    const t = signReservaLinkToken('ABCD2345')
    expect(reservaPath('abcd2345')).toBe(`/reserva/ABCD2345?t=${t}`)
    expect(reservaUrl('https://citas.ciaociao.mx/', 'ABCD2345')).toBe(`https://citas.ciaociao.mx/reserva/ABCD2345?t=${t}`)
  })

  it('un enlace firmado con la clave derivada de SESSION_SECRET sigue valiendo al crear RESERVA_LINK_SECRET', () => {
    vi.stubEnv('RESERVA_LINK_SECRET', '')
    const legacy = signReservaLinkToken('ABCD2345')!
    vi.stubEnv('RESERVA_LINK_SECRET', PRIMARY)
    expect(signReservaLinkToken('ABCD2345')).not.toBe(legacy)
    expect(verifyReservaLinkToken('ABCD2345', legacy)).toBe(true)
  })

  it('ignora un RESERVA_LINK_SECRET demasiado corto', () => {
    vi.stubEnv('RESERVA_LINK_SECRET', 'corto')
    vi.stubEnv('SESSION_SECRET', '')
    expect(isReservaAccessConfigured()).toBe(false)
  })

  it('sin ningún secreto falla cerrado: enlace sin firma y nada verifica', () => {
    const t = signReservaLinkToken('ABCD2345')!
    vi.stubEnv('RESERVA_LINK_SECRET', '')
    vi.stubEnv('SESSION_SECRET', '')
    expect(isReservaAccessConfigured()).toBe(false)
    expect(signReservaLinkToken('ABCD2345')).toBeNull()
    expect(reservaPath('ABCD2345')).toBe('/reserva/ABCD2345')
    expect(verifyReservaLinkToken('ABCD2345', t)).toBe(false)
    expect(signReservaCookie('ABCD2345')).toBeNull()
  })

  it('normaliza y valida códigos', () => {
    expect(normalizeReservaCode(' abcd2345 ')).toBe('ABCD2345')
    expect(normalizeReservaCode('ab')).toBeNull()
    expect(normalizeReservaCode('ABCD 2345')).toBeNull()
    expect(normalizeReservaCode(42)).toBeNull()
  })
})

describe('reserva-access: cookie', () => {
  beforeEach(() => vi.stubEnv('RESERVA_LINK_SECRET', PRIMARY))
  afterEach(() => vi.unstubAllEnvs())

  it('verifica solo para su código y dentro de su vida', () => {
    const now = 1_800_000_000_000
    const c = signReservaCookie('ABCD2345', now)!
    expect(verifyReservaCookie('ABCD2345', c, now + 1000)).toBe(true)
    expect(verifyReservaCookie('ZZZZ2345', c, now + 1000)).toBe(false)
    expect(verifyReservaCookie('ABCD2345', c, now + RESERVA_COOKIE_MAX_AGE_S * 1000 + 1)).toBe(false)
  })

  it('rechaza cookies alteradas (caducidad extendida o firma cambiada)', () => {
    const now = 1_800_000_000_000
    const c = signReservaCookie('ABCD2345', now)!
    const [exp, sig] = c.split('.')
    expect(verifyReservaCookie('ABCD2345', `${Number(exp) + 1000}.${sig}`, now)).toBe(false)
    expect(verifyReservaCookie('ABCD2345', `${exp}.${sig.slice(1)}A`, now)).toBe(false)
    expect(verifyReservaCookie('ABCD2345', 'basura', now)).toBe(false)
    expect(verifyReservaCookie('ABCD2345', undefined, now)).toBe(false)
  })

  it('hasReservaAccess lee la cookie del encabezado de la petición', () => {
    const c = signReservaCookie('ABCD2345')!
    const ok = new Request('https://x.test/api', { headers: { cookie: `otra=1; ${reservaCookieName('ABCD2345')}=${c}` } })
    expect(hasReservaAccess(ok, 'abcd2345')).toBe(true)
    expect(hasReservaAccess(ok, 'ZZZZ2345')).toBe(false)
    expect(hasReservaAccess(new Request('https://x.test/api'), 'ABCD2345')).toBe(false)
  })
})

describe('reserva-access: comparación de correo', () => {
  it('normaliza mayúsculas, espacios y Unicode', () => {
    expect(emailMatches('  Maria@Ejemplo.COM ', 'maria@ejemplo.com')).toBe(true)
    expect(emailMatches('ｍaria@ejemplo.com', 'maria@ejemplo.com')).toBe(true) // NFKC: m de ancho completo
  })

  it('no coincide con otro correo, vacío o sin correo guardado', () => {
    expect(emailMatches('otra@ejemplo.com', 'maria@ejemplo.com')).toBe(false)
    expect(emailMatches('', 'maria@ejemplo.com')).toBe(false)
    expect(emailMatches('maria@ejemplo.com', '')).toBe(false)
    expect(emailMatches('', '')).toBe(false)
    expect(emailMatches(undefined, undefined)).toBe(false)
    expect(emailMatches({ email: 'x' }, 'maria@ejemplo.com')).toBe(false)
  })
})
