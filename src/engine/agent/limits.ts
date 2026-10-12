import { CRORE, LAKH, clamp } from './format'

/**
 * Single source of truth for every input guardrail.
 * The UI uses these for slider ranges and inline hints; the engine uses them to clamp,
 * so a hand-typed or URL-injected value can never produce a nonsensical output.
 */
export interface FieldLimit {
  min: number
  max: number
  step: number
  /** Value used when the user has not answered. */
  default: number
  /** Shown when we had to move the user's number. */
  why: string
}

export const LIMITS = {
  age: { min: 18, max: 70, step: 1, default: 30, why: 'Insurers sell to adults 18 and over. New term cover is rarely sold past 65.' },
  income: { min: 2 * LAKH, max: 20 * CRORE, step: 50_000, default: 12 * LAKH, why: 'Annual income before tax, between ₹2 lakh and ₹20 crore.' },
  monthlySpend: { min: 8_000, max: 15 * LAKH, step: 1_000, default: 50_000, why: 'Monthly household spending, excluding EMIs.' },
  loans: { min: 0, max: 15 * CRORE, step: 50_000, default: 0, why: 'Total loans still outstanding (home, car, personal).' },
  freeSavings: { min: 0, max: 25 * CRORE, step: 50_000, default: 0, why: 'Savings you could spare, not counting your emergency fund or retirement money.' },
  existingTerm: { min: 0, max: 100 * CRORE, step: 500_000, default: 0, why: 'Individual term cover you already hold.' },
  goalsToday: { min: 0, max: 10 * CRORE, step: 100_000, default: 0, why: 'Cost of big goals in today’s money.' },
  childAge: { min: 0, max: 24, step: 1, default: 3, why: 'Youngest child’s age, 0 to 24.' },
  parentAge: { min: 45, max: 95, step: 1, default: 62, why: 'Parent’s age, 45 to 95.' },
  years: { min: 3, max: 40, step: 1, default: 20, why: 'Years your family would need support, 3 to 40.' },
  employerHealth: { min: 0, max: 5 * CRORE, step: 100_000, default: 0, why: 'Cover your employer provides.' },
  ownHealth: { min: 0, max: 5 * CRORE, step: 100_000, default: 0, why: 'Cover you pay for yourself.' },
  savingsForBill: { min: 0, max: 5 * CRORE, step: 100_000, default: 5 * LAKH, why: 'A hospital bill you could pay from savings.' },
  vehicleValue: { min: 10_000, max: 5 * CRORE, step: 5_000, default: 600_000, why: 'Current market value of the vehicle.' },
  ncb: { min: 0, max: 50, step: 5, default: 0, why: 'No-claim bonus is 0, 20, 25, 35, 45 or 50 percent.' },
  goalCost: { min: 50_000, max: 10 * CRORE, step: 50_000, default: 10 * LAKH, why: 'What the goal costs in today’s money, between ₹50,000 and ₹10 crore.' },
  goalYears: { min: 0, max: 40, step: 1, default: 5, why: 'Years until you need the money, 0 to 40.' },
  parentSupport: { min: 0, max: 5 * LAKH, step: 1_000, default: 15_000, why: 'What you send or spend on your parents each month, between ₹0 and ₹5 lakh.' },
} as const satisfies Record<string, FieldLimit>

export type LimitKey = keyof typeof LIMITS

export interface Clamped {
  value: number
  adjusted: boolean
  message?: string
}

/** Clamp a raw number to a field's range. NaN / Infinity / negatives fall back safely and say why. */
export function clampField(key: LimitKey, raw: unknown): Clamped {
  const L: FieldLimit = LIMITS[key]
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return { value: L.default, adjusted: true, message: L.why }
  const v = clamp(n, L.min, L.max)
  if (v !== n) return { value: v, adjusted: true, message: L.why }
  return { value: v, adjusted: false }
}

/** Cross-field sanity checks. Return human messages, never throw. */
export function crossChecks(p: { income?: number; monthlySpend?: number; loans?: number; freeSavings?: number }): string[] {
  const out: string[] = []
  const { income, monthlySpend, loans, freeSavings } = p
  if (income && monthlySpend && monthlySpend * 12 > income * 1.5)
    out.push('Your spending is much higher than your income. Check both numbers.')
  if (income && loans && loans > income * 12) out.push('Loans above 12× yearly income are rare. Check the amount.')
  if (income && freeSavings && freeSavings > income * 25) out.push('Savings above 25× yearly income are unusual. Check the amount.')
  return out
}
