import { describe, expect, it } from 'vitest'
import { countdownLabel } from './countdown'

const H = 3_600_000
const M = 60_000

describe('cuenta regresiva de la reserva', () => {
  it('días y horas', () => {
    expect(countdownLabel(3 * 24 * H + 4 * H + 5 * M, 0)).toBe('Faltan 3 días y 4 horas')
    expect(countdownLabel(24 * H + 30 * M, 0)).toBe('Faltan 1 día')
  })
  it('horas y minutos el mismo día', () => {
    expect(countdownLabel(2 * H + 10 * M + 20_000, 0)).toBe('Faltan 2 horas y 10 minutos')
    expect(countdownLabel(1 * H, 0)).toBe('Faltan 1 hora')
  })
  it('últimos minutos y cita pasada', () => {
    expect(countdownLabel(25 * M, 0)).toBe('Faltan 25 minutos')
    expect(countdownLabel(30_000, 0)).toBe('Es ahora')
    expect(countdownLabel(0, 1)).toBeNull()
  })
})
