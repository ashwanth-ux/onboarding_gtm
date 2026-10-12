import { describe, expect, it } from 'vitest'
import { LIFE_CAP_MULTIPLE, coverNeeds, coverPlan } from '../src/engine/cover'
import { cardUsage } from '../src/engine/benchmark'

const LAKH = 100_000
const person = (o: Partial<Parameters<typeof coverNeeds>[0]> = {}) => ({ age: 30, deps: 0, income: 80000, spending: 50000, savings: 200000, emi: 0, ...o })

describe('health cover to suggest', () => {
  it('stays in the range the insurance guide uses: ₹10 lakh to ₹50 lakh', () => {
    for (const age of [18, 25, 35, 50, 65, 80]) for (const deps of [0, 1, 2, 4, 8]) for (const income of [15000, 60000, 400000, 5_000_000]) {
      const c = coverNeeds(person({ age, deps, income, spending: income * 0.6 }))
      expect(c.health, `${age}/${deps}/${income}`).toBeGreaterThanOrEqual(10 * LAKH)
      expect(c.health).toBeLessThanOrEqual(50 * LAKH)
      expect(c.healthBase).toBeLessThanOrEqual(c.health)
    }
  })
  it('is nowhere near the old ₹90 lakh figure for an ordinary salary', () => {
    expect(coverNeeds(person({ income: 120000, deps: 2 })).health).toBeLessThanOrEqual(30 * LAKH)
  })
  it('does not shrink as the family grows', () => {
    let prev = 0
    for (let deps = 0; deps <= 6; deps++) { const h = coverNeeds(person({ deps })).health; expect(h).toBeGreaterThanOrEqual(prev); prev = h }
  })
})

describe('life cover to suggest', () => {
  it('is zero when nobody depends on you', () => {
    expect(coverNeeds(person({ deps: 0, emi: 20000 })).life).toBe(0)
  })
  it(`never exceeds ${LIFE_CAP_MULTIPLE}x yearly income, even for a low earner with several dependents`, () => {
    for (const income of [15000, 25000, 40000, 90000, 300000]) for (const deps of [1, 2, 3, 5]) for (const emi of [0, 10000, 60000]) {
      const c = coverNeeds(person({ income, deps, emi, spending: income * 0.8 }))
      expect(c.life, `${income}/${deps}/${emi}`).toBeLessThanOrEqual(income * 12 * LIFE_CAP_MULTIPLE)
      expect(c.life % (5 * LAKH)).toBe(0)
    }
  })
  it('rises with the dependants and the loans', () => {
    expect(coverNeeds(person({ deps: 2 })).life).toBeGreaterThan(coverNeeds(person({ deps: 1 })).life)
    expect(coverNeeds(person({ deps: 2, emi: 30000 })).life).toBeGreaterThanOrEqual(coverNeeds(person({ deps: 2, emi: 0 })).life)
  })
  it('is lower for someone whose savings already cover a lot', () => {
    expect(coverNeeds(person({ deps: 2, savings: 20_000_000 })).life).toBeLessThanOrEqual(coverNeeds(person({ deps: 2, savings: 0 })).life)
  })
})

describe('retirement savings', () => {
  it('count towards what the family would need, so someone with a big nest egg is not told to buy a huge policy', () => {
    const without = coverNeeds(person({ age: 56, deps: 1, income: 250000, spending: 100000, savings: 4_000_000 }))
    const withNestEgg = coverNeeds(person({ age: 56, deps: 1, income: 250000, spending: 100000, savings: 4_000_000, retirement: 15_000_000 }))
    expect(withNestEgg.life).toBeLessThan(without.life)
    expect(withNestEgg.life).toBeLessThanOrEqual(50 * LAKH)
  })
})

describe('inputs that could go wrong', () => {
  const nasty = [0, -5, NaN, 1e15, 1e-9]
  it('never produces NaN, infinity or a negative amount', () => {
    for (const age of [17, 18, 70, 120, NaN]) for (const income of nasty) for (const spending of nasty) {
      const c = coverNeeds({ age, deps: 2, income, spending, savings: income, emi: spending })
      for (const v of [c.life, c.health, c.healthBase, c.healthYearlyCost]) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0) }
    }
  })
})

describe('what to buy', () => {
  const base = person({ deps: 1, income: 100000 })
  const need = coverNeeds(base)
  it('says nothing is needed when health cover already meets the target', () => {
    const p = coverPlan({ ...base, lifeCover: 0, healthCover: need.health })
    expect(p.health.kind).toBe('none')
    expect(p.health.buy).toBe(0)
  })
  it('suggests a first plan when the person has little or none', () => {
    for (const own of [0, 100_000, 250_000]) {
      const p = coverPlan({ ...base, lifeCover: 0, healthCover: own })
      expect(p.health.kind).toBe('plan')
      expect(p.health.buy).toBe(p.health.base)
      expect(p.health.yearlyCost).toBeGreaterThan(0)
    }
  })
  it('suggests a top-up, sized to the gap, when a decent plan is already held', () => {
    const p = coverPlan({ ...base, lifeCover: 0, healthCover: 10 * LAKH })
    expect(p.health.kind).toBe('topup')
    expect(p.health.own + p.health.buy).toBe(p.health.need)
  })
  it('treats life cover as covered once it meets the target, or when the gap is too small to be worth a policy', () => {
    expect(coverPlan({ ...base, lifeCover: need.life, healthCover: 0 }).life.covered).toBe(true)
    expect(coverPlan({ ...base, lifeCover: need.life - 10 * LAKH, healthCover: 0 }).life.covered).toBe(true)
    const open = coverPlan({ ...base, lifeCover: 0, healthCover: 0 })
    expect(open.life.covered).toBe(false)
    expect(open.life.yearlyCost).toBeGreaterThan(0)
  })
})

describe('card usage read-out', () => {
  it('says nothing until there is something to say', () => expect(cardUsage(0, 0).level).toBe('none'))
  it('asks for the limit when money is owed but no limit is given', () => expect(cardUsage(20000, 0).level).toBe('needLimit'))
  it('reads the share of the limit in plain words', () => {
    expect(cardUsage(15000, 100000)).toMatchObject({ pct: 15, level: 'ok' })
    expect(cardUsage(45000, 100000)).toMatchObject({ pct: 45, level: 'high' })
    expect(cardUsage(80000, 100000)).toMatchObject({ pct: 80, level: 'veryHigh' })
  })
  it('owing nothing against a limit is a healthy 0%', () => expect(cardUsage(0, 100000)).toMatchObject({ pct: 0, level: 'ok' }))
  it('flags a balance above the limit as a likely typo', () => expect(cardUsage(500000, 100000).level).toBe('over'))
})
