/**
 * Plantillas y envío de los correos del cron diario enriquecido (/api/reminders):
 *
 *  1. Digest matutino al equipo — agenda de hoy + aceptadas sin confirmación + por decidir.
 *  2. Post-cita a la clienta — «gracias por tu visita» (asistió) / rescate amable (no asistió).
 *  3. Waitlist viva — «se abrió un horario» a quien dejó sus datos sin disponibilidad.
 *
 * Vive separado de lib/email.ts a propósito: replica su mismo patrón de cliente
 * Resend + registro en emailOutbox/emailEvents (para que retryEmailOutbox()
 * también recupere estos envíos si fallan), sin tocar las plantillas
 * transaccionales existentes. Todos los envíos llevan Idempotency-Key porque
 * salen en lote desde un cron.
 */
import { Resend } from 'resend'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'
import { formatDate, formatTime, redactPII } from './utils'
import { getActiveAdminEmails } from './email'
import type { AppointmentType } from '@/types'

const FROM = process.env.RESEND_FROM_EMAIL || 'hola@ciaociao.mx'
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'
// WhatsApp del equipo (solo dígitos con lada país, p.ej. 5215512345678).
// Opcional: si no está configurado, los correos a clienta ofrecen el correo.
const TEAM_WHATSAPP = (process.env.TEAM_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')

type DailyEmailKind = 'daily_digest' | 'post_visit_thanks' | 'post_visit_rescue' | 'waitlist_slot_open'

let resendClient: Resend | null = null

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('RESEND_API_KEY env var not set')
  if (!resendClient) resendClient = new Resend(key)
  return resendClient
}

