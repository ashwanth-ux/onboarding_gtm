import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postLead } from '../src/api'
import { calcFRI, calcPillars, calcWeights } from '../src/engine/crisp'
import { krCandidates, krPrioritise } from '../src/engine/report'
import { LEAD_COLUMNS, PAYLOAD_KEYS, buildLead, newSession, normaliseEmail, normalisePhone } from '../src/lead'
import { ST, deriveInp } from '../src/state'

const DEFAULTS = { ...ST }
beforeEach(() => { Object.assign(ST, DEFAULTS) })

function report() {
  const inp = deriveInp()
  const pillars = calcPillars(inp)
  const weights = calcWeights(inp)
  const fri = calcFRI(pillars, weights)
  const moves = krPrioritise(krCandidates(inp, pillars, weights, fri))
  return { inp, pillars, weights, fri, moves }
}

describe('normalisePhone', () => {
  it('accepts Indian mobiles however they are typed', () => {
    for (const raw of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', '(98765) 43210']) {
      expect(normalisePhone(raw), raw).toBe('+919876543210')
    }
  })
  it('rejects anything that is not a 10-digit mobile', () => {
    for (const raw of ['', '12345', '5876543210', '98765432101', '+1 415 555 0100', 'abcdefghij', '98765x3210']) {
      expect(normalisePhone(raw), raw).toBeNull()
    }
  })
})

describe('normaliseEmail', () => {
  it('trims and lowercases', () => expect(normaliseEmail('  Asha.Rao@Example.COM ')).toBe('asha.rao@example.com'))
  it('rejects malformed addresses', () => {
    for (const raw of ['', 'asha', 'asha@', '@example.com', 'a b@example.com', 'asha@example']) expect(normaliseEmail(raw), raw).toBeNull()
  })
})

describe('buildLead', () => {
  const contact = { email: 'asha@example.com', phone: '+919876543210' }

  it('sends exactly the columns the sheet expects, no more and no fewer', () => {
    Object.assign(ST, { income: 50000, spending: 40000, savings: 30000, emi: 15000, knownScore: 650, cardBalance: 40000, cardLimit: 50000, deps: 2 })
    const lead = buildLead(contact, ST, report())
    expect(Object.keys(lead).sort()).toEqual([...PAYLOAD_KEYS].sort())
  })

  it('records the answers and the derived figures', () => {
    Object.assign(ST, { age: 31, deps: 3, income: 50000, spending: 40000, savings: 30000, emi: 15000, knownScore: 650, cardBalance: 40000, cardLimit: 50000 })
    const lead = buildLead(contact, ST, report(), { device: 'Mobile' })
    expect(lead).toMatchObject({ phone: '+919876543210', email: 'asha@example.com', age: 31, dependents: 3, income: 50000, spending: 40000, savings: 30000, emi: 15000, creditScore: 650, emiPct: 30, cardUtilPct: 80, runwayMonths: 0.8, device: 'Mobile' })
    expect(lead.readiness).toBeGreaterThanOrEqual(0)
    expect(lead.priority1).toBeTruthy()
  })

  it('leaves out what does not apply instead of writing a misleading zero', () => {
    Object.assign(ST, { age: 28, income: 100000, spending: 50000, knownScore: null, noCardBalance: true, cardLimit: 100000 })
    const lead = buildLead(contact, ST, report())
    expect(lead.creditScore).toBe('')
    expect([lead.cardBalance, lead.cardLimit, lead.cardUtilPct]).toEqual(['', '', ''])
    expect(lead.retirementCorpus).toBe('')
  })

  it('keeps only the origin and path of the referrer, never its query string', () => {
    const lead = buildLead(contact, ST, report(), { referrer: 'https://news.example.com/story?token=secret#frag' })
    expect(lead.referrer).toBe('https://news.example.com/story')
  })

  it('reads campaign tags from the address', () => {
    const lead = buildLead(contact, ST, report(), { search: '?utm_source=instagram&utm_medium=story&utm_campaign=launch' })
    expect([lead.utmSource, lead.utmMedium, lead.utmCampaign]).toEqual(['instagram', 'story', 'launch'])
  })

  it('reuses the session id for a resend and changes it for a fresh run', () => {
    const a = buildLead(contact, ST, report()).sessionId
    expect(buildLead(contact, ST, report()).sessionId).toBe(a)
    newSession()
    expect(buildLead(contact, ST, report()).sessionId).not.toBe(a)
  })
})

describe('Google Sheet script stays in step with the app', () => {
  const gs = readFileSync(new URL('../scripts/google-sheet/Code.gs', import.meta.url), 'utf8')
  const list = (name: string) => [...(gs.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1])

  it('lists the same columns, in the same order, as lead-columns.json', () => {
    expect(list('COLUMNS')).toEqual(LEAD_COLUMNS.map((c) => c.key))
  })
  it('treats exactly the numeric columns as numbers', () => {
    const numeric = LEAD_COLUMNS.filter((c) => ['rupee', 'number', 'integer', 'percent', 'months', 'toppct', 'score'].includes(c.kind)).map((c) => c.key)
    expect(list('NUMERIC')).toEqual(numeric)
  })
  it('owns the team columns the app never sends', () => {
    expect(list('TEAM_COLUMNS')).toEqual(LEAD_COLUMNS.filter((c) => c.owner === 'team').map((c) => c.key))
  })
  it('applies the same alignment as the sheet to every column', () => {
    for (const c of LEAD_COLUMNS) expect(gs, c.key).toContain(`${c.key}: '${c.align}'`)
  })
  it('applies the same display format as the sheet to every column', () => {
    for (const c of LEAD_COLUMNS) expect(gs, c.key).toContain(`${c.key}: ${JSON.stringify(c.format)}`)
  })
})

describe('postLead', () => {
  const lead = { phone: '+919876543210' } as never
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response

  it('does nothing, and says so, when no webhook is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await postLead(undefined, lead, vi.fn())).toBe('skipped')
    warn.mockRestore()
  })
  it('sends the lead as plain text so the browser makes no preflight request', async () => {
    const f = vi.fn().mockResolvedValue(ok({ ok: true }))
    expect(await postLead('https://script.example/exec', lead, f)).toBe('sent')
    const [, init] = f.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(init.headers['Content-Type']).toMatch(/^text\/plain/)
    expect(JSON.parse(init.body)).toEqual(lead)
  })
  it('surfaces a refusal from the sheet', async () => {
    const f = vi.fn().mockResolvedValue(ok({ ok: false, error: 'bad phone' }))
    await expect(postLead('https://script.example/exec', lead, f)).rejects.toThrow('bad phone')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('does not claim success when the server itself errors', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(postLead('https://script.example/exec', lead, f)).rejects.toThrow('HTTP 500')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('falls back to a blind send when the reply cannot be read', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ type: 'opaque' } as Response)
    expect(await postLead('https://script.example/exec', lead, f)).toBe('sent')
    expect(f.mock.calls[1][1].mode).toBe('no-cors')
  })
  it('fails when the connection is down for both attempts', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(postLead('https://script.example/exec', lead, f)).rejects.toThrow()
  })
})
