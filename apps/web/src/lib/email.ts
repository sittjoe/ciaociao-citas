import { Resend } from 'resend'
import { formatDate, formatTime } from './utils'
import type { Appointment } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM    = process.env.RESEND_FROM_EMAIL  || 'hola@ciaociao.mx'
const ADMIN   = process.env.ADMIN_EMAIL        || 'info@ciaociao.mx'
const SITE    = process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; background:#0D0D0D; font-family:'Inter',Helvetica,Arial,sans-serif; color:#E8D5A8; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .logo { text-align:center; margin-bottom:32px; }
  .logo h1 { font-family:Georgia,serif; color:#C9A55A; font-size:28px; margin:0; letter-spacing:4px; font-weight:400; }
  .logo p { color:#A88B49; font-size:11px; letter-spacing:3px; margin:4px 0 0; text-transform:uppercase; }
  .card { background:#1A1A1A; border:1px solid #2A2A2A; border-radius:12px; padding:32px; margin:24px 0; }
  .title { font-family:Georgia,serif; font-size:22px; color:#C9A55A; margin:0 0 16px; font-weight:400; }
  .detail { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #2A2A2A; font-size:14px; }
  .detail:last-child { border-bottom:none; }
  .detail .label { color:#A88B49; }
  .detail .value { color:#E8D5A8; font-weight:500; }
  .btn { display:inline-block; background:#C9A55A; color:#0D0D0D; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px; margin-top:20px; }
  .footer { text-align:center; color:#525252; font-size:12px; margin-top:32px; line-height:1.6; }
  .divider { border:none; border-top:1px solid #2A2A2A; margin:24px 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <h1>CIAO CIAO</h1>
    <p>Joyería · Showroom Privado</p>
  </div>
  ${body}
  <div class="footer">
    <p>Ciao Ciao Joyería · Showroom Privado</p>
    <p>Si tienes dudas escríbenos a <a href="mailto:hola@ciaociao.mx" style="color:#C9A55A;">hola@ciaociao.mx</a></p>
  </div>
</div>
</body>
</html>`
}

export async function sendBookingConfirmation(appt: Appointment) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)
  const url     = `${SITE}/reserva/${appt.confirmationCode}`

  await resend.emails.send({
    from:    `Ciao Ciao Joyería <${FROM}>`,
    to:      appt.email,
    subject: `Tu cita en Ciao Ciao – ${dateStr}`,
    html: baseTemplate('Cita Confirmada', `
      <div class="card">
        <p class="title">¡Tu cita ha sido recibida!</p>
        <p style="color:#A88B49;font-size:14px;margin:0 0 20px">Revisaremos tu solicitud y te notificaremos a la brevedad.</p>
        <div class="detail"><span class="label">Fecha</span><span class="value">${dateStr}</span></div>
        <div class="detail"><span class="label">Hora</span><span class="value">${timeStr}</span></div>
        <div class="detail"><span class="label">Nombre</span><span class="value">${appt.name}</span></div>
        <div class="detail"><span class="label">Código</span><span class="value">${appt.confirmationCode}</span></div>
      </div>
      <p style="text-align:center"><a class="btn" href="${url}">Ver estado de tu cita</a></p>
    `),
  })

  // Notificar al admin
  await resend.emails.send({
    from:    `Sistema Citas <${FROM}>`,
    to:      ADMIN,
    subject: `Nueva cita: ${appt.name} – ${dateStr} ${timeStr}`,
    html: baseTemplate('Nueva Solicitud de Cita', `
      <div class="card">
        <p class="title">Nueva solicitud</p>
        <div class="detail"><span class="label">Nombre</span><span class="value">${appt.name}</span></div>
        <div class="detail"><span class="label">Email</span><span class="value">${appt.email}</span></div>
        <div class="detail"><span class="label">Teléfono</span><span class="value">${appt.phone}</span></div>
        <div class="detail"><span class="label">Fecha</span><span class="value">${dateStr} ${timeStr}</span></div>
        ${appt.notes ? `<div class="detail"><span class="label">Notas</span><span class="value">${appt.notes}</span></div>` : ''}
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/admin/citas">Gestionar en panel admin</a></p>
    `),
  })
}

export async function sendStatusUpdate(appt: Appointment, action: 'accept' | 'reject', reason?: string) {
  const dateStr  = formatDate(appt.slotDatetime)
  const timeStr  = formatTime(appt.slotDatetime)
  const accepted = action === 'accept'

  const icsContent = accepted ? generateICS(appt) : null

  const body = accepted
    ? `<div class="card">
        <p class="title">✓ ¡Tu cita está confirmada!</p>
        <p style="color:#A88B49;font-size:14px;margin:0 0 20px">Te esperamos en nuestro showroom privado.</p>
        <div class="detail"><span class="label">Fecha</span><span class="value">${dateStr}</span></div>
        <div class="detail"><span class="label">Hora</span><span class="value">${timeStr}</span></div>
        <div class="detail"><span class="label">Código</span><span class="value">${appt.confirmationCode}</span></div>
       </div>
       <p style="text-align:center"><a class="btn" href="${SITE}/reserva/${appt.confirmationCode}">Ver tu cita</a></p>`
    : `<div class="card">
        <p class="title">Tu solicitud no pudo ser procesada</p>
        ${reason ? `<p style="color:#A88B49;font-size:14px">${reason}</p>` : '<p style="color:#A88B49;font-size:14px">En este momento no podemos confirmar tu cita. Te invitamos a intentar con otro horario.</p>'}
       </div>
       <p style="text-align:center"><a class="btn" href="${SITE}">Agendar nueva cita</a></p>`

  const attachments = icsContent
    ? [{ filename: 'cita-ciaociao.ics', content: Buffer.from(icsContent).toString('base64') }]
    : []

  await resend.emails.send({
    from:        `Ciao Ciao Joyería <${FROM}>`,
    to:          appt.email,
    subject:     accepted ? `Cita confirmada – ${dateStr}` : 'Actualización sobre tu solicitud de cita',
    html:        baseTemplate(accepted ? 'Cita Confirmada' : 'Solicitud No Disponible', body),
    attachments,
  })
}

export async function sendReminder(appt: Appointment, hoursAhead: 24 | 2) {
  const dateStr = formatDate(appt.slotDatetime)
  const timeStr = formatTime(appt.slotDatetime)
  const label   = hoursAhead === 24 ? 'mañana' : 'en 2 horas'

  await resend.emails.send({
    from:    `Ciao Ciao Joyería <${FROM}>`,
    to:      appt.email,
    subject: `Recordatorio: tu cita es ${label}`,
    html: baseTemplate('Recordatorio de Cita', `
      <div class="card">
        <p class="title">Tu cita es ${label}</p>
        <div class="detail"><span class="label">Fecha</span><span class="value">${dateStr}</span></div>
        <div class="detail"><span class="label">Hora</span><span class="value">${timeStr}</span></div>
        <div class="detail"><span class="label">Código</span><span class="value">${appt.confirmationCode}</span></div>
      </div>
      <p style="text-align:center"><a class="btn" href="${SITE}/reserva/${appt.confirmationCode}">Ver detalles</a></p>
    `),
  })
}

function generateICS(appt: Appointment): string {
  const start = appt.slotDatetime
  const end   = new Date(start.getTime() + 60 * 60 * 1000)
  const fmt   = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CiaoCiao//Citas//ES',
    'BEGIN:VEVENT',
    `UID:${appt.id}@ciaociao.mx`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    'SUMMARY:Cita en Ciao Ciao Joyería',
    'DESCRIPTION:Tu cita personalizada en el showroom privado de Ciao Ciao Joyería.',
    'LOCATION:Showroom Ciao Ciao Joyería',
    `ORGANIZER;CN=Ciao Ciao Joyería:mailto:${ADMIN}`,
    `ATTENDEE;CN=${appt.name}:mailto:${appt.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
