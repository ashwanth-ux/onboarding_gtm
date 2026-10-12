import { beforeEach, describe, expect, it } from 'vitest'
import { calcFRI, calcPillars, calcWeights } from '../src/engine/crisp'
import { coverPlan } from '../src/engine/cover'
import { krCandidates, krPositive, krPrioritise, krRampFV, krRs, krStepPlan } from '../src/engine/report'
import { buildPillarDetail } from '../src/ui/detail'
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

// Small seeded generator so a failure can be reproduced exactly.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F1}]|\uFE0F/u
const JARGON = /liquid fund|super top-up|term plan|term-insurance|corpus|\bFOIR\b|utili[sz]ation|drawdown|runway|premium|sum insured|revolving|allocation|prepay|compounding|trifecta|\bNCB\b|deductible|co-pay/i
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const numbers = (text: string) => new Set(strip(text).match(/₹[\d.,]+\s?(?:Cr|L|K|crore|lakh)?|\b\d+(?:\.\d+)?%/g) ?? [])

const PEOPLE: Record<string, Partial<typeof ST>> = {
  stretched: { age: 28, deps: 2, income: 50000, spending: 40000, savings: 30000, emi: 15000, knownScore: 650, cardBalance: 40000, cardLimit: 50000 },
  starter: { age: 24, deps: 0, income: 30000, spending: 22000, savings: 15000 },
  family: { age: 35, deps: 3, income: 120000, spending: 70000, savings: 400000, sip: 15000, emi: 35000, knownScore: 690, cardBalance: 60000, cardLimit: 150000, lifeCover: 5_000_000, healthCover: 500_000 },
  senior: { age: 55, deps: 1, income: 250000, spending: 100000, savings: 6_000_000, retirementCorpus: 15_000_000, knownScore: 800 },
  loan: { age: 32, deps: 0, income: 150000, spending: 60000, savings: 500_000, emi: 25000, knownScore: 760, sip: 30000, healthCover: 1_000_000 },
}
function movesFor(overrides: Partial<typeof ST>) {
  Object.assign(ST, overrides)
  const inp = deriveInp()
  const pillars = calcPillars(inp)
  const weights = calcWeights(inp)
  const fri = calcFRI(pillars, weights)
  return krPrioritise(krCandidates(inp, pillars, weights, fri))
}

describe('the green "already getting right" card', () => {
  it('never says the same number twice', () => {
    const r = rng(7)
    for (let n = 0; n < 1500; n++) {
      Object.assign(ST, DEFAULTS, {
        age: 20 + Math.floor(r() * 50), deps: Math.floor(r() * 4), income: 20000 + Math.floor(r() * 400000), spending: 10000 + Math.floor(r() * 150000),
        savings: Math.floor(r() * 20_000_000), sip: Math.floor(r() * 100000), retirementCorpus: Math.floor(r() * 30_000_000), emi: Math.floor(r() * 60000),
        knownScore: 500 + Math.floor(r() * 400), cardBalance: Math.floor(r() * 100000), cardLimit: 50000 + Math.floor(r() * 400000),
        lifeCover: r() < 0.5 ? 0 : 5_000_000, healthCover: r() < 0.5 ? 0 : 1_500_000,
      })
      const inp = deriveInp()
      const pos = krPositive(inp, calcPillars(inp))
      const head = numbers(pos.head), body = numbers(pos.payoff)
      for (const x of head) expect(body.has(x), `"${x}" is in both the headline and the body: ${pos.head} / ${strip(pos.payoff)}`).toBe(false)
      const digitsIn = (t: string) => strip(t).match(/\d+/g) ?? []
      for (const d of digitsIn(pos.head)) expect(digitsIn(pos.payoff).includes(d), `"${d}" is in both: ${pos.head} / ${strip(pos.payoff)}`).toBe(false)
    }
  })
})

