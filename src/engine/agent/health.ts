import { CRORE, LAKH, clamp, inr, inrFull, roundTo } from './format'
import { LIMITS } from './limits'
import type { CityTier, Flag, Range, Step } from './types'

export type HospitalTier = 'top' | 'standard' | 'local'

/* ───────────────────────── Assumptions ───────────────────────── */
export const HEALTH_ASSUMPTIONS = {
  /**
   * Total cover (base + super top-up) for ONE adult, by the hospitals you would use: local, good private, top private.
   * A floater's limit is shared, so the target grows with the people on it (see familyLoad). The base plan comes first.
   * Judgement, not regulation (field guide §5.2). Lowered after review: ₹75 lakh for a young family was far more than most households need.
   */
  targets: {
    metro: { low: 10 * LAKH, mid: 20 * LAKH, high: 30 * LAKH },
    tier2: { low: 10 * LAKH, mid: 15 * LAKH, high: 25 * LAKH },
    other: { low: 10 * LAKH, mid: 10 * LAKH, high: 20 * LAKH },
  } satisfies Record<CityTier, Range>,
  /**
   * Family adjustment: target = one-adult target × (1 + 0.25 per extra adult + 0.10 per child, up to 3 children), rounded to the nearest ₹5 lakh.
   * One limit is shared by everyone on a floater, so the chance that someone needs a big claim in a year rises with the number of people.
   */
  familyLoad: { spouse: 0.25, child: 0.1, maxChildren: 3 },
  roundTo: 5 * LAKH,
  /** The most we ever suggest, whatever the family. */
  maxTotal: 50 * LAKH,
  /** Smallest super top-up worth buying as a separate plan. Below this, the base plan stands alone. */
  minTopUp: 10 * LAKH,
  /** Savings below this cannot absorb a gap above the base plan. */
  thinSavings: 3 * LAKH,
  /** Medical cost inflation 11.5–14% a year; planning value 12%. */
  medicalInflation: 0.12,
  deductibleOptions: [3, 5, 10, 15, 20, 25].map((l) => l * LAKH),
  parentBase: { metro: 10 * LAKH, tier2: 10 * LAKH, other: 5 * LAKH } satisfies Record<CityTier, number>,
  /** Waiting-period rules, IRDAI Master Circular on Health Insurance Business, 29 May 2024. */
  pedWaitMonthsMax: 36,
  moratoriumMonths: 60,
} as const

export const hospitalLabel: Record<HospitalTier, string> = {
  top: 'Top private hospitals',
  standard: 'Good private hospitals',
  local: 'Local or nearby hospitals',
}

/** What ₹X today buys after `years` of medical inflation. 10L at 12% for 10 yrs → ₹3.2L. */
export const realValue = (sumInsured: number, years: number, inflation = HEALTH_ASSUMPTIONS.medicalInflation) =>
  sumInsured / Math.pow(1 + inflation, years)

/* ───────────────────────── Premium (indicative, ex-GST: individual health is GST-free since 22 Sep 2025) ───────────────────────── */
export const HEALTH_PREMIUM_MODEL = {
  /** Indicative annual premium for ₹10 lakh individual cover at 30, metro. Aggregator-grade, to be replaced by insurer rate sheets. */
  anchor: 9_500,
  anchorAge: 30,
  /** Growth per year of age: 30–45, 45–60, 60+ */
  growth: [0.044, 0.06, 0.07] as const,
  /** Sum insured scaling: 5L ≈ 0.78×, 25L ≈ 1.38×, 1cr ≈ 2.24× of the ₹10L premium. */
  siExponent: 0.35,
  cityFactor: { metro: 1.15, tier2: 1.0, other: 0.9 } satisfies Record<CityTier, number>,
  /** Floater: eldest-member premium × (1 + spouse + children). */
  spouseLoad: 0.45,
  childLoad: 0.15,
  maxChildLoads: 3,
  /** Super top-up: ₹1cr over a ₹10L deductible costs ~45% of the ₹10L base premium. */
  topUpAnchorShare: 0.45,
  topUpSizeExponent: 0.3,
  topUpDeductibleExponent: 0.25,
  /** Different insurers price the same cover ~±20% apart. */
  spread: 0.2,
  /** A known condition can load the premium. Insurers decide case by case, so this is a range, not a rule. */
  conditionLoad: { low: 1.0, mid: 1.15, high: 1.3 },
  /** Maternity add-ons lift the base premium. Rule of thumb with no rate sheet behind it: treat as indicative. */
  maternityShare: { low: 0.15, mid: 0.25, high: 0.35 },
} as const

