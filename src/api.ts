import type { Lead } from './lead'

export const LEADS_URL: string | undefined = import.meta.env.VITE_LEADS_WEBHOOK_URL || undefined

type Fetch = typeof fetch
// The sheet answered and said no (or errored): resending the same lead would not help.
export class Rejected extends Error {}
// The server answered with an error status: usually temporary, so the lead is worth retrying later.
class HttpError extends Error {}

// Sends one lead to the Google Sheet web app. Resolves 'sent' (or 'skipped' when no webhook is
// configured, e.g. a local preview) and throws if the sheet could not be reached or refused it.
export async function postLead(url: string | undefined, lead: Lead, fetchImpl: Fetch = fetch, timeoutMs = 60000): Promise<'sent' | 'skipped'> {
  if (!url) { console.warn('VITE_LEADS_WEBHOOK_URL is not set: lead not saved'); return 'skipped' }
  const init = { method: 'POST', body: JSON.stringify(lead), keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }
  const timer = new AbortController()
  const t = setTimeout(() => timer.abort(), timeoutMs)
  try {
    try {
      const res = await fetchImpl(url, { ...init, signal: timer.signal })
      if (!res.ok) throw new HttpError('HTTP ' + res.status)
      const body = await res.json().catch(() => null)
      if (body && body.ok === false) throw new Rejected(body.error || 'rejected')
      return 'sent'
    } catch (e) {
      if (e instanceof Rejected || e instanceof HttpError || (e as Error).name === 'AbortError') throw e
      // Some browsers block reading Google's redirected reply. The write still happens, and the
      // sheet de-duplicates on the session id, so a blind resend cannot create a second row.
      await fetchImpl(url, { ...init, mode: 'no-cors', signal: timer.signal })
      return 'sent'
    }
  } finally { clearTimeout(t) }
}
