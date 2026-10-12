import { describe, expect, it } from 'vitest'
import { cardUsage, creditInsight, incomeInsight, insuranceInsight } from '../src/engine/benchmark'
import { coverPlan } from '../src/engine/cover'
import { calcFRI, calcPillars, calcWeights } from '../src/engine/crisp'
import { krCandidates, krPositive, krPrioritise, krVerdict } from '../src/engine/report'
import { ST, deriveInp } from '../src/state'

const DEFAULTS = { ...ST }
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F1}]|\uFE0F/u
const BAD = /NaN|undefined|Infinity|₹-|null/

// Small seeded generator so a failure can be reproduced exactly.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const money = (r: () => number, max: number) => (r() < 0.12 ? 0 : Math.round(Math.exp(r() * Math.log(max)) / 100) * 100)

function randomPerson(r: () => number) {
  const income = money(r, 8_000_000) || 25000
  return {
    age: 18 + Math.floor(r() * 63), deps: Math.floor(r() * 7),
    income, spending: Math.min(money(r, income * 1.5) || 10000, 5_000_000),
    savings: money(r, 100_000_000), sip: money(r, income), retirementCorpus: money(r, 300_000_000), emi: money(r, income * 1.2),
    knownScore: r() < 0.3 ? null : 300 + Math.floor(r() * 600),
    cardBalance: money(r, 5_000_000), cardLimit: money(r, 5_000_000), noCardBalance: r() < 0.2,
    lifeCover: r() < 0.5 ? 0 : money(r, 500_000_000), healthCover: r() < 0.4 ? 0 : money(r, 50_000_000),
  }
}

describe('3,000 random people through the whole report', () => {
  it('never crash, never print NaN or an icon, never suggest absurd cover', () => {
    const r = rng(20261012)
    const hits: Record<string, number> = {}
    for (let n = 0; n < 3000; n++) {
      Object.assign(ST, DEFAULTS, randomPerson(r))
      const where = `person #${n}: ${JSON.stringify(ST)}`
      const inp = deriveInp()
      const pillars = calcPillars(inp)
      const weights = calcWeights(inp)
      const fri = calcFRI(pillars, weights)
      expect(Number.isFinite(fri) && fri >= 0 && fri <= 100, where).toBe(true)
      for (const k of ['savings', 'credit', 'investment', 'protection']) expect(pillars[k] >= 0 && pillars[k] <= 1, `${k} ${where}`).toBe(true)

      const moves = krPrioritise(krCandidates(inp, pillars, weights, fri))
      expect(moves.length, where).toBeLessThanOrEqual(3)
      const seen = new Set<string>()
      for (const m of moves) {
        const text = [m.title, m.action, m.visualHtml, m.why, m.wait, m.whyLabel, m.trigger].join(' ')
        expect(text, where).not.toMatch(BAD)
        expect(text, where).not.toMatch(EMOJI)
        expect(m.title && m.action, where).toBeTruthy()
        expect(seen.has(m.title), `duplicate step ${m.title} ${where}`).toBe(false)
        seen.add(m.title)
        hits[m.title] = (hits[m.title] ?? 0) + 1
      }

      const plan = coverPlan({ age: ST.age, deps: ST.deps, income: ST.income, spending: ST.spending, savings: ST.savings, emi: ST.emi, retirement: ST.retirementCorpus, lifeCover: ST.lifeCover, healthCover: ST.healthCover })
      expect(plan.life.need, where).toBeLessThanOrEqual(ST.income * 12 * 15)
      expect(plan.health.need, where).toBeGreaterThanOrEqual(10 * 100000)
      expect(plan.health.need, where).toBeLessThanOrEqual(50 * 100000)
      if (ST.deps === 0) expect(plan.life.need, where).toBe(0)
      if (plan.life.covered) expect(moves.some((m) => m.title === "Protect your family's income"), `life step shown though covered ${where}`).toBe(false)
      if (plan.health.kind === 'none') expect(moves.some((m) => m.title === 'Guard against a big hospital bill'), `health step shown though covered ${where}`).toBe(false)

      for (const t of [krPositive(inp, pillars).head, krPositive(inp, pillars).payoff, krVerdict(moves, moves.some((m) => m.crit)), insuranceInsight(inp, pillars).headline, creditInsight(pillars).body, incomeInsight(Math.max(1, ST.income)).headline]) {
        expect(String(t), where).not.toMatch(BAD)
      }
      const u = cardUsage(ST.cardBalance, ST.cardLimit)
      expect(Number.isFinite(u.pct), where).toBe(true)
    }
    // The sweep must actually reach every kind of step, or passing means little.
    for (const title of ['Build your safety cushion', 'Invest a little more', "Protect your family's income", 'Guard against a big hospital bill', 'Stay on track for retirement', 'Get ahead on your loan', 'Lift your credit score', 'Ease your debt load']) {
      expect(hits[title] ?? 0, `the sweep never produced "${title}": ${JSON.stringify(hits)}`).toBeGreaterThan(10)
    }
  })
})