describe('credit health in the full breakdown', () => {
  const credit = (p: Partial<typeof ST>) => {
    Object.assign(ST, DEFAULTS, p)
    const inp = deriveInp(), pillars = calcPillars(inp), weights = calcWeights(inp)
    const cands = krCandidates(inp, pillars, weights, calcFRI(pillars, weights))
    return buildPillarDetail('credit', inp, cands, krPrioritise(cands))
  }
  const stretched = { age: 30, deps: 1, income: 100000, spending: 60000, savings: 200000, emi: 50000, knownScore: 700, cardBalance: 60000, cardLimit: 100000 }

  it('explains what the number is made of instead of showing a bare percentage', () => {
    const c = credit(stretched)
    const text = strip(c.visual)
    expect(text).toMatch(/comes from three things/)
    expect(text).toMatch(/Your EMIs/)
    expect(text).toMatch(/Your credit score/)
    expect(text).toMatch(/Your card use/)
    expect(text).not.toMatch(/credit health \d+%/i)
    expect(c.chips).toEqual([])
  })
  it('says what to do about each part, in plain words', () => {
    const text = strip(credit(stretched).visual)
    expect(text).toMatch(/comfortable level|safe level/)
    expect(text).toMatch(/Over 30%/)
    expect(text).not.toMatch(JARGON)
  })
  it('marks the part the report step works on, without repeating that step\'s advice', () => {
    const c = credit(stretched)
    expect(c.visual).toContain('Your step above works on this')
    expect((c.visual.match(/Your step above works on this/g) ?? []).length).toBe(1)
    // the step is about EMIs, so the EMI row must not restate "pay down your most expensive loan"
    expect(strip(c.visual)).not.toMatch(/most expensive loan/)
  })
  it('tags each part by the same line its advice uses, so a tag never contradicts its sentence', () => {
    const rows = credit(stretched).visual.split('class="cred-row"').slice(1).map((r) => strip(r))
    expect(rows[0]).toMatch(/Needs work.*Over the comfortable level/) // 50% EMIs
    expect(rows[1]).toMatch(/On track.*Good\./) // score 700
    expect(rows[2]).toMatch(/Watch.*Over 30%/) // 60% card use
  })
  it('does not pretend a score we guessed is the person\'s own', () => {
    expect(strip(credit({ ...stretched, knownScore: null }).visual)).toMatch(/our guess/)
  })
  it('calls the step an optional extra, not a fix, on a part that is already fine', () => {
    const c = credit({ age: 30, deps: 0, income: 100000, spending: 40000, savings: 150000, sip: 10000, emi: 10000, knownScore: 810, cardBalance: 5000, cardLimit: 300000, healthCover: 1_500_000 })
    expect(strip(c.visual)).toMatch(/On track.*optional extra/)
    expect(strip(c.visual)).not.toContain('works on this')
  })
  it('gives a healthy picture a healthy reading, with no step to point at', () => {
    const c = credit({ age: 30, deps: 0, income: 150000, spending: 60000, savings: 900000, sip: 40000, emi: 10000, knownScore: 810, cardBalance: 5000, cardLimit: 300000, healthCover: 2_000_000 })
    expect(strip(c.visual)).not.toMatch(/Needs work|Watch/)
    expect(c.visual).not.toContain('Your step above works on this')
  })
})

describe('full breakdown', () => {
  it('uses no icons or jargon, and never says the same number twice in one area', () => {
    for (const [name, p] of Object.entries(PEOPLE)) {
      Object.assign(ST, DEFAULTS, p)
      const inp = deriveInp(), pillars = calcPillars(inp), weights = calcWeights(inp)
      const cands = krCandidates(inp, pillars, weights, calcFRI(pillars, weights))
      const moves = krPrioritise(cands)
      for (const key of ['savings', 'credit', 'protection', 'investment']) {
        const c = buildPillarDetail(key, inp, cands, moves)
        const all = [c.title, c.whyMatters, c.note ?? '', c.reason, c.actionLine ?? '', strip(c.visual), ...c.chips.map((x) => x.l)].join(' ')
        expect(all, `${name}/${key}`).not.toMatch(EMOJI)
        expect(all, `${name}/${key}`).not.toMatch(JARGON)
        // Only the picture's current-value labels (the bold ones): a tile must not say them again.
        const shown = numbers([...c.visual.matchAll(/<b>(.*?)<\/b>/g)].map((m) => m[1]).join(' '))
        for (const chip of c.chips) expect(shown.has(chip.v), `${name}/${key}: tile "${chip.v}" repeats the picture`).toBe(false)
      }
    }
  })
})

