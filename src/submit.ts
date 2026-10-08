import type { Lead } from './lead'
import { Rejected } from './api'

export type Outcome = 'saved' | 'in-progress'

// Google can take several seconds, sometimes far more, to write a row. Waiting that long in front of
// a customer is worse than the small risk of a late failure, so: answer quickly when the sheet does,
// otherwise tell the person they're on the list and keep the save going in the background. A save
// that fails after that is kept (see outbox.ts) and retried on their next visit.
export async function submitLead(lead: Lead, send: (lead: Lead) => Promise<unknown>, keep: (lead: Lead) => void, patienceMs = 3500): Promise<Outcome> {
  const sending = send(lead)
  const slow = Symbol('slow')
  let timer: ReturnType<typeof setTimeout> | undefined
  const first = await Promise.race([
    sending.then(() => 'saved' as const, (error) => ({ error })),
    new Promise<typeof slow>((resolve) => { timer = setTimeout(() => resolve(slow), patienceMs) }),
  ])
  clearTimeout(timer)
  if (first === 'saved') return 'saved'
  if (first === slow) {
    sending.catch((error) => { if (!(error instanceof Rejected)) keep(lead) })
    return 'in-progress'
  }
  throw first.error
}
