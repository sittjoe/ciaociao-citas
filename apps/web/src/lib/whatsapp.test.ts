import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWhatsAppTemplate, sendWhatsAppMessage } from './whatsapp'

describe('renderWhatsAppTemplate', () => {
  it('renders the confirmation template with an informal greeting', () => {
    const body = renderWhatsAppTemplate('confirmation', {
      name: 'Ana',
      date: 'lunes 12 de mayo, 2026',
      time: '10:30',
    })
    expect(body).toContain('¡Hola Ana!')
    expect(body).toContain('Ciao Ciao')
    expect(body).toContain('lunes 12 de mayo, 2026')
    expect(body).toContain('10:30')
  })

  it('renders the 24h reminder with a reschedule URL', () => {
    const body = renderWhatsAppTemplate('reminder_24h', {
      name: 'Ana',
      date: 'mañana',
      time: '09:00',
      url: 'https://citas.ciaociao.mx/c/abc',
    })
    expect(body).toContain('recordamos')
    expect(body).toContain('https://citas.ciaociao.mx/c/abc')
  })

  it('renders the cancellation template', () => {
    const body = renderWhatsAppTemplate('cancellation', {
      name: 'Luis',
      date: 'martes',
      time: '15:00',
    })
    expect(body).toContain('Hola Luis')
    expect(body).toContain('cancelada')
  })
})

describe('sendWhatsAppMessage feature flag', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns whatsapp_disabled without calling Twilio when ENABLE_WHATSAPP is not "true"', async () => {
    vi.stubEnv('ENABLE_WHATSAPP', 'false')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok')
    vi.stubEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886')
    const res = await sendWhatsAppMessage({
      to: '+525512345678',
      template: 'confirmation',
      vars: { name: 'Ana', date: 'hoy', time: '12:00' },
    })
    expect(res).toEqual({ ok: false, error: 'whatsapp_disabled' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns whatsapp_disabled when creds are missing even if flag is on', async () => {
    vi.stubEnv('ENABLE_WHATSAPP', 'true')
    vi.stubEnv('TWILIO_ACCOUNT_SID', '')
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    vi.stubEnv('TWILIO_WHATSAPP_FROM', '')
    const res = await sendWhatsAppMessage({
      to: '+525512345678',
      template: 'confirmation',
      vars: { name: 'Ana', date: 'hoy', time: '12:00' },
    })
    expect(res).toEqual({ ok: false, error: 'whatsapp_disabled' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('sendWhatsAppMessage happy path', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubEnv('ENABLE_WHATSAPP', 'true')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_WHATSAPP_FROM', '+14155238886')
    fetchSpy.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('POSTs to the correct Twilio URL with basic auth and whatsapp: prefixed To/From', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: 'WA_abc' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const res = await sendWhatsAppMessage({
      to: '5512345678',
      template: 'confirmation',
      vars: { name: 'Ana', date: 'lunes', time: '10:30' },
    })
    expect(res).toEqual({ ok: true, sid: 'WA_abc' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchSpy.mock.calls[0]
    expect(calledUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('AC123:secret').toString('base64')}`,
    )
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const params = new URLSearchParams(init.body as string)
    expect(params.get('To')).toBe('whatsapp:+525512345678')
    expect(params.get('From')).toBe('whatsapp:+14155238886')
    expect(params.get('Body')).toContain('¡Hola Ana!')
  })

  it('accepts a TWILIO_WHATSAPP_FROM that already has the whatsapp: prefix', async () => {
    vi.stubEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886')
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: 'WA_x' }), { status: 201 }),
    )
    const res = await sendWhatsAppMessage({
      to: '+525512345678',
      template: 'confirmation',
      vars: { name: 'Ana', date: 'lunes', time: '10:30' },
    })
    expect(res.ok).toBe(true)
    const init = fetchSpy.mock.calls[0][1]
    const params = new URLSearchParams(init.body as string)
    expect(params.get('From')).toBe('whatsapp:+14155238886')
  })

  it('surfaces Twilio HTTP errors without throwing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"code": 63007}', { status: 400 }))
    const res = await sendWhatsAppMessage({
      to: '+525512345678',
      template: 'confirmation',
      vars: { name: 'Ana', date: 'hoy', time: '12:00' },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/^twilio_400/)
  })

  it('rejects invalid phone numbers before hitting the network', async () => {
    const res = await sendWhatsAppMessage({
      to: 'not-a-phone',
      template: 'confirmation',
      vars: { name: 'Ana', date: 'hoy', time: '12:00' },
    })
    expect(res).toEqual({ ok: false, error: 'invalid_phone' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
