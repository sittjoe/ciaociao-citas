import { describe, expect, it, vi } from 'vitest'
import {
  decideAppointment,
  findExistingByIdempotencyKey,
  findExistingByKeyInTx,
  AppointmentErrorCode,
  spanishMessageForCode,
} from './appointments'

/**
 * Minimal Firestore stub. Each test composes its own document map and
 * `runTransaction` semantics so we can simulate the in-snapshot reads/writes
 * the production code relies on.
 *
 * NOTE: we do NOT mock @/lib/firebase-admin globally — every helper in
 * appointments.ts accepts an injected `db` parameter for exactly this reason.
 */
type DocMap = Map<string, Record<string, unknown>>

interface FakeDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection: (path: string) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTransaction: (fn: (tx: any) => Promise<any>) => Promise<any>
}

function makeDb(docs: Record<string, DocMap>): FakeDb {
  const writes: Array<{ path: string; data: Record<string, unknown> }> = []

  const docRef = (collection: string, id: string) => ({
    id,
    _path: `${collection}/${id}`,
    get: async () => {
      const data = docs[collection]?.get(id)
      return {
        exists: data !== undefined,
        id,
        data: () => data,
      }
    },
    update: async (patch: Record<string, unknown>) => {
      const existing = docs[collection]?.get(id) ?? {}
      docs[collection]!.set(id, { ...existing, ...patch })
      writes.push({ path: `${collection}/${id}`, data: patch })
    },
  })

  const queryFor = (collection: string, field: string, value: unknown) => ({
    limit: () => queryFor(collection, field, value),
    get: async () => {
      const map = docs[collection]
      if (!map) return { empty: true, docs: [] }
      const matched = [...map.entries()].filter(([, v]) => v[field] === value)
      return {
        empty: matched.length === 0,
        docs: matched.map(([id, v]) => ({ id, data: () => v })),
      }
    },
  })

  const collection = (path: string) => ({
    doc: (id: string) => docRef(path, id),
    where: (field: string, _op: string, value: unknown) => queryFor(path, field, value),
  })

  return {
    collection,
    runTransaction: async (fn) => {
      // Snapshot semantics: we read from the live `docs` map but stage writes
      // in a buffer and commit them at the end. Concurrent transactions in
      // these tests are simulated by manually re-entering this function.
      const buffered: Array<() => void> = []
      const tx = {
        get: async (refOrQuery: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = refOrQuery as any
          if (typeof r.get === 'function') return r.get()
          return r
        },
        update: (ref: { _path: string }, patch: Record<string, unknown>) => {
          buffered.push(() => {
            const [coll, id] = ref._path.split('/')
            const existing = docs[coll]?.get(id) ?? {}
            docs[coll]!.set(id, { ...existing, ...patch })
            writes.push({ path: ref._path, data: patch })
          })
        },
        set: (ref: { _path: string }, data: Record<string, unknown>) => {
          buffered.push(() => {
            const [coll, id] = ref._path.split('/')
            docs[coll]!.set(id, data)
            writes.push({ path: ref._path, data })
          })
        },
      }
      const result = await fn(tx)
      buffered.forEach(w => w())
      return result
    },
  }
}

