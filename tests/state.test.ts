import { beforeEach, describe, expect, it } from 'vitest'
import { ST, deriveInp } from '../src/state'

const DEFAULTS = { ...ST }
beforeEach(() => { Object.assign(ST, DEFAULTS) })

describe('deriveInp', () => {
  it('derives every ratio from absolute rupee inputs', () => {
    Object.assign(ST, { income: 100000, spending: 50000, savings: 300000, sip: 20000, emi: 25000, cardBalance: 30000, cardLimit: 100000, lifeCover: 6000000, healthCover: 500000 })
    const d = deriveInp()
    expect(d.foi).toBe(25)
    expect(d.liq).toBe(6)
    expect(d.inv).toBe(20)
    expect(d.util).toBe(30)
    expect(d.cvr).toBe(5)
    expect(d.hlt).toBe(5)
  })

  it('measures runway against spending, never income', () => {
    Object.assign(ST, { income: 200000, spending: 50000, savings: 300000 })
    expect(deriveInp().liq).toBe(6)
    Object.assign(ST, { spending: 100000 })
    expect(deriveInp().liq).toBe(3)
  })

  it('gives zero for every ratio when the denominator is missing', () => {
    Object.assign(ST, { income: 0, spending: 0, savings: 500000, emi: 10000, sip: 5000, lifeCover: 1e7 })
    const d = deriveInp()
    expect([d.foi, d.liq, d.inv, d.cvr, d.corpus]).toEqual([0, 0, 0, 0, 0])
  })

  it('treats "no card balance" and a zero limit as zero utilisation', () => {
    Object.assign(ST, { cardBalance: 80000, cardLimit: 100000, noCardBalance: true })
    expect(deriveInp().util).toBe(0)
    Object.assign(ST, { noCardBalance: false, cardLimit: 0 })
    expect(deriveInp().util).toBe(0)
  })

  it('assumes a 700 credit score when the user does not know theirs', () => {
    expect(deriveInp().crd).toBe(700)
    ST.knownScore = 640
    expect(deriveInp().crd).toBe(640)
  })

  it('only counts a retirement corpus from age 50', () => {
    Object.assign(ST, { spending: 100000, retirementCorpus: 12000000, age: 49 })
    expect(deriveInp().corpus).toBe(0)
    ST.age = 50
    expect(deriveInp().corpus).toBe(10)
  })

  it('caps ratios so mismatched inputs cannot produce absurd multiples', () => {
    Object.assign(ST, { income: 1000, spending: 1000, emi: 1e9, savings: 1e12, sip: 1e9, lifeCover: 1e12, cardBalance: 1e9, cardLimit: 1 })
    const d = deriveInp()
    expect(d.foi).toBe(100)
    expect(d.liq).toBe(60)
    expect(d.inv).toBe(60)
    expect(d.cvr).toBe(50)
    expect(d.util).toBe(100)
  })
})