export function healthAgeFactor(age: number): number {
  const a = clamp(age, 18, 90)
  const [g1, g2, g3] = HEALTH_PREMIUM_MODEL.growth
  const at = (x: number) => Math.min(a, x)
  return Math.pow(1 + g1, Math.max(0, at(45) - 30)) * Math.pow(1 + g2, Math.max(0, at(60) - 45)) * Math.pow(1 + g3, Math.max(0, a - 60)) * (a < 30 ? Math.pow(1 + g1, a - 30) : 1)
}

const spreadRange = (mid: number): Range => ({ low: roundTo(mid * (1 - HEALTH_PREMIUM_MODEL.spread), 100), mid: roundTo(mid, 100), high: roundTo(mid * (1 + HEALTH_PREMIUM_MODEL.spread), 100) })

export function baseIndividualMid(age: number, sumInsured: number, city: CityTier): number {
  const M = HEALTH_PREMIUM_MODEL
  return M.anchor * healthAgeFactor(age) * Math.pow(clamp(sumInsured, 3 * LAKH, 5 * CRORE) / (10 * LAKH), M.siExponent) * M.cityFactor[city]
}

export function healthBasePremium(i: { eldestAge: number; spouse: boolean; kids: number; sumInsured: number; city: CityTier }): Range {
  const M = HEALTH_PREMIUM_MODEL
  const members = 1 + (i.spouse ? M.spouseLoad : 0) + Math.min(M.maxChildLoads, i.kids) * M.childLoad
  return spreadRange(baseIndividualMid(i.eldestAge, i.sumInsured, i.city) * members)
}

export function superTopUpPremium(i: { eldestAge: number; spouse: boolean; kids: number; topUp: number; deductible: number; city: CityTier }): Range {
  const M = HEALTH_PREMIUM_MODEL
  if (i.topUp <= 0) return { low: 0, mid: 0, high: 0 }
  const members = 1 + (i.spouse ? M.spouseLoad : 0) + Math.min(M.maxChildLoads, i.kids) * M.childLoad
  const mid =
    baseIndividualMid(i.eldestAge, 10 * LAKH, i.city) * members * M.topUpAnchorShare *
    Math.pow(i.topUp / CRORE, M.topUpSizeExponent) *
    Math.pow((10 * LAKH) / clamp(i.deductible, 3 * LAKH, 25 * LAKH), M.topUpDeductibleExponent)
  return spreadRange(mid)
}

/* ───────────────────────── Orchestrator ───────────────────────── */
export interface HealthInput {
  age: number
  spouse: boolean
  kids: number
  parents: 0 | 1 | 2
  parentAge: number
  city: CityTier
  hospital: HospitalTier
  /** Individual cover you pay for yourself, total sum insured (0 if none). */
  ownCover: number
  employerCover: number
  knownCondition: boolean
  familyHistory?: boolean
  babyPlanned: boolean
  /** A hospital bill you could pay from savings. */
  savingsForBill: number
  income: number
  noIncome?: boolean
}

export interface HealthToBuy {
  kind: 'full' | 'topup' | 'none'
  topUp: number
  deductible: number
  premium: Range
  note: string
}

