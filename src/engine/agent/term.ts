import { CRORE, LAKH, clamp, inr, pct, roundTo, roundUpTo } from './format'
import { LIMITS } from './limits'
import type { Flag, Gender, Range, Spouse, Step } from './types'

/* ───────────────────────── Assumptions (all named, all shown to the user) ───────────────────────── */
export const TERM_ASSUMPTIONS = {
  /** Share of household spending the family still needs without you (you stop spending on yourself). */
  supportShare: 0.75,
  /** After-death return on the payout: low case / base / high-need case (nominal, conservative mix). */
  returnLow: 0.08,
  returnBase: 0.07,
  returnHigh: 0.065,
  /** General inflation. */
  inflation: 0.06,
  /** Goals are discounted at a conservative fixed return, whatever the stream return is. */
  goalDiscount: 0.08,
  educationInflation: 0.09,
  marriageInflation: 0.06,
  /** High case adds this many years of support. */
  highExtraYears: 5,
  /** When a spouse earns and we don't know how much, assume they cover this share of spending. */
  spouseCoversShare: 0.5,
  /** Human-life-value cross-check. */
  hlvIncomeGrowth: 0.07,
  hlvDiscount: 0.09,
  hlvRetireAge: 60,
  hlvSelfConsumption: 0.3,
  /** Homemaker: cost of replacing the work (childcare, help) as a share of household spending, bounded. */
  replacementShare: 0.25,
  replacementFloor: 3 * LAKH,
  replacementCap: 8 * LAKH,
  /** Smallest policy worth recommending. */
  minPolicy: 25 * LAKH,
  roundStep: 5 * LAKH,
} as const

/** Insurer financial-underwriting ceiling: roughly 10–25× income, tapering with age. IRDAI sets no universal multiple. */
export function incomeMultipleCeiling(age: number): number {
  if (age <= 35) return 25
  if (age <= 45) return 20
  if (age <= 50) return 15
  if (age <= 55) return 12
  return 10
}

/* ───────────────────────── Core formula ───────────────────────── */

/** r = (1+i)/(1+π) − 1  (real return on the payout) */
export const realRate = (nominal: number, inflation: number) => (1 + nominal) / (1 + inflation) - 1

/** Present value of N yearly payments of 1, paid at year end, at rate r. Handles r≈0. */
export function annuityFactor(r: number, n: number): number {
  if (n <= 0) return 0
  if (Math.abs(r) < 1e-9) return n
  return (1 - Math.pow(1 + r, -n)) / r
}

export interface Goal {
  id: 'education' | 'marriage' | 'other'
  label: string
  /** Cost in today's money. */
  todayCost: number
  yearsAway: number
  inflation: number
}

export const goalPV = (g: Goal, discount = TERM_ASSUMPTIONS.goalDiscount) =>
  g.todayCost * Math.pow(1 + g.inflation, g.yearsAway) / Math.pow(1 + discount, g.yearsAway)

/** Cover = S·[1−(1+r)^−N]/r + L + G − A − E   (floored at zero) */
export function termNeed(p: { S: number; N: number; i: number; pi: number; L: number; G: number; A: number; E: number; X?: number }) {
  const r = realRate(p.i, p.pi)
  const af = annuityFactor(r, p.N)
  const support = p.S * af
  return { r, af, support, total: Math.max(0, support + (p.X ?? 0) + p.L + p.G - p.A - p.E) }
}

/** Human life value: PV of future after-consumption income to retirement (growing annuity). Ceiling cross-check only. */
export function humanLifeValue(age: number, income: number): number {
  const { hlvIncomeGrowth: g, hlvDiscount: d, hlvRetireAge, hlvSelfConsumption } = TERM_ASSUMPTIONS
  const n = Math.max(0, hlvRetireAge - age)
  if (n === 0) return 0
  const pv = Math.abs(d - g) < 1e-9 ? (income * n) / (1 + d) : (income / (d - g)) * (1 - Math.pow((1 + g) / (1 + d), n))
  return pv * (1 - hlvSelfConsumption)
}

