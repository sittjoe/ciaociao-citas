import { Resend } from 'resend'
import { createHash } from 'crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime12, redactPII } from './utils'
import { adminDb } from './firebase-admin'
import { appointmentTypeLabels, engagementBriefRows, isVideoEngagement } from './commercial'
import { reservaUrl } from './reserva-access'
import { buildAppointmentICS, type IcsMethod } from './ics'
import { relativeDayWord, scheduled24SendAt } from './reminder-windows'
import type { Appointment } from '@/types'

/**
 * Resend 4.x NUNCA lanza: devuelve `{ data: null, error }` ante un 429, un 422
 * o una caída. Sin esta comprobación el envío fallido se registraba como
 * exitoso (outbox 'sent', emailEvents ok:true) y nunca se reintentaba.
 */
export class ResendError extends Error {
  readonly code: string
  constructor(message: string, code = 'resend_error') {
    super(message)
    this.name = 'ResendError'
    this.code = code
  }
}

export function assertResendOk<T extends { id?: string } | null | undefined>(
  result: { data?: T; error?: { message?: string; name?: string } | null } | null | undefined,
  what = 'envío',
): string {
  if (!result) throw new ResendError(`Resend no respondió (${what})`, 'no_response')
  if (result.error) {
    throw new ResendError(`Resend ${what}: ${result.error.message ?? result.error.name ?? 'error'}`, result.error.name ?? 'resend_error')
  }
  const id = (result.data as { id?: string } | null | undefined)?.id
  if (!id) throw new ResendError(`Resend no devolvió id (${what})`, 'missing_id')
  return id
}

const FROM = process.env.RESEND_FROM_EMAIL || 'hola@ciaociao.mx'
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'
// Dirección física del showroom. No existe en el repo: se lee del entorno y,
// si no está configurada, los bloques de ubicación simplemente no se renderizan.
const SHOWROOM_ADDRESS = process.env.SHOWROOM_ADDRESS || ''

type EmailKind = 'booking_client' | 'booking_admin' | 'status_update' | 'reminder' | 'confirmation_request' | 'calendar_error' | 'guest_invitation' | 'guest_reminder' | 'reservation_recovery' | 'slots_reminder' | 'request_alert' | 'request_expired'

let resendClient: Resend | null = null

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('RESEND_API_KEY env var not set')
  if (!resendClient) resendClient = new Resend(key)
  return resendClient
}

function parseEmailList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
}

export function getConfiguredAdminEmails(): string[] {
  return Array.from(new Set([
    ...parseEmailList(process.env.ADMIN_EMAIL),
    ...parseEmailList(process.env.ADMIN_BOOTSTRAP_EMAILS),
  ]))
}

export async function getActiveAdminEmails(): Promise<string[]> {
  const configured = getConfiguredAdminEmails()
  try {
    // Single-field equality is auto-indexed; cap reads — there are never many admins.
    const snap = await adminDb.collection('admins').where('active', '==', true).limit(100).get()
    const firestoreEmails = snap.docs
      .map(doc => String(doc.data().email ?? '').trim().toLowerCase())
      .filter(Boolean)
    return Array.from(new Set([...firestoreEmails, ...configured]))
  } catch (err) {
    console.error('Unable to load admin email recipients, using env fallback:', err)
    return configured
  }
}