/** One plan the user would buy, so every plan, including the parents', is visible with its own cover and price. */
export interface HealthPlan {
  id: 'base' | 'parent'
  group: 'family' | 'parents'
  title: string
  /** A few words, for compact lists. */
  short: string
  cover: number
  /** 'core' is a plan to buy. */
  role: 'core'
  premium: Range
  why: string
  /** 'each' when the cover amount applies to every person on the plan(s). */
  per?: 'each'
  /** 'for both' when the premium covers more than one separate plan. */
  premiumFor?: 'for both'
}

/** The super top-up, offered as an add-on. `recommended` says whether the answers call for it. */
export interface TopUpOption {
  recommended: boolean
  /** Cover the top-up adds. */
  size: number
  /** The family's total with it: the plan underneath plus the top-up. */
  total: number
  /** What is paid before it begins (your base plan, or the plan you already hold). */
  deductible: number
  premium: Range
  reasons: string[]
  why: string
}

/** The base plans: one floater for you and your family, and a separate plan for each parent. */
export interface BasePlans {
  floater: number
  parents: { count: number; each: number; premiumEach: Range; premium: Range } | null
  /** Sum insured across every plan. */
  totalCover: number
  planCount: number
  /** Yearly premium of all the base plans, as if bought fresh. */
  premium: Range
  /** What you would actually pay for the base plans: nothing for the family plan if you already hold a clean base. */
  buyPremium: Range
}

export interface HealthResult {
  /** The base plans to buy: the family floater first, then one for each parent. */
  plans: HealthPlan[]
  basePlans: BasePlans
  topUp: TopUpOption
  /** Maternity cover, priced as a share of the base premium. Offered when a baby is planned. */
  maternityOption: { premium: Range }
  /** Where you stand against the base plan alone. */
  baseStanding: 'sorted' | 'partly' | 'fresh'
  baseSurplus: number
  /** Why a super top-up is suggested (empty when the base plan stands alone). */
  topUpReasons: string[]
  /** If no super top-up is suggested: the reason the base is enough. */
  baseOnlyWhy: string | null
  /** The next step up, for people who want more headroom. */
  stretch: { total: number; topUp: number } | null
  total: Range
  recommendedTotal: number
  base: number
  superTopUp: number
  deductible: number
  parents: { count: number; basePerParent: number; premium: Range } | null
  premium: { base: Range; topUp: Range; parents: Range; maternity: Range | null; total: Range }
  /** Premium of your own stack (base, top-up, maternity) as a share of income. Parents are counted separately. */
  premiumPctOfIncome: number
  /** True when your own stack would be unaffordable and the super top-up was trimmed. */
  trimmed: boolean
  /** A known condition can load premiums. */
  loaded: boolean
  /** What you would actually add, given the health cover you already hold. */
  toBuy: HealthToBuy
  /** A higher deductible you could afford, and what it saves. */
  deductibleOption: { deductible: number; saves: number; yourShare: number } | null
  shortfall: number
  covered: boolean
  /** Where you stand against the target: already at or above it, part of the way, or starting fresh. */
  standing: 'sorted' | 'partly' | 'fresh'
  /** How far your own cover is above the target (0 if not). */
  surplus: number
  decay: { years: number; value: number }[]
  flags: Flag[]
  steps: Step[]
  waits: { ped: number; moratorium: number }
}

const sumRange = (...r: (Range | null)[]): Range => {
  const x = r.filter((v): v is Range => !!v)
  return { low: x.reduce((s, v) => s + v.low, 0), mid: x.reduce((s, v) => s + v.mid, 0), high: x.reduce((s, v) => s + v.high, 0) }
}