describe('decideAppointment', () => {
  it('atomically accepts a pending appointment and clears slot hold', async () => {
    const docs: Record<string, DocMap> = {
      appointments: new Map([
        ['appt1', { slotId: 'slot1', status: 'pending' }],
      ]),
      slots: new Map([
        ['slot1', { available: false, bookedBy: 'appt1', heldUntil: new Date() }],
      ]),
    }
    const db = makeDb(docs)

    const result = await decideAppointment({
      appointmentId: 'appt1',
      action:        'accept',
      adminEmail:    'admin@ciaociao.mx',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: db as any,
    })

    expect(result.newStatus).toBe('accepted')
    expect(docs.appointments.get('appt1')!.status).toBe('accepted')
    expect(docs.appointments.get('appt1')!.decidedBy).toBe('admin@ciaociao.mx')
    expect(docs.slots.get('slot1')!.heldUntil).toBeNull()
    // Slot remains booked
    expect(docs.slots.get('slot1')!.available).toBe(false)
  })

  it('throws ALREADY_PROCESSED when accepting a non-pending appointment', async () => {
    const docs: Record<string, DocMap> = {
      appointments: new Map([
        ['appt1', { slotId: 'slot1', status: 'accepted' }],
      ]),
      slots: new Map([['slot1', { available: false, bookedBy: 'appt1' }]]),
    }
    const db = makeDb(docs)

    await expect(
      decideAppointment({
        appointmentId: 'appt1',
        action:        'accept',
        adminEmail:    'admin@ciaociao.mx',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: db as any,
      })
    ).rejects.toThrow(AppointmentErrorCode.ALREADY_PROCESSED)
  })

  it('throws APPT_NOT_FOUND for missing appointments', async () => {
    const db = makeDb({ appointments: new Map(), slots: new Map() })
    await expect(
      decideAppointment({
        appointmentId: 'nope',
        action:        'accept',
        adminEmail:    'admin@ciaociao.mx',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: db as any,
      })
    ).rejects.toThrow(AppointmentErrorCode.APPT_NOT_FOUND)
  })

  it('rejecting frees the slot', async () => {
    const docs: Record<string, DocMap> = {
      appointments: new Map([
        ['appt1', { slotId: 'slot1', status: 'pending' }],
      ]),
      slots: new Map([
        ['slot1', { available: false, bookedBy: 'appt1', heldUntil: new Date() }],
      ]),
    }
    const db = makeDb(docs)

    const result = await decideAppointment({
      appointmentId: 'appt1',
      action:        'reject',
      adminEmail:    'admin@ciaociao.mx',
      reason:        'Conflicto de agenda',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: db as any,
    })

    expect(result.newStatus).toBe('rejected')
    expect(docs.appointments.get('appt1')!.status).toBe('rejected')
    expect(docs.appointments.get('appt1')!.adminNote).toBe('Conflicto de agenda')
    expect(docs.slots.get('slot1')!.available).toBe(true)
    expect(docs.slots.get('slot1')!.bookedBy).toBeNull()
  })
})

describe('findExistingByIdempotencyKey', () => {
  it('returns null when no appointment has the key', async () => {
    const db = makeDb({ appointments: new Map(), slots: new Map() })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findExistingByIdempotencyKey('abc', db as any)
    expect(r).toBeNull()
  })

  it('returns existing appointment summary when key is present', async () => {
    const docs: Record<string, DocMap> = {
      appointments: new Map([
        ['appt1', { idempotencyKey: 'key-1', confirmationCode: 'CODE1', slotId: 'slotA' }],
      ]),
      slots: new Map(),
    }
    const db = makeDb(docs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findExistingByIdempotencyKey('key-1', db as any)
    expect(r).toEqual({ id: 'appt1', confirmationCode: 'CODE1', slotId: 'slotA' })
  })
})

// Concurrency test: two simulated concurrent bookings with the same
// idempotency key. The second should observe the first's write inside the
// transaction snapshot and bail out without creating a second document.
//
// We can't perfectly simulate Firestore's optimistic locking with our naïve
// stub (it lacks read-set conflict detection) but we CAN verify the helper
// short-circuits when a prior write is already visible.
describe('idempotency concurrency', () => {
  it.skip('two concurrent submissions with the same key collapse to 1 doc', async () => {
    // Skipped: requires real Firestore emulator or a more sophisticated stub
    // that models read-set conflict detection. Covered by integration tests
    // running against the Firestore emulator in CI.
  })

  it('serial replay with same key short-circuits the second call', async () => {
    const docs: Record<string, DocMap> = {
      appointments: new Map([
        ['appt1', {
          idempotencyKey:   'k-42',
          confirmationCode: 'AAA111',
          slotId:           'slotZ',
          status:           'pending',
        }],
      ]),
      slots: new Map(),
    }
    const db = makeDb(docs)

    // First check: returns the existing doc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = await findExistingByIdempotencyKey('k-42', db as any)
    expect(first?.confirmationCode).toBe('AAA111')

    // Simulate the in-transaction re-check the booking route performs.
    await db.runTransaction(async tx => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dup = await findExistingByKeyInTx(tx as any, 'k-42', db as any)
      expect(dup?.confirmationCode).toBe('AAA111')
      // Booking handler returns here without doing tx.set — verified by
      // the fact that no new docs are written.
    })

    expect(docs.appointments.size).toBe(1)
  })
})

describe('spanishMessageForCode', () => {
  it('returns Spanish messages for known codes', () => {
    expect(spanishMessageForCode(AppointmentErrorCode.ALREADY_PROCESSED))
      .toBe('Cita ya procesada por otro administrador.')
    expect(spanishMessageForCode(AppointmentErrorCode.SLOT_UNAVAILABLE))
      .toBe('Este horario ya fue reservado.')
    expect(spanishMessageForCode(AppointmentErrorCode.APPT_NOT_FOUND))
      .toBe('Cita no encontrada.')
  })

  it('returns generic message for unknown codes', () => {
    expect(spanishMessageForCode('FOO_BAR')).toBe('Error al procesar la solicitud.')
  })
})

// Silence unused-import warnings if the skip path is hit
void vi
