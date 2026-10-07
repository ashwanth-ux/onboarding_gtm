import { describe, expect, it } from 'vitest'
import { SEVERITY, calcFRI, calcPillars, calcWeights, whatIfFri } from '../src/engine/crisp'

const base = { inc: 100000, spend: 60000, liq: 3, foi: 20, crd: 700, util: 30, cvr: 5, hlt: 5, inv: 10, age: 30, corpus: 0, deps: 1 }

describe('SEVERITY', () => {
  it('bands a 0-1 score at 0.35 / 0.55 / 0.80', () => {
    expect(SEVERITY(0.34)[0]).toBe('CRITICAL')
    expect(SEVERITY(0.35)[0]).toBe('CAUTION')
    expect(SEVERITY(0.54)[0]).toBe('CAUTION')
    expect(SEVERITY(0.55)[0]).toBe('IMPROVE')
    expect(SEVERITY(0.79)[0]).toBe('IMPROVE')
    expect(SEVERITY(0.8)[0]).toBe('OK')
  })
})

describe('calcPillars', () => {
  it('scores every pillar between 0 and 1', () => {
    for (const liq of [0, 1, 6, 60]) for (const foi of [0, 30, 100]) for (const hlt of [0, 5, 100000]) {
      const p = calcPillars({ ...base, liq, foi, hlt })
      for (const k of ['savings', 'credit', 'investment', 'protection']) {
        expect(p[k]).toBeGreaterThanOrEqual(0)
        expect(p[k]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('exposes the three credit sub-scores the credit reveal needs', () => {
    const p = calcPillars(base)
    expect(typeof p.credit_foir).toBe('number')
    expect(typeof p.credit_bureau).toBe('number')
    expect(typeof p.credit_util).toBe('number')
  })

  it('scores a better savings buffer higher', () => {
    expect(calcPillars({ ...base, liq: 6 }).savings).toBeGreaterThan(calcPillars({ ...base, liq: 1 }).savings)
  })
})

describe('calcWeights', () => {
  it('weights protection more for people with dependents', () => {
    expect(calcWeights({ ...base, deps: 3 }).protection).toBeGreaterThan(calcWeights({ ...base, deps: 0 }).protection)
  })
})

describe('calcFRI', () => {
  it('stays within 0-100', () => {
    const w = calcWeights(base)
    for (const liq of [0, 3, 12]) {
      const f = calcFRI(calcPillars({ ...base, liq }), w)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(100)
    }
  })

  it('rises when a pillar improves, and never falls', () => {
    const w = calcWeights(base)
    const p = calcPillars({ ...base, liq: 0.5 })
    expect(calcFRI({ ...p, savings: 0.9 }, w)).toBeGreaterThan(calcFRI(p, w))
    for (const k of Object.keys(w)) expect(whatIfFri(p, w, k)).toBeGreaterThanOrEqual(calcFRI(p, w))
  })
})