async function recordEmailEvent(data: {
  kind: DailyEmailKind
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

/**
 * Mismo contrato de outbox que sendTracked() de lib/email.ts (mismos campos,
 * misma colección) para que retryEmailOutbox() reintente estos envíos, más
 * Idempotency-Key de Resend porque el cron manda en lote.
 */
async function sendTrackedDaily(params: {
  kind: DailyEmailKind
  appointmentId?: string
  from: string
  to: string | string[]
  subject: string
  html: string
  idempotencyKey: string
}) {
  const outboxRef = adminDb.collection('emailOutbox').doc()
  await outboxRef.set({
    kind: params.kind,
    appointmentId: params.appointmentId ?? null,
    from: params.from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    attachments: [],
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
      headers: { 'List-Unsubscribe': `<mailto:${FROM}?subject=Baja>` },
    }, { idempotencyKey: params.idempotencyKey })
    await recordEmailEvent({
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      appointmentId: params.appointmentId,
      ok: true,
    })
    await outboxRef.update({
      status: 'sent',
      resendId: result.data?.id ?? null,
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

// Mismo lienzo maison que lib/email.ts (duplicado a propósito: ese módulo no
// exporta sus plantillas y no se toca desde aquí).
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

/** Botón de contacto para clientas: WhatsApp del equipo si está configurado, correo si no. */
function contactButton(prefillText: string): string {
  if (TEAM_WHATSAPP) {
    const url = `https://wa.me/${TEAM_WHATSAPP}?text=${encodeURIComponent(prefillText)}`
    return `<p style="text-align:center"><a class="btn" href="${url}">Escríbenos por WhatsApp</a></p>`
  }
  return `<p style="text-align:center"><a class="btn" href="mailto:${FROM}">Escríbenos</a></p>`
}

// ---------------------------------------------------------------------------
// 1. Digest matutino al equipo
// ---------------------------------------------------------------------------

export interface DigestTodayRow {
  /** Hora CDMX ya formateada, p.ej. "11:00". */
  time: string
  name: string
  typeLabel: string
  isVideo: boolean
  clientConfirmed: boolean
  hasIdentification: boolean
}

export interface DigestUnconfirmedRow {
  /** Día y hora CDMX ya formateados, p.ej. "jue 17 de jul · 11:00". */
  dateLabel: string
  name: string
  typeLabel: string
  whatsappUrl: string
}

export interface DigestPendingRow {
  id: string
  dateLabel: string
  name: string
  typeLabel: string
}

function digestSection(title: string, rowsHtml: string): string {
  return `<div class="card" style="padding:22px 28px;">
    <p style="font-size:11px;color:#9A7E50;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;font-weight:600;">${escapeHtml(title)}</p>
    ${rowsHtml}
  </div>`
}

function digestTodayRows(rows: DigestTodayRow[]): string {
  if (rows.length === 0) {
    return '<p style="font-size:13px;color:#8B8B8B;margin:8px 0 0;">Sin citas agendadas para hoy.</p>'
  }
  return rows.map(r => {
    const confirmChip = r.clientConfirmed
      ? '<span style="color:#2E7D32;font-weight:600;">&#9679; Confirmó</span>'
      : '<span style="color:#B26A00;font-weight:600;">&#9675; Sin confirmar</span>'
    const idChip = r.isVideo
      ? ''
      : ` &nbsp;·&nbsp; <span style="color:${r.hasIdentification ? '#2E7D32' : '#B26A00'};">ID ${r.hasIdentification ? '&#10003;' : 'pendiente'}</span>`
    return `<div style="padding:10px 0;border-bottom:1px solid #F0EDE6;">
      <p style="margin:0;font-size:14px;color:#1A1A1A;"><strong>${escapeHtml(r.time)}</strong> — ${escapeHtml(r.name)} <span style="color:#6B6B6B;">· ${escapeHtml(r.typeLabel)}</span></p>
      <p style="margin:4px 0 0;font-size:12px;">${confirmChip}${idChip}</p>
    </div>`
  }).join('')
}

function digestUnconfirmedRows(rows: DigestUnconfirmedRow[]): string {
  return rows.map(r => `<div style="padding:10px 0;border-bottom:1px solid #F0EDE6;">
      <p style="margin:0;font-size:14px;color:#1A1A1A;"><strong>${escapeHtml(r.dateLabel)}</strong> — ${escapeHtml(r.name)} <span style="color:#6B6B6B;">· ${escapeHtml(r.typeLabel)}</span></p>
      <p style="margin:4px 0 0;"><a href="${r.whatsappUrl}" style="font-size:12px;color:#9A7E50;text-decoration:none;font-weight:600;">Pedir confirmación por WhatsApp &rarr;</a></p>
    </div>`).join('')
}

function digestPendingRows(rows: DigestPendingRow[]): string {
  return rows.map(r => `<div style="padding:10px 0;border-bottom:1px solid #F0EDE6;">
      <p style="margin:0;font-size:14px;color:#1A1A1A;"><strong>${escapeHtml(r.dateLabel)}</strong> — ${escapeHtml(r.name)} <span style="color:#6B6B6B;">· ${escapeHtml(r.typeLabel)}</span></p>
      <p style="margin:4px 0 0;"><a href="${SITE}/admin/citas?open=${encodeURIComponent(r.id)}" style="font-size:12px;color:#9A7E50;text-decoration:none;font-weight:600;">Decidir &rarr;</a></p>
    </div>`).join('')
}

/**
 * Un solo correo a los admins activos (mismo destinatario que el recordatorio
 * de slots: getActiveAdminEmails de lib/email.ts). El caller decide si hay
 * contenido; aquí solo se renderiza y envía.
 */
export async function sendDailyTeamDigest(params: {
  /** Día CDMX legible, p.ej. "Miércoles 16 de julio". */
  dayLabel: string
  /** Clave del día CDMX (yyyy-MM-dd), usada para la Idempotency-Key. */
  dateKey: string
  today: DigestTodayRow[]
  unconfirmed: DigestUnconfirmedRow[]
  pending: DigestPendingRow[]
}): Promise<{ sent: boolean; recipients: number }> {
  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length === 0) {
    console.error('daily_digest: no hay admins activos ni ADMIN_EMAIL configurado')
    return { sent: false, recipients: 0 }
  }

  const { today, unconfirmed, pending } = params
  const subjectParts = [
    `${today.length} ${today.length === 1 ? 'cita' : 'citas'} hoy`,
    ...(unconfirmed.length > 0 ? [`${unconfirmed.length} sin confirmar`] : []),
    ...(pending.length > 0 ? [`${pending.length} por decidir`] : []),
  ]

  const sections = [
    digestSection('Citas de hoy', digestTodayRows(today)),
    ...(unconfirmed.length > 0
      ? [digestSection('Próximos 2 días · aceptadas sin confirmación de la clienta', digestUnconfirmedRows(unconfirmed))]
      : []),
    ...(pending.length > 0
      ? [digestSection('Pendientes de decidir', digestPendingRows(pending))]
      : []),
  ].join('')

  await sendTrackedDaily({
    kind: 'daily_digest',
    from: `Sistema Citas <${FROM}>`,
    to: adminRecipients,
    subject: `☀️ ${params.dayLabel}: ${subjectParts.join(' · ')}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Agenda del día</p>
        <p class="copy" style="margin:0;">${escapeHtml(params.dayLabel)} · resumen matutino para el equipo.</p>
      </div>
      ${sections}
      <p style="text-align:center"><a class="btn" href="${SITE}/admin/hoy">Abrir la hoja del día</a></p>
    `),
    idempotencyKey: `daily-digest-${params.dateKey}`,
  })
  return { sent: true, recipients: adminRecipients.length }
}

// ---------------------------------------------------------------------------
// 2. Post-cita a la clienta
// ---------------------------------------------------------------------------

export async function sendPostVisitThanks(params: {
  appointmentId: string
  name: string
  email: string
  isVideo: boolean
}) {
  const prefill = 'Hola, tuve una cita con Ciao Ciao Joyería y me gustaría dar seguimiento.'
  await sendTrackedDaily({
    kind: 'post_visit_thanks',
    appointmentId: params.appointmentId,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: params.email,
    subject: 'Gracias por tu visita a Ciao Ciao',
    html: baseTemplate(`
      <div class="card">
        <p class="title">Gracias por tu visita</p>
        <p class="copy">
          Hola ${escapeHtml(params.name)}, fue un gusto recibirte ${params.isVideo ? 'en tu video consulta' : 'en nuestro showroom privado'}.
          Esperamos que la experiencia haya estado a la altura de lo que buscabas.
        </p>
        <p class="copy" style="margin-bottom:0;">
          Si te quedaste pensando en alguna pieza, quieres ver opciones a tu medida
          o simplemente tienes una duda, estamos a un mensaje de distancia.
        </p>
      </div>
      ${contactButton(prefill)}
    `),
    idempotencyKey: `post-visit-${params.appointmentId}`,
  })
}

export async function sendPostVisitRescue(params: {
  appointmentId: string
  name: string
  email: string
  confirmationCode: string
  isVideo: boolean
}) {
  const statusUrl = `${SITE}/reserva/${params.confirmationCode}`
  await sendTrackedDaily({
    kind: 'post_visit_rescue',
    appointmentId: params.appointmentId,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: params.email,
    subject: 'Te esperamos en Ciao Ciao — ¿reagendamos?',
    html: baseTemplate(`
      <div class="card">
        <p class="title">Te esperamos — ¿reagendamos?</p>
        <p class="copy">
          Hola ${escapeHtml(params.name)}, no pudimos coincidir en tu ${params.isVideo ? 'video consulta' : 'cita'} — esperamos que todo esté bien.
        </p>
        <p class="copy" style="margin-bottom:0;">
          Tu lugar en Ciao Ciao sigue apartado para cuando quieras retomarla.
          Elegir un nuevo horario toma menos de un minuto.
        </p>
      </div>
      <p style="text-align:center"><a class="btn" href="${statusUrl}">Reagendar mi cita</a></p>
      <p style="text-align:center;margin-top:12px;font-size:13px;color:#8B8B8B;">Si prefieres, responde este correo y lo vemos contigo.</p>
    `),
    idempotencyKey: `post-visit-${params.appointmentId}`,
  })
}

// ---------------------------------------------------------------------------
// 3. Waitlist viva
// ---------------------------------------------------------------------------

export async function sendWaitlistSlotOpen(params: {
  entryId: string
  name: string
  email: string
  appointmentType: AppointmentType
  slotDatetime: Date
}) {
  const isVideo = params.appointmentType === 'video_engagement_rings'
  const wanted = isVideo
    ? 'una video consulta de anillo de compromiso'
    : 'una visita a nuestro showroom privado'
  await sendTrackedDaily({
    kind: 'waitlist_slot_open',
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: params.email,
    subject: 'Se abrió un horario en Ciao Ciao',
    html: baseTemplate(`
      <div class="card">
        <p class="title">Se abrió un horario</p>
        <p class="copy">
          Hola ${escapeHtml(params.name)}, nos pediste avisarte cuando hubiera
          disponibilidad para ${wanted}. Acaba de abrirse este horario:
        </p>
        ${details([
          ['Fecha', formatDate(params.slotDatetime)],
          ['Hora', formatTime(params.slotDatetime)],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}">Reservar ahora</a></p>
      <p style="text-align:center;margin-top:12px;font-size:13px;color:#8B8B8B;">Los lugares se asignan por orden de reserva. Si este horario no te acomoda, en la página verás el resto de la disponibilidad.</p>
    `),
    idempotencyKey: `waitlist-open-${params.entryId}`,
  })
}
