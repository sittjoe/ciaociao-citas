import { Resend } from 'resend'
import { FieldValue } from 'firebase-admin/firestore'
import { formatInTimeZone } from 'date-fns-tz'
import { formatDate, formatTime, BUSINESS_TZ } from './utils'
import { adminDb } from './firebase-admin'
import type { Appointment } from '@/types'

const FROM = process.env.RESEND_FROM_EMAIL || 'hola@ciaociao.mx'
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'
const SHOWROOM_ADDRESS = process.env.SHOWROOM_ADDRESS || 'Ciudad de México'

type EmailKind = 'booking_client' | 'booking_admin' | 'status_update' | 'reminder' | 'confirmation_request' | 'calendar_error' | 'guest_invitation' | 'guest_reminder'

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
    const snap = await adminDb.collection('admins').where('active', '==', true).get()
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
  attachments?: { filename: string; content: string }[]
}) {
  try {
    const result = await getResend().emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.attachments ? { attachments: params.attachments } : {}),
      headers: { 'List-Unsubscribe': `<mailto:${FROM}?subject=Baja>` },
    })
    await recordEmailEvent({
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      appointmentId: params.appointmentId,
      ok: true,
    })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
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
    <p>Joyería fina · Showroom privado</p>
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

export async function sendBookingConfirmation(
  appt: Appointment,
  guestNames: string[] = [],
) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)
  const url = `${SITE}/reserva/${appt.confirmationCode}`

  const guestBlock = guestNames.length > 0
    ? `<div style="margin:16px 0;padding:14px 16px;background:#FAF7F2;border-radius:12px;border:1px solid #E7E2D7;">
        <p style="font-size:11px;color:#9A7E50;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;font-weight:600;">Invitados agregados</p>
        ${guestNames.map(n => `<p style="font-size:13px;color:#1A1A1A;margin:2px 0;">· ${escapeHtml(n)}</p>`).join('')}
        <p style="font-size:11px;color:#6B6B6B;margin:10px 0 0;">Cada uno recibirá un correo con su link de verificación. Solo las personas verificadas podrán ingresar al showroom.</p>
       </div>`
    : ''

  await sendTracked({
    kind: 'booking_client',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Solicitud recibida en Ciao Ciao - ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Solicitud recibida</p>
        <p class="copy">Gracias, ${escapeHtml(appt.name)}. Nuestro equipo revisará tu solicitud y te notificará la confirmación.</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      ${guestBlock}
      <p style="text-align:center"><a class="btn" href="${url}">Ver estado de tu cita</a></p>
    `),
  })

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
            ['Nombre', appt.name],
            ['Email', appt.email],
            ['Teléfono', appt.phone],
            ['Fecha', `${dateStr} ${timeStr}`],
            ['Notas', appt.notes || 'Sin notas'],
          ])}
        </div>
        <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas">Gestionar cita</a></p>
      `),
    })
  }
}

export async function sendStatusUpdate(appt: Appointment, action: 'accept' | 'reject', reason?: string) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)
  const accepted = action === 'accept'
  const icsContent = accepted ? generateICS(appt) : null
  const attachments = icsContent
    ? [{ filename: 'cita-ciaociao.ics', content: Buffer.from(icsContent).toString('base64') }]
    : []

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(SHOWROOM_ADDRESS)}`
  const body = accepted
    ? `<div class="card">
        <p class="title">Tu cita está confirmada</p>
        <p class="copy">Te esperamos en nuestro showroom privado. Encontrarás el .ics adjunto para agregar la cita a tu calendario.</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
        ])}
       </div>
       <div style="text-align:center;margin:20px 0;padding:18px 20px;background:#FAF7F2;border-radius:14px;border:1px solid #E7E2D7;">
         <p style="font-size:11px;color:#9A7E50;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px;">Ubicación del showroom</p>
         <p style="font-size:14px;color:#1A1A1A;font-weight:600;margin:0 0 4px;">${escapeHtml(SHOWROOM_ADDRESS)}</p>
         <a href="${mapsUrl}" style="font-size:12px;color:#9A7E50;text-decoration:none;">Ver en Google Maps →</a>
       </div>
       <p style="text-align:center"><a class="btn" href="${SITE}/reserva/${appt.confirmationCode}">Ver tu cita</a></p>`
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

export async function sendReminder(appt: Appointment, hoursAhead: 24 | 2) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)
  const label = hoursAhead === 24 ? 'mañana' : 'en 2 horas'

  await sendTracked({
    kind: 'reminder',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Recordatorio: tu cita es ${label}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Tu cita es ${label}</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/reserva/${appt.confirmationCode}">Ver detalles</a></p>
    `),
  })
}

