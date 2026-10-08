import { describe, expect, it } from 'vitest'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import {
  inReminder24Window,
  inReminder2Window,
  isQuietHours,
  relativeDayWord,
  scheduled24SendAt,
  cdmxIsoWeekKey,
} from './reminder-windows'

const TZ = 'America/Mexico_City'
const cdmx = (s: string) => fromZonedTime(s, TZ)
const fmt = (d: Date) => formatInTimeZone(d, TZ, 'yyyy-MM-dd HH:mm')
const H = 3_600_000

/*
 * Bug real (jun–jul 2026): «Tu cita es en 2 horas» llegó a las 00:00 por citas
 * de las 12:00, y «Confirma tu cita de mañana» cuando faltaban 2 días. Causa:
 * ventanas pensadas para 1 corrida diaria y un llamador externo cada 30 min.
 * Estas pruebas reproducen esa cadencia (como scratchpad/audit/cronsim.mjs).
 */

function firstHit(runs: Date[], pred: (now: Date) => boolean): Date | null {
  return runs.find(pred) ?? null
}

function runsEvery(minutes: number, fromUtc: string, days: number, offsetMin = 0): Date[] {
  const out: Date[] = []
  const start = Date.parse(fromUtc) + offsetMin * 60_000
  for (let t = start; t < start + days * 86_400_000; t += minutes * 60_000) out.push(new Date(t))
  return out
}

describe('ventana «mañana» (24h) en hora CDMX', () => {
  it('cita mañana a las 11:00: sí a las 08:00 y a las 21:30 de hoy; no a las 07:30 ni a las 22:00', () => {
    const slot = cdmx('2026-10-22T11:00:00')
    expect(inReminder24Window(slot, cdmx('2026-10-21T08:00:00'))).toBe(true)
    expect(inReminder24Window(slot, cdmx('2026-10-21T21:30:00'))).toBe(true)
    expect(inReminder24Window(slot, cdmx('2026-10-21T07:30:00'))).toBe(false)
    expect(inReminder24Window(slot, cdmx('2026-10-21T22:00:00'))).toBe(false)
    expect(inReminder24Window(slot, cdmx('2026-10-21T23:00:00'))).toBe(false)
  })

  it('nunca cuando faltan 2 días (el caso del sábado 23:00 por una cita del lunes)', () => {
    const slot = cdmx('2026-05-11T11:00:00')
    expect(inReminder24Window(slot, cdmx('2026-05-09T23:00:00'))).toBe(false)
    expect(inReminder24Window(slot, cdmx('2026-05-09T12:00:00'))).toBe(false)
    expect(inReminder24Window(slot, cdmx('2026-05-10T09:00:00'))).toBe(true)
  })

  it('nunca el mismo día de la cita («mañana» sería falso)', () => {
    const slot = cdmx('2026-10-22T21:00:00')
    expect(inReminder24Window(slot, cdmx('2026-10-22T08:00:00'))).toBe(false)
  })
})

describe('ventana «en 2 horas»', () => {
  const slot = cdmx('2026-10-22T12:00:00')
  it('solo entre 2 h 15 y 1 h 45 antes', () => {
    expect(inReminder2Window(slot, cdmx('2026-10-22T09:45:00'))).toBe(true)
    expect(inReminder2Window(slot, cdmx('2026-10-22T10:00:00'))).toBe(true)
    expect(inReminder2Window(slot, cdmx('2026-10-22T10:15:00'))).toBe(true)
    expect(inReminder2Window(slot, cdmx('2026-10-22T09:30:00'))).toBe(false)
    expect(inReminder2Window(slot, cdmx('2026-10-22T10:30:00'))).toBe(false)
  })
  it('nunca a medianoche por una cita de mediodía (bug de producción)', () => {
    expect(inReminder2Window(slot, cdmx('2026-10-22T00:00:00'))).toBe(false)
    expect(inReminder2Window(slot, cdmx('2026-10-21T23:30:00'))).toBe(false)
  })
})

