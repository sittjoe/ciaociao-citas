import { formatInTimeZone } from 'date-fns-tz'
import { BUSINESS_TZ } from './utils'
import { isVideoEngagement } from './commercial'
import type { Appointment } from '@/types'

/*
 * Un solo generador de .ics (RFC 5545) para el adjunto de los correos y para
 * /api/calendar/[apptId]. Reglas que antes no se cumplían:
 *  - TEXT escapado: \\ ; , y saltos de línea (un LF suelto en DESCRIPTION
 *    dejaba una línea sin «:» y Outlook rechazaba el archivo completo).
 *  - Parámetros (CN=) entre comillas dobles: un nombre con coma rompía ATTENDEE.
 *  - Líneas plegadas a 75 octetos (UTF-8), con CRLF + espacio.
 *  - SEQUENCE + DTSTAMP: con el mismo UID, el calendario de la clienta
 *    reemplaza el evento al reprogramar (REQUEST, SEQUENCE mayor) y lo quita al
 *    cancelar (METHOD:CANCEL + STATUS:CANCELLED).
 */

export type IcsMethod = 'REQUEST' | 'CANCEL'

/** Escapa un valor TEXT (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Valor de parámetro entre comillas (RFC 5545 §3.2): sin comillas ni controles dentro. */
export function quoteIcsParam(value: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/["\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
  return `"${clean}"`
}

/** Pliega una línea a ≤75 octetos sin partir un carácter UTF-8 (RFC 5545 §3.1). */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let currentBytes = 0
  let limit = 75 // la primera línea lleva 75; las siguientes 74 + el espacio inicial
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (currentBytes + b > limit) {
      parts.push(current)
      current = ch
      currentBytes = b
      limit = 74
    } else {
      current += ch
      currentBytes += b
    }
  }
  if (current) parts.push(current)
  return parts.join('\r\n ')
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildAppointmentICS(
  appt: Pick<Appointment,
    'id' | 'slotDatetime' | 'appointmentType' | 'name' | 'email'
    | 'meetingUrl' | 'meetingInstructions' | 'icsSequence'>,
  opts: { method: IcsMethod; organizerEmail: string; now?: Date },
): string {
  const start = appt.slotDatetime
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const fmtLocal = (d: Date) => formatInTimeZone(d, BUSINESS_TZ, "yyyyMMdd'T'HHmmss")
  const isVideo = isVideoEngagement(appt.appointmentType)
  const meetingUrl = String(appt.meetingUrl ?? '').trim()
  const cancelled = opts.method === 'CANCEL'
  const sequence = Math.max(0, Math.floor(Number(appt.icsSequence ?? 0)) || 0)

  const description = cancelled
    ? 'Esta cita fue cancelada.'
    : isVideo
      ? [
          'Video consulta para anillo de compromiso en Ciao Ciao Joyería.',
          meetingUrl ? `Link: ${meetingUrl}` : 'Link: pendiente por enviar.',
          appt.meetingInstructions ? `Indicaciones: ${appt.meetingInstructions}` : '',
        ].filter(Boolean).join('\n')
      : 'Tu cita personalizada en el showroom privado de Ciao Ciao Joyería.'
  const location = isVideo ? (meetingUrl || 'Videollamada') : 'Showroom Ciao Ciao Joyería'
  const summary = isVideo ? 'Video consulta Ciao Ciao' : 'Cita en Ciao Ciao Joyería'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CiaoCiao//Citas//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${opts.method}`,
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
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${utcStamp(opts.now ?? new Date())}`,
    `DTSTART;TZID=${BUSINESS_TZ}:${fmtLocal(start)}`,
    `DTEND;TZID=${BUSINESS_TZ}:${fmtLocal(end)}`,
    `SUMMARY:${escapeIcsText(cancelled ? `Cancelada: ${summary}` : summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `ORGANIZER;CN=${quoteIcsParam('Ciao Ciao Joyería')}:mailto:${opts.organizerEmail}`,
    `ATTENDEE;${cancelled ? '' : 'RSVP=TRUE;'}CN=${quoteIcsParam(appt.name || 'Cliente')}:mailto:${appt.email}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
