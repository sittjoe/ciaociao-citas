import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

/**
 * Webhook de Resend (firmado con svix) para enterarnos de rebotes y quejas.
 * Solo procesa email.bounced y email.complained: cada evento se guarda en la
 * colección emailBounces (doc id = id del correo en Resend, merge para que los
 * reintentos de Resend sean idempotentes) y la pestaña Problemas los muestra.
 *
 * Configuración manual (una vez): crear el webhook en el dashboard de Resend
 * apuntando a https://citas.ciaociao.mx/api/webhooks/resend con los eventos
 * bounced/complained y guardar el signing secret como RESEND_WEBHOOK_SECRET.
 */

/** Tolerancia del timestamp svix: fuera de esta ventana el evento se rechaza (anti-replay). */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

/**
 * Verificación de firma svix con crypto nativo (sin dependencias nuevas).
 * Esquema svix: HMAC-SHA256 en base64 sobre `${svixId}.${svixTimestamp}.${payload}`
 * con el secret base64 (sin el prefijo `whsec_`). El header svix-signature puede
 * traer varias firmas separadas por espacio, cada una como `v1,<base64>`.
 */
function verifySvixSignature(params: {
  secret: string
  svixId: string
  svixTimestamp: string
  svixSignature: string
  payload: string
}): boolean {
  const { secret, svixId, svixTimestamp, svixSignature, payload } = params
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const timestampMs = Number(svixTimestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > TIMESTAMP_TOLERANCE_MS) {
    return false
  }

  let key: Buffer
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  } catch {
    return false
  }
  if (key.length === 0) return false

  const expected = createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${payload}`)
    .digest()

  return svixSignature.split(' ').some(part => {
    const [version, signature] = part.split(',')
    if (version !== 'v1' || !signature) return false
    let candidate: Buffer
    try {
      candidate = Buffer.from(signature, 'base64')
    } catch {
      return false
    }
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  })
}

interface ResendWebhookEvent {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string | string[]
    subject?: string
    created_at?: string
  }
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 })
  }

  const payload = await request.text()
  const ok = verifySvixSignature({
    secret,
    svixId: request.headers.get('svix-id') ?? '',
    svixTimestamp: request.headers.get('svix-timestamp') ?? '',
    svixSignature: request.headers.get('svix-signature') ?? '',
    payload,
  })
  if (!ok) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let event: ResendWebhookEvent
  try {
    event = JSON.parse(payload) as ResendWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const type = event.type
  if (type !== 'email.bounced' && type !== 'email.complained') {
    // 200 para que Resend no reintente eventos que no nos interesan.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const data = event.data ?? {}
  const to = Array.isArray(data.to) ? data.to : [data.to]
  const email = String(to[0] ?? '').trim().toLowerCase()
  const resendId = String(data.email_id ?? '').trim()
  if (!email || !resendId) {
    // Sin destinatario o sin id no hay nada útil que guardar; 200 evita reintentos.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const eventDate = new Date(String(data.created_at ?? event.created_at ?? ''))
  const at = Number.isFinite(eventDate.getTime()) ? Timestamp.fromDate(eventDate) : Timestamp.now()

  try {
    // Doc id = id del correo en Resend: los reintentos del webhook hacen merge
    // sobre el mismo doc en lugar de duplicar el rebote.
    await adminDb
      .collection('emailBounces')
      .doc(resendId.replace(/[^\w-]/g, '_').slice(0, 200))
      .set({
        email,
        tipo: type === 'email.bounced' ? 'bounced' : 'complained',
        subject: String(data.subject ?? ''),
        at,
        resendId,
      }, { merge: true })
  } catch (err) {
    console.error('POST /api/webhooks/resend', err)
    // 500 para que Resend reintente: el merge por resendId lo hace seguro.
    return NextResponse.json({ error: 'No se pudo guardar el evento' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
