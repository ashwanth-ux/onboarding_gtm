export const LAKH = 100_000
export const CRORE = 10_000_000

const trim = (n: number, dp: number) => {
  const s = n.toFixed(dp)
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** Indian digit grouping: 12,34,567 */
export function group(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const neg = n < 0
  const s = Math.round(Math.abs(n)).toString()
  let out = s
  if (s.length > 3) {
    const last3 = s.slice(-3)
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    out = `${rest},${last3}`
  }
  return (neg ? '-' : '') + out
}

/** ₹2.35 crore · ₹45 lakh · ₹9,500. Never prints NaN. */
export function inr(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= CRORE * 0.995) return `${sign}₹${trim(a / CRORE, 2)} crore`
  if (a >= LAKH) {
    const l = Math.round((a / LAKH) * 100) / 100
    if (l >= 100) return `${sign}₹1 crore`
    return `${sign}₹${trim(l, 2)} lakh`
  }
  return `${sign}₹${group(a)}`
}

/** Short form for tight spaces: ₹2.35 Cr · ₹45 L */
export function inrShort(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= CRORE * 0.995) return `${sign}₹${trim(a / CRORE, 2)} Cr`
  if (a >= LAKH) return `${sign}₹${trim(a / LAKH, 2)} L`
  if (a >= 1000) return `${sign}₹${trim(a / 1000, 1)}k`
  return `${sign}₹${group(a)}`
}

export const inrFull = (n: number) => (Number.isFinite(n) ? `₹${group(n)}` : '—')

export const pct = (n: number, dp = 1) => (Number.isFinite(n) ? `${trim(n, dp)}%` : '—')
export const times = (n: number, dp = 1) => (Number.isFinite(n) ? `${trim(n, dp)}×` : '—')

export const roundUpTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step
export const roundTo = (n: number, step: number) => Math.round(n / step) * step
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Parse "₹24 lakh", "2.5cr", "1,20,000", "45k" → rupees. Returns null if not a number. */
export function parseMoney(input: string): number | null {
  const s = input.toLowerCase().replace(/[₹,\s]/g, '').replace(/rs\.?|inr/g, '')
  const m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lacs|lakh|lakhs|lpa|cr|crore|crores)?$/)
  if (!m) return null
  const v = parseFloat(m[1])
  const u = m[2]
  if (!u) return v
  if (u === 'k' || u === 'thousand') return v * 1e3
  if (u === 'cr' || u === 'crore' || u === 'crores') return v * CRORE
  return v * LAKH
}
