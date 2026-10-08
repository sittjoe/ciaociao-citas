import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromZonedTime } from 'date-fns-tz'

/*
 * Revisión adversarial antes de publicar (oct-2026): escenarios de punta a
 * punta con el módulo de correo REAL, Resend falso (4.x no lanza: devuelve
 * { data, error }) y Firestore en memoria. Nada real se toca.
 */
const R = vi.hoisted(() => ({
  sent: [] as { payload: Record<string, unknown>; opts?: { idempotencyKey?: string } }[],
  cancelled: [] as string[],
  sendError: null as null | { name: string; message: string },
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
        R.sent.push({ payload, opts })
        return R.sendError ? { data: null, error: R.sendError } : { data: { id: `em_${R.sent.length}` }, error: null }
      },
      cancel: async (id: string) => {
        R.cancelled.push(id)
        return { data: { object: 'email', id }, error: null }
      },
    }
  },
}))
vi.mock('firebase-admin/firestore', async () => (await import('@/test/fake-firestore')).firestoreModule())
vi.mock('./firebase-admin', async () => ({ adminDb: (await import('@/test/fake-firestore')).fakeDb, adminStorage: {} }))
vi.mock('./google-calendar', () => ({}))
vi.mock('./public-rate-limit', () => ({ checkPublicRateLimit: async () => false, requestIp: () => '1.2.3.4' }))

import { Timestamp } from '@google-cloud/firestore'
import { fakeStore } from '@/test/fake-firestore'
import { runClientReminders } from './client-reminders'
import { retryEmailOutbox, syncScheduledReminderEmails } from './email'
import { mapAppointment } from './appointment-decision'
import * as confirmRoute from '@/app/api/confirm/[token]/route'

const cdmx = (s: string) => fromZonedTime(s, 'America/Mexico_City')
const TOKEN = 'K'.repeat(32)

function putAppt(id: string, slot: Date, extra: Record<string, unknown> = {}) {
  fakeStore.put(`appointments/${id}`, {
    status: 'accepted',
    slotId: `s-${id}`,
    slotDatetime: Timestamp.fromDate(slot),
    appointmentType: 'showroom',
    name: 'Ana',
    email: `${id}@example.com`,
    phone: '+525512345678',
    confirmationCode: 'ABCD2345',
    cancelToken: TOKEN,
    reminder24Sent: false,
    reminder2Sent: false,
    createdAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
    ...extra,
  })
}

const subjects = () => R.sent.map(s => String(s.payload.subject))
const to = (id: string) => R.sent.filter(s => s.payload.to === `${id}@example.com`)

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test_dummy')
  vi.stubEnv('ADMIN_EMAIL', 'equipo@example.com')
  vi.stubEnv('RESERVA_LINK_SECRET', 'r'.repeat(40))
  fakeStore.reset()
  R.sent.length = 0
  R.cancelled.length = 0
  R.sendError = null
})
afterEach(() => { vi.useRealTimers() })

describe('cron /api/reminders llamado 3 veces seguidas dentro de la ventana', () => {
  it('cada recordatorio sale UNA vez (secuencial, a minutos y en paralelo)', async () => {
    putAppt('h2', cdmx('2026-10-22T12:00:00'))       // ventana 2 h: 09:45–10:15
    putAppt('h24', cdmx('2026-10-23T11:00:00'))      // «mañana» visto desde el 22
    for (const t of ['10:00:00', '10:00:01', '10:05:00']) {
      await runClientReminders(cdmx(`2026-10-22T${t}`))
    }
    await Promise.all([1, 2, 3].map(() => runClientReminders(cdmx('2026-10-22T10:10:00'))))
    expect(to('h2')).toHaveLength(1)
    expect(to('h24')).toHaveLength(1)
    expect(subjects().filter(s => /mañana/.test(s))).toHaveLength(1)
  })
})

describe('cron a las 03:00 CDMX', () => {
  it('no manda «mañana» de madrugada; sí el «en 2 horas» de una cita a las 05:00; el «mañana» sale a las 08:00', async () => {
    putAppt('early', cdmx('2026-10-22T05:00:00'))
    putAppt('tmrw', cdmx('2026-10-23T11:00:00'))
    const r = await runClientReminders(cdmx('2026-10-22T03:00:00'))
    expect(r.quiet).toBe(true)
    expect(r.sent24).toBe(0)
    expect(to('early')).toHaveLength(1)
    expect(String(to('early')[0].payload.subject)).toMatch(/2 horas/)
    expect(to('tmrw')).toHaveLength(0)

    const r8 = await runClientReminders(cdmx('2026-10-22T08:00:00'))
    expect(r8.sent24).toBe(1)
    expect(to('tmrw')).toHaveLength(1)
  })

  it('cita a las 00:30: «mañana» el día anterior a las 08:00 y «en 2 horas» a las 22:30', async () => {
    putAppt('m', cdmx('2026-10-23T00:30:00'))
    await runClientReminders(cdmx('2026-10-22T07:30:00'))
    expect(to('m')).toHaveLength(0)
    await runClientReminders(cdmx('2026-10-22T08:00:00'))
    expect(to('m')).toHaveLength(1)
    await runClientReminders(cdmx('2026-10-22T22:30:00'))
    expect(to('m')).toHaveLength(2)
    expect(String(to('m')[1].payload.subject)).toMatch(/2 horas/)
  })
})