describe('next steps', () => {
  it('are well formed for a range of people, with no NaN or negative amounts', () => {
    for (const [name, p] of Object.entries(PEOPLE)) {
      Object.assign(ST, DEFAULTS)
      for (const m of movesFor(p)) {
        const text = [m.title, m.action, m.visualHtml, m.why, m.wait].join(' ')
        expect(m.title, name).toBeTruthy()
        expect(m.action, name).toBeTruthy()
        expect(text, `${name}: ${m.title}`).not.toMatch(/NaN|undefined|Infinity|₹-/)
      }
    }
  })

  it('use no emoji or icons', () => {
    for (const [name, p] of Object.entries(PEOPLE)) {
      Object.assign(ST, DEFAULTS)
      for (const m of movesFor(p)) expect([m.title, m.action, m.visualHtml, m.why, m.wait].join(' '), `${name}: ${m.title}`).not.toMatch(EMOJI)
    }
  })

  it('use everyday words, no insurance or finance jargon', () => {
    for (const [name, p] of Object.entries(PEOPLE)) {
      Object.assign(ST, DEFAULTS)
      for (const m of movesFor(p)) expect([m.title, m.action, m.why, m.wait].join(' '), `${name}: ${m.title}`).not.toMatch(JARGON)
    }
  })

  it('never repeat a figure between the face of a step and its folded explanation', () => {
    for (const [name, p] of Object.entries(PEOPLE)) {
      Object.assign(ST, DEFAULTS)
      for (const m of movesFor(p)) {
        const face = numbers([m.action, m.visualHtml].join(' '))
        for (const n of numbers([m.why, m.wait].join(' '))) expect(face.has(n), `${name}: "${n}" appears on the face and in the explanation of "${m.title}"`).toBe(false)
      }
    }
  })

  it('explain an extra EMI in plain words, behind a button labelled with the question', () => {
    Object.assign(ST, DEFAULTS)
    const m = movesFor({ age: 30, deps: 0, income: 150000, spending: 60000, savings: 900_000, emi: 25000, knownScore: 780, sip: 40000, healthCover: 1_500_000, lifeCover: 0 }).find((x) => x.title === 'Get ahead on your loan')
    expect(m, 'the loan step appears for someone in good shape with an EMI').toBeTruthy()
    expect(m.whyLabel).toBe('Why pay an extra EMI?')
    expect(m.why).toMatch(/interest/i)
    expect(m.why).toMatch(/fee/i)
  })

  it('suggest cover in line with the insurance guide, not a flat multiple of income', () => {
    Object.assign(ST, DEFAULTS)
    const who = { age: 30, deps: 1, income: 100000, spending: 60000, savings: 100000, lifeCover: 0, healthCover: 0, sip: 20000, knownScore: 780 }
    const m = movesFor(who).find((x) => x.key === 'protection')
    expect(m).toBeTruthy()
    const plan = coverPlan({ age: 30, deps: 1, income: 100000, spending: 60000, savings: 100000, emi: 0, lifeCover: 0, healthCover: 0 })
    expect(m.action).toContain(krRs(plan.life.covered ? plan.health.buy : plan.life.need))
    expect(plan.life.need).toBeLessThanOrEqual(15 * 100000 * 12)
    expect(plan.health.need).toBeLessThanOrEqual(50 * 100000)
  })
})
