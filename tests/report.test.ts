import { beforeEach, describe, expect, it } from 'vitest'
import { calcFRI, calcPillars, calcWeights } from '../src/engine/crisp'
import { krCandidates, krPrioritise, krRampFV, krRs, krStepPlan } from '../src/engine/report'
import { ST, deriveInp } from '../src/state'

const DEFAULTS = { ...ST }
beforeEach(() => { Object.assign(ST, DEFAULTS) })

describe('krRs', () => {
  it('formats rupees the Indian way', () => {
    expect(krRs(0)).toBe('₹0')
    expect(krRs(2000)).toBe('₹2K')
    expect(krRs(150000)).toBe('₹1.5L')
    expect(krRs(25000000)).toBe('₹2.5 Cr')
  })
  it('never shows a negative amount', () => {
    expect(krRs(-500)).toBe('₹0')
  })
})

describe('krStepPlan', () => {
  it('starts small and steps up towards the target', () => {
    const p = krStepPlan(2000, 20000, 0.2)
    expect(p.seed).toBe(2000)
    expect(p.steps).toBeGreaterThan(0)
    expect(2000 * Math.pow(1.2, p.steps)).toBeGreaterThanOrEqual(20000)
  })
  it('needs no steps when the target is already close to the start', () => {
    expect(krStepPlan(10000, 10500, 0.2).steps).toBe(0)
  })
})

describe('krRampFV', () => {
  it('is zero with no months', () => {
    expect(krRampFV(1000, 5000, 0.2, 0, 0.12)).toBe(0)
  })
  it('sits between "seed forever" and "full amount from month one"', () => {
    const ramp = krRampFV(1000, 5000, 0.2, 120, 0.12)
    const seedOnly = krRampFV(1000, 1000, 0.2, 120, 0.12)
    const fullFromStart = krRampFV(5000, 5000, 0.2, 120, 0.12)
    expect(ramp).toBeGreaterThan(seedOnly)
    expect(ramp).toBeLessThan(fullFromStart)
  })
  it('matches the closed form when there is no step-up', () => {
    const r = 0.12 / 12
    const closed = 1000 * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r)
    expect(krRampFV(1000, 1000, 0, 12, 0.12)).toBeCloseTo(closed, 6)
  })
})

describe('moves for a stretched earner', () => {
  it('produces ordered, well-formed moves without NaN or negatives', () => {
    Object.assign(ST, { age: 28, deps: 2, income: 50000, spending: 40000, savings: 30000, emi: 15000, knownScore: 650, cardBalance: 40000, cardLimit: 50000 })
    const inp = deriveInp()
    const pillars = calcPillars(inp)
    const weights = calcWeights(inp)
    const fri = calcFRI(pillars, weights)
    const moves = krPrioritise(krCandidates(inp, pillars, weights, fri))
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.title).toBeTruthy()
      expect(m.action).toBeTruthy()
      expect(String(m.costNum)).not.toMatch(/NaN|undefined|-/)
    }
  })
})
