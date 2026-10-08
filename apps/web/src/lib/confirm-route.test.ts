import { beforeEach, describe, expect, it, vi } from 'vitest'

// Ninguna prueba toca Firestore real ni manda correos: todo va mockeado.
const TOKEN = 'T'.repeat(32)
const { store, update, rateLimit } = vi.hoisted(() => ({
  store: { data: null as Record<string, unknown> | null },
  update: vi.fn(async (_patch: Record<string, unknown>) => {}),
  rateLimit: vi.fn(async (_p: { key: string }) => false),
}))

vi.mock('./firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      where: (field: string, _op: string, value: unknown) => ({
        limit: () => ({
          get: async () => {
            const hit = store.data !== null && store.data[field] === value
            const docs = hit ? [{ id: 'appt-1', ref: { id: 'appt-1', update }, data: () => store.data }] : []
            return { empty: docs.length === 0, docs }
          },
        }),
      }),
    }),
  },
  adminStorage: {},
}))
vi.mock('./public-rate-limit', () => ({
  checkPublicRateLimit: rateLimit,
  requestIp: () => '1.2.3.4',
}))

import * as confirmRoute from '@/app/api/confirm/[token]/route'
import { getConfirmation } from './appointment-confirm'

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
const ts = (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() })

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    name: 'María',
    confirmationCode: 'ABCD2345',
    cancelToken: TOKEN,
    status: 'accepted',
    clientConfirmed: false,
    slotDatetime: ts(FUTURE),
    ...overrides,
  }
}

function post(token = TOKEN, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: 'citas.test',
    origin: 'https://citas.test',
    ...init.headers,
  }
  return confirmRoute.POST(
    new Request(`https://citas.test/api/confirm/${token}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(init.body === undefined ? { token } : init.body),
    }),
    { params: Promise.resolve({ token }) },
  )
}

describe('/api/confirm/[token]', () => {
  beforeEach(() => {
    vi.stubEnv('RESERVA_LINK_SECRET', 'r'.repeat(40))
    store.data = appointment()
    update.mockClear()
    rateLimit.mockReset()
    rateLimit.mockResolvedValue(false)
  })

  it('no exporta GET: abrir la URL nunca confirma', () => {
    expect((confirmRoute as Record<string, unknown>).GET).toBeUndefined()
    expect((confirmRoute as Record<string, unknown>).HEAD).toBeUndefined()
  })

  it('la lectura de la página (GET) no muta la cita', async () => {
    const view = await getConfirmation(TOKEN)
    expect(view.state).toBe('pending_client')
    expect(update).not.toHaveBeenCalled()
  })

  it('POST confirma y devuelve resumen con enlace firmado a la reserva', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, alreadyConfirmed: false, code: 'ABCD2345', name: 'María' })
    expect(json.timeStr).toMatch(/^\d{1,2}:\d{2} (am|pm)$/)
    expect(json.reservaHref).toMatch(/^\/reserva\/ABCD2345\?t=[A-Za-z0-9_-]+$/)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toMatchObject({ clientConfirmed: true })
  })

  it('es idempotente: si ya estaba confirmada responde amable y no escribe', async () => {
    store.data = appointment({ clientConfirmed: true })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, alreadyConfirmed: true })
    expect(update).not.toHaveBeenCalled()
  })

  it('token inexistente → 404 sin escribir', async () => {
    const other = 'X'.repeat(32)
    const res = await post(other)
    expect(res.status).toBe(404)
    expect(update).not.toHaveBeenCalled()
  })

  it('token mal formado → 404 y ni siquiera consulta el rate limit', async () => {
    const res = await post('corto')
    expect(res.status).toBe(404)
    expect(rateLimit).not.toHaveBeenCalled()
  })

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['rejected', { status: 'rejected' }],
    ['awaiting_team', { status: 'pending' }],
    ['past', { slotDatetime: ts(new Date(Date.now() - 60 * 60 * 1000)) }],
  ])('estado %s → 409 sin escribir', async (state, overrides) => {
    store.data = appointment(overrides)
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).state).toBe(state)
    expect(update).not.toHaveBeenCalled()
  })

  it('rechaza otro origen (CSRF) sin escribir', async () => {
    const res = await post(TOKEN, { headers: { origin: 'https://malo.example' } })
    expect(res.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('rechaza Sec-Fetch-Site cross-site cuando no hay Origin', async () => {
    const res = await post(TOKEN, { headers: { origin: '', 'sec-fetch-site': 'cross-site' } })
    expect(res.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('exige el token en el cuerpo JSON', async () => {
    expect((await post(TOKEN, { body: {} })).status).toBe(400)
    expect((await post(TOKEN, { body: { token: 'Y'.repeat(32) } })).status).toBe(400)
    expect((await post(TOKEN, { headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    expect(update).not.toHaveBeenCalled()
  })

  it('respeta el rate limit', async () => {
    rateLimit.mockResolvedValue(true)
    const res = await post()
    expect(res.status).toBe(429)
    expect(update).not.toHaveBeenCalled()
  })
})
