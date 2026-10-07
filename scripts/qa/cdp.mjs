// Minimal Chrome DevTools driver + static server for real-browser QA. No dependencies.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' }

export function serve(dir, port = 0) {
  const s = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    const f = join(dir, p)
    if (existsSync(f)) { res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) }
    else { res.writeHead(404); res.end('nf') }
  })
  return new Promise((r) => s.listen(port, '127.0.0.1', () => r({ server: s, port: s.address().port })))
}

export async function launch({ width = 1280, height = 900, mobile = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-chrome-'))
  const port = 9300 + Math.floor(Math.random() * 400)
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
  let ver
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break } catch { await new Promise((r) => setTimeout(r, 150)) }
  }
  if (!ver) throw new Error('chrome did not start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const consoleMsgs = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result) }
    else if (d.method === 'Runtime.consoleAPICalled') consoleMsgs.push({ type: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ') })
    else if (d.method === 'Runtime.exceptionThrown') consoleMsgs.push({ type: 'exception', text: d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text })
  }
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  const setViewport = (w, h, m = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: m ? 3 : 2, mobile: m })
  await setViewport(width, height, mobile)
  const api = {
    consoleMsgs,
    setViewport,
    async goto(url, wait = 700) { await send('Page.navigate', { url }); await new Promise((r) => setTimeout(r, wait)) },
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value },
    async wait(ms) { await new Promise((r) => setTimeout(r, ms)) },
    async shot(file, { full = false } = {}) {
      let clip
      if (full) { const m = await send('Page.getLayoutMetrics'); const w = m.cssContentSize.width, h = Math.min(m.cssContentSize.height, 9000); clip = { x: 0, y: 0, width: w, height: h, scale: 1 } }
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) })
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    async click(sel) { return api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NOT FOUND'; e.scrollIntoView({block:'center'}); e.click(); return 'ok'})()`) },
    async clickText(text, sel = 'button, a, [role=radio], [role=checkbox]') { return api.eval(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.trim().replace(/\\s+/g,' ').startsWith(${JSON.stringify(text)})); if(!e) return 'NOT FOUND: '+${JSON.stringify(text)}; e.scrollIntoView({block:'center'}); e.click(); return 'ok'})()`) },
    async type(sel, value) { // real-ish typing: focus, set via native setter, input event, blur
      return api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NOT FOUND'; e.focus(); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input',{bubbles:true})); e.blur(); return 'ok'})()`)
    },
    async close() { try { ws.close() } catch {} proc.kill() },
  }
  return api
}
