import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ninguna prueba toca Firestore real ni manda correos: todo va mockeado.
const { appointment, runTransaction, rateLimit } = vi.hoisted(() => ({
  appointment: {
  id: 'appt-1',
  data: {
    confirmationCode: 'ABCD2345',
    email: 'maria@ejemplo.com',
    cancelToken: 'T'.repeat(32),
    status: 'accepted',
    slotId: 'slot-1',
    slotDatetime: { toDate: () => new Date('2030-01-01T18:00:00Z'), toMillis: () => Date.parse('2030-01-01T18:00:00Z') },
    createdAt: { toDate: () => new Date('2029-12-01T18:00:00Z') },
  },
  },
  runTransaction: vi.fn(),
  rateLimit: vi.fn(async (_p: { key: string }) => false),
}))

vi.mock('./firebase-admin', () => {
  const query = (field: string, value: unknown) => ({
    limit: () => ({
      get: async () => {
        const hit = (appointment.data as Record<string, unknown>)[field] === value
        const docs = hit
          ? [{ id: appointment.id, ref: { id: appointment.id, update: vi.fn() }, data: () => appointment.data }]
          : []
        return { empty: docs.length === 0, docs }
      },
    }),
  })
  return {
    adminDb: {
      collection: () => ({ where: (field: string, _op: string, value: unknown) => query(field, value) }),
      runTransaction,
    },
    adminStorage: {},
  }
})
vi.mock('./public-rate-limit', () => ({
  checkPublicRateLimit: rateLimit,
  requestIp: () => '1.2.3.4',
}))
vi.mock('./email', () => ({
  sendCancellationEmail: vi.fn(async () => {}),
  cancelScheduledReminderEmails: vi.fn(async () => {}),
  sendRescheduleNotice: vi.fn(async () => {}),
  sendCalendarError: vi.fn(async () => {}),
  syncScheduledReminderEmails: vi.fn(async () => {}),
}))
vi.mock('./google-calendar', () => ({
  deleteAppointmentCalendarEvent: vi.fn(),
  updateAppointmentCalendarEvent: vi.fn(),
}))
vi.mock('./appointment-events', () => ({ logAppointmentEvent: vi.fn(async () => {}) }))

import { POST as accesoPOST } from '@/app/api/reserva/[code]/acceso/route'
import { GET as entrarGET } from '@/app/api/reserva/[code]/entrar/route'
import { POST as cancelPOST } from '@/app/api/cancel/[token]/route'
import { POST as reschedulePOST } from '@/app/api/reschedule/[token]/route'
import { reservaCookieName, signReservaCookie, signReservaLinkToken } from './reserva-access'

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

function acceso(code: string, email: unknown) {
  return accesoPOST(
    new Request(`https://citas.test/api/reserva/${code}/acceso`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
    params({ code }),
  )
}

describe('API de la reserva: exigen credencial', () => {
  beforeEach(() => {
    vi.stubEnv('RESERVA_LINK_SECRET', 'r'.repeat(40))
    runTransaction.mockReset()
    rateLimit.mockReset()
    rateLimit.mockResolvedValue(false)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('cancelar sin cookie de acceso → 403 y no toca la cita', async () => {
    const res = await cancelPOST(
      new Request(`https://citas.test/api/cancel/${appointment.data.cancelToken}`, { method: 'POST' }),
      params({ token: appointment.data.cancelToken }),
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('cancelar con cookie de OTRA reserva → 403', async () => {
    const other = signReservaCookie('ZZZZ2345')!
    const res = await cancelPOST(
      new Request(`https://citas.test/api/cancel/${appointment.data.cancelToken}`, {
        method: 'POST',
        headers: { cookie: `${reservaCookieName('ZZZZ2345')}=${other}` },
      }),
      params({ token: appointment.data.cancelToken }),
    )
    expect(res.status).toBe(403)
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('cancelar con cookie válida sí llega a la transacción', async () => {
    runTransaction.mockRejectedValue(new Error('ALREADY_CANCELLED'))
    const cookie = signReservaCookie('ABCD2345')!
    const res = await cancelPOST(
      new Request(`https://citas.test/api/cancel/${appointment.data.cancelToken}`, {
        method: 'POST',
        headers: { cookie: `${reservaCookieName('ABCD2345')}=${cookie}` },
      }),
      params({ token: appointment.data.cancelToken }),
    )
    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(409)
  })

  it('reagendar sin cookie de acceso → 403 y no toca la cita', async () => {
    const res = await reschedulePOST(
      new Request(`https://citas.test/api/reschedule/${appointment.data.cancelToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newSlotId: 'slot-2' }),
      }),
      params({ token: appointment.data.cancelToken }),
    )
    expect(res.status).toBe(403)
    expect(runTransaction).not.toHaveBeenCalled()
  })
})

describe('Puerta del correo (/api/reserva/[code]/acceso)', () => {
  beforeEach(() => {
    vi.stubEnv('RESERVA_LINK_SECRET', 'r'.repeat(40))
    rateLimit.mockReset()
    rateLimit.mockResolvedValue(false)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('correo correcto (normalizado) → 200 + cookie httpOnly/Secure/Lax con alcance al código', async () => {
    const res = await acceso('abcd2345', '  MARIA@ejemplo.com ')
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${reservaCookieName('ABCD2345')}=`)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/SameSite=lax/i)
    expect(setCookie).toMatch(/Max-Age=2592000/)
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('correo incorrecto y código inexistente dan la MISMA respuesta neutra', async () => {
    const wrong = await acceso('ABCD2345', 'otra@ejemplo.com')
    const missing = await acceso('QQQQ2345', 'maria@ejemplo.com')
    expect(wrong.status).toBe(403)
    expect(missing.status).toBe(403)
    expect(await wrong.json()).toEqual(await missing.json())
    expect(wrong.headers.get('set-cookie')).toBeNull()
    expect(missing.headers.get('set-cookie')).toBeNull()
  })

  it('aplica el rate limit por IP+código antes de verificar', async () => {
    rateLimit.mockResolvedValueOnce(true)
    const res = await acceso('ABCD2345', 'maria@ejemplo.com')
    expect(res.status).toBe(429)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: 'rsv-access:ipc:1.2.3.4:ABCD2345' }))
  })

  it('sin secreto configurado no abre (503) aunque el correo coincida', async () => {
    vi.stubEnv('RESERVA_LINK_SECRET', '')
    vi.stubEnv('SESSION_SECRET', '')
    const res = await acceso('ABCD2345', 'maria@ejemplo.com')
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('Entrada de enlace firmado (/api/reserva/[code]/entrar)', () => {
  beforeEach(() => vi.stubEnv('RESERVA_LINK_SECRET', 'r'.repeat(40)))
  afterEach(() => vi.unstubAllEnvs())

  it('firma válida → cookie + redirección a la URL limpia', async () => {
    const t = signReservaLinkToken('ABCD2345')!
    const res = await entrarGET(new Request(`https://citas.test/api/reserva/ABCD2345/entrar?t=${t}`), params({ code: 'ABCD2345' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://citas.test/reserva/ABCD2345')
    expect(res.headers.get('set-cookie') ?? '').toContain(reservaCookieName('ABCD2345'))
  })

  it('firma inválida → misma redirección pero SIN cookie (cae en la puerta)', async () => {
    const t = signReservaLinkToken('ZZZZ2345')!
    const res = await entrarGET(new Request(`https://citas.test/api/reserva/ABCD2345/entrar?t=${t}`), params({ code: 'ABCD2345' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://citas.test/reserva/ABCD2345')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
