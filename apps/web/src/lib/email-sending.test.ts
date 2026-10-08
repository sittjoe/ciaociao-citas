import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

// Resend falso (4.x NO lanza: devuelve { data, error }) + Firestore en memoria.
const R = vi.hoisted(() => ({
  sent: [] as { payload: Record<string, unknown>; opts?: { idempotencyKey?: string } }[],
  cancelled: [] as string[],
  sendError: null as null | { name: string; message: string },
  cancelError: null as null | { name: string; message: string },
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
        return R.cancelError ? { data: null, error: R.cancelError } : { data: { object: 'email', id }, error: null }
      },
    }
  },
}))
vi.mock('firebase-admin/firestore', async () => (await import('@/test/fake-firestore')).firestoreModule())
vi.mock('./firebase-admin', async () => ({ adminDb: (await import('@/test/fake-firestore')).fakeDb }))

import { Timestamp } from '@google-cloud/firestore'
import { fakeStore } from '@/test/fake-firestore'
import * as E from './email'
import * as D from './email-daily'
import type { Appointment } from '@/types'

const TZ = 'America/Mexico_City'
const cdmx = (s: string) => fromZonedTime(s, TZ)

function appt(over: Partial<Appointment> = {}): Appointment {
  return {
    id: 'APPT1',
    slotId: 'S1',
    slotDatetime: cdmx('2026-10-20T13:00:00'),
    appointmentType: 'showroom',
    name: 'Ana López',
    email: 'ana@example.com',
    phone: '+52 55 1234 5678',
    identificationUrl: 'x',
    status: 'accepted',
    confirmationCode: 'ABCD2345',
    cancelToken: 'T'.repeat(32),
    reminder24Sent: false,
    reminder2Sent: false,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  }
}

const text = (html: unknown) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test_dummy')
  vi.stubEnv('ADMIN_EMAIL', 'equipo@example.com')
  fakeStore.reset()
  R.sent.length = 0
  R.cancelled.length = 0
  R.sendError = null
  R.cancelError = null
  vi.useRealTimers()
})

describe('Resend devuelve error (no lanza): ya no se registra como enviado', () => {
  it('sendStatusUpdate lanza, el outbox queda failed y emailEvents ok:false', async () => {
    R.sendError = { name: 'rate_limit_exceeded', message: 'Too many requests' }
    await expect(E.sendStatusUpdate(appt(), 'accept')).rejects.toThrow(/Too many requests/)
    const outbox = fakeStore.list('emailOutbox')
    expect(outbox).toHaveLength(1)
    expect(outbox[0].data.status).toBe('failed')
    const events = fakeStore.list('emailEvents')
    expect(events.every(e => e.data.ok === false)).toBe(true)
  })

  it('retryEmailOutbox no marca como enviado si Resend sigue fallando; sí cuando se recupera', async () => {
    R.sendError = { name: 'application_error', message: 'boom' }
    await E.sendStatusUpdate(appt(), 'reject').catch(() => {})
    const r1 = await E.retryEmailOutbox()
    expect(r1.sent).toBe(0)
    expect(r1.failed).toBe(1)
    expect(fakeStore.list('emailOutbox')[0].data.status).toBe('failed')
    R.sendError = null
    const r2 = await E.retryEmailOutbox()
    expect(r2.sent).toBe(1)
    expect(fakeStore.list('emailOutbox')[0].data.status).toBe('sent')
  })

  it('el outbox reusa la Idempotency-Key y no reenvía un «en 2 horas» caducado', async () => {
    R.sendError = { name: 'application_error', message: 'boom' }
    await E.sendReminder(appt(), 2, { idempotencyKey: 'cron-h2/APPT1-1', notAfter: new Date(Date.now() + 60_000) }).catch(() => {})
    R.sendError = null
    await E.retryEmailOutbox()
    expect(R.sent.at(-1)!.opts?.idempotencyKey).toBe('cron-h2/APPT1-1')

    fakeStore.reset()
    R.sendError = { name: 'application_error', message: 'boom' }
    await E.sendReminder(appt(), 2, { notAfter: new Date(Date.now() - 1) }).catch(() => {})
    R.sendError = null
    const before = R.sent.length
    const r = await E.retryEmailOutbox()
    expect(R.sent.length).toBe(before)
    expect(r.abandoned).toBe(1)
    expect(fakeStore.list('emailOutbox')[0].data.status).toBe('expired')
  })

  it('los correos del cron diario (email-daily) también lanzan', async () => {
    R.sendError = { name: 'validation_error', message: 'invalid to' }
    await expect(D.sendPostVisitThanks({ appointmentId: 'X', name: 'A', email: 'a@example.com', isVideo: false }))
      .rejects.toThrow(/invalid to/)
    expect(fakeStore.list('emailOutbox')[0].data.status).toBe('failed')
  })

  it('si falla el correo a la clienta, la «Nueva solicitud» al equipo sale igual', async () => {
    let n = 0
    R.sendError = null
    const realPush = R.sent.push.bind(R.sent)
    R.sent.push = (...items) => { n++; R.sendError = n === 1 ? { name: 'validation_error', message: 'bad client email' } : null; return realPush(...items) }
    await expect(E.sendBookingConfirmation(appt({ status: 'pending' }))).rejects.toThrow(/bad client email/)
    R.sent.push = realPush
    expect(R.sent.map(s => s.payload.subject)).toEqual([
      expect.stringMatching(/^Solicitud recibida/),
      expect.stringMatching(/^Nueva solicitud/),
    ])
  })
})

