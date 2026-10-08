import { describe, expect, it } from 'vitest'
import { buildPendingIcs } from '@/lib/pending-ics'

describe('calendario de la solicitud (tarjeta final)', () => {
  const ics = buildPendingIcs({
    datetime: '2026-10-15T19:00:00.000Z',
    code: 'CC7H2K',
    type: 'showroom',
    origin: 'https://citas.ciaociao.mx',
  })

  it('es un evento tentativo de una hora con el horario elegido', () => {
    expect(ics).toContain('DTSTART:20261015T190000Z')
    expect(ics).toContain('DTEND:20261015T200000Z')
    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('UID:solicitud-CC7H2K@citas.ciaociao.mx')
  })

  it('nunca lleva la dirección del showroom, aunque exista en el entorno', () => {
    process.env.SHOWROOM_ADDRESS = 'Calle Falsa 123 Col. Prueba'
    const again = buildPendingIcs({ datetime: '2026-10-15T19:00:00.000Z', code: 'X', type: 'showroom', origin: 'https://x' })
    const unfolded = again.replace(/\r\n /g, '')
    expect(unfolded).not.toContain('Calle Falsa')
    expect(unfolded).toContain('la dirección llega con tu confirmación')
    delete process.env.SHOWROOM_ADDRESS
  })

  it('respeta el plegado de líneas de RFC 5545', () => {
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    expect(ics.endsWith('\r\n')).toBe(true)
  })
})
