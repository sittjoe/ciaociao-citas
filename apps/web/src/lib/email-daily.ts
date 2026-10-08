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
import { formatDate, formatTime12, redactPII } from './utils'
import { assertResendOk, getActiveAdminEmails } from './email'
import { reservaUrl } from './reserva-access'
import type { AppointmentType } from '@/types'
import { FUENTES, PAPEL, aviso, boton, documento, enlace, escapeHtml, libro, notaCentrada, parrafo, seccion } from './email-design'

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
    // retryEmailOutbox() reusa la llave: un reintento nunca duplica el correo.
    idempotencyKey: params.idempotencyKey,
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
    // Resend 4.x no lanza: sin esto un 429/422 quedaba como enviado.
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

// Presentación: la misma papelería de la casa que lib/email.ts
// (lib/email-design.ts). Aquí solo se arma el contenido de cada correo.
const details = libro

/** Botón de contacto para clientas: WhatsApp del equipo si está configurado, correo si no. */
function contactButton(prefillText: string): string {
  if (TEAM_WHATSAPP) {
    const url = `https://wa.me/${TEAM_WHATSAPP}?text=${encodeURIComponent(prefillText)}`
    return boton(url, 'Escríbenos por WhatsApp')
  }
  return boton(`mailto:${FROM}`, 'Escríbenos')
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

const SANS = FUENTES.sans

function digestSection(title: string, rowsHtml: string): string {
  return seccion(title, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cc-linea" style="width:100%;border-collapse:collapse;border-top:1px solid ${PAPEL.linea}">${rowsHtml}</table>`)
}

/** Fila de agenda: momento a la izquierda (sans: Georgia, el respaldo de Gmail, usa cifras antiguas y «11:00» se leería «I I:OO») y quién a la derecha. */
function digestRow(when: string, name: string, typeLabel: string, extra: string, whenWidth = 84): string {
  return `<tr><td class="cc-linea cc-tinta" width="${whenWidth}" valign="top" style="width:${whenWidth}px;padding:12px 12px 12px 0;border-bottom:1px solid ${PAPEL.linea};font-family:${SANS};font-size:15px;line-height:21px;font-weight:500;color:${PAPEL.tinta};font-variant-numeric:lining-nums tabular-nums">${escapeHtml(when)}</td>`
    + `<td class="cc-linea" valign="top" style="padding:12px 0;border-bottom:1px solid ${PAPEL.linea};font-family:${SANS};font-size:14px;line-height:21px">`
    + `<span class="cc-tinta" style="color:${PAPEL.tinta};font-weight:500">${escapeHtml(name)}</span> <span class="cc-tenue" style="color:${PAPEL.tenue}">· ${escapeHtml(typeLabel)}</span>`
    + `<div style="margin-top:3px;font-size:12px;line-height:18px">${extra}</div></td></tr>`
}

function digestTodayRows(rows: DigestTodayRow[]): string {
  if (rows.length === 0) {
    return `<tr><td class="cc-tenue" style="padding:12px 0;font-family:${SANS};font-size:13px;color:${PAPEL.tenue}">Sin citas agendadas para hoy.</td></tr>`
  }
  return rows.map(r => {
    const confirmChip = r.clientConfirmed
      ? `<span style="color:${PAPEL.bien};font-weight:500;">&#9679; Confirmó</span>`
      : `<span style="color:${PAPEL.atencion};font-weight:500;">&#9675; Sin confirmar</span>`
    const idChip = r.isVideo
      ? ''
      : ` &nbsp;·&nbsp; <span style="color:${r.hasIdentification ? PAPEL.bien : PAPEL.atencion};">ID ${r.hasIdentification ? '&#10003;' : 'pendiente'}</span>`
    return digestRow(r.time, r.name, r.typeLabel, confirmChip + idChip)
  }).join('')
}

function digestUnconfirmedRows(rows: DigestUnconfirmedRow[]): string {
  return rows.map(r => digestRow(r.dateLabel, r.name, r.typeLabel, enlace(r.whatsappUrl, 'Pedir confirmación por WhatsApp →'), 132)).join('')
}

function digestPendingRows(rows: DigestPendingRow[]): string {
  return rows.map(r => digestRow(r.dateLabel, r.name, r.typeLabel, enlace(`${SITE}/admin/citas?open=${encodeURIComponent(r.id)}`, 'Decidir →'), 132)).join('')
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
  /**
   * Alerta de pocos horarios: cantidad de slots libres de los próximos 7 días
   * cuando queda poca oferta (el caller decide el umbral). null/undefined = sin alerta.
   */
  lowSlots?: number | null
}): Promise<{ sent: boolean; recipients: number }> {
  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length === 0) {
    console.error('daily_digest: no hay admins activos ni ADMIN_EMAIL configurado')
    return { sent: false, recipients: 0 }
  }

  const { today, unconfirmed, pending } = params
  const lowSlots = typeof params.lowSlots === 'number' ? params.lowSlots : null
  const subjectParts = [
    `${today.length} ${today.length === 1 ? 'cita' : 'citas'} hoy`,
    ...(unconfirmed.length > 0 ? [`${unconfirmed.length} sin confirmar`] : []),
    ...(pending.length > 0 ? [`${pending.length} por decidir`] : []),
    ...(lowSlots !== null ? [lowSlots === 1 ? 'queda 1 horario' : `quedan ${lowSlots} horarios`] : []),
  ]

  // Línea destacada de pocos horarios — arriba de todo, es lo más accionable.
  const lowSlotsAlert = lowSlots !== null
    ? aviso('Pocos horarios',
        `<span style="font-weight:500">${lowSlots === 1
          ? 'Queda 1 horario publicado para los próximos 7 días — publica más desde Slots.'
          : `Quedan ${lowSlots} horarios publicados para los próximos 7 días — publica más desde Slots.`}</span><br>${enlace(`${SITE}/admin/slots`, 'Abrir Slots →')}`,
        { centrado: false })
    : ''

  const sections = [
    lowSlotsAlert,
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
    html: documento({
      eyebrow: 'Para el equipo',
      titulo: 'Agenda del día',
      preheader: subjectParts.join(' · '),
      cuerpo: parrafo(`${escapeHtml(params.dayLabel)} · resumen matutino para el equipo.`, { centrado: true })
        + sections
        + boton(`${SITE}/admin/hoy`, 'Abrir la hoja del día'),
    }),
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
    html: documento({
      eyebrow: 'Después de tu cita',
      titulo: 'Gracias por tu visita',
      preheader: 'Estamos a un mensaje de distancia.',
      cuerpo: parrafo(`Hola ${escapeHtml(params.name)}, fue un gusto recibirte ${params.isVideo ? 'en tu video consulta' : 'en nuestro showroom privado'}. Esperamos que la experiencia haya estado a la altura de lo que buscabas.`)
        + parrafo('Si te quedaste pensando en alguna pieza, quieres ver opciones a tu medida o simplemente tienes una duda, estamos a un mensaje de distancia.', { final: true })
        + contactButton(prefill),
    }),
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
  const statusUrl = reservaUrl(SITE, params.confirmationCode)
  await sendTrackedDaily({
    kind: 'post_visit_rescue',
    appointmentId: params.appointmentId,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: params.email,
    subject: 'Te esperamos en Ciao Ciao — ¿reagendamos?',
    html: documento({
      eyebrow: 'Tu cita',
      titulo: 'Te esperamos — ¿reagendamos?',
      preheader: 'Elegir un nuevo horario toma menos de un minuto.',
      cuerpo: parrafo(`Hola ${escapeHtml(params.name)}, no pudimos coincidir en tu ${params.isVideo ? 'video consulta' : 'cita'} — esperamos que todo esté bien.`)
        + parrafo('Tu lugar en Ciao Ciao sigue apartado para cuando quieras retomarla. Elegir un nuevo horario toma menos de un minuto.', { final: true })
        + boton(statusUrl, 'Reagendar mi cita')
        + notaCentrada('Si prefieres, responde este correo y lo vemos contigo.'),
    }),
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
    html: documento({
      eyebrow: 'Lista de espera',
      titulo: 'Se abrió un horario',
      preheader: `${formatDate(params.slotDatetime)} · ${formatTime12(params.slotDatetime)}`,
      cuerpo: parrafo(`Hola ${escapeHtml(params.name)}, nos pediste avisarte cuando hubiera disponibilidad para ${wanted}. Acaba de abrirse este horario:`)
        + details([
          ['Fecha', formatDate(params.slotDatetime)],
          ['Hora', formatTime12(params.slotDatetime)],
        ])
        + boton(SITE, 'Reservar ahora')
        + notaCentrada('Los lugares se asignan por orden de reserva. Si este horario no te acomoda, en la página verás el resto de la disponibilidad.'),
    }),
    idempotencyKey: `waitlist-open-${params.entryId}`,
  })
}
