import { describe, expect, it } from 'vitest'
import { durationLabel, nextDayKeys, relativeLabel, sortInbox, waitLevel } from './agenda'

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 8, 18, 0) // 8 oct 2026, 12:00 CDMX

describe('agenda del panel', () => {
  it('etiquetas de duración', () => {
    expect(durationLabel(7)).toBe('7 min')
    expect(durationLabel(65)).toBe('1 h 05 min')
    expect(durationLabel(120)).toBe('2 h')
    expect(durationLabel(3 * 1440)).toBe('3 días')
    expect(relativeLabel(NOW + 45 * MIN, NOW)).toBe('en 45 min')
    expect(relativeLabel(NOW - 10 * MIN, NOW)).toBe('hace 10 min')
  })

  it('nivel de espera alineado con el aviso de 20 min del backend', () => {
    expect(waitLevel(NOW - 19 * MIN, NOW)).toBe('fresh')
    expect(waitLevel(NOW - 20 * MIN, NOW)).toBe('alerted')
    expect(waitLevel(NOW - 125 * MIN, NOW)).toBe('overdue')
  })

  it('la bandeja pone primero lo próximo, luego prioridad y luego la espera', () => {
    const iso = (ms: number) => new Date(ms).toISOString()
    const items = [
      { id: 'lejana-alta', slotDatetime: iso(NOW + 6 * 1440 * MIN), createdAt: iso(NOW - 10 * MIN), commercialPriority: 'high' as const },
      { id: 'lejana-vieja', slotDatetime: iso(NOW + 5 * 1440 * MIN), createdAt: iso(NOW - 300 * MIN), commercialPriority: 'normal' as const },
      { id: 'manana', slotDatetime: iso(NOW + 26 * 60 * MIN), createdAt: iso(NOW - 5 * MIN) },
      { id: 'hoy', slotDatetime: iso(NOW + 3 * 60 * MIN), createdAt: iso(NOW - 2 * MIN) },
    ]
    expect(sortInbox(items, NOW).map(i => i.id)).toEqual(['hoy', 'manana', 'lejana-alta', 'lejana-vieja'])
  })

  it('días consecutivos cruzando mes', () => {
    expect(nextDayKeys('2026-10-30', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })
})

import { attendanceRate, bucketByWeek, weekStartKey } from './agenda'

describe('métricas semanales', () => {
  it('lunes de la semana', () => {
    expect(weekStartKey('2026-10-08', 4)).toBe('2026-10-05') // jueves
    expect(weekStartKey('2026-11-01', 7)).toBe('2026-10-26') // domingo
  })
  it('cubetas y tasa de asistencia', () => {
    const weeks = ['2026-09-28', '2026-10-05']
    const b = bucketByWeek(weeks, [
      { weekKey: '2026-10-05', attended: true },
      { weekKey: '2026-10-05', attended: false },
      { weekKey: '2026-10-05', attended: null },
      { weekKey: '2026-10-05', attended: true },
      { weekKey: '2020-01-06', attended: true },
    ])
    expect(b[0]).toEqual({ weekKey: '2026-09-28', attended: 0, noShow: 0, unmarked: 0 })
    expect(b[1]).toEqual({ weekKey: '2026-10-05', attended: 2, noShow: 1, unmarked: 1 })
    expect(attendanceRate(b)).toBe(67)
    expect(attendanceRate([b[0]])).toBeNull()
  })
})