async function recordEmailEvent(data: {
  kind: EmailKind
  to: string | string[]
  subject: string
  appointmentId?: string
  ok: boolean
  error?: string
}) {
  try {
    await adminDb.collection('emailEvents').add({
      ...data,
      to: Array.isArray(data.to) ? data.to : [data.to],
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error('Unable to record email event:', err)
  }
}

async function sendTracked(params: {
  kind: EmailKind
  appointmentId?: string
  from: string
  to: string | string[]
  subject: string
  html: string
  attachments?: { filename: string; content: string; contentType?: string }[]
  /** Idempotency-Key de Resend; se guarda en el outbox y se reusa al reintentar. */
  idempotencyKey?: string
  /** Pasado este instante el outbox ya no lo reintenta (p.ej. un «en 2 horas» tardío). */
  notAfter?: Date
}) {
  const outboxRef = adminDb.collection('emailOutbox').doc()
  const payload = {
    kind: params.kind,
    appointmentId: params.appointmentId ?? null,
    from: params.from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    attachments: params.attachments ?? [],
    idempotencyKey: params.idempotencyKey ?? null,
    notAfter: params.notAfter ? Timestamp.fromDate(params.notAfter) : null,
  }
  await outboxRef.set({
    ...payload,
    status: 'sending',
    attempts: 1,
    lastAttemptAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }).catch(err => console.error('Unable to create email outbox entry:', err))

  try {
    const result = await getResend().emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.attachments ? { attachments: params.attachments } : {}),
      headers: { 'List-Unsubscribe': `<mailto:${FROM}?subject=Baja>` },
    }, params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined)
    const resendId = assertResendOk(result, params.kind)
    await recordEmailEvent({
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      appointmentId: params.appointmentId,
      ok: true,
    })
    await outboxRef.update({
      status: 'sent',
      resendId,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {})
    return result
  } catch (err) {
    const message = redactPII(err instanceof Error ? err.message : String(err))
    await outboxRef.update({
      status: 'failed',
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {})
    await recordEmailEvent({
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      appointmentId: params.appointmentId,
      ok: false,
      error: message,
    })
    throw err
  }
}

// After this many tries a stuck email is abandoned instead of retried forever.
const MAX_EMAIL_ATTEMPTS = 5

export async function retryEmailOutbox(limit = 20): Promise<{ retried: number; sent: number; failed: number; abandoned: number; errors: string[] }> {
  const snap = await adminDb
    .collection('emailOutbox')
    .where('status', '==', 'failed')
    .limit(limit)
    .get()

  let sent = 0
  let failed = 0
  let abandoned = 0
  const errors: string[] = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const attempts = Number(data.attempts ?? 0)
    if (attempts >= MAX_EMAIL_ATTEMPTS) {
      await doc.ref.update({ status: 'abandoned', updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
      errors.push(`${doc.id}: abandonado tras ${attempts} intentos`)
      abandoned++
      continue
    }
    // Un recordatorio con caducidad («en 2 horas») no se manda tarde.
    const notAfter = data.notAfter instanceof Timestamp ? data.notAfter.toMillis() : null
    if (notAfter !== null && Date.now() > notAfter) {
      await doc.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
      errors.push(`${doc.id}: caducado sin reenviar`)
      abandoned++
      continue
    }
    try {
      await doc.ref.update({
        status: 'sending',
        attempts: attempts + 1,
        lastAttemptAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      const idempotencyKey = typeof data.idempotencyKey === 'string' && data.idempotencyKey ? data.idempotencyKey : null
      const result = await getResend().emails.send({
        from: data.from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        ...(Array.isArray(data.attachments) && data.attachments.length > 0 ? { attachments: data.attachments } : {}),
        headers: { 'List-Unsubscribe': `<mailto:${FROM}?subject=Baja>` },
      }, idempotencyKey ? { idempotencyKey } : undefined)
      const resendId = assertResendOk(result, `reintento ${data.kind}`)
      await doc.ref.update({
        status: 'sent',
        resendId,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      await recordEmailEvent({
        kind: data.kind,
        to: data.to,
        subject: data.subject,
        appointmentId: data.appointmentId ?? undefined,
        ok: true,
      })
      sent++
    } catch (err) {
      const message = redactPII(err instanceof Error ? err.message : String(err))
      await doc.ref.update({
        status: 'failed',
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})
      errors.push(`${doc.id}: ${message}`)
      failed++
    }
  }

  return { retried: snap.size, sent, failed, abandoned, errors }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[char] ?? char
  })
}

function baseTemplate(body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; background:#FAFAF7; font-family:Inter,Helvetica,Arial,sans-serif; color:#1A1A1A; }
  .wrap { max-width:600px; margin:0 auto; padding:36px 20px; }
  .logo { text-align:center; margin-bottom:28px; }
  .logo h1 { font-family:Georgia,serif; color:#1A1A1A; font-size:30px; margin:0; letter-spacing:4px; font-weight:400; }
  .logo p { color:#9A7E50; font-size:11px; letter-spacing:3px; margin:6px 0 0; text-transform:uppercase; }
  .card { background:#FFFFFF; border:1px solid #E7E2D7; border-radius:16px; padding:28px; margin:22px 0; }
  .title { font-family:Georgia,serif; font-size:24px; color:#1A1A1A; margin:0 0 12px; font-weight:400; }
  .copy { color:#6B6B6B; font-size:14px; line-height:1.65; margin:0 0 18px; }
  .detail { display:flex; justify-content:space-between; gap:20px; padding:11px 0; border-bottom:1px solid #F0EDE6; font-size:14px; }
  .detail:last-child { border-bottom:none; }
  .label { color:#9A7E50; }
  .value { color:#1A1A1A; font-weight:600; text-align:right; }
  .btn { display:inline-block; background:#B89968; color:#FFFFFF; padding:13px 24px; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px; margin-top:18px; }
  .footer { text-align:center; color:#8B8B8B; font-size:12px; margin-top:30px; line-height:1.6; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <h1>CIAO CIAO</h1>
    <p>Joyería fina · Citas privadas</p>
  </div>
  ${body}
  <div class="footer">
    <p>Ciao Ciao Joyería · Showroom Privado</p>
    <p>Dudas: <a href="mailto:hola@ciaociao.mx" style="color:#9A7E50;">hola@ciaociao.mx</a></p>
  </div>
</div>
</body>
</html>`
}

function details(rows: [string, string][]): string {
  return rows.map(([label, value]) =>
    `<div class="detail"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`
  ).join('')
}

function isVideoAppointment(appt: Appointment): boolean {
  return isVideoEngagement(appt.appointmentType)
}

function videoMeetingRows(appt: Appointment): [string, string][] {
  if (!isVideoAppointment(appt)) return []
  return [
    ...(appt.meetingProvider ? [['Plataforma', appt.meetingProvider] as [string, string]] : []),
    ['Link', appt.meetingUrl || 'Pendiente por enviar'],
    ...(appt.meetingInstructions ? [['Indicaciones', appt.meetingInstructions] as [string, string]] : []),
  ]
}

/** Bloque con la dirección del showroom y link a Google Maps. Vacío si no hay dirección configurada. */
function showroomLocationBlock(): string {
  if (!SHOWROOM_ADDRESS) return ''
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(SHOWROOM_ADDRESS)}`
  return `<div style="text-align:center;margin:20px 0;padding:18px 20px;background:#FAF7F2;border-radius:14px;border:1px solid #E7E2D7;">
         <p style="font-size:11px;color:#9A7E50;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px;">Ubicación del showroom</p>
         <p style="font-size:14px;color:#1A1A1A;font-weight:600;margin:0 0 4px;">${escapeHtml(SHOWROOM_ADDRESS)}</p>
         <a href="${mapsUrl}" style="font-size:12px;color:#9A7E50;text-decoration:none;">Ver en Google Maps →</a>
       </div>`
}

/** Botón «Agregar a mi calendario» — descarga el .ics desde /api/calendar/[apptId] (solo citas aceptadas). */
function addToCalendarButton(appt: Appointment): string {
  const url = `${SITE}/api/calendar/${appt.id}?code=${encodeURIComponent(appt.confirmationCode)}`
  return `<p style="text-align:center"><a class="btn" href="${url}">Agregar a mi calendario</a></p>`
}

/** Botón para entrar a la videollamada; vacío si aún no hay link. */
function videoJoinButton(appt: Appointment): string {
  if (!appt.meetingUrl) return ''
  return `<p style="text-align:center"><a class="btn" href="${escapeHtml(appt.meetingUrl)}">Entrar a la videollamada</a></p>`
}

export async function sendBookingConfirmation(
  appt: Appointment,
  guestNames: string[] = [],
) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const url = reservaUrl(SITE, appt.confirmationCode)
  const isVideo = isVideoAppointment(appt)

  const guestBlock = !isVideo && guestNames.length > 0
    ? `<div style="margin:16px 0;padding:14px 16px;background:#FAF7F2;border-radius:12px;border:1px solid #E7E2D7;">
        <p style="font-size:11px;color:#9A7E50;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;font-weight:600;">Invitados agregados</p>
        ${guestNames.map(n => `<p style="font-size:13px;color:#1A1A1A;margin:2px 0;">· ${escapeHtml(n)}</p>`).join('')}
        <p style="font-size:11px;color:#6B6B6B;margin:10px 0 0;">Cada uno recibirá un correo con su link de verificación. Solo las personas verificadas podrán ingresar al showroom.</p>
       </div>`
    : ''

  // Si falla el correo a la clienta, el aviso al equipo sale igual (antes
  // Resend nunca lanzaba; ahora sí, y no debe tapar la «Nueva solicitud»).
  const clientError = await sendTracked({
    kind: 'booking_client',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Solicitud recibida en Ciao Ciao - ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Solicitud recibida</p>
        <p class="copy">Gracias, ${escapeHtml(appt.name)}. Nuestro equipo revisará tu solicitud de ${isVideo ? 'video consulta para anillo de compromiso' : 'cita en showroom'} y te notificará la confirmación.</p>
        ${details([
          ['Tipo', appointmentTypeLabels[appt.appointmentType ?? 'showroom']],
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      ${guestBlock}
      <p style="text-align:center"><a class="btn" href="${url}">Ver estado de tu cita</a></p>
    `),
  }).then(() => null, (err: unknown) => err)

  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length > 0) {
    await sendTracked({
      kind: 'booking_admin',
      appointmentId: appt.id,
      from: `Sistema Citas <${FROM}>`,
      to: adminRecipients,
      subject: `Nueva solicitud: ${appt.name} - ${dateStr} ${timeStr}`,
      html: baseTemplate(`
        <div class="card">
          <p class="title">Nueva solicitud de cita</p>
          <p class="copy">Hay una nueva solicitud pendiente en el panel administrativo.</p>
          ${details([
            ['Tipo', appointmentTypeLabels[appt.appointmentType ?? 'showroom']],
            ['Nombre', appt.name],
            ['Email', appt.email],
            ['Teléfono', appt.phone],
            ['Fecha', `${dateStr} ${timeStr}`],
            ['Notas', appt.notes || 'Sin notas'],
            ...(appt.productType ? [['Producto', appt.productType] as [string, string]] : []),
            ...(appt.budgetRange ? [['Presupuesto', appt.budgetRange] as [string, string]] : []),
            ...(appt.lookingFor ? [['Busca', appt.lookingFor] as [string, string]] : []),
            ...engagementBriefRows(appt.engagementBrief),
            ...videoMeetingRows(appt),
          ])}
        </div>
        <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas?open=${encodeURIComponent(appt.id)}">Gestionar cita</a></p>
      `),
    })
  }
  if (clientError) throw clientError
}

export async function sendStatusUpdate(appt: Appointment, action: 'accept' | 'reject', reason?: string) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const accepted = action === 'accept'
  const isVideo = isVideoAppointment(appt)
  const attachments = accepted ? [icsAttachment(appt, 'REQUEST')] : []

  const body = accepted
    ? isVideo
      ? `<div class="card">
        <p class="title">Tu video consulta está confirmada</p>
        <p class="copy">${appt.meetingUrl ? 'Tu enlace de videollamada aparece abajo y también en el .ics adjunto.' : 'Encontrarás el .ics adjunto. El equipo te enviará el enlace de videollamada antes de la consulta.'}</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
          ...videoMeetingRows(appt),
        ])}
       </div>
       ${appt.meetingUrl ? `<p style="text-align:center"><a class="btn" href="${escapeHtml(appt.meetingUrl)}">Entrar a la videollamada</a></p>` : ''}
       <p style="text-align:center"><a class="btn" href="${reservaUrl(SITE, appt.confirmationCode)}">Ver tu cita</a></p>`
      : `<div class="card">
        <p class="title">Tu cita está confirmada</p>
        <p class="copy">Te esperamos en nuestro showroom privado. Encontrarás el .ics adjunto para agregar la cita a tu calendario.</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
        ])}
       </div>
       ${showroomLocationBlock()}
       ${addToCalendarButton(appt)}
       <p style="text-align:center"><a class="btn" href="${reservaUrl(SITE, appt.confirmationCode)}">Ver tu cita</a></p>`
    : `<div class="card">
        <p class="title">No pudimos confirmar tu solicitud</p>
        <p class="copy">${escapeHtml(reason || 'En este momento no podemos confirmar ese horario. Te invitamos a elegir otro disponible.')}</p>
       </div>
       <p style="text-align:center"><a class="btn" href="${SITE}">Agendar nueva cita</a></p>`

  await sendTracked({
    kind: 'status_update',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: accepted ? `Cita confirmada - ${dateStr}` : 'Actualización sobre tu solicitud de cita',
    html: baseTemplate(body),
    attachments,
  })
}

export async function sendReminder(appt: Appointment, hoursAhead: 24 | 2, opts: { idempotencyKey?: string; notAfter?: Date } = {}) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const label = hoursAhead === 24 ? 'mañana' : 'en 2 horas'
  const isVideo = isVideoAppointment(appt)

  await sendTracked({
    kind: 'reminder',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    ...opts,
    subject: `Recordatorio: tu cita es ${label}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Tu ${isVideo ? 'video consulta' : 'cita'} es ${label}</p>
        ${isVideo ? `<p class="copy">${appt.meetingUrl ? 'Usa el link guardado para entrar a la videollamada.' : 'El equipo te compartirá el enlace de videollamada antes de iniciar.'}</p>` : ''}
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
          ...videoMeetingRows(appt),
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${reservaUrl(SITE, appt.confirmationCode)}">Ver detalles</a></p>
    `),
  })
}

export async function sendReminder24Confirm(appt: Appointment, opts: { idempotencyKey?: string; notAfter?: Date } = {}) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const isVideo = isVideoAppointment(appt)

  await sendTracked({
    kind: 'confirmation_request',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    ...opts,
    subject: `Confirma tu cita de mañana — ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Tu ${isVideo ? 'video consulta' : 'cita'} es mañana</p>
        <p class="copy">Hola ${escapeHtml(appt.name)}, ${isVideo ? 'mañana será tu video consulta con Ciao Ciao Joyería' : 'te esperamos mañana en el showroom privado de Ciao Ciao Joyería'}. Para ayudarnos a prepararnos, confírmanos que podrás asistir.</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
          ...videoMeetingRows(appt),
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/confirmar/${appt.cancelToken}">Sí, confirmar mi cita</a></p>
      <p style="text-align:center;margin-top:12px;font-size:13px;color:#8B8B8B;">¿No podrás asistir? <a href="${reservaUrl(SITE, appt.confirmationCode)}" style="color:#9A7E50;text-decoration:none;">Cancelar mi cita</a></p>
    `),
  })
}


// ─── Recordatorios programados con Resend (scheduledAt) ──────────────────────
//
// Al aceptar una cita se programan en Resend los correos de 24h y 2h antes,
// con hora exacta, en lugar de depender del cron diario (que puede llegar con
// horas de desfase y hace imposible el de 2h). El cron de /api/reminders sigue
// siendo la red de seguridad: para citas a más de 30 días (límite de Resend)
// y para cuando la programación falla, gracias a los flags reminder*Sent.

export interface ScheduledReminderEmailIds {
  h24?: string
  h2?: string
}

const HOUR_MS = 60 * 60 * 1000
/** Resend solo permite programar correos hasta 30 días hacia adelante. */
const RESEND_MAX_SCHEDULE_AHEAD_MS = 30 * 24 * HOUR_MS

/**
 * Programa un correo en Resend con `scheduledAt` (ISO 8601). Los correos
 * programados no pasan por el outbox de reintentos: si la programación falla
 * devolvemos null y el cron diario cubre el hueco (flag reminder*Sent en false).
 * Nota: Resend no admite adjuntos ni headers extra en correos programados.
 */
async function scheduleTracked(params: {
  kind: EmailKind
  appointmentId: string
  to: string
  subject: string
  html: string
  scheduledAt: string
  idempotencyKey: string
}): Promise<string | null> {
  try {
    const result = await getResend().emails.send({
      from: `Ciao Ciao Joyería <${FROM}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      scheduledAt: params.scheduledAt,
    }, { idempotencyKey: params.idempotencyKey })
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'Resend no devolvió id del correo programado')
    }
    await adminDb.collection('emailEvents').add({
      kind: params.kind,
      to: [params.to],
      subject: params.subject,
      appointmentId: params.appointmentId,
      ok: true,
      scheduled: true,
      scheduledAt: params.scheduledAt,
      resendId: result.data.id,
      createdAt: FieldValue.serverTimestamp(),
    }).catch(err => console.error('Unable to record scheduled email event:', err))
    return result.data.id
  } catch (err) {
    const message = redactPII(err instanceof Error ? err.message : String(err))
    console.error(`No se pudo programar el correo ${params.kind} (cita ${params.appointmentId}):`, message)
    await recordEmailEvent({
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      appointmentId: params.appointmentId,
      ok: false,
      error: message,
    })
    return null
  }
}

/** Recordatorio 24h programado — deriva del correo de confirmación de asistencia del cron. */
function scheduledReminder24Content(appt: Appointment): { subject: string; html: string } {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const isVideo = isVideoAppointment(appt)

  return {
    subject: `Confirma tu cita de mañana — ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Tu ${isVideo ? 'video consulta' : 'cita'} es mañana</p>
        <p class="copy">Hola ${escapeHtml(appt.name)}, ${isVideo ? 'mañana será tu video consulta con Ciao Ciao Joyería' : 'te esperamos mañana en el showroom privado de Ciao Ciao Joyería'}. Para tenerlo todo listo, confírmanos que podrás asistir.</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
          ...videoMeetingRows(appt),
        ])}
      </div>
      ${isVideo ? '' : showroomLocationBlock()}
      <p style="text-align:center"><a class="btn" href="${SITE}/confirmar/${appt.cancelToken}">Sí, confirmar mi cita</a></p>
      ${isVideo ? videoJoinButton(appt) : addToCalendarButton(appt)}
      <p style="text-align:center;margin-top:12px;font-size:13px;color:#8B8B8B;">¿No podrás asistir? <a href="${reservaUrl(SITE, appt.confirmationCode)}" style="color:#9A7E50;text-decoration:none;">Cancelar mi cita</a></p>
    `),
  }
}

/** Recordatorio 2h programado — corto y directo. */
function scheduledReminder2Content(appt: Appointment): { subject: string; html: string } {
  const timeStr = formatTime12(appt.slotDatetime)
  // «hoy» solo si lo es al momento de enviarse (2 h antes); una cita a las
  // 00:30 recibe este correo a las 22:30 del día anterior: ahí es «mañana».
  const dayWord = relativeDayWord(appt.slotDatetime, new Date(appt.slotDatetime.getTime() - 2 * HOUR_MS))
  const isVideo = isVideoAppointment(appt)

  return {
    subject: `Tu ${isVideo ? 'video consulta' : 'cita'} es en 2 horas — ${timeStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Te esperamos en 2 horas</p>
        <p class="copy">${escapeHtml(appt.name)}, tu ${isVideo ? 'video consulta' : 'cita en el showroom privado'} es ${dayWord ? `${dayWord} ` : ''}a las ${timeStr}.${isVideo && !appt.meetingUrl ? ' El equipo te compartirá el enlace de videollamada antes de iniciar.' : ''}</p>
        ${details([
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
          ...videoMeetingRows(appt),
        ])}
      </div>
      ${isVideo ? videoJoinButton(appt) : `${showroomLocationBlock()}
      ${addToCalendarButton(appt)}`}
    `),
  }
}

/** Huella corta del contenido: cambia si cambia el link, la hora, el nombre… */
function contentHash(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16)
}

/**
 * Idempotency-Key versionada: cita + horario + SEQUENCE del .ics + huella del
 * contenido. Con la llave vieja (`reminder-h2/{id}-{slotMs}`) un cambio de link
 * de videollamada, o reprogramar A→B→A en menos de 24 h, hacía que Resend
 * devolviera el correo viejo (o 409) y la clienta recibía el link anterior.
 */
export function scheduledReminderIdempotencyKey(
  kind: 'h24' | 'h2',
  appt: Pick<Appointment, 'id' | 'slotDatetime' | 'icsSequence'>,
  subject: string,
  html: string,
): string {
  return `reminder-${kind}/${appt.id}-${appt.slotDatetime.getTime()}-s${appt.icsSequence ?? 0}-${contentHash(subject, html)}`
}

/** No programar algo que saldría en menos de este margen: lo cubre el cron. */
const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000

interface ScheduleOutcome {
  ids: ScheduledReminderEmailIds
  /** Qué recordatorios correspondía programar (aunque la programación fallara). */
  attempted: { h24: boolean; h2: boolean }
}

async function scheduleReminders(
  appt: Appointment,
  skip: { h24?: boolean; h2?: boolean } = {},
): Promise<ScheduleOutcome> {
  const out: ScheduleOutcome = { ids: {}, attempted: { h24: false, h2: false } }
  if (!isEmailConfigured()) return out

  const now = Date.now()
  const slotMs = appt.slotDatetime.getTime()
  const msUntil = slotMs - now
  if (msUntil <= 0 || msUntil > RESEND_MAX_SCHEDULE_AHEAD_MS) return out

  // «Mañana»: 24 h antes, pero nunca en horario silencioso (22:00–08:00 CDMX).
  const send24 = scheduled24SendAt(appt.slotDatetime)
  if (!skip.h24 && msUntil > 24 * HOUR_MS && send24.getTime() - now > MIN_SCHEDULE_LEAD_MS) {
    out.attempted.h24 = true
    const { subject, html } = scheduledReminder24Content(appt)
    const id = await scheduleTracked({
      kind: 'confirmation_request',
      appointmentId: appt.id,
      to: appt.email,
      subject,
      html,
      scheduledAt: send24.toISOString(),
      idempotencyKey: scheduledReminderIdempotencyKey('h24', appt, subject, html),
    })
    if (id) out.ids.h24 = id
  }

  if (!skip.h2 && msUntil - 2 * HOUR_MS > MIN_SCHEDULE_LEAD_MS) {
    out.attempted.h2 = true
    const { subject, html } = scheduledReminder2Content(appt)
    const id = await scheduleTracked({
      kind: 'reminder',
      appointmentId: appt.id,
      to: appt.email,
      subject,
      html,
      scheduledAt: new Date(slotMs - 2 * HOUR_MS).toISOString(),
      idempotencyKey: scheduledReminderIdempotencyKey('h2', appt, subject, html),
    })
    if (id) out.ids.h2 = id
  }

  return out
}

/**
 * Programa los recordatorios de una cita aceptada. Reglas:
 *  - «mañana» (24h): si la cita está a más de 24 h; sale 24 h antes metido en
 *    [08:00, 21:30] CDMX del día anterior (nunca de madrugada);
 *  - 2h antes: solo si la cita está a más de 2 horas;
 *  - ambos solo si la cita está a ≤30 días (límite de Resend). Si está más
 *    lejos, NO se programa nada y el cron la cubre con sus flags y ventanas.
 * Nunca lanza: cada fallo se registra y se devuelve el mapa parcial de ids.
 */
export async function scheduleAppointmentReminderEmails(appt: Appointment): Promise<ScheduledReminderEmailIds> {
  return (await scheduleReminders(appt)).ids
}

/** Colección donde quedan las cancelaciones de Resend que fallaron; el cron las reintenta. */
const PENDING_CANCELS = 'scheduledEmailCancels'
/** ~24 h de reintentos con el cron cada 30 min. */
const MAX_CANCEL_ATTEMPTS = 48

/**
 * Errores de `emails.cancel` que NO tiene sentido reintentar: el correo ya
 * salió, ya estaba cancelado o el id no existe.
 */
function isFinalCancelError(error: { name?: string; message?: string }): boolean {
  const name = String(error.name ?? '')
  const message = String(error.message ?? '')
  return name === 'not_found'
    || /already|cannot be cancel|can't be cancel|not found|not scheduled/i.test(message)
}

async function cancelOnce(id: string): Promise<'ok' | 'final' | 'retry'> {
  try {
    const result = await getResend().emails.cancel(id)
    if (!result) return 'retry'
    if (!result.error) return 'ok'
    return isFinalCancelError(result.error) ? 'final' : 'retry'
  } catch {
    return 'retry'
  }
}

export interface CancelScheduledResult {
  cancelled: string[]
  /** Ya enviado / ya cancelado / inexistente: nada que hacer. */
  skipped: string[]
  /** No se pudo cancelar: quedó registrado para que el cron lo reintente. */
  pending: string[]
}

/**
 * Cancela en Resend los correos programados de una cita. Acepta el valor
 * crudo del campo `scheduledEmails` del doc (unknown). Resend 4.x no lanza:
 * se revisa `error` en cada respuesta, se reintenta 3 veces y, si aún falla,
 * el id queda en `scheduledEmailCancels` para que el cron siga intentándolo
 * (si no, la clienta que canceló recibía igual «Confirma tu cita de mañana»).
 * Nunca lanza.
 */
export async function cancelScheduledReminderEmails(
  ids: unknown,
  opts: { appointmentId?: string; retryDelaysMs?: number[] } = {},
): Promise<CancelScheduledResult> {
  const res: CancelScheduledResult = { cancelled: [], skipped: [], pending: [] }
  if (!ids || typeof ids !== 'object' || !isEmailConfigured()) return res
  const { h24, h2 } = ids as { h24?: unknown; h2?: unknown }
  const delays = opts.retryDelaysMs ?? [250, 1000]
  for (const id of [h24, h2]) {
    if (typeof id !== 'string' || !id) continue
    let outcome = await cancelOnce(id)
    for (const delay of delays) {
      if (outcome !== 'retry') break
      await new Promise(resolve => setTimeout(resolve, delay))
      outcome = await cancelOnce(id)
    }
    if (outcome === 'ok') { res.cancelled.push(id); continue }
    if (outcome === 'final') { res.skipped.push(id); continue }
    res.pending.push(id)
    console.error(`No se pudo cancelar el correo programado ${id}; queda para reintento del cron`)
    await adminDb.collection(PENDING_CANCELS).doc(id).set({
      resendId: id,
      appointmentId: opts.appointmentId ?? null,
      status: 'pending',
      attempts: 1 + delays.length,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(err => console.error('Unable to record pending cancel:', err))
  }
  return res
}

/** Reintenta (desde el cron) las cancelaciones de correos programados que fallaron. */
export async function retryPendingScheduledEmailCancels(limit = 20): Promise<{ retried: number; cancelled: number; failed: number; abandoned: number }> {
  const out = { retried: 0, cancelled: 0, failed: 0, abandoned: 0 }
  if (!isEmailConfigured()) return out
  const snap = await adminDb.collection(PENDING_CANCELS).where('status', '==', 'pending').limit(limit).get()
  for (const doc of snap.docs) {
    out.retried++
    const data = doc.data()
    const attempts = Number(data.attempts ?? 0) + 1
    const outcome = await cancelOnce(String(data.resendId ?? doc.id))
    if (outcome === 'ok' || outcome === 'final') {
      out.cancelled++
      await doc.ref.update({ status: outcome === 'ok' ? 'cancelled' : 'not_cancellable', attempts, updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
    } else if (attempts >= MAX_CANCEL_ATTEMPTS) {
      out.abandoned++
      await doc.ref.update({ status: 'abandoned', attempts, updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
    } else {
      out.failed++
      await doc.ref.update({ attempts, updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
    }
  }
  return out
}

/**
 * Cancela los recordatorios programados previos (si los hay), programa los del
 * horario/contenido vigente y persiste los ids en `scheduledEmails` del doc.
 * Marca reminder24Sent/reminder2Sent para los que quedaron programados (el
 * cron no duplica) y los deja en false si la programación falló (el cron, con
 * sus ventanas, los cubre). La escritura es transaccional: si mientras tanto
 * la cita se canceló o cambió de horario, lo recién programado se cancela
 * (antes quedaba un recordatorio vivo de una cita cancelada). Nunca lanza.
 */
export async function syncScheduledReminderEmails(
  appt: Appointment,
  previousIds?: unknown,
): Promise<ScheduledReminderEmailIds> {
  await cancelScheduledReminderEmails(previousIds, { appointmentId: appt.id })
  // Un recordatorio con su marca en true y SIN id programado previo ya lo mandó
  // el cron (p.ej. cita a >30 días al aceptarse): re-sincronizar por un cambio
  // de link no debe programar un segundo «mañana». Al reprogramar, las rutas
  // reinician las marcas a false, así que ahí sí se programa.
  const prev = (previousIds && typeof previousIds === 'object' ? previousIds : {}) as Record<string, unknown>
  const { ids: scheduled, attempted } = await scheduleReminders(appt, {
    h24: appt.reminder24Sent === true && !prev.h24,
    h2: appt.reminder2Sent === true && !prev.h2,
  })
  const hadPrevious = Boolean(previousIds && typeof previousIds === 'object'
    && Object.values(previousIds as Record<string, unknown>).some(Boolean))
  if (!scheduled.h24 && !scheduled.h2 && !attempted.h24 && !attempted.h2 && !hadPrevious) return scheduled

  try {
    const ref = adminDb.collection('appointments').doc(appt.id)
    const stillValid = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists) return false
      const d = snap.data()!
      const slotMs = d.slotDatetime instanceof Timestamp ? d.slotDatetime.toMillis() : NaN
      if (d.status !== 'accepted' || slotMs !== appt.slotDatetime.getTime()) return false
      tx.update(ref, {
        scheduledEmails: scheduled,
        ...(attempted.h24 ? { reminder24Sent: Boolean(scheduled.h24) } : {}),
        ...(attempted.h2 ? { reminder2Sent: Boolean(scheduled.h2) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return true
    })
    if (!stillValid) {
      console.error(`La cita ${appt.id} cambió o se canceló mientras se programaban sus recordatorios; se cancelan`)
      await cancelScheduledReminderEmails(scheduled, { appointmentId: appt.id })
      return {}
    }
    return scheduled
  } catch (err) {
    console.error(`No se pudieron guardar los ids de correos programados (cita ${appt.id}); se cancelan para evitar dobles:`, err)
    await cancelScheduledReminderEmails(scheduled, { appointmentId: appt.id })
    return {}
  }
}

export async function sendCalendarError(appt: Appointment, errorMessage: string) {
  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length === 0) return

  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)

  await sendTracked({
    kind: 'calendar_error',
    appointmentId: appt.id,
    from: `Sistema Citas <${FROM}>`,
    to: adminRecipients,
    subject: `⚠ Error Calendar — ${escapeHtml(appt.name)} ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Error al crear evento en Calendar</p>
        <p class="copy">La cita de <strong>${escapeHtml(appt.name)}</strong> fue aprobada pero no se pudo sincronizar con Google Calendar. La cita sigue confirmada.</p>
        ${details([
          ['Cliente', appt.name],
          ['Fecha', `${dateStr} ${timeStr}`],
          ['Error', errorMessage],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas">Ver en panel</a></p>
    `),
  })
}

export async function sendGuestInvitation(params: {
  guest: { id: string; name: string; email: string; verifyToken: string }
  appointment: Appointment
  hostName: string
}) {
  const { guest, appointment, hostName } = params
  const dateStr  = formatDate(appointment.slotDatetime)
  const timeStr  = formatTime12(appointment.slotDatetime)
  const deadline = new Date(appointment.slotDatetime.getTime() - 24 * 60 * 60 * 1000)
  const deadlineStr = `${formatDate(deadline)} a las ${formatTime12(deadline)}`
  const link = `${SITE}/invitado/${guest.verifyToken}`

  await sendTracked({
    kind: 'guest_invitation',
    appointmentId: appointment.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: guest.email,
    subject: `Verifica tu identidad para tu visita a Ciao Ciao`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Visita al showroom privado</p>
        <p class="copy">
          ${escapeHtml(hostName)} te ha invitado a su visita privada al showroom de Ciao Ciao Joyería.
          Para poder ingresar, necesitamos verificar tu identidad antes del ${escapeHtml(deadlineStr)}.
        </p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Invitado por', hostName],
        ])}
      </div>
      <div style="background:#FFF8F0;border:1px solid #E7E2D7;border-radius:12px;padding:14px 18px;margin:20px 0;text-align:center;">
        <p style="font-size:11px;color:#9A7E50;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;font-weight:600;">Importante</p>
        <p style="font-size:13px;color:#1A1A1A;margin:0;">Solo las personas con identificación verificada podrán ingresar al showroom.</p>
      </div>
      <p style="text-align:center"><a class="btn" href="${link}">Verificar mi identidad</a></p>
      <p style="text-align:center;font-size:12px;color:#8B8B8B;margin-top:8px;">Válido hasta el ${escapeHtml(deadlineStr)}</p>
    `),
  })
}

export async function sendGuestReminder(params: {
  guest: { name: string; email: string; verifyToken: string }
  appointment: Appointment
  hoursAhead: 48 | 24
}) {
  const { guest, appointment, hoursAhead } = params
  const dateStr = formatDate(appointment.slotDatetime)
  const timeStr = formatTime12(appointment.slotDatetime)
  const label   = hoursAhead === 48 ? '48 horas' : '24 horas'
  const link    = `${SITE}/invitado/${guest.verifyToken}`

  await sendTracked({
    kind: 'guest_reminder',
    appointmentId: appointment.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: guest.email,
    subject: `Recordatorio: verifica tu identidad para ingresar al showroom`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Faltan ${escapeHtml(label)} para tu visita</p>
        <p class="copy">
          Todavía no hemos recibido tu identificación. Sin verificación no podrás ingresar al showroom privado de Ciao Ciao.
        </p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${link}">Verificar ahora</a></p>
    `),
  })
}

/** Organizador del .ics: el mismo en el adjunto y en /api/calendar. */
export function icsOrganizerEmail(): string {
  return getConfiguredAdminEmails()[0] ?? 'info@ciaociao.mx'
}

export function generateICS(appt: Appointment, method: IcsMethod = 'REQUEST'): string {
  return buildAppointmentICS(appt, { method, organizerEmail: icsOrganizerEmail() })
}

function icsAttachment(appt: Appointment, method: IcsMethod): { filename: string; content: string; contentType: string } {
  return {
    filename: method === 'CANCEL' ? 'cita-ciaociao-cancelada.ics' : 'cita-ciaociao.ics',
    content: Buffer.from(generateICS(appt, method)).toString('base64'),
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  }
}

/**
 * `wasAccepted`: si la cita estaba confirmada, la clienta pudo agregarla a su
 * calendario; se adjunta un .ics METHOD:CANCEL (mismo UID, SEQUENCE mayor) para
 * que el evento desaparezca.
 */
export async function sendCancellationEmail(appt: Appointment, opts: { wasAccepted?: boolean } = {}) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const isVideo = isVideoAppointment(appt)

  const clientError = await sendTracked({
    kind: 'status_update',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Cita cancelada - ${dateStr}`,
    ...(opts.wasAccepted ? { attachments: [icsAttachment(appt, 'CANCEL')] } : {}),
    html: baseTemplate(`
      <div class="card">
        <p class="title">Cita cancelada</p>
        <p class="copy">Tu ${isVideo ? 'video consulta' : 'cita'} del ${dateStr} a las ${timeStr} ha sido cancelada. Si deseas agendar de nuevo, puedes hacerlo en cualquier momento.</p>
        ${details([
          ['Fecha',  dateStr],
          ['Hora',   timeStr],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}">Agendar nueva cita</a></p>
    `),
  }).then(() => null, (err: unknown) => err)

  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length > 0) {
    await sendTracked({
      kind: 'booking_admin',
      appointmentId: appt.id,
      from: `Sistema Citas <${FROM}>`,
      to: adminRecipients,
      subject: `Cita cancelada: ${appt.name} — ${dateStr} ${timeStr}`,
      html: baseTemplate(`
        <div class="card">
          <p class="title">Cita cancelada por el cliente</p>
          <p class="copy">El cliente canceló desde su link de cancelación.</p>
          ${details([
            ['Nombre',  appt.name],
            ['Email',   appt.email],
            ['Fecha',   `${dateStr} ${timeStr}`],
            ['Código',  appt.confirmationCode],
          ])}
        </div>
        <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas">Ver panel</a></p>
      `),
    })
  }
  if (clientError) throw clientError
}

export async function sendRescheduleNotice(appt: Appointment) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)
  const isVideo = isVideoAppointment(appt)

  await sendTracked({
    kind: 'status_update',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Tu cita fue reprogramada — ${dateStr}`,
    // Cita confirmada: .ics con el mismo UID y SEQUENCE mayor para que el
    // calendario de la clienta MUEVA el evento en lugar de dejarlo en la hora vieja.
    ...(appt.status === 'accepted' ? { attachments: [icsAttachment(appt, 'REQUEST')] } : {}),
    html: baseTemplate(`
      <div class="card">
        <p class="title">Tu cita fue reprogramada</p>
        <p class="copy">Hemos actualizado el horario de tu ${isVideo ? 'video consulta' : 'visita al showroom'}. A continuación encontrarás los nuevos detalles.</p>
        ${details([
          ['Nueva fecha', dateStr],
          ['Nueva hora',  timeStr],
          ['Código',      appt.confirmationCode],
          ...videoMeetingRows(appt),
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${reservaUrl(SITE, appt.confirmationCode)}">Ver tu cita</a></p>
    `),
  })
}

/**
 * Aviso al equipo: una solicitud enviada por la clienta lleva >20 min sin que
 * nadie la acepte o rechace. Antes, a los 30 min se cancelaba sola y en silencio.
 */
export async function sendPendingRequestAlert(appt: Appointment, minutesWaiting: number) {
  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length === 0) return { sent: false as const, recipients: 0 }
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)

  await sendTracked({
    kind: 'request_alert',
    appointmentId: appt.id,
    from: `Sistema Citas <${FROM}>`,
    to: adminRecipients,
    subject: `Solicitud sin atender (${minutesWaiting} min): ${appt.name} — ${dateStr} ${timeStr}`,
    idempotencyKey: `request-alert/${appt.id}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Una clienta espera respuesta</p>
        <p class="copy">Esta solicitud lleva ${minutesWaiting} minutos sin aceptarse ni rechazarse. El horario sigue apartado para ella; no se cancelará sola mientras la cita no haya pasado.</p>
        ${details([
          ['Tipo', appointmentTypeLabels[appt.appointmentType ?? 'showroom']],
          ['Nombre', appt.name],
          ['Teléfono', appt.phone],
          ['Fecha', `${dateStr} ${timeStr}`],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas?open=${encodeURIComponent(appt.id)}">Atender solicitud</a></p>
    `),
  })
  return { sent: true as const, recipients: adminRecipients.length }
}

/**
 * Una solicitud que nadie atendió llegó a su horario y se cancela: se le avisa
 * a la clienta (con una disculpa y la liga para agendar) y al equipo.
 */
export async function sendRequestExpiredNotices(appt: Appointment) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime12(appt.slotDatetime)

  const clientError = await sendTracked({
    kind: 'request_expired',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: 'Sobre tu solicitud de cita en Ciao Ciao',
    idempotencyKey: `request-expired-client/${appt.id}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">No alcanzamos a confirmar tu solicitud</p>
        <p class="copy">Hola ${escapeHtml(appt.name)}, lamentamos no haber confirmado a tiempo tu solicitud para el ${escapeHtml(dateStr)} a las ${escapeHtml(timeStr)}. Nos encantará recibirte: elige un nuevo horario o escríbenos y te ayudamos.</p>
        ${details([
          ['Código', appt.confirmationCode],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}">Elegir un nuevo horario</a></p>
    `),
  }).then(() => null, (err: unknown) => err)

  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length > 0) {
    await sendTracked({
      kind: 'request_expired',
      appointmentId: appt.id,
      from: `Sistema Citas <${FROM}>`,
      to: adminRecipients,
      subject: `Solicitud expirada sin respuesta: ${appt.name} — ${dateStr} ${timeStr}`,
      idempotencyKey: `request-expired-team/${appt.id}`,
      html: baseTemplate(`
        <div class="card">
          <p class="title">Solicitud expirada sin respuesta</p>
          <p class="copy">Nadie aceptó ni rechazó esta solicitud antes de su horario, así que se canceló y se le avisó a la clienta. Conviene contactarla.</p>
          ${details([
            ['Nombre', appt.name],
            ['Email', appt.email],
            ['Teléfono', appt.phone],
            ['Fecha', `${dateStr} ${timeStr}`],
            ['Código', appt.confirmationCode],
          ])}
        </div>
        <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas?open=${encodeURIComponent(appt.id)}">Ver en el panel</a></p>
      `),
    })
  }
  if (clientError) throw clientError
}

/**
 * Recordatorio semanal a los socios/admins para publicar horarios a mano.
 * La generación automática de slots está desactivada por decisión del negocio
 * (los horarios se curan manualmente cada semana); este correo es el sustituto.
 */
export async function sendSlotsReminderEmail(stats: {
  published: number
  available: number
  horizonDays: number
}) {
  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length === 0) {
    console.error('slots_reminder: no hay admins activos ni ADMIN_EMAIL configurado')
    return { sent: false as const, recipients: 0 }
  }

  const lowInventory = stats.available < 5
  const intro = lowInventory
    ? `Arranca la semana y quedan <strong>solo ${stats.available}</strong> horarios disponibles para agendar. Las clientas no pueden reservar si no hay slots publicados.`
    : 'Arranca la semana: recuerda publicar los horarios de citas para los próximos días.'

  await sendTracked({
    kind: 'slots_reminder',
    from: `Sistema Citas <${FROM}>`,
    to: adminRecipients,
    subject: lowInventory
      ? `🗓 Recordatorio: quedan ${stats.available} horarios — publica los de esta semana`
      : '🗓 Recordatorio semanal: publica los horarios de citas',
    html: baseTemplate(`
      <div class="card">
        <p class="title">Hora de publicar horarios</p>
        <p class="copy">${intro} Los horarios se añaden a mano — la generación automática está desactivada.</p>
        ${details([
          [`Publicados (próx. ${stats.horizonDays} días)`, String(stats.published)],
          ['Disponibles para agendar', String(stats.available)],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/admin/slots">Añadir horarios</a></p>
    `),
  })
  return { sent: true as const, recipients: adminRecipients.length }
}