export async function sendReminder24Confirm(appt: Appointment) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)

  await sendTracked({
    kind: 'confirmation_request',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Confirma tu cita de mañana — ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Tu cita es mañana</p>
        <p class="copy">Hola ${escapeHtml(appt.name)}, te esperamos mañana en el showroom privado de Ciao Ciao Joyería. Para ayudarnos a prepararnos, confírmanos que podrás asistir.</p>
        ${details([
          ['Fecha', dateStr],
          ['Hora', timeStr],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/confirmar/${appt.cancelToken}">Sí, confirmar mi cita</a></p>
      <p style="text-align:center;margin-top:12px;font-size:13px;color:#8B8B8B;">¿No podrás asistir? <a href="${SITE}/reserva/${appt.confirmationCode}" style="color:#9A7E50;text-decoration:none;">Cancelar mi cita</a></p>
    `),
  })
}


export async function sendCalendarError(appt: Appointment, errorMessage: string) {
  const adminRecipients = await getActiveAdminEmails()
  if (adminRecipients.length === 0) return

  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)

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
  const timeStr  = formatTime(appointment.slotDatetime)
  const deadline = new Date(appointment.slotDatetime.getTime() - 24 * 60 * 60 * 1000)
  const deadlineStr = `${formatDate(deadline)} a las ${formatTime(deadline)}`
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
  const timeStr = formatTime(appointment.slotDatetime)
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

function generateICS(appt: Appointment): string {
  const start    = appt.slotDatetime
  const end      = new Date(start.getTime() + 60 * 60 * 1000)
  const fmtLocal = (d: Date) => formatInTimeZone(d, BUSINESS_TZ, "yyyyMMdd'T'HHmmss")
  const dtstamp  = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const admin    = getConfiguredAdminEmails()[0] ?? 'info@ciaociao.mx'

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CiaoCiao//Citas//ES',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    `TZID:${BUSINESS_TZ}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZNAME:CST',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0600',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${appt.id}@ciaociao.mx`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${BUSINESS_TZ}:${fmtLocal(start)}`,
    `DTEND;TZID=${BUSINESS_TZ}:${fmtLocal(end)}`,
    'SUMMARY:Cita en Ciao Ciao Joyería',
    'DESCRIPTION:Tu cita personalizada en el showroom privado de Ciao Ciao Joyería.',
    'LOCATION:Showroom Ciao Ciao Joyería',
    `ORGANIZER;CN=Ciao Ciao Joyería:mailto:${admin}`,
    `ATTENDEE;RSVP=TRUE;CN=${appt.name}:mailto:${appt.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export async function sendCancellationEmail(appt: Appointment) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)

  await sendTracked({
    kind: 'status_update',
    appointmentId: appt.id,
    from: `Ciao Ciao Joyería <${FROM}>`,
    to: appt.email,
    subject: `Cita cancelada - ${dateStr}`,
    html: baseTemplate(`
      <div class="card">
        <p class="title">Cita cancelada</p>
        <p class="copy">Tu cita del ${dateStr} a las ${timeStr} ha sido cancelada. Si deseas agendar una nueva visita, puedes hacerlo en cualquier momento.</p>
        ${details([
          ['Fecha',  dateStr],
          ['Hora',   timeStr],
          ['Código', appt.confirmationCode],
        ])}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}">Agendar nueva cita</a></p>
    `),
  })

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
}
