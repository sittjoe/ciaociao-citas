import { describe, expect, it } from 'vitest'
import { formatTime12 } from './utils'

describe('formatTime12', () => {
  it('formatea en reloj de 12 h en CDMX sin importar la zona del proceso', () => {
    // 19:00Z = 13:00 en CDMX (UTC-6)
    expect(formatTime12('2026-10-08T19:00:00.000Z')).toBe('1:00 pm')
    expect(formatTime12(new Date('2026-10-08T17:30:00.000Z'))).toBe('11:30 am')
  })

  it('mediodía y medianoche', () => {
    expect(formatTime12('2026-10-08T18:00:00.000Z')).toBe('12:00 pm')
    expect(formatTime12('2026-10-09T06:00:00.000Z')).toBe('12:00 am')
  })

  it('acepta otra zona explícita (hora local de la clienta)', () => {
    expect(formatTime12('2026-10-08T19:00:00.000Z', 'America/Tijuana')).toBe('12:00 pm')
  })
})
