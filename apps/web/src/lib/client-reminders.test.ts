import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromZonedTime } from 'date-fns-tz'

// Firestore en memoria y correos espiados: nada real.
vi.mock('firebase-admin/firestore', async () => (await import('@/test/fake-firestore')).firestoreModule())
vi.mock('./firebase-admin', async () => ({ adminDb: (await import('@/test/fake-firestore')).fakeDb }))
const { sendReminder, sendReminder24Confirm } = vi.hoisted(() => ({
  sendReminder: vi.fn(async (..._a: unknown[]) => {}),
  sendReminder24Confirm: vi.fn(async (..._a: unknown[]) => {}),
}))
vi.mock('./email', () => ({ sendReminder, sendReminder24Confirm }))
vi.mock('./google-calendar', () => ({}))

import { Timestamp } from '@google-cloud/firestore'
import { fakeStore } from '@/test/fake-firestore'
import { runClientReminders } from './client-reminders'

const cdmx = (s: string) => fromZonedTime(s, 'America/Mexico_City')

function putAppt(id: string, slot: Date, extra: Record<string, unknown> = {}) {
  fakeStore.put(`appointments/${id}`, {
    status: 'accepted',
    slotId: `s-${id}`,
    slotDatetime: Timestamp.fromDate(slot),
    appointmentType: 'showroom',
    name: 'Ana',
    email: 'ana@example.com',
    phone: '+525512345678',
    confirmationCode: 'ABCD2345',
    cancelToken: 'T'.repeat(32),
    reminder24Sent: false,
    reminder2Sent: false,
    createdAt: Timestamp.fromDate(new Date('2026-10-01T00:00:00Z')),
    ...extra,
  })
}

describe('cron de recordatorios a clientas: ventanas CDMX + marca idempotente', () => {
  beforeEach(() => {
    fakeStore.reset()
    sendReminder.mockReset()
    sendReminder24Confirm.mockReset()
    sendReminder.mockImplementation(async () => {})
    sendReminder24Confirm.mockImplementation(async () => {})
  })

  it('a las 00:00 CDMX no manda NADA por una cita de las 12:00 (bug de producción)', async () => {
    putAppt('a1', cdmx('2026-10-22T12:00:00'))
    const r = await runClientReminders(cdmx('2026-10-22T00:00:00'))
    expect(r.quiet).toBe(true)
    expect(sendReminder).not.toHaveBeenCalled()
    expect(sendReminder24Confirm).not.toHaveBeenCalled()
  })

  it('a las 23:00 CDMX no manda «mañana» aunque la cita sea mañana', async () => {
    putAppt('a1', cdmx('2026-10-22T11:00:00'))
    await runClientReminders(cdmx('2026-10-21T23:00:00'))
    expect(sendReminder24Confirm).not.toHaveBeenCalled()
  })

  it('no manda «mañana» cuando faltan 2 días', async () => {
    putAppt('a1', cdmx('2026-10-23T11:00:00'))
    await runClientReminders(cdmx('2026-10-21T12:00:00'))
    expect(sendReminder24Confirm).not.toHaveBeenCalled()
  })

  it('«mañana» sale una sola vez aunque el cron se llame cada 30 min todo el día', async () => {
    putAppt('a1', cdmx('2026-10-22T11:00:00'))
    for (let h = 0; h < 24; h++) {
      for (const m of ['00', '30']) {
        await runClientReminders(cdmx(`2026-10-21T${String(h).padStart(2, '0')}:${m}:00`))
      }
    }
    expect(sendReminder24Confirm).toHaveBeenCalledTimes(1)
    expect(fakeStore.get('appointments/a1')!.reminder24Sent).toBe(true)
    const [, opts] = sendReminder24Confirm.mock.calls[0] as [unknown, { idempotencyKey: string }]
    expect(opts.idempotencyKey).toMatch(/^cron-h24\/a1-/)
  })

  it('«en 2 horas» sale una sola vez, entre 1h45 y 2h15 antes', async () => {
    putAppt('a1', cdmx('2026-10-22T12:00:00'))
    const at: string[] = []
    sendReminder.mockImplementation(async () => { at.push(current) })
    let current = ''
    for (const t of ['00:00', '06:00', '09:00', '09:30', '09:45', '10:00', '10:15', '10:30', '11:00']) {
      current = t
      await runClientReminders(cdmx(`2026-10-22T${t}:00`))
    }
    expect(sendReminder).toHaveBeenCalledTimes(1)
    expect(at).toEqual(['09:45'])
  })

  it('dos corridas simultáneas no duplican (marca transaccional)', async () => {
    putAppt('a1', cdmx('2026-10-22T12:00:00'))
    const now = cdmx('2026-10-22T10:00:00')
    await Promise.all([runClientReminders(now), runClientReminders(now)])
    expect(sendReminder).toHaveBeenCalledTimes(1)
  })

  it('si Resend falla, la marca se libera y la siguiente corrida dentro de la ventana reintenta', async () => {
    putAppt('a1', cdmx('2026-10-22T12:00:00'))
    sendReminder.mockImplementationOnce(async () => { throw new Error('rate_limit_exceeded') })
    const r1 = await runClientReminders(cdmx('2026-10-22T09:45:00'))
    expect(r1.errors.join()).toMatch(/2h reminder failed/)
    expect(fakeStore.get('appointments/a1')!.reminder2Sent).toBe(false)
    await runClientReminders(cdmx('2026-10-22T10:15:00'))
    expect(sendReminder).toHaveBeenCalledTimes(2)
    expect(fakeStore.get('appointments/a1')!.reminder2Sent).toBe(true)
  })

  it('no manda a citas canceladas ni a las que ya tienen su recordatorio programado en Resend', async () => {
    putAppt('c1', cdmx('2026-10-22T12:00:00'), { status: 'cancelled' })
    putAppt('p1', cdmx('2026-10-22T12:00:00'), { reminder2Sent: true, reminder24Sent: true })
    await runClientReminders(cdmx('2026-10-22T10:00:00'))
    await runClientReminders(cdmx('2026-10-21T10:00:00'))
    expect(sendReminder).not.toHaveBeenCalled()
    expect(sendReminder24Confirm).not.toHaveBeenCalled()
  })

  it('el aviso usa los datos frescos de la cita (link de video vigente)', async () => {
    putAppt('v1', cdmx('2026-10-22T13:00:00'), {
      appointmentType: 'video_engagement_rings',
      meetingUrl: 'https://meet.example/nuevo',
    })
    await runClientReminders(cdmx('2026-10-22T11:00:00'))
    const [appt] = sendReminder.mock.calls[0] as [{ meetingUrl: string }]
    expect(appt.meetingUrl).toBe('https://meet.example/nuevo')
  })

  it('si el envío falla pero mientras tanto quedó programado en Resend, NO suelta la marca (sin duplicado)', async () => {
    putAppt('a1', cdmx('2026-10-22T12:00:00'))
    sendReminder.mockImplementationOnce(async () => {
      // Carrera: syncScheduledReminderEmails programó el «en 2 horas» y marcó la cita.
      fakeStore.put('appointments/a1', { ...fakeStore.get('appointments/a1')!, scheduledEmails: { h2: 'em_x' }, reminder2Sent: true })
      throw new Error('network')
    })
    await runClientReminders(cdmx('2026-10-22T09:45:00'))
    expect(fakeStore.get('appointments/a1')!.reminder2Sent).toBe(true)
    await runClientReminders(cdmx('2026-10-22T10:15:00'))
    expect(sendReminder).toHaveBeenCalledTimes(1)
  })
})
