// Shared by the QA scripts: personas, and a helper that taps through the real UI like a person.
export const PERSONAS = {
  starter: { age: 24, deps: 0, in: { 'in-income': '30000', 'in-spending': '22000', 'in-savings': '15000', 'in-sip': '0', 'in-emi': '0', 'in-life': '0', 'in-health': '0' }, noBalance: true, skipScore: true },
  family: { age: 35, deps: 2, in: { 'in-income': '120000', 'in-spending': '70000', 'in-savings': '400000', 'in-sip': '15000', 'in-emi': '35000', 'in-score': '690', 'in-balance': '60000', 'in-limit': '150000', 'in-life': '5000000', 'in-health': '500000' } },
  senior: { age: 52, deps: 1, in: { 'in-income': '250000', 'in-spending': '100000', 'in-savings': '6000000', 'in-sip': '80000', 'in-corpus': '20000000', 'in-emi': '0', 'in-score': '800', 'in-balance': '10000', 'in-limit': '800000', 'in-life': '30000000', 'in-health': '2500000' } },
  hostile: { age: 19, deps: 6, in: { 'in-income': '999999999999', 'in-spending': '5l', 'in-savings': '1cr', 'in-sip': '9999999999', 'in-emi': '400000', 'in-score': '9999', 'in-balance': '99999999', 'in-limit': '1', 'in-life': '99999999999', 'in-health': '99999999999' } },
}

export const SNAP = `(()=>{const a=document.querySelector('.screen.active'); if(!a) return null;
  return {screen:a.dataset.id, text:a.innerText.replace(/\\s+/g,' ').trim(), side:document.getElementById('side-label').textContent+' | '+document.getElementById('side-headline').textContent,
    progress:[...document.querySelectorAll('.progress-seg i')].map(i=>i.style.width||'0'), continueDisabled:(document.getElementById('btn-continue')||{}).disabled}})()`

// Walks one persona from the welcome screen until `stopAt` (default: the last screen).
// Returns what each screen showed, in order.
export async function walk(b, base, name, { stopAt = 'cta', log = () => {} } = {}) {
  const p = PERSONAS[name]
  await b.goto(base, 900)
  const seen = []
  for (let step = 0; step < 16; step++) {
    await b.wait(1500)
    const s = JSON.parse(JSON.stringify(await b.eval(SNAP)))
    if (!s) { log(name, 'no active screen at step', step); return { seen, problem: true } }
    seen.push(s)
    if (s.screen === stopAt) return { seen, problem: false }
    if (s.screen === 'about') {
      await b.eval(`(()=>{const clickN=(id,n)=>{for(let i=0;i<n;i++) document.getElementById(id).click()}; clickN('age-${p.age >= 28 ? 'up' : 'dn'}', ${Math.abs(p.age - 28)}); clickN('deps-up', ${p.deps})})()`)
    }
    for (const [id, v] of Object.entries(p.in)) await b.type('#' + id, v)
    if (s.screen === 'crd-q1' && p.skipScore) await b.click('#skip-score')
    if (s.screen === 'crd-q2' && p.noBalance) await b.click('#no-balance-toggle')
    const r = await b.click('#btn-continue')
    if (r !== 'ok') { log(name, 'stuck on', s.screen); return { seen, problem: true } }
  }
  return { seen, problem: true }
}
