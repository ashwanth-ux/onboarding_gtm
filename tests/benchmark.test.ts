import { describe, expect, it } from 'vitest'
import { INCOME_ANCHORS, bufferInsight, creditInsight, incomeInsight, interpPercentile } from '../src/engine/benchmark'
import { calcPillars } from '../src/engine/crisp'

describe('income percentile curve', () => {
  it('returns each sourced anchor exactly', () => {
    for (const [income, pct] of INCOME_ANCHORS) expect(interpPercentile(income)).toBeCloseTo(pct, 6)
  })

  it('never decreases as income rises', () => {
    let prev = 0
    for (let inc = 500; inc <= 5_000_000; inc = Math.round(inc * 1.05)) {
      const p = interpPercentile(inc)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('puts Rs 30L a year (Rs 2.5L a month) comfortably inside the top 1%', () => {
    expect(incomeInsight(250000).top).toBeLessThan(1)
  })
})

describe('incomeInsight copy', () => {
  const sweep: number[] = []
  for (let inc = 500; inc <= 2_000_000; inc += 250) sweep.push(inc)

  it('shows the quantified claim once: headline and body never restate it', () => {
    for (const inc of sweep) {
      const r = incomeInsight(inc)
      const digits = new RegExp(`(^|[^\\d.])${String(r.top).replace('.', '\\.')}\\s?%`)
      // "top-5% territory" is a fixed tier name, not a restatement of the user's own figure
      const headline = r.headline.replace('top-5% territory', '')
      expect(digits.test(headline), `${inc}: ${r.headline}`).toBe(false)
      expect(digits.test(r.body), `${inc}: ${r.body}`).toBe(false)
    }
  })

  it('keeps the badge number and the headline tier in agreement', () => {
    for (const inc of sweep) {
      const r = incomeInsight(inc)
      expect(r.percentile).toBeCloseTo(100 - r.top, 9)
      expect(r.topLabel).toBe(`top ${r.top}%`)
    }
  })

  it('does not claim a salaried-only comparison', () => {
    for (const inc of sweep) {
      const r = incomeInsight(inc)
      expect(`${r.headline} ${r.body}`.toLowerCase()).not.toContain('salaried')
    }
  })
})

describe('creditInsight', () => {
  const inp = { inc: 100000, spend: 50000, liq: 3, foi: 20, crd: 700, util: 30, cvr: 5, hlt: 5, inv: 10, age: 30, corpus: 0, deps: 0 }

  it('names the weakest factor, capitalised, and explains it', () => {
    const r = creditInsight(calcPillars({ ...inp, util: 95, crd: 800, foi: 5 }))
    expect(r.weakest.name).toBe('Card usage')
    expect(/^[A-Z]/.test(r.body) || r.body.includes('Card usage')).toBe(true)
  })

  it('moves to a better band as the underlying numbers improve', () => {
    const order = ['Needs Work', 'Fair', 'Good', 'Excellent']
    const worst = creditInsight(calcPillars({ ...inp, foi: 70, crd: 450, util: 100 })).band
    const best = creditInsight(calcPillars({ ...inp, foi: 0, crd: 850, util: 0 })).band
    expect(order.indexOf(best)).toBeGreaterThan(order.indexOf(worst))
  })
})

describe('bufferInsight', () => {
  it('always returns a headline and body, including for zero months', () => {
    for (const m of [0, 0.4, 1, 3, 6, 12, 60]) {
      const r = bufferInsight(m)
      expect(r.headline.length).toBeGreaterThan(0)
      expect(r.body.length).toBeGreaterThan(0)
    }
  })
})