describe('Resend devuelve error en el cron', () => {
  it('libera la marca, deja el outbox failed con su Idempotency-Key y el reintento usa la MISMA llave', async () => {
    putAppt('e', cdmx('2026-10-23T11:00:00'))
    R.sendError = { name: 'rate_limit_exceeded', message: 'Too many requests' }
    const r1 = await runClientReminders(cdmx('2026-10-22T08:00:00'))
    expect(r1.sent24).toBe(0)
    expect(r1.errors.join()).toMatch(/Too many requests/)
    expect(fakeStore.get('appointments/e')!.reminder24Sent).toBe(false)
    const outbox = fakeStore.list('emailOutbox')
    expect(outbox).toHaveLength(1)
    expect(outbox[0].data.status).toBe('failed')
    const key = outbox[0].data.idempotencyKey
    expect(key).toMatch(/^cron-h24\/e-/)

    // Resend se recupera: el outbox reintenta con la misma llave…
    R.sendError = null
    const retry = await retryEmailOutbox()
    expect(retry.sent).toBe(1)
    expect(R.sent.at(-1)!.opts?.idempotencyKey).toBe(key)

    // …y la siguiente corrida del cron vuelve a tomar la marca (quedó en false):
    // manda OTRA vez con la misma llave. Solo la deduplicación de Resend (24 h,
    // mismo payload) evita el doble correo real.
    await runClientReminders(cdmx('2026-10-22T08:30:00'))
    const attempts = R.sent.filter(s => s.opts?.idempotencyKey === key)
    expect(attempts.length).toBe(3)
    expect(fakeStore.get('appointments/e')!.reminder24Sent).toBe(true)
  })
})

describe('reprogramar después de enviado el recordatorio de 24 h', () => {
  it('la cita nueva recibe su propio «mañana» (las marcas se reinician al reprogramar)', async () => {
    putAppt('r', cdmx('2026-10-23T11:00:00'))
    await runClientReminders(cdmx('2026-10-22T08:00:00'))
    expect(to('r')).toHaveLength(1)
    // Lo que hacen /api/reschedule y el reagendado del admin dentro de su transacción.
    fakeStore.put('appointments/r', {
      ...fakeStore.get('appointments/r')!,
      slotDatetime: Timestamp.fromDate(cdmx('2026-10-27T11:00:00')),
      reminder24Sent: false,
      reminder2Sent: false,
    })
    await runClientReminders(cdmx('2026-10-22T09:00:00'))
    expect(to('r')).toHaveLength(1)                  // aún no es «mañana»
    await runClientReminders(cdmx('2026-10-26T08:00:00'))
    expect(to('r')).toHaveLength(2)
    expect(String(to('r')[1].payload.subject)).toMatch(/27 de octubre/)
  })

  it('cambiar el link de video DESPUÉS de que el cron mandó «mañana» no programa un segundo «mañana»', async () => {
    // Cita a >30 días al aceptarse: nada quedó programado en Resend; el cron
    // mandó «mañana» a las 08:00 del día anterior.
    putAppt('v', cdmx('2026-10-23T15:00:00'), { appointmentType: 'video_engagement_rings' })
    await runClientReminders(cdmx('2026-10-22T08:00:00'))
    expect(to('v')).toHaveLength(1)

    // 10:00: el equipo pone el link → commercial/route llama syncScheduledReminderEmails.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(cdmx('2026-10-22T10:00:00'))
    const data = fakeStore.get('appointments/v')!
    const updated = { ...mapAppointment('v', data), meetingUrl: 'https://meet.example/x', icsSequence: 1 }
    await syncScheduledReminderEmails(updated, data.scheduledEmails ?? null)
    const confirms = to('v').filter(s => /mañana/.test(String(s.payload.subject)))
    expect(confirms).toHaveLength(1)
    // El «en 2 horas» sí se programa con el link nuevo.
    expect(to('v').some(s => s.payload.scheduledAt && /2 horas/.test(String(s.payload.subject)))).toBe(true)
  })
})

describe('confirmación con POST repetido', () => {
  function post() {
    return confirmRoute.POST(
      new Request(`https://citas.test/api/confirm/${TOKEN}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'citas.test', origin: 'https://citas.test' },
        body: JSON.stringify({ token: TOKEN }),
      }),
      { params: Promise.resolve({ token: TOKEN }) },
    )
  }

  it('el primero confirma; los siguientes responden «ya estaba» sin reescribir', async () => {
    putAppt('c', new Date(Date.now() + 3 * 86_400_000))
    const first = await (await post()).json()
    expect(first).toMatchObject({ ok: true, alreadyConfirmed: false })
    const at = fakeStore.get('appointments/c')!.clientConfirmedAt
    for (let i = 0; i < 3; i++) {
      const res = await post()
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, alreadyConfirmed: true })
    }
    expect(fakeStore.get('appointments/c')!.clientConfirmedAt).toBe(at)
  })

  it('doble clic en paralelo: ambos responden 200 y la cita queda confirmada', async () => {
    putAppt('c', new Date(Date.now() + 3 * 86_400_000))
    const res = await Promise.all([post(), post()])
    expect(res.map(r => r.status)).toEqual([200, 200])
    expect(fakeStore.get('appointments/c')!.clientConfirmed).toBe(true)
  })

  it('una cita cancelada no se confirma por POST', async () => {
    putAppt('c', new Date(Date.now() + 3 * 86_400_000), { status: 'cancelled' })
    const res = await post()
    expect(res.status).toBe(409)
    expect(fakeStore.get('appointments/c')!.clientConfirmed).toBeUndefined()
  })
})
