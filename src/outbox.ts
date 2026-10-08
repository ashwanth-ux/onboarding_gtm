import type { Lead } from './lead'

const KEY = 'kyfr-pending-leads'
const KEEP = 5

function read(): Lead[] {
  try { const q = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(q) ? q : [] } catch { return [] }
}

// A lead that could not be delivered is kept in this browser and sent again on the next visit.
export function queueLead(lead: Lead) {
  try {
    const q = read().filter((l) => l.sessionId !== lead.sessionId)
    q.push(lead)
    localStorage.setItem(KEY, JSON.stringify(q.slice(-KEEP)))
  } catch { /* storage unavailable (private mode): nothing more we can do */ }
}

export async function flushOutbox(send: (lead: Lead) => Promise<unknown>) {
  const q = read()
  if (!q.length) return
  try { localStorage.removeItem(KEY) } catch { return }
  for (const lead of q) {
    try { await send(lead) } catch { queueLead(lead) }
  }
}
