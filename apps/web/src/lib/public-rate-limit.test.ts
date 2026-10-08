import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore en memoria: solo lo que usa checkPublicRateLimit (doc + transacción).
const store = new Map<string, Record<string, unknown>>()

vi.mock('./firebase-admin', () => {
  const ref = (id: string) => ({ id })
  return {
    adminDb: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
        get: async (r: { id: string }) => ({ exists: store.has(r.id), data: () => store.get(r.id) }),
        set: (r: { id: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
          store.set(r.id, opts?.merge ? { ...store.get(r.id), ...data } : { ...data })
        },
        update: (r: { id: string }, data: Record<string, unknown>) => {
          store.set(r.id, { ...store.get(r.id), ...data })
        },
      }),
    },
  }
})

import { checkPublicRateLimit, requestIp } from './public-rate-limit'

describe('checkPublicRateLimit', () => {
  beforeEach(() => {
    store.clear()
    vi.useRealTimers()
  })

  it('permite hasta max intentos por ventana y luego limita', async () => {
    const params = { key: 'rsv-access:ipc:1.2.3.4:ABCD2345', windowMs: 60_000, max: 5 }
    const results: boolean[] = []
    for (let i = 0; i < 7; i++) results.push(await checkPublicRateLimit(params))
    expect(results).toEqual([false, false, false, false, false, true, true])
  })

  it('las llaves son independientes (otra IP u otro código)', async () => {
    const base = { windowMs: 60_000, max: 1 }
    expect(await checkPublicRateLimit({ ...base, key: 'k:a' })).toBe(false)
    expect(await checkPublicRateLimit({ ...base, key: 'k:a' })).toBe(true)
    expect(await checkPublicRateLimit({ ...base, key: 'k:b' })).toBe(false)
  })

  it('la ventana se reinicia al vencer', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const params = { key: 'k:win', windowMs: 60_000, max: 1 }
    expect(await checkPublicRateLimit(params)).toBe(false)
    expect(await checkPublicRateLimit(params)).toBe(true)
    vi.setSystemTime(1_800_000_000_000 + 60_001)
    expect(await checkPublicRateLimit(params)).toBe(false)
    vi.useRealTimers()
  })

  it('requestIp toma la primera IP de x-forwarded-for', () => {
    const req = new Request('https://x.test', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })
    expect(requestIp(req)).toBe('9.9.9.9')
  })
})