export function computeHealth(i: HealthInput): HealthResult {
  const A = HEALTH_ASSUMPTIONS
  const M = HEALTH_PREMIUM_MODEL
  const age = clamp(i.age, LIMITS.age.min, LIMITS.age.max)
  const kids = clamp(Math.round(i.kids), 0, 6)
  const ownCover = clamp(i.ownCover, 0, LIMITS.ownHealth.max)
  const employer = clamp(i.employerCover, 0, LIMITS.employerHealth.max)
  const savings = clamp(i.savingsForBill, 0, LIMITS.savingsForBill.max)
  const income = clamp(i.income, LIMITS.income.min, LIMITS.income.max)
  // A planned baby joins the family premium from day one: waiting periods start at purchase, so the plan is bought before the birth.
  const kidsForPrice = kids + (i.babyPlanned ? 1 : 0)

  const t = A.targets[i.city]
  const levels = [t.low, t.mid, t.high]
  const members = 1 + (i.spouse ? 1 : 0) + kidsForPrice
  const factor = 1 + (i.spouse ? A.familyLoad.spouse : 0) + Math.min(A.familyLoad.maxChildren, kidsForPrice) * A.familyLoad.child
  const levelTotal = (l: number) => clamp(Math.max(levels[l], roundTo(levels[l] * factor, A.roundTo)), 0, A.maxTotal)
  // Base plan: big enough that ordinary admissions are cashless. ₹5L only for a smaller town, local hospitals and savings that can absorb a bill.
  // A family of three or more sharing one floater in a city with good private hospitals starts at ₹15L.
  // Top private hospitals bill well above a ₹10L plan even for ordinary admissions, so the base steps up another ₹5L.
  const smallAndLocal = !i.babyPlanned && i.city === 'other' && i.hospital === 'local' && savings >= 5 * LAKH
  const base = smallAndLocal ? 5 * LAKH : 10 * LAKH + (members >= 3 && i.city !== 'other' && i.hospital !== 'local' ? 5 * LAKH : 0) + (i.hospital === 'top' ? 5 * LAKH : 0)
  let lvl = i.hospital === 'top' ? 2 : i.hospital === 'standard' ? 1 : 0
  const topUpReasons: string[] = []
  const cityWord = i.city === 'metro' ? 'a metro' : i.city === 'tier2' ? 'a tier-2 city' : 'a smaller town'
  if (lvl >= 1) topUpReasons.push(lvl === 2 ? `Top private hospitals in ${cityWord} bill far above a ${inr(base)} plan for a serious admission.` : `Good private hospitals in ${cityWord}: one serious admission can pass a ${inr(base)} plan.`)
  if ((i.knownCondition || i.familyHistory) && lvl < 1) { lvl = 1; topUpReasons.push(i.knownCondition ? 'You have a known condition, which makes a long or repeated admission more likely.' : 'Serious illness runs in your family, so a long treatment is a real possibility.') }
  else if (i.knownCondition) topUpReasons.push('You have a known condition, which makes a long or repeated admission more likely.')
  else if (i.familyHistory) topUpReasons.push('Serious illness runs in your family, so a long treatment is a real possibility.')
  if (savings < A.thinSavings && lvl < 1) { lvl = 1; topUpReasons.push('Your savings could not absorb a large gap above the base plan.') }
  const selected = levelTotal(lvl)

  const pCount = i.parents
  const parentBase = A.parentBase[i.city]
  const parentEach = pCount > 0 ? spreadRange(baseIndividualMid(clamp(i.parentAge, LIMITS.parentAge.min, LIMITS.parentAge.max), parentBase, i.city)) : { low: 0, mid: 0, high: 0 }
  const parentsP = { low: parentEach.low * pCount, mid: parentEach.mid * pCount, high: parentEach.high * pCount }

  const load = (r: Range): Range =>
    i.knownCondition ? { low: roundTo(r.low * M.conditionLoad.low, 100), mid: roundTo(r.mid * M.conditionLoad.mid, 100), high: roundTo(r.high * M.conditionLoad.high, 100) } : r

  const build = (target: number) => {
    // A gap too small to be worth its own plan is left to the base.
    const gap = target - base
    const superTopUp = gap >= A.minTopUp ? gap : 0
    const baseRaw = healthBasePremium({ eldestAge: age, spouse: i.spouse, kids: kidsForPrice, sumInsured: base, city: i.city })
    const baseP = load(baseRaw)
    const topP = load(superTopUpPremium({ eldestAge: age, spouse: i.spouse, kids: kidsForPrice, topUp: superTopUp, deductible: base, city: i.city }))
    const maternity: Range | null = i.babyPlanned ? { low: roundTo(baseRaw.mid * M.maternityShare.low, 100), mid: roundTo(baseRaw.mid * M.maternityShare.mid, 100), high: roundTo(baseRaw.mid * M.maternityShare.high, 100) } : null
    const own = sumRange(baseP, topP, maternity)
    return { base, superTopUp, deductible: base, baseP, topP, maternity, own, total: sumRange(own, parentsP), target: base + superTopUp }
  }
  let b = build(selected)
  const pctOf = (mid: number) => (!i.noIncome && income > 0 ? (mid / income) * 100 : 0)
  let trimmed = false
  // Affordability trims only your own stack. Parents' plans are a separate decision and are flagged on their own.
  if (pctOf(b.own.mid) > 8 && b.superTopUp > 0) {
    const lean = build(0)
    if (lean.own.mid < b.own.mid) { b = lean; trimmed = true }
  }
  const { superTopUp, deductible, baseP, topP, maternity, total } = b
  const recommendedTotal = b.target
  const shortfall = Math.max(0, recommendedTotal - ownCover)
  // A gap too small to be worth its own plan counts as covered.
  const covered = ownCover >= recommendedTotal || (ownCover >= base && shortfall < A.minTopUp)

  // What you would actually buy, given what you already hold.
  let toBuy: HealthToBuy
  if (covered) toBuy = { kind: 'none', topUp: 0, deductible: 0, premium: { low: 0, mid: 0, high: 0 }, note: 'Your own cover already meets the target. Check its wording for a room-rent cap, co-pay and sub-limits.' }
  else if (ownCover >= 3 * LAKH) {
    const ded = clamp(ownCover, 3 * LAKH, 25 * LAKH)
    const need = recommendedTotal - ownCover
    toBuy = { kind: 'topup', topUp: need, deductible: ded, premium: load(superTopUpPremium({ eldestAge: age, spouse: i.spouse, kids: kidsForPrice, topUp: need, deductible: ded, city: i.city })), note: `Keep your ${inr(ownCover)} plan as the base and add a ${inr(need)} super top-up with a ${inr(ded)} deductible. If your plan has a room-rent cap, a co-pay or sub-limits, the top-up inherits its weakness.` }
  } else toBuy = { kind: 'full', topUp: superTopUp, deductible, premium: b.own, note: superTopUp > 0 ? 'Buy the base plan first, then the super top-up above it.' : `A ${inr(base)} base plan is enough for now.` }

  // A higher deductible you could afford.
  let deductibleOption: HealthResult['deductibleOption'] = null
  if (superTopUp > 0 && savings >= 2 * base) {
    const alt = A.deductibleOptions.filter((d) => d > base && d <= Math.min(savings, 25 * LAKH)).pop()
    if (alt) {
      const altP = load(superTopUpPremium({ eldestAge: age, spouse: i.spouse, kids: kidsForPrice, topUp: superTopUp, deductible: alt, city: i.city }))
      const saves = topP.mid - altP.mid
      if (saves >= 300) deductibleOption = { deductible: alt, saves: roundTo(saves, 100), yourShare: alt - base }
    }
  }

  const folks = ['you', i.spouse && 'your spouse', kids > 0 && `${kids} ${kids === 1 ? 'child' : 'children'}`, i.babyPlanned && 'the baby you plan'].filter(Boolean) as string[]
  const family = folks.length > 1 ? `${folks.slice(0, -1).join(', ')} and ${folks[folks.length - 1]}` : 'you'
  const parentPlans: HealthPlan[] = Array.from({ length: pCount }, (_, n) => ({
    id: 'parent' as const, group: 'parents' as const, title: `Parent ${n + 1}: their own plan`, short: `Parent ${n + 1}`, cover: parentBase, role: 'core' as const, premium: parentEach,
    why: n === 0 ? `A separate ${inr(parentBase)} plan, so a parent’s claims never use up your family’s limit. Premiums and co-pays rise with age, so compare senior plans and buy early: waiting periods start at purchase.` : `The same, for the other parent. Two plans, so each has a full limit.`,
  }))
  const plans: HealthPlan[] = [
    { id: 'base', group: 'family', title: i.spouse || kids > 0 ? `Family floater for ${family}` : 'Your health plan', short: i.spouse || kids > 0 ? 'Family floater' : 'Your plan', cover: base, role: 'core', premium: baseP,
      why: `Start here. ${inr(base)} makes ordinary admissions cashless.${i.spouse || kids > 0 ? ' One limit is shared by everyone on the plan. It is rare for more than one person to claim a large amount in the same year.' : ''}` },
    ...parentPlans,
  ]
  const basePlans: BasePlans = {
    floater: base,
    parents: pCount > 0 ? { count: pCount, each: parentBase, premiumEach: parentEach, premium: parentsP } : null,
    totalCover: base + pCount * parentBase,
    planCount: 1 + pCount,
    premium: sumRange(baseP, pCount > 0 ? parentsP : null),
    buyPremium: ownCover > 0 ? sumRange(pCount > 0 ? parentsP : null) : sumRange(baseP, pCount > 0 ? parentsP : null),
  }
  // The super top-up sits on the plan you hold (or the base you would buy).
  const topBase = ownCover >= 3 * LAKH ? ownCover : base
  const topDed = clamp(topBase, 3 * LAKH, 25 * LAKH)
  const calledFor = !trimmed && selected - topBase >= A.minTopUp
  // If none is called for but the user wants one anyway: a step up to the next level, never below the smallest worthwhile top-up.
  const topSize = calledFor ? selected - topBase : Math.max(A.minTopUp, levelTotal(Math.min(2, lvl + 1)) - topBase)
  const topTotal = topBase + topSize
  const topOpt: TopUpOption = {
    recommended: calledFor,
    size: topSize, total: topTotal, deductible: topDed,
    premium: load(superTopUpPremium({ eldestAge: age, spouse: i.spouse, kids: kidsForPrice, topUp: topSize, deductible: topDed, city: i.city })),
    reasons: topUpReasons,
    why: calledFor
      ? `Pays once a year’s bills cross ${inr(topDed)}, taking the family’s total to ${inr(topTotal)}. Suggested because: ${topUpReasons.join(' ').replace(/\.$/, '')}. A super top-up adds up every claim in the year, a plain top-up looks at one bill at a time, so we suggest the super top-up.`
      : ownCover >= selected ? `You already hold ${inr(ownCover)}, more than the ${inr(selected)} we would aim for, so you do not need one.` : trimmed ? 'Your premiums would be heavy with a super top-up, so the base plan comes first. Add it later as income grows.' : `Your answers do not call for one: ${inr(topBase)} is enough for the hospitals you would use. Add it if you want more headroom.`,
  }
  const matBase = healthBasePremium({ eldestAge: age, spouse: i.spouse, kids: kidsForPrice, sumInsured: base, city: i.city })
  const maternityOption = { premium: { low: roundTo(matBase.mid * M.maternityShare.low, 100), mid: roundTo(matBase.mid * M.maternityShare.mid, 100), high: roundTo(matBase.mid * M.maternityShare.high, 100) } }
  const baseOnlyWhy = superTopUp > 0 ? null
    : trimmed ? 'Your premiums would be heavy with a super top-up, so the base plan comes first. You can add the top-up later as income grows.'
    : `Hospitals ${i.city === 'other' ? 'near you' : 'like the ones you would use'} rarely run past a ${inr(base)} plan, and your answers do not point to a large bill. Add a super top-up if that changes.`
  const nextLvl = lvl < 2 ? levelTotal(lvl + 1) : null
  const stretch = nextLvl && nextLvl - base >= A.minTopUp && nextLvl > recommendedTotal ? { total: nextLvl, topUp: nextLvl - base } : null

  const flags: Flag[] = []
  if (ownCover === 0) flags.push({ level: 'critical', text: employer > 0 ? 'You have no health plan of your own. Employer cover ends when the job does, and new waiting periods start only when you buy.' : 'You have no health cover. A single hospital stay could take your savings.' })
  else if (ownCover < base) flags.push({ level: 'gap', text: `Your own plan (${inr(ownCover)}) is below a clean ${inr(base)} base.` })
  if (ownCover >= base && ownCover < recommendedTotal) flags.push({ level: 'gap', text: `A super top-up of about ${inr(recommendedTotal - ownCover)} gets you to ${inr(recommendedTotal)} cheaply.` })
  if (ownCover === 0 && employer > 0) flags.push({ level: 'warn', text: 'We sized your cover as if the employer plan did not exist.' })
  if (i.knownCondition) flags.push({ level: 'info', text: `Disclose it. The premium may be loaded about 15–30%, waiting for a known condition is up to ${A.pedWaitMonthsMax} months, and after ${A.moratoriumMonths} months of continuous cover an insurer cannot reject a claim for non-disclosure, except fraud.` })
  if (i.babyPlanned) flags.push({ level: 'info', text: 'A planned baby is priced in as an extra child, plus a maternity add-on. Maternity has a two to four year wait, so buy now. The baby counts as another person on the plan when we size the cover.' })
  if (age > 65) flags.push({ level: 'info', text: 'There is no maximum entry age for health cover since April 2024, but premiums and co-pays rise. Compare senior plans.' })
  const pct = pctOf(b.own.mid)
  if (trimmed) flags.push({ level: 'info', text: `The full stack would cost about ${pctOf(build(selected).own.mid).toFixed(0)}% of your income, so we put the base plan first and left the super top-up for later.` })
  if (pct > 8) flags.push({ level: 'warn', text: `Your own premiums are about ${pct.toFixed(1)}% of income, which is heavy. A smaller top-up or a higher deductible lowers the cost.` })
  const parentPct = pctOf(parentsP.mid)
  if (parentsP.mid > 0 && parentPct > 6) flags.push({ level: 'warn', text: `Your parents’ plans alone are about ${parentPct.toFixed(1)}% of your income. A 10–20% co-pay on theirs lowers the cost. Your own cover is not reduced for this.` })

  const steps: Step[] = [
    { label: 'Cover for one adult at these hospitals', formula: `${hospitalLabel[i.hospital]} in a ${i.city === 'metro' ? 'metro' : i.city === 'tier2' ? 'tier-2 city' : 'smaller town'}${lvl !== (i.hospital === 'top' ? 2 : i.hospital === 'standard' ? 1 : 0) ? ', raised because of your answers' : ''}. Local / good / top hospitals: ${inr(t.low)} / ${inr(t.mid)} / ${inr(t.high)}`, value: inr(levels[lvl]) },
    { label: 'Adjustment for the people on the plan', formula: `1 + ${A.familyLoad.spouse} per extra adult + ${A.familyLoad.child} per child (up to ${A.familyLoad.maxChildren}) = 1 + ${i.spouse ? A.familyLoad.spouse : 0} + ${Math.min(A.familyLoad.maxChildren, kidsForPrice)} × ${A.familyLoad.child}. One limit is shared by everyone`, value: `× ${factor.toFixed(2)}` },
    { label: 'Total cover to aim for (base + super top-up)', formula: trimmed ? 'Base plan only, to keep your premium affordable' : `${inr(levels[lvl])} × ${factor.toFixed(2)}, rounded to the nearest ${inr(A.roundTo)}, never above ${inr(A.maxTotal)}. A gap under ${inr(A.minTopUp)} above the base is left to the base`, value: inr(recommendedTotal) },
    { label: 'Base plan', formula: `${members >= 3 && base === 15 * LAKH ? 'Three or more people share one limit, so it starts higher. ' : ''}Large enough that ordinary admissions${i.babyPlanned ? ' and a delivery' : ''} are cashless`, value: inr(base) },
    { label: 'Super top-up', formula: superTopUp > 0 ? 'Total − base. It pays once a year’s bills cross the deductible' : 'Not suggested for your answers', value: superTopUp > 0 ? `${inr(superTopUp)} over ${inr(deductible)}` : '—' },
    { label: 'Family premium', formula: `You${i.spouse ? ', spouse' : ''}${kids ? `, ${kids} ${kids === 1 ? 'child' : 'children'}` : ''}${i.babyPlanned ? ', plus the baby you plan' : ''} on one floater`, value: `${inrFull(sumRange(baseP, topP).low)} to ${inrFull(sumRange(baseP, topP).high)} a year` },
    ...(i.knownCondition ? [{ label: 'Known-condition loading', formula: 'Insurers may load premiums by about 15–30%. They decide case by case', value: 'Included in the range' }] : []),
    ...(maternity ? [{ label: 'Maternity add-on', formula: 'Roughly 15–35% of the base premium. A rule of thumb, not a rate sheet', value: `${inrFull(maternity.low)} to ${inrFull(maternity.high)} a year` }] : []),
    { label: 'Why it needs a review', formula: `At ${(A.medicalInflation * 100).toFixed(0)}% medical inflation, ${inr(10 * LAKH)} buys what ${inr(realValue(10 * LAKH, 10))} buys today in 10 years`, value: 'Review every 3 to 5 years' },
  ]

  return {
    plans, basePlans, topUp: topOpt, maternityOption, baseStanding: ownCover >= base ? 'sorted' : ownCover > 0 ? 'partly' : 'fresh', baseSurplus: Math.max(0, ownCover - base),
    topUpReasons, baseOnlyWhy, stretch,
    total: { low: t.low, mid: recommendedTotal, high: t.high },
    recommendedTotal, base, superTopUp, deductible,
    parents: pCount > 0 ? { count: pCount, basePerParent: parentBase, premium: parentsP } : null,
    premium: { base: baseP, topUp: topP, parents: parentsP, maternity, total },
    premiumPctOfIncome: pct, trimmed, loaded: i.knownCondition, toBuy, deductibleOption,
    shortfall, covered, standing: covered ? 'sorted' : toBuy.kind === 'topup' ? 'partly' : 'fresh', surplus: Math.max(0, ownCover - recommendedTotal),
    decay: [5, 10, 15].map((years) => ({ years, value: realValue(10 * LAKH, years) })),
    flags, steps,
    waits: { ped: A.pedWaitMonthsMax, moratorium: A.moratoriumMonths },
  }
}

/** Field guide §4: the room-rent cap worked example. Proportionate deduction cuts room-linked charges by the same ratio. */
export function roomRentDeduction(bill: { roomRentPerDay: number; days: number; associatedCharges: number; nonAssociated: number; capPerDay: number }) {
  const ratio = Math.min(1, bill.capPerDay / bill.roomRentPerDay)
  const room = bill.roomRentPerDay * bill.days
  const paid = room * ratio + bill.associatedCharges * ratio + bill.nonAssociated
  const total = room + bill.associatedCharges + bill.nonAssociated
  return { ratio, paid, youPay: total - paid, total }
}

/** Super top-up payout for one year's bills (field guide §4). */
export function healthPayout(bill: number, base: number, topUp: number, deductible: number) {
  const fromBase = Math.min(bill, base)
  const fromTop = bill > deductible ? Math.min(bill - deductible, topUp) : 0
  return { fromBase, fromTop, youPay: Math.max(0, bill - fromBase - fromTop) }
}