describe('cancelar recordatorios programados revisa el resultado', () => {
  it('éxito: no deja pendientes', async () => {
    const r = await E.cancelScheduledReminderEmails({ h24: 'em_a', h2: 'em_b' }, { retryDelaysMs: [] })
    expect(r.cancelled).toEqual(['em_a', 'em_b'])
    expect(fakeStore.list('scheduledEmailCancels')).toHaveLength(0)
  })

  it('error transitorio: reintenta y, si sigue, lo deja para el cron; el cron lo termina', async () => {
    R.cancelError = { name: 'rate_limit_exceeded', message: 'Too many' }
    const r = await E.cancelScheduledReminderEmails({ h24: 'em_a' }, { appointmentId: 'APPT1', retryDelaysMs: [0, 0] })
    expect(R.cancelled).toEqual(['em_a', 'em_a', 'em_a'])
    expect(r.pending).toEqual(['em_a'])
    const pend = fakeStore.get('scheduledEmailCancels/em_a')!
    expect(pend.status).toBe('pending')
    expect(pend.appointmentId).toBe('APPT1')

    R.cancelError = null
    const retry = await E.retryPendingScheduledEmailCancels()
    expect(retry.cancelled).toBe(1)
    expect(fakeStore.get('scheduledEmailCancels/em_a')!.status).toBe('cancelled')
  })

  it('«ya enviado / no existe» no se reintenta para siempre', async () => {
    R.cancelError = { name: 'not_found', message: 'Email not found' }
    const r = await E.cancelScheduledReminderEmails({ h2: 'em_x' }, { retryDelaysMs: [0] })
    expect(r.skipped).toEqual(['em_x'])
    expect(R.cancelled).toHaveLength(1)
    expect(fakeStore.list('scheduledEmailCancels')).toHaveLength(0)
  })
})

describe('correos con reloj de 12 h (como la web)', () => {
  it('confirmación, recordatorio y cancelación dicen «1:00 pm», no «13:00»', async () => {
    const a = appt()
    await E.sendStatusUpdate(a, 'accept')
    await E.sendReminder(a, 2)
    await E.sendCancellationEmail({ ...a, status: 'cancelled' })
    for (const s of R.sent) {
      const t = `${s.payload.subject} ${text(s.payload.html)}`
      expect(t).not.toMatch(/\b13:00\b/)
    }
    expect(text(R.sent[0].payload.html)).toContain('1:00 pm')
  })

  it('el «en 2 horas» programado no lleva «h» de 24 h y dice «mañana» para una cita a las 00:30', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(cdmx('2026-10-17T12:00:00'))
    fakeStore.put('appointments/APPT1', { status: 'accepted', slotDatetime: Timestamp.fromDate(cdmx('2026-10-20T00:30:00')) })
    await E.scheduleAppointmentReminderEmails(appt({ slotDatetime: cdmx('2026-10-20T00:30:00') }))
    const h2 = R.sent.find(s => String(s.payload.subject).includes('2 horas'))!
    expect(h2.payload.subject).toBe('Tu cita es en 2 horas — 12:30 am')
    expect(text(h2.payload.html)).toContain('es mañana a las 12:30 am')
    // El «mañana» programado no sale de madrugada: 08:00 del día anterior.
    const h24 = R.sent.find(s => String(s.payload.subject).startsWith('Confirma'))!
    expect(formatInTimeZone(new Date(String(h24.payload.scheduledAt)), TZ, 'yyyy-MM-dd HH:mm')).toBe('2026-10-19 08:00')
  })
})