describe('simulación de la cadencia real: llamada cada 30 min durante 5 días', () => {
  const runs = runsEvery(30, '2026-10-19T06:00:00Z', 5)
  for (const hhmm of ['00:30', '09:00', '11:00', '12:00', '16:00', '19:00', '21:00', '23:30']) {
    it(`cita a las ${hhmm}: «mañana» el día anterior 08:00–22:00 y «2 h» a 1h45–2h15`, () => {
      const slot = cdmx(`2026-10-22T${hhmm}:00`)
      const s24 = firstHit(runs, now => inReminder24Window(slot, now))
      const s2 = firstHit(runs, now => inReminder2Window(slot, now))
      expect(s24).not.toBeNull()
      expect(fmt(s24!).slice(0, 10)).toBe('2026-10-21')
      expect(isQuietHours(s24!)).toBe(false)
      expect(s2).not.toBeNull()
      const lead = (slot.getTime() - s2!.getTime()) / H
      expect(lead).toBeGreaterThanOrEqual(1.75)
      expect(lead).toBeLessThanOrEqual(2.25)
    })
  }

  it('con llamadas desfasadas (:15/:45) también cae dentro', () => {
    const shifted = runsEvery(30, '2026-10-19T06:00:00Z', 5, 15)
    const slot = cdmx('2026-10-22T12:00:00')
    const s2 = firstHit(shifted, now => inReminder2Window(slot, now))
    expect(s2).not.toBeNull()
    expect(fmt(s2!)).toBe('2026-10-22 09:45')
  })

  it('con solo el cron diario de vercel.json (08:00 CDMX) el «mañana» sale el día anterior', () => {
    const daily = runsEvery(24 * 60, '2026-10-19T14:00:00Z', 5)
    for (const hhmm of ['00:30', '11:00', '21:00', '23:30']) {
      const slot = cdmx(`2026-10-22T${hhmm}:00`)
      const s24 = firstHit(daily, now => inReminder24Window(slot, now))
      expect(fmt(s24!)).toBe('2026-10-21 08:00')
    }
  })
})

describe('«mañana» programado en Resend: nunca de madrugada', () => {
  it('cita a las 00:30 → 08:00 del día anterior (antes: 00:30 de la madrugada)', () => {
    expect(fmt(scheduled24SendAt(cdmx('2026-10-20T00:30:00')))).toBe('2026-10-19 08:00')
  })
  it('cita a las 23:30 → 21:30 del día anterior', () => {
    expect(fmt(scheduled24SendAt(cdmx('2026-10-20T23:30:00')))).toBe('2026-10-19 21:30')
  })
  it('cita a las 12:00 → exactamente 24 h antes', () => {
    expect(fmt(scheduled24SendAt(cdmx('2026-10-20T12:00:00')))).toBe('2026-10-19 12:00')
  })
  it('siempre cae el día anterior y fuera del horario silencioso', () => {
    for (let h = 0; h < 24; h++) {
      const slot = cdmx(`2026-10-20T${String(h).padStart(2, '0')}:30:00`)
      const at = scheduled24SendAt(slot)
      expect(fmt(at).slice(0, 10)).toBe('2026-10-19')
      expect(isQuietHours(at)).toBe(false)
    }
  })
})

describe('texto relativo calculado al enviar', () => {
  it('una cita a las 00:30 avisada a las 22:30 es «mañana», no «hoy»', () => {
    const slot = cdmx('2026-10-20T00:30:00')
    expect(relativeDayWord(slot, new Date(slot.getTime() - 2 * H))).toBe('mañana')
    expect(relativeDayWord(cdmx('2026-10-20T13:00:00'), cdmx('2026-10-20T11:00:00'))).toBe('hoy')
  })
})

describe('semana ISO para el recordatorio semanal', () => {
  it('lunes y domingo de la misma semana comparten clave', () => {
    expect(cdmxIsoWeekKey(cdmx('2026-10-05T09:00:00'))).toBe(cdmxIsoWeekKey(cdmx('2026-10-11T20:00:00')))
    expect(cdmxIsoWeekKey(cdmx('2026-10-05T09:00:00'))).not.toBe(cdmxIsoWeekKey(cdmx('2026-10-12T09:00:00')))
  })
})
