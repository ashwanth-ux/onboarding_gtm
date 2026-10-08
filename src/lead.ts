import columns from './data/lead-columns.json'
import { SEVERITY } from './engine/crisp'
import { creditInsight, incomeInsight } from './engine/benchmark'

export type LeadColumn = { key: string, label: string, group: string, kind: string, width: number, format: string, align: string, owner?: string }
export const LEAD_COLUMNS: LeadColumn[] = columns

// Columns the app sends. The rest ('team' owner) belong to whoever follows the lead up.
export const PAYLOAD_KEYS = LEAD_COLUMNS.filter((c) => c.owner !== 'team' && c.key !== 'submittedAt').map((c) => c.key)

export type Lead = Record<string, string | number>

export function normalisePhone(raw: string): string | null {
  let d = String(raw).replace(/[\s\-().]/g, '').replace(/^\+/, '')
  if (/^91\d{10}$/.test(d)) d = d.slice(2)
  else if (/^0\d{10}$/.test(d)) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? '+91' + d : null
}

export function normaliseEmail(raw: string): string | null {
  const e = String(raw).trim().toLowerCase()
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null
}

let sessionId = newId()
function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)
}
// One session = one run through the flow. A resend after a bad connection reuses it so the sheet
// updates the same row; "start over" begins a new one so a second attempt is its own row.
export function newSession() { sessionId = newId() }

const SEVERITY_LABEL: Record<string, string> = { CRITICAL: 'Critical', CAUTION: 'Caution', IMPROVE: 'Improve', OK: 'On track' }
const sev = (score: number) => SEVERITY_LABEL[SEVERITY(score)[0]]

export type Context = { device?: string, search?: string, referrer?: string }

export function buildLead(contact: { email: string, phone: string }, st: any, report: any, ctx: Context = {}): Lead {
  const { inp, pillars, fri, moves } = report
  const hasCard = !st.noCardBalance && st.cardLimit > 0
  const params = new URLSearchParams(ctx.search || '')
  const cap = (s: string) => String(s || '').slice(0, 120)
  let referrer = ''
  try { if (ctx.referrer) { const u = new URL(ctx.referrer); referrer = u.origin + u.pathname } } catch { /* not a URL */ }
  return {
    phone: contact.phone,
    email: contact.email,
    age: st.age,
    dependents: st.deps,
    income: st.income,
    spending: st.spending,
    incomeRank: st.income > 0 ? incomeInsight(st.income).top : '',
    savings: st.savings,
    sip: st.sip,
    retirementCorpus: st.age >= 50 ? st.retirementCorpus : '',
    runwayMonths: inp.liq,
    emi: st.emi,
    creditScore: st.knownScore != null ? st.knownScore : '',
    emiPct: inp.foi,
    cardBalance: hasCard ? st.cardBalance : '',
    cardLimit: hasCard ? st.cardLimit : '',
    cardUtilPct: hasCard ? inp.util : '',
    creditBand: creditInsight(pillars).band,
    lifeCover: st.lifeCover,
    healthCover: st.healthCover,
    readiness: fri,
    sevSavings: sev(pillars.savings),
    sevCredit: sev(pillars.credit),
    sevInsurance: sev(pillars.protection),
    sevInvesting: sev(pillars.investment),
    priority1: moves[0] ? moves[0].title : '',
    priority2: moves[1] ? moves[1].title : '',
    priority3: moves[2] ? moves[2].title : '',
    device: ctx.device || '',
    utmSource: cap(params.get('utm_source')),
    utmMedium: cap(params.get('utm_medium')),
    utmCampaign: cap(params.get('utm_campaign')),
    referrer: referrer.slice(0, 200),
    sessionId,
  }
}