/* ───────────────────────── Premium (indicative) ─────────────────────────
 * Calibrated to Ditto's September 2026 quotes for ten term plans (healthy non-smoker, tier-1 city, ex-GST,
 * individual life and health premiums are GST-free since 22 Sep 2025), cross-checked against Pranay Kapoor's
 * ₹5 crore quotes (SBI ₹32.8k at the cheap end, LIC ₹41.3k at the dear end). */
export const TERM_PREMIUM_MODEL = {
  /** ₹1 crore to age 65, 25-year-old non-smoking man: mean of ten plans (₹808 to ₹946 a month). */
  anchor: 10_500,
  anchorAge: 25,
  anchorCoverTo: 65,
  /** Per-year growth of price with entry age: 18–25, 25–40 (Ditto: 25→35 is ×1.55), 40+ (field guide: 6–9%). */
  ageGrowth: { under25: 0.015, to40: 0.045, over40: 0.075 },
  /** Cover scaling: ₹2 crore costs 1.73× ₹1 crore (Ditto). Above ₹5 crore bands flatten (exponent ½). */
  coverKnots: [
    [0.5 * CRORE, 0.58],
    [CRORE, 1],
    [2 * CRORE, 1.728],
    [5 * CRORE, 2.55],
  ] as [number, number][],
  belowExponent: Math.log(1.728) / Math.log(2),
  aboveExponent: 0.5,
  /** Women pay about 15% less: ₹15.8k vs ₹18.2k at 25, ₹23.3k vs ₹28.1k at 35. */
  femaleFactor: 0.85,
  /** Smokers pay 60% to 100% more. */
  smokerFactor: 1.7,
  /** Cover to 50 costs about 40% less than to 60: 2.8% per year of cover-to age. */
  perYearCoverTo: 0.028,
  /** Ten plans at 35, ₹2 crore: ₹25.3k to ₹32.2k around a ₹28.1k mean. */
  spread: { low: 0.88, high: 1.18 },
  floor: 2_500,
} as const

/** Premiums climb about 4.5% a year of delay through the 20s and 30s, 7.5% from 40. */
export function termAgeFactor(age: number): number {
  const G = TERM_PREMIUM_MODEL.ageGrowth
  const a = clamp(age, 18, 70)
  const base = TERM_PREMIUM_MODEL.anchorAge
  if (a <= base) return Math.pow(1 + G.under25, a - base)
  if (a <= 40) return Math.pow(1 + G.to40, a - base)
  return Math.pow(1 + G.to40, 40 - base) * Math.pow(1 + G.over40, a - 40)
}

/** Relative price of a cover amount versus ₹1 crore. Log-log interpolation between published price bands. */
export function termCoverFactor(cover: number): number {
  const M = TERM_PREMIUM_MODEL
  const k = M.coverKnots
  const c = clamp(cover, 5 * LAKH, 100 * CRORE)
  if (c <= k[0][0]) return k[0][1] * Math.pow(c / k[0][0], M.belowExponent)
  for (let i = 0; i < k.length - 1; i++) {
    const [x0, y0] = k[i]
    const [x1, y1] = k[i + 1]
    if (c <= x1) return y0 * Math.pow(y1 / y0, Math.log(c / x0) / Math.log(x1 / x0))
  }
  const [xl, yl] = k[k.length - 1]
  return yl * Math.pow(c / xl, M.aboveExponent)
}

export function termPremium(i: { age: number; gender: Gender; smoker: boolean; cover: number; coverToAge: number }): Range {
  const M = TERM_PREMIUM_MODEL
  const coverTo = clamp(i.coverToAge, i.age + 5, 99)
  const mid =
    M.anchor *
    termAgeFactor(i.age) *
    clamp(1 + M.perYearCoverTo * (coverTo - M.anchorCoverTo), 0.55, 2.3) *
    termCoverFactor(i.cover) *
    (i.gender === 'female' ? M.femaleFactor : 1) *
    (i.smoker ? M.smokerFactor : 1)
  const m = Math.max(M.floor, mid)
  return { low: roundTo(m * M.spread.low, 100), mid: roundTo(m, 100), high: roundTo(m * M.spread.high, 100) }
}

