// Checks the sign-up form on the last screen against a stand-in for the Google Sheet web app:
// validation, the exact row that would be written, double-submits, spam trap, and failure handling.
//
//   node scripts/qa/lead.mjs        # builds into a temp folder with a local webhook, then drives Chrome
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve, launch } from './cdp.mjs'
import { walk } from './walk.mjs'

const hits = []
let mode = 'cors' // cors | nocors | error500 | refuse
const hook = createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); return res.end() }
    hits.push({ contentType: req.headers['content-type'], lead: JSON.parse(body || '{}') })
    const cors = mode === 'nocors' ? {} : { 'access-control-allow-origin': '*' }
    if (mode === 'error500') { res.writeHead(500, cors); return res.end('{}') }
    res.writeHead(200, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify({ ok: true }))
  })
})
await new Promise((r) => hook.listen(0, '127.0.0.1', r))
const hookUrl = `http://127.0.0.1:${hook.address().port}/exec`

const out = mkdtempSync(join(tmpdir(), 'kyfr-lead-'))
execSync(`npx vite build --outDir ${out} --emptyOutDir`, { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, VITE_LEADS_WEBHOOK_URL: hookUrl }, stdio: 'pipe' })
const { server, port } = await serve(out)
const base = `http://127.0.0.1:${port}/`

let bad = 0
const check = (name, ok, extra = '') => { console.log(ok ? '  ok  ' : ' FAIL ', name, ok ? '' : extra); if (!ok) bad++ }
const form = (b, email, phone, trap = '') => b.eval(`(()=>{const set=(id,v)=>{const e=document.getElementById(id); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(e,v); e.dispatchEvent(new Event('input',{bubbles:true}))}; set('notify-email',${JSON.stringify(email)}); set('notify-phone',${JSON.stringify(phone)}); set('notify-website',${JSON.stringify(trap)}); document.getElementById('notify-btn').click(); return 'ok'})()`)
const state = (b) => b.eval(`JSON.stringify({btn:document.getElementById('notify-btn').textContent, disabled:document.getElementById('notify-btn').disabled, error:document.getElementById('notify-error').textContent, inputsDisabled:document.getElementById('notify-email').disabled})`).then(JSON.parse)

const b = await launch({ width: 430, height: 900, mobile: true })
const { problem } = await walk(b, base, 'family')
check('reached the last screen', !problem)

console.log('validation')
await form(b, 'not-an-email', '9876543210'); await b.wait(300)
let s = await state(b); check('bad email is refused with a message', /valid email/i.test(s.error) && hits.length === 0, JSON.stringify(s))
await form(b, 'asha@example.com', '12345'); await b.wait(300)
s = await state(b); check('bad phone is refused with a message', /10-digit/i.test(s.error) && hits.length === 0, JSON.stringify(s))

console.log('spam trap')
await form(b, 'bot@example.com', '9876543210', 'http://spam.example'); await b.wait(600)
check('a filled hidden field sends nothing', hits.length === 0, String(hits.length))
await b.goto(base, 600); await walk(b, base, 'family')

console.log('a real sign-up')
await form(b, ' Asha.Rao@Example.com ', '98765 43210'); await b.wait(1200)
s = await state(b)
check('shows the confirmation and locks the form', /on the list/.test(s.btn) && s.inputsDisabled && s.error === '', JSON.stringify(s))
check('sends exactly one request', hits.length === 1, String(hits.length))
const lead = hits[0]?.lead || {}
check('sent as plain text (no preflight)', /^text\/plain/.test(hits[0]?.contentType || ''), hits[0]?.contentType)
check('phone and email are normalised', lead.phone === '+919876543210' && lead.email === 'asha.rao@example.com', JSON.stringify({ p: lead.phone, e: lead.email }))
check('answers are recorded', lead.age === 35 && lead.dependents === 2 && lead.income === 120000 && lead.spending === 70000 && lead.savings === 400000 && lead.emi === 35000 && lead.creditScore === 690 && lead.cardUtilPct === 40 && lead.lifeCover === 5000000 && lead.healthCover === 500000, JSON.stringify(lead))
check('report is recorded', typeof lead.readiness === 'number' && !!lead.priority1 && !!lead.sevSavings && lead.device === 'Mobile' && !!lead.sessionId, JSON.stringify(lead))
console.log('   row preview:', JSON.stringify(lead))

console.log('blocked reply (no CORS headers): still saved once from the sheet\'s point of view')
mode = 'nocors'; hits.length = 0
await b.goto(base, 600); await walk(b, base, 'starter')
await form(b, 'meera@example.com', '9812300003'); await b.wait(1500)
s = await state(b); check('shows the confirmation', /on the list/.test(s.btn), JSON.stringify(s))
check('every request carries the same session id (so the sheet keeps one row)', hits.length >= 1 && new Set(hits.map((h) => h.lead.sessionId)).size === 1, String(hits.length))

console.log('server error: do not claim it was saved')
mode = 'error500'; hits.length = 0
await b.goto(base, 600); await walk(b, base, 'starter')
await form(b, 'meera@example.com', '9812300003'); await b.wait(1200)
s = await state(b); check('shows an error and lets the person retry', /couldn.t save/i.test(s.error) && !s.disabled && /notify me/i.test(s.btn), JSON.stringify(s))

console.log('offline: do not claim it was saved')
mode = 'refuse'; hook.close(); hits.length = 0
await b.goto(base, 600); await walk(b, base, 'starter')
await form(b, 'meera@example.com', '9812300003'); await b.wait(2500)
s = await state(b); check('shows an error and lets the person retry', /couldn.t save/i.test(s.error) && !s.disabled, JSON.stringify(s))

const errs = b.consoleMsgs.filter((m) => m.type === 'exception')
check('no uncaught exceptions', errs.length === 0, JSON.stringify(errs))
await b.close(); server.close()
console.log(bad ? `\n${bad} FAILED` : '\nall sign-up checks passed')
process.exit(bad ? 1 : 0)
