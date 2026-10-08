import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Rejected } from '../src/api'
import type { Lead } from '../src/lead'
import { flushOutbox, queueLead } from '../src/outbox'
import { submitLead } from '../src/submit'

const lead = { phone: '+919876543210', sessionId: 's1' } as unknown as Lead
const later = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms))
const failLater = (ms: number, e: Error) => new Promise<never>((_, rej) => setTimeout(() => rej(e), ms))

describe('submitLead', () => {
  it('reports saved when the sheet answers quickly', async () => {
    const keep = vi.fn()
    expect(await submitLead(lead, () => later(5, 'ok'), keep, 100)).toBe('saved')
    expect(keep).not.toHaveBeenCalled()
  })
  it('lets a quick failure through so the person can retry', async () => {
    const keep = vi.fn()
    await expect(submitLead(lead, () => failLater(5, new Error('offline')), keep, 100)).rejects.toThrow('offline')
    expect(keep).not.toHaveBeenCalled()
  })
  it('moves on when the sheet is slow, and the save still completes', async () => {
    const keep = vi.fn()
    const done = vi.fn()
    expect(await submitLead(lead, () => later(60, 'ok').then(done), keep, 10)).toBe('in-progress')
    await later(100, 0)
    expect(done).toHaveBeenCalled()
    expect(keep).not.toHaveBeenCalled()
  })
  it('keeps the lead for later when a slow save then fails', async () => {
    const keep = vi.fn()
    expect(await submitLead(lead, () => failLater(40, new Error('network')), keep, 10)).toBe('in-progress')
    await later(80, 0)
    expect(keep).toHaveBeenCalledWith(lead)
  })
  it('does not keep a lead the sheet explicitly refused', async () => {
    const keep = vi.fn()
    expect(await submitLead(lead, () => failLater(40, new Rejected('bad phone')), keep, 10)).toBe('in-progress')
    await later(80, 0)
    expect(keep).not.toHaveBeenCalled()
  })
})

describe('outbox', () => {
  let store: Record<string, string>
  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } })
  })

  it('sends queued leads and empties itself', async () => {
    queueLead({ ...lead, sessionId: 'a' } as Lead); queueLead({ ...lead, sessionId: 'b' } as Lead)
    const send = vi.fn().mockResolvedValue(undefined)
    await flushOutbox(send)
    expect(send).toHaveBeenCalledTimes(2)
    expect(Object.keys(store)).toEqual([])
  })
  it('keeps a lead that still cannot be sent', async () => {
    queueLead({ ...lead, sessionId: 'a' } as Lead)
    await flushOutbox(vi.fn().mockRejectedValue(new Error('offline')))
    expect(JSON.parse(store['kyfr-pending-leads'])).toHaveLength(1)
  })
  it('queues one entry per session and caps the backlog', () => {
    for (let i = 0; i < 9; i++) queueLead({ ...lead, sessionId: 's' + i } as Lead)
    queueLead({ ...lead, sessionId: 's8', phone: '+919000000000' } as unknown as Lead)
    const q = JSON.parse(store['kyfr-pending-leads'])
    expect(q).toHaveLength(5)
    expect(q.filter((l: Lead) => l.sessionId === 's8')).toHaveLength(1)
  })
  it('does nothing when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } })
    expect(() => queueLead(lead)).not.toThrow()
    await expect(flushOutbox(vi.fn())).resolves.toBeUndefined()
  })
})