/* ───────────────────────── Orchestrator ───────────────────────── */
export interface TermInput {
  age: number
  gender: Gender
  smoker: boolean
  income: number
  monthlySpend: number
  spouse: Spouse
  kids: number
  youngestChildAge: number
  dependentParents: boolean
  loans: number
  goals: Goal[]
  freeSavings: number
  existingTerm: number
  employerLife: number
  /** Optional manual override of support years. */
  yearsOverride?: number
  /** Homemaker or student: size on the cost of replacing their work, not on income. */
  noIncome?: boolean
  /** What you send or spend on dependent parents each year. 0 when nobody. */
  parentSupportYearly?: number
  parentAge?: number
}

export function defaultYears(i: Pick<TermInput, 'spouse' | 'kids' | 'youngestChildAge' | 'dependentParents' | 'age'>): number {
  let n = 0
  if (i.spouse === 'homemaker') n = 25
  else if (i.spouse === 'earning') n = 12
  if (i.kids > 0) n = Math.max(n, 25 - i.youngestChildAge)
  if (n === 0) return 0
  return clamp(Math.min(n, 85 - i.age), LIMITS.years.min, LIMITS.years.max)
}

export function defaultGoals(kids: number, youngestChildAge: number): Goal[] {
  if (kids <= 0) return []
  return [
    {
      id: 'education',
      label: kids > 1 ? `Education for ${kids} children` : 'Child’s education',
      todayCost: 40 * LAKH * kids,
      yearsAway: Math.max(0, 18 - youngestChildAge),
      inflation: TERM_ASSUMPTIONS.educationInflation,
    },
  ]
}

const kidsPresent = (i: Pick<TermInput, 'kids'>) => i.kids > 0

export function defaultCoverToAge(age: number, years: number): number {
  return clamp(roundUpTo(Math.max(60, age + years), 5), 60, 85)
}

export interface TermResult {
  S: number
  N: number
  loans: number
  goalsPV: number
  assets: number
  existing: number
  parts: { support: number; parents: number; loans: number; goals: number; assets: number; existing: number }
  parentSupportYearly: number
  parentYears: number
  need: Range
  recommended: number
  multipleOfIncome: number
  eligibility: { multiple: number; ceiling: number; additionalAllowed: number; binding: boolean }
  hlv: number
  coverToAge: number
  premium: Range
  premiumPctOfIncome: number
  sensitivity: { returns: number[]; years: number[]; grid: number[][] }
  flags: Flag[]
  steps: Step[]
  noNeed: boolean
  /** The need before subtracting what you already hold. */
  grossNeed: number
  /** Already covered (what you hold meets the need), part of the way, or starting fresh. */
  standing: 'sorted' | 'partly' | 'fresh'
  /** How far your existing cover is above the need (0 if not). */
  surplus: number
}

