import { describe, it, expect } from 'vitest'
import { toBaseWeight, fromBaseWeight, weightStep } from './units.js'

describe('weight unit conversion', () => {
  it('leaves a weight alone when the units match', () => {
    expect(toBaseWeight(60, 'kg', 'kg')).toBe(60)
    expect(fromBaseWeight(60, 'kg', 'kg')).toBe(60)
    expect(toBaseWeight(135, 'lb', 'lb')).toBe(135)
  })

  it('converts a typed weight into the base unit', () => {
    expect(toBaseWeight(100, 'lb', 'kg')).toBe(45.36)   // 100 lb on a kg-based app
    expect(toBaseWeight(50, 'kg', 'lb')).toBe(110.23)   // 50 kg on an lb-based app
  })

  it('converts a stored base weight into the display unit', () => {
    expect(fromBaseWeight(45.36, 'kg', 'lb')).toBe(100)
    expect(fromBaseWeight(110.23, 'lb', 'kg')).toBe(50)
  })

  it('round-trips a typed value back to itself (stable factors)', () => {
    for (const x of [45, 100, 135, 225, 2.5]) {
      expect(fromBaseWeight(toBaseWeight(x, 'lb', 'kg'), 'kg', 'lb')).toBe(x)
      expect(fromBaseWeight(toBaseWeight(x, 'kg', 'lb'), 'lb', 'kg')).toBe(x)
    }
  })

  it('treats empty or junk as zero', () => {
    expect(toBaseWeight('', 'lb', 'kg')).toBe(0)
    expect(toBaseWeight(undefined, 'lb', 'kg')).toBe(0)
    expect(fromBaseWeight(null, 'kg', 'lb')).toBe(0)
  })

  it('steps by a real plate change per unit', () => {
    expect(weightStep('kg')).toBe(2.5)
    expect(weightStep('lb')).toBe(5)
  })
})
