import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromZonedTime } from 'date-fns-tz'

vi.mock('firebase-admin/firestore', async () => (await import('@/test/fake-firestore')).firestoreModule())
vi.mock('./firebase-admin', async () => ({ adminDb: (await import('@/test/fake-firestore')).fakeDb }))
const M = vi.hoisted(() => ({ send: vi.fn(async (..._a: unknown[]) => ({ sent: true as const, recipients: 2 })) }))
vi.mock('./email', () => ({
  isEmailConfigured: () => true,
  sendSlotsReminderEmail: M.send,
  ResendError: class ResendError extends Error {},
}))

import { fakeStore } from '@/test/fake-firestore'
import { GET } from '@/app/api/cron/slots-reminder/route'

const cdmx = (s: string) => fromZonedTime(s, 'America/Mexico_City')
const call = () => GET(new Request('https://citas.test/api/cron/slots-reminder', { headers: { Authorization: 'Bearer s3cret' } }))

/* Hay un llamador externo que pega a los crons cada ~30 min: el recordatorio
   semanal de publicar horarios debe salir UNA vez por semana y nunca de noche. */
describe('cron slots-reminder: robusto a cualquier frecuencia', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    fakeStore.reset()
    M.send.mockClear()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => vi.useRealTimers())

  it('de madrugada no manda', async () => {
    vi.setSystemTime(cdmx('2026-10-12T03:00:00'))
    const res = await call()
    expect((await res.json()).skipped).toBe('fuera_de_horario')
    expect(M.send).not.toHaveBeenCalled()
  })

  it('llamado cada 30 min toda la semana: un solo correo', async () => {
    for (let day = 12; day <= 18; day++) {
      for (let h = 0; h < 24; h++) {
        for (const m of ['00', '30']) {
          vi.setSystemTime(cdmx(`2026-10-${day}T${String(h).padStart(2, '0')}:${m}:00`))
          await call()
        }
      }
    }
    expect(M.send).toHaveBeenCalledTimes(1)
    // Y la semana siguiente vuelve a salir.
    vi.setSystemTime(cdmx('2026-10-19T09:00:00'))
    await call()
    expect(M.send).toHaveBeenCalledTimes(2)
  })

  it('si falla ANTES de Resend (p.ej. leer destinatarios) suelta la marca y la siguiente corrida lo manda', async () => {
    vi.setSystemTime(cdmx('2026-10-12T09:00:00'))
    M.send.mockImplementationOnce(async () => { throw new Error('firestore unavailable') })
    expect((await call()).status).toBe(500)
    expect(fakeStore.get('slotsReminderRuns/2026-W42')).toBeUndefined()
    vi.setSystemTime(cdmx('2026-10-12T09:30:00'))
    await call()
    expect(M.send).toHaveBeenCalledTimes(2)
    expect(fakeStore.get('slotsReminderRuns/2026-W42')!.status).toBe('sent')
  })

  it('si Resend rechaza, conserva la marca (el outbox lo reintenta; no se duplica)', async () => {
    const { ResendError } = await import('./email')
    vi.setSystemTime(cdmx('2026-10-12T09:00:00'))
    M.send.mockImplementationOnce(async () => { throw new ResendError('rate_limit_exceeded') })
    await call()
    vi.setSystemTime(cdmx('2026-10-12T09:30:00'))
    await call()
    expect(M.send).toHaveBeenCalledTimes(1)
    expect(fakeStore.get('slotsReminderRuns/2026-W42')!.status).toBe('failed')
  })
})
