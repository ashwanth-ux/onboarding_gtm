import { computeHealth } from './agent/health'
import { computeTerm, defaultCoverToAge, defaultGoals, termPremium } from './agent/term'

// How much life and health cover to suggest, using the same rules as the KYFR insurance guide
// (src/engine/agent). The onboarding does not ask who depends on you or where you live, so those
// come from the guide's own defaults and are stated in plain words wherever the number is shown.
export interface CoverInput {
  age: number
  /** People who rely on your income. */
  deps: number
  /** Monthly take-home income, in rupees. */
  income: number
  /** Monthly spending, in rupees. */
  spending: number
  savings: number
  /** Total monthly EMI. */
  emi: number
  /** Retirement savings. They would support the family too, so they count against the need. */
  retirement?: number
}

export interface CoverNeeds {
  /** Life cover to suggest, in rupees. 0 when nobody depends on you. */
  life: number
  /** Total health cover to suggest (base plan plus any top-up), in rupees. */
  health: number
  /** The first health plan to buy, in rupees. */
  healthBase: number
  /** Yearly cost of the suggested health cover, mid estimate. */
  healthYearlyCost: number
}

// About six years of EMIs left on average: we ask for the monthly EMI, not what is still owed.
const EMI_MONTHS_LEFT = 72
// Savings beyond six months of spending count towards the family's cushion.
const CUSHION_MONTHS = 6
// The guide's formula can reach 25x income for a low earner with several dependents. That is more
// than most people need or can sensibly pay for, so the onboarding stops at 15x yearly income.
export const LIFE_CAP_MULTIPLE = 15
const STEP = 500_000

// Anything that is not a sensible finite number becomes a safe one, so a stray NaN can never reach the maths.
const num = (v: number, fallback: number, lo = 0, hi = 1e12) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
const clean = (p: CoverInput): CoverInput => ({
  age: Math.round(num(p.age, 30, 18, 70)), deps: Math.round(num(p.deps, 0, 0, 10)),
  income: num(p.income, 0), spending: num(p.spending, 0), savings: num(p.savings, 0), emi: num(p.emi, 0),
  retirement: num(p.retirement ?? 0, 0),
})

export function coverNeeds(input: CoverInput): CoverNeeds {
  const p = clean(input)
  const age = p.age
  const deps = p.deps
  const annualIncome = p.income * 12
  const kids = Math.max(0, deps - 1)

  const h = computeHealth({
    age, spouse: deps >= 1, kids, parents: 0, parentAge: 62, city: 'metro', hospital: 'standard',
    ownCover: 0, employerCover: 0, knownCondition: false, babyPlanned: false,
    savingsForBill: Math.max(0, p.savings), income: annualIncome, noIncome: annualIncome <= 0,
  })

  let life = 0
  if (deps >= 1 && annualIncome > 0) {
    const youngestChildAge = 3
    life = computeTerm({
      age, gender: 'male', smoker: false, income: annualIncome, monthlySpend: p.spending,
      spouse: 'homemaker', kids, youngestChildAge, dependentParents: false,
      loans: Math.max(0, p.emi) * EMI_MONTHS_LEFT, goals: defaultGoals(kids, youngestChildAge),
      freeSavings: Math.max(0, p.savings - p.spending * CUSHION_MONTHS) + (p.retirement ?? 0), existingTerm: 0, employerLife: 0,
    }).recommended
    life = Math.min(life, Math.floor((annualIncome * LIFE_CAP_MULTIPLE) / STEP) * STEP)
  }

  return { life, health: h.recommendedTotal, healthBase: h.base, healthYearlyCost: h.premium.total.mid }
}

export interface CoverPlan {
  life: { need: number; own: number; buy: number; yearlyCost: number; covered: boolean }
  health: {
    need: number; own: number; base: number
    /** 'none' when already covered, 'plan' to start with a first plan, 'topup' to add a top-up above a plan you hold. */
    kind: 'none' | 'plan' | 'topup'
    /** The cover to buy: the first plan, or the top-up amount. */
    buy: number
    yearlyCost: number
  }
}

// What to actually buy, given the cover already held, and roughly what it costs each year.
export function coverPlan(input: CoverInput & { lifeCover: number; healthCover: number }): CoverPlan {
  const p = { ...clean(input), lifeCover: num(input.lifeCover, 0), healthCover: num(input.healthCover, 0) }
  const age = p.age
  const deps = p.deps
  const annualIncome = p.income * 12
  const kids = Math.max(0, deps - 1)
  const needs = coverNeeds(p)

  const h = computeHealth({
    age, spouse: deps >= 1, kids, parents: 0, parentAge: 62, city: 'metro', hospital: 'standard',
    ownCover: Math.max(0, p.healthCover), employerCover: 0, knownCondition: false, babyPlanned: false,
    savingsForBill: Math.max(0, p.savings), income: annualIncome, noIncome: annualIncome <= 0,
  })
  const health: CoverPlan['health'] = { need: needs.health, own: p.healthCover, base: h.base, kind: 'none', buy: 0, yearlyCost: 0 }
  if (!h.covered) {
    if (p.healthCover >= 3 * 100_000) { health.kind = 'topup'; health.buy = h.toBuy.topUp; health.yearlyCost = h.toBuy.premium.mid }
    else { health.kind = 'plan'; health.buy = h.base; health.yearlyCost = h.plans[0].premium.mid }
  }

  const buy = Math.max(0, needs.life - Math.max(0, p.lifeCover))
  // A gap smaller than the smallest policy worth buying counts as covered.
  const covered = needs.life === 0 || buy < 25 * 100_000
  const yearlyCost = covered ? 0 : termPremium({ age, gender: 'male', smoker: false, cover: buy, coverToAge: defaultCoverToAge(age, 25) }).mid
  return { life: { need: needs.life, own: p.lifeCover, buy: covered ? 0 : buy, yearlyCost, covered }, health }
}
