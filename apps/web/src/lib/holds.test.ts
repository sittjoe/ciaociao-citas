import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('firebase-admin/firestore', async () => (await import('@/test/fake-firestore')).firestoreModule())
vi.mock('./firebase-admin', async () => ({ adminDb: (await import('@/test/fake-firestore')).fakeDb }))
const M = vi.hoisted(() => ({
  alert: vi.fn(async (..._a: unknown[]) => ({ sent: true, recipients: 1 })),
  expired: vi.fn(async (..._a: unknown[]) => {}),
}))
vi.mock('./email', () => ({ sendPendingRequestAlert: M.alert, sendRequestExpiredNotices: M.expired }))
vi.mock('./google-calendar', () => ({}))

import { Timestamp } from '@google-cloud/firestore'
import { fakeStore } from '@/test/fake-firestore'
import { releaseExpiredHolds, PENDING_ALERT_AFTER_MS } from './holds'
import { slotLockRef } from './slot-locks'

const MIN = 60_000

function setup(opts: { status?: string | null; slotInMs: number; createdAgoMs: number; heldAgoMs?: number; alerted?: boolean }) {
  const now = Date.now()
  const slotTs = Timestamp.fromMillis(now + opts.slotInMs)
  fakeStore.put('slots/S1', {
    datetime: slotTs,
    available: false,
    bookedBy: 'A1',
    heldUntil: Timestamp.fromMillis(now - (opts.heldAgoMs ?? 1)),
  })
  fakeStore.put(slotLockRef(slotTs).path, { appointmentId: 'A1' })
  if (opts.status !== null) {
    fakeStore.put('appointments/A1', {
      status: opts.status ?? 'pending',
      slotId: 'S1',
      slotDatetime: slotTs,
      name: 'Ana',
      email: 'ana@example.com',
      phone: '+525512345678',
      confirmationCode: 'ABCD2345',
      cancelToken: 'T'.repeat(32),
      identificationUrl: 'identifications/x.jpg',
      createdAt: Timestamp.fromMillis(now - opts.createdAgoMs),
      ...(opts.alerted ? { pendingAlertSentAt: Timestamp.fromMillis(now - MIN) } : {}),
    })
  }
  return slotTs
}

describe('holds: una solicitud enviada ya no se cancela en silencio', () => {
  beforeEach(() => {
    fakeStore.reset()
    M.alert.mockClear()
    M.expired.mockClear()
  })

  it('el aviso al equipo es a los 20 min', () => {
    expect(PENDING_ALERT_AFTER_MS).toBe(20 * MIN)
  })

  it('a los 20+ min sin atender: NO se cancela, se avisa al equipo una vez y el horario sigue apartado', async () => {
    const slotTs = setup({ slotInMs: 3 * 86_400_000, createdAgoMs: 31 * MIN })
    const r1 = await releaseExpiredHolds()
    expect(r1).toEqual({ released: 0, alerted: 1, expired: 0 })
    expect(fakeStore.get('appointments/A1')!.status).toBe('pending')
    expect(fakeStore.get('appointments/A1')!.pendingAlertSentAt).toBeDefined()
    const slot = fakeStore.get('slots/S1')!
    expect(slot.available).toBe(false)
    expect(slot.bookedBy).toBe('A1')
    // Siguiente revisión: a la hora de la cita.
    expect((slot.heldUntil as Timestamp).toMillis()).toBe(slotTs.toMillis())
    expect(M.alert).toHaveBeenCalledTimes(1)
    expect((M.alert.mock.calls[0] as unknown[])[1]).toBe(31)

    // Llamadas repetidas (cada visita a /api/slots) no duplican el aviso.
    await releaseExpiredHolds()
    await releaseExpiredHolds()
    expect(M.alert).toHaveBeenCalledTimes(1)
    expect(M.expired).not.toHaveBeenCalled()
  })

  it('si ya se avisó (p.ej. tras reprogramar), solo se re-agenda la revisión', async () => {
    setup({ slotInMs: 86_400_000, createdAgoMs: 2 * 3_600_000, alerted: true })
    const r = await releaseExpiredHolds()
    expect(r).toEqual({ released: 0, alerted: 0, expired: 0 })
    expect(M.alert).not.toHaveBeenCalled()
    expect(fakeStore.get('appointments/A1')!.status).toBe('pending')
  })

  it('si llega su horario sin respuesta: se cancela AVISANDO a la clienta y al equipo', async () => {
    const slotTs = setup({ slotInMs: -MIN, createdAgoMs: 3 * 86_400_000, alerted: true })
    const r = await releaseExpiredHolds()
    expect(r).toEqual({ released: 0, alerted: 0, expired: 1 })
    const a = fakeStore.get('appointments/A1')!
    expect(a.status).toBe('cancelled')
    expect(a.cancelReason).toBe('expired_unattended')
    expect(fakeStore.get('slots/S1')!.available).toBe(true)
    expect(fakeStore.get(slotLockRef(slotTs).path)).toBeUndefined()
    expect(M.expired).toHaveBeenCalledTimes(1)
    const [appt] = M.expired.mock.calls[0] as [{ id: string; email: string; status: string }]
    expect(appt).toMatchObject({ id: 'A1', email: 'ana@example.com', status: 'cancelled' })
    // Queda en la bitácora de la cita.
    expect(fakeStore.list('appointments/A1/events')[0].data.actor).toBe('system')
  })

  it('hold huérfano (cita cancelada/rechazada/inexistente): se libera sin avisar a nadie', async () => {
    for (const status of ['cancelled', 'rejected', null] as const) {
      fakeStore.reset()
      setup({ status, slotInMs: 86_400_000, createdAgoMs: 40 * MIN })
      const r = await releaseExpiredHolds()
      expect(r.released).toBe(1)
      expect(fakeStore.get('slots/S1')).toMatchObject({ available: true, bookedBy: null, heldUntil: null })
    }
    expect(M.alert).not.toHaveBeenCalled()
    expect(M.expired).not.toHaveBeenCalled()
  })

  it('cita aceptada: solo se limpia el hold', async () => {
    setup({ status: 'accepted', slotInMs: 86_400_000, createdAgoMs: 40 * MIN })
    const r = await releaseExpiredHolds()
    expect(r).toEqual({ released: 0, alerted: 0, expired: 0 })
    expect(fakeStore.get('slots/S1')).toMatchObject({ available: false, bookedBy: 'A1', heldUntil: null })
  })

  it('un hold que aún no vence no se toca', async () => {
    const now = Date.now()
    fakeStore.put('slots/S1', { available: false, bookedBy: 'A1', heldUntil: Timestamp.fromMillis(now + 5 * MIN) })
    expect(await releaseExpiredHolds()).toEqual({ released: 0, alerted: 0, expired: 0 })
  })
})
