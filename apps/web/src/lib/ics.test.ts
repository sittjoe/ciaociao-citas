import { describe, expect, it } from 'vitest'
import { fromZonedTime } from 'date-fns-tz'
import { buildAppointmentICS, escapeIcsText, foldIcsLine } from './ics'

const TZ = 'America/Mexico_City'

/** Parser mínimo RFC 5545: despliega líneas y separa nombre/params/valor. */
function parseICS(ics: string) {
  expect(ics.includes('\r\n')).toBe(true)
  // Ninguna línea física pasa de 75 octetos y no hay LF/CR sueltos.
  const physical = ics.split('\r\n')
  for (const line of physical) {
    expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    expect(line).not.toMatch(/[\r\n]/)
  }
  const unfolded = ics.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean)
  const props: Record<string, { params: string; value: string }[]> = {}
  for (const line of unfolded) {
    // El «:» que separa el valor es el primero fuera de comillas.
    let inQuotes = false
    let idx = -1
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes
      else if (line[i] === ':' && !inQuotes) { idx = i; break }
    }
    expect(idx).toBeGreaterThan(0)
    const head = line.slice(0, idx)
    const [name, ...params] = head.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    expect(name).toMatch(/^[A-Z-]+$/)
    ;(props[name] ??= []).push({ params: params.join(';'), value: line.slice(idx + 1) })
  }
  return props
}

function unescapeText(v: string) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

const appt = {
  id: 'APPT123',
  slotDatetime: fromZonedTime('2026-10-20T13:00:00', TZ),
  appointmentType: 'video_engagement_rings' as const,
  name: "O'Connor, Ana Lucía; \"la novia\"",
  email: 'ana@example.com',
  meetingUrl: 'https://meet.google.com/abc-defg-hij?a=1;b=2',
  meetingInstructions: 'Entra 5 min antes, por favor;\nten a la mano tu presupuesto\\ y fotos',
  icsSequence: 3,
}

describe('ICS (RFC 5545)', () => {
  it('escapa \\ ; , y saltos de línea en TEXT', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf')
  })

  it('pliega a 75 octetos sin partir caracteres UTF-8', () => {
    const line = 'DESCRIPTION:' + 'Joyería ñ '.repeat(30)
    const folded = foldIcsLine(line)
    for (const l of folded.split('\r\n')) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })

  it('genera un REQUEST parseable con texto con saltos, comas y punto y coma', () => {
    const ics = buildAppointmentICS(appt, { method: 'REQUEST', organizerEmail: 'info@ciaociao.mx', now: new Date('2026-10-08T12:00:00Z') })
    const p = parseICS(ics)
    expect(p.METHOD[0].value).toBe('REQUEST')
    expect(p.UID[0].value).toBe('APPT123@ciaociao.mx')
    expect(p.SEQUENCE[0].value).toBe('3')
    expect(p.DTSTAMP[0].value).toBe('20261008T120000Z')
    expect(p.DTSTART[1].params).toBe('TZID=America/Mexico_City')
    expect(p.DTSTART[1].value).toBe('20261020T130000') // [0] es el de VTIMEZONE
    expect(p.STATUS[0].value).toBe('CONFIRMED')
    const desc = unescapeText(p.DESCRIPTION[0].value)
    expect(desc).toContain('Indicaciones: Entra 5 min antes, por favor;\nten a la mano tu presupuesto\\ y fotos')
    expect(desc).toContain('Link: https://meet.google.com/abc-defg-hij?a=1;b=2')
    expect(unescapeText(p.LOCATION[0].value)).toBe(appt.meetingUrl)
    // CN entre comillas: la coma y el ; del nombre no rompen el parámetro.
    expect(p.ATTENDEE[0].params).toMatch(/^RSVP=TRUE;CN="O'Connor, Ana Lucía; la novia"$/)
    expect(p.ATTENDEE[0].value).toBe('mailto:ana@example.com')
  })

  it('CANCEL: mismo UID, STATUS:CANCELLED y la SEQUENCE vigente', () => {
    const ics = buildAppointmentICS({ ...appt, icsSequence: 4 }, { method: 'CANCEL', organizerEmail: 'info@ciaociao.mx' })
    const p = parseICS(ics)
    expect(p.METHOD[0].value).toBe('CANCEL')
    expect(p.UID[0].value).toBe('APPT123@ciaociao.mx')
    expect(p.SEQUENCE[0].value).toBe('4')
    expect(p.STATUS[0].value).toBe('CANCELLED')
  })

  it('sin icsSequence en el doc (citas viejas) usa 0', () => {
    const p = parseICS(buildAppointmentICS({ ...appt, icsSequence: undefined }, { method: 'REQUEST', organizerEmail: 'x@y.mx' }))
    expect(p.SEQUENCE[0].value).toBe('0')
  })
})
