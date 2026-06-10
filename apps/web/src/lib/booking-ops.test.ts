import { describe, expect, it } from 'vitest'
import { budgetRangeOptions } from './schemas'
import { getCommercialPriority } from './commercial'
import { phoneDigits } from './utils'

describe('booking operations helpers', () => {
  it('uses 20,000 MXN as the minimum budget range', () => {
    expect(budgetRangeOptions).toEqual([
      '$20,000 - $30,000 MXN',
      '$30,000 - $60,000 MXN',
      'Más de $60,000 MXN',
      'Aún no lo sé',
    ])
  })

  it('normalizes phone numbers for recovery lookup', () => {
    expect(phoneDigits('+52 55 1234 5678')).toBe('525512345678')
    expect(phoneDigits('(55) 1234-5678')).toBe('5512345678')
  })

  it('keeps high commercial priority for larger budgets', () => {
    expect(getCommercialPriority({ budgetRange: '$30,000 - $60,000 MXN' })).toBe('high')
    expect(getCommercialPriority({ budgetRange: '$20,000 - $30,000 MXN' })).toBe('medium')
  })
})