/**
 * Recuperación de reserva: UN solo correo con todas las citas vigentes
 * (pendientes o confirmadas, con fecha futura) de la persona. Si no tiene
 * ninguna vigente, se envía un aviso amable en su lugar — nunca un correo
 * por cada cita del historial.
 */
export async function sendReservationRecovery(params: {
  to: string
  appointments: Appointment[]
  /** Nombre para el saludo cuando no hay citas vigentes que lo aporten. */
  name?: string
}) {
  const { to, appointments } = params
  const name = params.name?.trim() || appointments[0]?.name || ''
  const greeting = name ? `Hola ${escapeHtml(name)}, ` : ''

  if (appointments.length === 0) {
    await sendTracked({
      kind: 'reservation_recovery',
      from: `Ciao Ciao Joyería <${FROM}>`,
      to,
      subject: 'Tu consulta de citas en Ciao Ciao',
      html: baseTemplate(`
        <div class="card">
          <p class="title">Sin citas vigentes</p>
          <p class="copy">${greeting}recibimos tu solicitud para consultar tu reserva. Por el momento no encontramos citas próximas activas asociadas a tus datos. Será un placer recibirte cuando lo desees.</p>
        </div>
        <p style="text-align:center"><a class="btn" href="${SITE}">Agendar una cita</a></p>
      `),
    })
    return
  }

  const plural = appointments.length > 1
  const cards = appointments.map(appt => `
      <div class="card">
        ${details([
          ['Tipo', appointmentTypeLabels[appt.appointmentType ?? 'showroom']],
          ['Fecha', formatDate(appt.slotDatetime)],
          ['Hora', formatTime12(appt.slotDatetime)],
          ['Estado', appt.status === 'accepted' ? 'Confirmada' : 'Pendiente de revisión'],
          ['Código', appt.confirmationCode],
        ])}
        <p style="text-align:center;margin:16px 0 0;"><a class="btn" style="margin-top:0;" href="${reservaUrl(SITE, appt.confirmationCode)}">Ver estado de esta cita</a></p>
      </div>`).join('')

  await sendTracked({
    kind: 'reservation_recovery',
    appointmentId: appointments[0].id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to,
    subject: plural ? 'Tus citas vigentes en Ciao Ciao' : 'Tu cita en Ciao Ciao',
    html: baseTemplate(`
      <div class="card">
        <p class="title">${plural ? 'Tus citas vigentes' : 'Tu cita'}</p>
        <p class="copy">${greeting}${plural
          ? `encontramos ${appointments.length} citas vigentes a tu nombre. Aquí puedes consultar el estado de cada una y hacer los cambios disponibles.`
          : 'aquí puedes consultar el estado de tu cita y hacer los cambios disponibles.'}</p>
      </div>
      ${cards}
    `),
  })
}
