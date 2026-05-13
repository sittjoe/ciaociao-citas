import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeToE164,
  renderSmsTemplate,
  sendAppointmentSms,
  sendSms,
} from './sms'

describe('renderSmsTemplate', () => {
  it('renders the confirmation template in es-MX', () => {
    const body = renderSmsTemplate('confirmation', {
      name: 'Ana',
      date: 'lunes 12 de mayo, 2026',
      time: '10:30',
    })
    expect(body).toContain('Hola Ana')
    expect(body).toContain('confirmada')
    expect(body).toContain('lunes 12 de mayo, 2026')
    expect(body).toContain('10:30')
  })

  it('renders the 24h reminder with a reschedule URL', () => {
    const body = renderSmsTemplate('reminder_24h', {
      name: 'Ana',
      date: 'mañana',
      time: '09:00',
      url: 'https://citas.ciaociao.mx/c/abc',
    })
    expect(body).toContain('Recordatorio')
    expect(body).toContain('https://citas.ciaociao.mx/c/abc')
  })

  it('renders the cancellation template', () => {
    const body = renderSmsTemplate('cancellation', {
      name: 'Luis',
      date: 'martes',
      time: '15:00',
    })
    expect(body).toContain('Hola Luis')
    expect(body).toContain('cancelada')
  })
})

describe('normalizeToE164', () => {
  it('passes through already-formatted E.164', () => {
    expect(normalizeToE164('+5215512345678')).toBe('+5215512345678')
  })
  it('converts 10-digit MX local to +52', () => {
    expect(normalizeToE164('5512345678')).toBe('+525512345678')
  })
  it('prefixes a + on a 12-digit 52-leading number', () => {
    expect(normalizeToE164('525512345678')).toBe('+525512345678')
  })
  it('strips formatting characters', () => {
    expect(normalizeToE164('(55) 1234-5678')).toBe('+525512345678')
  })
  it('returns null on empty/invalid input', () => {
    expect(normalizeToE164('')).toBeNull()
    expect(normalizeToE164('abc')).toBeNull()
    expect(normalizeToE164('12')).toBeNull()
  })
})

describe('sendSms feature flag', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns sms_disabled without calling Twilio when ENABLE_SMS is not "true"', async () => {
    vi.stubEnv('ENABLE_SMS', 'false')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok')
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15555550100')
    const res = await sendSms({ to: '+525512345678', body: 'hi' })
    expect(res).toEqual({ ok: false, error: 'sms_disabled' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns sms_disabled when creds are missing even if flag is on', async () => {
    vi.stubEnv('ENABLE_SMS', 'true')
    vi.stubEnv('TWILIO_ACCOUNT_SID', '')
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    vi.stubEnv('TWILIO_FROM_NUMBER', '')
    const res = await sendSms({ to: '+525512345678', body: 'hi' })
    expect(res).toEqual({ ok: false, error: 'sms_disabled' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('sendSms happy path', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubEnv('ENABLE_SMS', 'true')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15555550100')
    fetchSpy.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('POSTs to the correct Twilio URL with basic auth and URL-encoded body', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: 'SM_abc' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const res = await sendSms({ to: '5512345678', body: 'hello world' })
    expect(res).toEqual({ ok: true, sid: 'SM_abc' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchSpy.mock.calls[0]
    expect(calledUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('AC123:secret').toString('base64')}`,
    )
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const params = new URLSearchParams(init.body as string)
    expect(params.get('To')).toBe('+525512345678')
    expect(params.get('From')).toBe('+15555550100')
    expect(params.get('Body')).toBe('hello world')
  })

  it('surfaces Twilio HTTP errors without throwing', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"code": 21211}', { status: 400 }),
    )
    const res = await sendSms({ to: '+525512345678', body: 'x' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/^twilio_400/)
  })

  it('rejects invalid phone numbers before hitting the network', async () => {
    const res = await sendSms({ to: 'not-a-phone', body: 'x' })
    expect(res).toEqual({ ok: false, error: 'invalid_phone' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendAppointmentSms renders the confirmation template and sends it', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: 'SM_x' }), { status: 201 }),
    )
    const res = await sendAppointmentSms({
      to: '5512345678',
      appointment: {
        name: 'Ana',
        date: 'lunes 12 de mayo, 2026',
        time: '10:30',
      },
    })
    expect(res.ok).toBe(true)
    const init = fetchSpy.mock.calls[0][1]
    const params = new URLSearchParams(init.body as string)
    expect(params.get('Body')).toContain('Hola Ana')
    expect(params.get('Body')).toContain('confirmada')
  })
})
