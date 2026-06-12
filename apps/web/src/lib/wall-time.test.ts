import { describe, it, expect } from 'vitest'
import { toBusinessWallTime } from './utils'

// CDMX is UTC-6 year-round (DST abolished in 2022). These cases pin the two
// bugs the admin calendar had: a 6h shift, and evening citas jumping a day.
describe('toBusinessWallTime', () => {
  it('converts a UTC instant to CDMX wall clock', () => {
    expect(toBusinessWallTime('2026-06-12T18:00:00.000Z')).toBe('2026-06-12T12:00:00')
  })

  it('keeps an evening appointment on its CDMX day', () => {
    // 17:00 CDMX = 23:00Z same day; 18:00 CDMX = 00:00Z NEXT day
    expect(toBusinessWallTime('2026-06-13T00:00:00.000Z')).toBe('2026-06-12T18:00:00')
  })

  it('respects an explicit offset (event end = start + 1h)', () => {
    expect(toBusinessWallTime('2026-06-13T00:00:00.000Z', 60 * 60 * 1000)).toBe('2026-06-12T19:00:00')
  })

  it('accepts ISO strings with offsets', () => {
    expect(toBusinessWallTime('2026-06-12T18:00:00-06:00')).toBe('2026-06-12T18:00:00')
  })
})
