/**
 * SMS notifications via Twilio REST API.
 *
 * Feature-flagged with ENABLE_SMS. When disabled or unconfigured, all send
 * functions return `{ ok: false, error: 'sms_disabled' }` instead of throwing,
 * so callers can safely fire-and-forget in parallel with email sends.
 *
 * No external dependencies — uses native fetch.
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

export type SmsTemplate = 'confirmation' | 'reminder_24h' | 'cancellation'

export type SmsTemplateVars = {
  name?: string
  date?: string
  time?: string
  url?: string
  code?: string
}

export type SmsResult = { ok: true; sid?: string } | { ok: false; error: string }

type TwilioConfig = {
  accountSid: string
  authToken: string
  fromNumber: string
}

function getTwilioConfig(): TwilioConfig | null {
  if (process.env.ENABLE_SMS !== 'true') return null
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim()
  if (!accountSid || !authToken || !fromNumber) return null
  return { accountSid, authToken, fromNumber }
}

/**
 * Normalize a phone number to E.164. MX numbers without country code are
 * assumed to be Mexican (+52). Returns null if the input is unrecoverable.
 */
export function normalizeToE164(input: string, defaultCountry: 'MX' = 'MX'): string | null {
  if (!input) return null
  const trimmed = input.trim()
  // Already E.164
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed

  // Strip everything except digits
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  if (defaultCountry === 'MX') {
    // 10-digit local MX number
    if (digits.length === 10) return `+52${digits}`
    // 12-digit with leading 52 (no plus)
    if (digits.length === 12 && digits.startsWith('52')) return `+${digits}`
    // 11-digit "1" + 10 (rare; treat as US-style mistake — skip)
  }

  // Fallback: if it's 11-15 digits, treat as already including country code
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

/**
 * Render a localized (es-MX) SMS template with the provided vars.
 * Missing vars are substituted with an empty string.
 */
export function renderSmsTemplate(template: SmsTemplate, vars: SmsTemplateVars): string {
  const name = vars.name ?? ''
  const date = vars.date ?? ''
  const time = vars.time ?? ''
  const url = vars.url ?? ''
  switch (template) {
    case 'confirmation':
      return `Hola ${name}, tu cita en Ciao Ciao está confirmada para el ${date} a las ${time}. ¡Te esperamos!`
    case 'reminder_24h':
      return `Recordatorio: tu cita en Ciao Ciao es mañana ${date} a las ${time}. Confirma o reagenda en ${url}.`
    case 'cancellation':
      return `Hola ${name}, tu cita del ${date} a las ${time} fue cancelada. Contáctanos para reagendar.`
    default: {
      const _exhaustive: never = template
      return _exhaustive
    }
  }
}

/**
 * Low-level: send an arbitrary SMS body via Twilio.
 * Respects the ENABLE_SMS feature flag.
 */
export async function sendSms(opts: { to: string; body: string }): Promise<SmsResult> {
  const config = getTwilioConfig()
  if (!config) return { ok: false, error: 'sms_disabled' }

  const to = normalizeToE164(opts.to)
  if (!to) return { ok: false, error: 'invalid_phone' }

  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`
  const body = new URLSearchParams({
    To: to,
    From: config.fromNumber,
    Body: opts.body,
  })

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `twilio_${res.status}:${text.slice(0, 200)}` }
    }
    const json = (await res.json().catch(() => ({}))) as { sid?: string }
    return { ok: true, sid: json.sid }
  } catch (err) {
    return { ok: false, error: `network:${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * High-level: send a templated appointment SMS.
 */
export async function sendAppointmentSms(opts: {
  to: string
  template?: SmsTemplate
  appointment: {
    name: string
    date: string
    time: string
    code?: string
    url?: string
  }
}): Promise<SmsResult> {
  const template: SmsTemplate = opts.template ?? 'confirmation'
  const body = renderSmsTemplate(template, {
    name: opts.appointment.name,
    date: opts.appointment.date,
    time: opts.appointment.time,
    code: opts.appointment.code,
    url: opts.appointment.url,
  })
  return sendSms({ to: opts.to, body })
}