export function computeTerm(i: TermInput): TermResult {
  const A = TERM_ASSUMPTIONS
  const age = clamp(i.age, LIMITS.age.min, LIMITS.age.max)
  const income = clamp(i.income, LIMITS.income.min, LIMITS.income.max)
  const spend = clamp(i.monthlySpend, LIMITS.monthlySpend.min, LIMITS.monthlySpend.max)
  const loans = clamp(i.loans, 0, LIMITS.loans.max)
  const assets = clamp(i.freeSavings, 0, LIMITS.freeSavings.max)
  const existing = clamp(i.existingTerm, 0, LIMITS.existingTerm.max)

  const householdDepends = i.spouse !== 'none' || i.kids > 0
  const parentYearly = i.dependentParents ? clamp(i.parentSupportYearly ?? 0, 0, LIMITS.parentSupport.max * 12) : 0
  const depends = householdDepends || parentYearly > 0
  const defN = defaultYears({ ...i, age })
  const N = householdDepends ? clamp(i.yearsOverride ?? defN, LIMITS.years.min, LIMITS.years.max) : 0
  // Parents are supported for their own expected years, not for yours.
  const parentYears = clamp(85 - (i.parentAge ?? 65), LIMITS.years.min, 25)

  const homemaker = !!i.noIncome
  const householdYear = spend * 12
  const spouseShare = !homemaker && i.spouse === 'earning' ? A.spouseCoversShare : 0
  const S = homemaker ? clamp(householdYear * A.replacementShare, A.replacementFloor, A.replacementCap) : householdYear * A.supportShare * (1 - spouseShare)

  // A homemaker's cover replaces her work. Education and marriage are funded by the earning spouse's cover, so they are not added twice.
  // The earning spouse's cover funds the children's education and marriage; goals the person sets for themselves still count.
  const G = i.goals.filter((g) => !homemaker || g.id === 'other').reduce((s, g) => s + goalPV(g), 0)

  const parentPV = (iRet: number) => (parentYearly > 0 ? parentYearly * annuityFactor(realRate(iRet, A.inflation), parentYears) : 0)
  const calc = (iRet: number, years: number) => termNeed({ S: householdDepends ? S : 0, N: years, i: iRet, pi: A.inflation, L: loans, G, A: assets, E: existing, X: parentPV(iRet) })
  const low = calc(A.returnLow, N)
  const base = calc(A.returnBase, N)
  const high = calc(A.returnHigh, N === 0 ? 0 : Math.min(LIMITS.years.max, N + A.highExtraYears))
  const parentsPV = parentPV(A.returnBase)

  const baseNeed = base.total
  // The need before subtracting what is already held. The net figure is clamped at zero, so it cannot be recovered from it.
  const grossBase = termNeed({ S: householdDepends ? S : 0, N, i: A.returnBase, pi: A.inflation, L: loans, G, A: assets, E: 0, X: parentPV(A.returnBase) }).total
  const recommendedRaw = baseNeed <= 0 ? 0 : Math.max(A.roundStep, roundUpTo(baseNeed, A.roundStep))

  const multiple = incomeMultipleCeiling(age)
  const ceiling = homemaker ? 100 * CRORE : multiple * income
  const additionalAllowed = Math.max(0, ceiling - existing)
  const binding = !homemaker && recommendedRaw > additionalAllowed
  const recommended = binding ? Math.floor(additionalAllowed / A.roundStep) * A.roundStep : recommendedRaw

  const totalCover = recommended + existing
  const coverToAge = defaultCoverToAge(age, N)
  const premium = recommended > 0 ? termPremium({ age, gender: i.gender, smoker: i.smoker, cover: recommended, coverToAge }) : { low: 0, mid: 0, high: 0 }
  const premiumPct = !homemaker && income > 0 ? (premium.mid / income) * 100 : 0
  const hlv = homemaker ? 0 : humanLifeValue(age, income)

  const flags: Flag[] = []
  if (!depends && loans === 0) flags.push({ level: 'info', text: 'Nobody depends on your income and you owe nothing, so term cover may not be needed yet. Revisit when that changes.' })
  if (depends && existing === 0) flags.push({ level: 'critical', text: 'People depend on your income and you hold no individual term cover.' })
  if (depends && recommended > 0 && existing > 0) flags.push({ level: 'gap', text: `You hold ${inr(existing)} already. About ${inr(recommended)} more closes the gap.` })
  if (i.employerLife > 0 && existing === 0) flags.push({ level: 'warn', text: 'Cover through your employer ends when the job does. We did not count it.' })
  if (binding) flags.push({ level: 'warn', text: `Insurers would likely approve about ${inr(additionalAllowed)} more at your age and income (about ${multiple}× income). Close the rest in stages, with a second insurer or your spouse’s cover.` })
  if (!homemaker && (kidsPresent(i) || i.spouse === 'homemaker' || i.dependentParents) && loans > 0 && baseNeed > 0 && (totalCover / income) < 8) flags.push({ level: 'warn', text: 'Under 8× income with dependents and loans is low. Recheck the inputs.' })
  if (homemaker && baseNeed > 0) flags.push({ level: 'info', text: 'Sized on the cost of replacing your work, not on income. Insurers usually cap cover for a homemaker at a share of the earning spouse’s cover, so ask before you apply.' })
  if (premiumPct > 2) flags.push({ level: 'info', text: `This would cost about ${pct(premiumPct, 1)} of income a year. Under 2% is comfortable. Cover to a lower age or a staged top-up can bring it down.` })
  if (age > 65) flags.push({ level: 'warn', text: 'Most insurers do not sell new term cover after 65. Health cover matters more now.' })
  if (hlv > 0 && totalCover > hlv * 1.05) flags.push({ level: 'warn', text: `This is above what your future earnings are worth (${inr(hlv)}). Check your spending and goals. Insurers also cap cover at a multiple of income, so a number this high may need staging.` })

  const returns = [0.065, 0.07, 0.08]
  const years = [N - 5, N, N + 5].map((y) => clamp(y, LIMITS.years.min, LIMITS.years.max))
  const grid = returns.map((r) => years.map((y) => (N === 0 && parentYearly === 0 ? baseNeed : termNeed({ S: householdDepends ? S : 0, N: y, i: r, pi: A.inflation, L: loans, G, A: assets, E: existing, X: parentPV(r) }).total)))

  const r = base.r
  const steps: Step[] = [
    { label: homemaker ? 'Yearly cost of replacing your work' : 'Yearly support the family still needs', formula: homemaker ? `${pct(A.replacementShare * 100, 0)} of household spending, between ${inr(A.replacementFloor)} and ${inr(A.replacementCap)}` : `₹${Math.round(householdYear).toLocaleString('en-IN')} a year × ${pct(A.supportShare * 100, 0)}${spouseShare ? ` × ${pct((1 - spouseShare) * 100, 0)} (spouse covers the rest)` : ''}`, value: inr(S) },
    { label: 'Years the support must last', formula: householdDepends ? 'Until your spouse and children can stand on their own' : 'No spouse or children depend on you', value: householdDepends ? `${N} years` : '—' },
    { label: 'Real return on the payout', formula: `(1 + ${pct(A.returnBase * 100)}) ÷ (1 + ${pct(A.inflation * 100)}) − 1`, value: pct(r * 100, 2) },
    { label: 'Income support', formula: `${inr(S)} × [1 − (1 + ${pct(r * 100, 2)})^−${N}] ÷ ${pct(r * 100, 2)}`, value: inr(base.support) },
    ...(parentYearly > 0 ? [{ label: 'Add support for your parents', formula: `${inr(parentYearly)} a year for ${parentYears} years, the years your parents are likely to need it`, value: inr(parentsPV) }] : []),
    { label: 'Add loans outstanding', value: inr(loans) },
    { label: 'Add big goals, in future money, discounted back', formula: homemaker ? 'Children’s goals are left to your earning spouse’s cover, so not counted twice' : `at ${pct(A.goalDiscount * 100, 0)} a year`, value: inr(G) },
    { label: 'Subtract savings you can spare', value: `− ${inr(assets)}` },
    { label: 'Subtract individual term cover you hold', value: `− ${inr(existing)}` },
    { label: 'Cover needed (base case)', formula: 'Support + parents + loans + goals − savings − existing cover', value: inr(baseNeed) },
    { label: 'Range', formula: `Low: ${pct(A.returnLow * 100)} return. High: ${pct(A.returnHigh * 100)} return and ${A.highExtraYears} more years`, value: `${inr(low.total)} to ${inr(high.total)}` },
    ...(homemaker ? [] : [{ label: 'Insurer ceiling', formula: `${multiple}× income at age ${age}. IRDAI sets no universal multiple`, value: inr(ceiling) }]),
    ...(homemaker ? [] : [{ label: 'Cross-check: economic value of your future earnings', formula: `Income grows ${pct(A.hlvIncomeGrowth * 100, 0)}, discounted ${pct(A.hlvDiscount * 100, 0)}, to age ${A.hlvRetireAge}, less ${pct(A.hlvSelfConsumption * 100, 0)} for your own spending`, value: inr(hlv) }]),
  ]

  return {
    S, N, loans, goalsPV: G, assets, existing,
    parts: { support: base.support, parents: parentsPV, loans, goals: G, assets: -assets, existing: -existing },
    parentSupportYearly: parentYearly, parentYears,
    need: { low: low.total, mid: baseNeed, high: high.total },
    recommended,
    multipleOfIncome: income > 0 ? totalCover / income : 0,
    eligibility: { multiple, ceiling, additionalAllowed, binding },
    hlv, coverToAge, premium, premiumPctOfIncome: premiumPct,
    sensitivity: { returns, years, grid },
    flags, steps,
    noNeed: baseNeed <= 0,
    grossNeed: Math.max(0, grossBase),
    standing: existing > 0 && baseNeed <= 0 ? 'sorted' : existing > 0 && recommended > 0 ? 'partly' : 'fresh',
    surplus: existing > 0 && baseNeed <= 0 ? Math.max(0, existing - grossBase) : 0,
  }
}
