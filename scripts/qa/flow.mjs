// End-to-end walkthrough in real headless Chrome: drives the UI like a person (types, taps Continue)
// for several personas and records what each screen shows.
//
//   npm run build && node scripts/qa/flow.mjs                 # serve dist/, print a summary
//   node scripts/qa/flow.mjs --url http://host/page --out a.json   # snapshot any build, to diff two builds
import { writeFileSync } from 'node:fs'
import { serve, launch } from './cdp.mjs'
import { PERSONAS, walk } from './walk.mjs'

const argv = (name) => { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : null }

let base = argv('url')
let server
if (!base) { const s = await serve(new URL('../../dist', import.meta.url).pathname); server = s.server; base = `http://127.0.0.1:${s.port}/` }

const out = {}
let problems = 0
const b = await launch({ width: 430, height: 900, mobile: true })
for (const name of Object.keys(PERSONAS)) {
  const { seen, problem } = await walk(b, base, name, { log: console.log })
  out[name] = seen
  if (problem) problems++
  console.log(name.padEnd(8), seen.map((s) => s.screen).join(' → '))
}
const errs = b.consoleMsgs.filter((m) => m.type === 'error' || m.type === 'exception')
if (errs.length) { problems += errs.length; console.log('console errors:', errs) }
const outFile = argv('out')
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1))
await b.close(); server?.close()
console.log(problems ? `PROBLEMS: ${problems}` : 'every persona reached the end with no console errors')
process.exit(problems ? 1 : 0)