describe('ICS en reprogramación y cancelación', () => {
  const icsOf = (s: { payload: Record<string, unknown> }) => {
    const att = (s.payload.attachments as { content: string; contentType?: string }[] | undefined)?.[0]
    return att ? { body: Buffer.from(att.content, 'base64').toString('utf8'), type: att.contentType } : null
  }

  it('reprogramar una cita confirmada adjunta REQUEST con el mismo UID y SEQUENCE mayor', async () => {
    await E.sendRescheduleNotice(appt({ icsSequence: 2 }))
    const ics = icsOf(R.sent[0])!
    expect(ics.type).toMatch(/method=REQUEST/)
    expect(ics.body).toContain('METHOD:REQUEST')
    expect(ics.body).toContain('UID:APPT1@ciaociao.mx')
    expect(ics.body).toContain('SEQUENCE:2')
    expect(ics.body).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
  })

  it('reprogramar una solicitud pendiente no adjunta .ics (no hay evento que mover)', async () => {
    await E.sendRescheduleNotice(appt({ status: 'pending' }))
    expect(icsOf(R.sent[0])).toBeNull()
  })

  it('cancelar una cita que estaba confirmada adjunta METHOD:CANCEL', async () => {
    await E.sendCancellationEmail(appt({ status: 'cancelled', icsSequence: 5 }), { wasAccepted: true })
    const ics = icsOf(R.sent[0])!
    expect(ics.body).toContain('METHOD:CANCEL')
    expect(ics.body).toContain('STATUS:CANCELLED')
    expect(ics.body).toContain('SEQUENCE:5')
  })
})

describe('recordatorios programados con link de video viejo', () => {
  it('la Idempotency-Key cambia si cambia el link (y si cambia la SEQUENCE)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(cdmx('2026-10-15T12:00:00'))
    const base = appt({ appointmentType: 'video_engagement_rings', meetingUrl: null, icsSequence: 0 })
    fakeStore.put('appointments/APPT1', { status: 'accepted', slotDatetime: Timestamp.fromDate(base.slotDatetime) })

    await E.syncScheduledReminderEmails(base)
    const first = R.sent.map(s => s.opts?.idempotencyKey)
    const firstIds = fakeStore.get('appointments/APPT1')!.scheduledEmails
    expect(text(R.sent[1].payload.html)).toContain('Pendiente por enviar')

    R.sent.length = 0
    await E.syncScheduledReminderEmails({ ...base, meetingUrl: 'https://meet.example/nuevo', icsSequence: 1 }, firstIds)
    const second = R.sent.map(s => s.opts?.idempotencyKey)
    expect(R.cancelled.sort()).toEqual(Object.values(firstIds as Record<string, string>).sort())
    for (const k of second) expect(first).not.toContain(k)
    expect(text(R.sent[1].payload.html)).toContain('https://meet.example/nuevo')
    expect(fakeStore.get('appointments/APPT1')!.reminder2Sent).toBe(true)
  })

  it('si la cita se canceló mientras se programaba, lo recién programado se cancela', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(cdmx('2026-10-15T12:00:00'))
    fakeStore.put('appointments/APPT1', { status: 'cancelled', slotDatetime: Timestamp.fromDate(appt().slotDatetime) })
    const ids = await E.syncScheduledReminderEmails(appt())
    expect(ids).toEqual({})
    expect(R.cancelled).toHaveLength(2)
  })

  it('si Resend rechaza la programación, el flag queda en false para que el cron lo cubra', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(cdmx('2026-10-15T12:00:00'))
    fakeStore.put('appointments/APPT1', { status: 'accepted', reminder2Sent: true, reminder24Sent: true, slotDatetime: Timestamp.fromDate(appt().slotDatetime) })
    R.sendError = { name: 'application_error', message: 'boom' }
    await E.syncScheduledReminderEmails(appt())
    const d = fakeStore.get('appointments/APPT1')!
    expect(d.reminder24Sent).toBe(false)
    expect(d.reminder2Sent).toBe(false)
  })
})
