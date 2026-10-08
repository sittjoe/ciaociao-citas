import { parseISO } from 'date-fns'
import type { AppointmentType } from '@/types'

/*
 * Calendario de una SOLICITUD (aún sin confirmar), generado en el navegador
 * para la tarjeta final del asistente de reserva.
 */

const DURATION_MS = 60 * 60 * 1000 // misma duración que el .ics del servidor

// PRIVACIDAD: la tarjeta (y el .ics que genera) nunca lleva la dirección del
// showroom. Esa llega en el correo de confirmación y en la página privada.
function calendarText(type: AppointmentType) {
  const isVideo = type === 'video_engagement_rings'
  return {
    title: isVideo ? 'Videollamada Ciao Ciao (por confirmar)' : 'Cita privada Ciao Ciao (por confirmar)',
    location: isVideo
      ? 'Videollamada: el enlace llega antes de la llamada'
      : 'Showroom privado Ciao Ciao: la dirección llega con tu confirmación',
  }
}

const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => `\\${m}`)

// RFC 5545: líneas de máximo 75 octetos, continuadas con CRLF + espacio.
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  out.push(rest)
  return out.join("\r\n ")
}

export function buildPendingIcs(input: { datetime: string; code: string; type: AppointmentType; origin: string }): string {
  const start = parseISO(input.datetime)
  const end = new Date(start.getTime() + DURATION_MS)
  const { title, location } = calendarText(input.type)
  const description = [
    'Tu solicitud está en revisión; te confirmamos por correo.',
    `Código: ${input.code}`,
    `Tu reserva: ${input.origin}/reserva/${input.code}`,
  ].join('\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ciao Ciao Joyeria//Citas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:solicitud-${input.code}@citas.ciaociao.mx`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `LOCATION:${icsEscape(location)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n'
}

export function pendingGoogleCalendarUrl(datetime: string, code: string, type: AppointmentType) {
  const start = parseISO(datetime)
  const end = new Date(start.getTime() + DURATION_MS)
  const { title, location } = calendarText(type)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${icsUtc(start)}/${icsUtc(end)}`,
    details: `Tu solicitud está en revisión; te confirmamos por correo. Código: ${code}`,
    location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

