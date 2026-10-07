import { describe, expect, it } from 'vitest'
import { fmtIndianInput, parseNum } from '../src/format'

describe('parseNum', () => {
  it('reads plain numbers and strips commas', () => {
    expect(parseNum('50000')).toBe(50000)
    expect(parseNum('1,25,000')).toBe(125000)
  })
  it('understands Indian shorthand', () => {
    expect(parseNum('50k')).toBe(50000)
    expect(parseNum('1l')).toBe(100000)
    expect(parseNum('2.5 lakh')).toBe(250000)
    expect(parseNum('1cr')).toBe(10000000)
    expect(parseNum('1.5 crore')).toBe(15000000)
  })
  it('returns 0 for empty or non-numeric input', () => {
    expect(parseNum('')).toBe(0)
    expect(parseNum('   ')).toBe(0)
    expect(parseNum('abc')).toBe(0)
  })
  it('caps a pathologically long number', () => {
    expect(parseNum('9'.repeat(40))).toBe(1e13)
  })
})

describe('fmtIndianInput', () => {
  it('groups digits the Indian way', () => {
    expect(fmtIndianInput(999)).toBe('999')
    expect(fmtIndianInput(1000)).toBe('1,000')
    expect(fmtIndianInput(125000)).toBe('1,25,000')
    expect(fmtIndianInput(12345678)).toBe('1,23,45,678')
  })
  it('shows nothing for zero', () => {
    expect(fmtIndianInput(0)).toBe('')
  })
})
