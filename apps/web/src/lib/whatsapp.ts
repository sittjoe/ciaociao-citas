/**
 * WhatsApp notifications via Twilio REST API.
 *
 * Feature-flagged with ENABLE_WHATSAPP. When disabled or unconfigured, all
 * send functions return `{ ok: false, error: 'whatsapp_disabled' }` instead of
 * throwing, so callers can safely fire-and-forget in parallel with email.
 *
 * No external dependencies — uses native fetch.
 */

import { normalizeToE164 } from './sms'

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

export type WhatsAppTemplate = 'confirmation' | 'reminder_24h' | 'cancellation'

export type WhatsAppTemplateVars = {
  name?: string
  date?: string
  time?: string
  url?: string
  code?: string
}

export type WhatsAppResult = { ok: true; sid?: string } | { ok: false; error: string }

type TwilioWhatsAppConfig = {
  accountSid: string
  authToken: string
  fromNumber: string // already including `whatsapp:` prefix
}

function getTwilioWhatsAppConfig(): TwilioWhatsAppConfig | null {
  if (process.env.ENABLE_WHATSAPP !== 'true') return null
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const rawFrom = process.env.TWILIO_WHATSAPP_FROM?.trim()
  if (!accountSid || !authToken || !rawFrom) return null
  const fromNumber = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`
  return { accountSid, authToken, fromNumber }
}

/**
 * Render a localized (es-MX) WhatsApp template. Slightly more informal than
 * SMS — uses warmer greetings since WA conversations are typically casual.
 */
export function renderWhatsAppTemplate(
  template: WhatsAppTemplate,
  vars: WhatsAppTemplateVars,
): string {
  const name = vars.name ?? ''
  const date = vars.date ?? ''
  const time = vars.time ?? ''
  const url = vars.url ?? ''
  switch (template) {
    case 'confirmation':
      return `¡Hola ${name}! Confirmamos tu cita en Ciao Ciao para el ${date} a las ${time}. ¡Nos vemos pronto!`
    case 'reminder_24h':
      return `¡Hola ${name}! Te recordamos que mañana ${date} a las ${time} tenemos tu cita en Ciao Ciao. Si necesitas confirmar o reagendar: ${url}`
    case 'cancellation':
      return `Hola ${name}, lamentamos avisarte que tu cita del ${date} a las ${time} fue cancelada. Escríbenos por aquí para reagendar cuando gustes.`
    default: {
      const _exhaustive: never = template
      return _exhaustive
    }
  }
}

/**
 * Send a WhatsApp message using one of the predefined templates.
 * Respects the ENABLE_WHATSAPP feature flag.
 */
export async function sendWhatsAppMessage(opts: {
  to: string
  template: WhatsAppTemplate
  vars: WhatsAppTemplateVars
}): Promise<WhatsAppResult> {
  const config = getTwilioWhatsAppConfig()
  if (!config) return { ok: false, error: 'whatsapp_disabled' }

  const e164 = normalizeToE164(opts.to)
  if (!e164) return { ok: false, error: 'invalid_phone' }
  const to = `whatsapp:${e164}`

  const body = renderWhatsAppTemplate(opts.template, opts.vars)
  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`

  const params = new URLSearchParams({
    To: to,
    From: config.fromNumber,
    Body: body,
  })

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
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
