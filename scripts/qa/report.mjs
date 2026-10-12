// Checks the report screen in real Chrome at phone and desktop sizes: the next-steps carousel (peek, counter,
// arrows, dots), the folded explanations, no icons, no sideways page scroll, and the full-breakdown screen.
//
//   npm run build && node scripts/qa/report.mjs
import { serve, launch } from './cdp.mjs'
import { walk } from './walk.mjs'

const { server, port } = await serve(new URL('../../dist', import.meta.url).pathname)
const base = `http://127.0.0.1:${port}/`
let bad = 0
const check = (name, ok, extra = '') => { console.log(ok ? '  ok  ' : ' FAIL ', name, ok ? '' : extra); if (!ok) bad++ }
const EMOJI = '/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B50}\\u{23F1}]|\\uFE0F/u'

const b = await launch({ width: 390, height: 844, mobile: true })

console.log('\nreveal screens: the number shows once, as the hero, and the sentences around it have no digits')
for (const stop of ['inc-r', 'sav-r', 'crd-r']) {
  const { problem } = await walk(b, base, 'stretched', { stopAt: stop })
  await b.wait(1200)
  const r = JSON.parse(await b.eval(`JSON.stringify({hero:(document.querySelector('.reveal-number')||{}).innerText, headline:(document.querySelector('.reveal-headline')||{}).innerText, body:(document.querySelector('.reveal-body')||{}).innerText})`))
  check(`${stop}: reached, with "${(r.hero || '').replace(/\s+/g, ' ')}" as the hero`, !problem && !!r.hero, JSON.stringify(r))
  check(`${stop}: headline and body contain no digits ("${r.headline}")`, !/\d/.test(r.headline || '') && !/\d/.test(r.body || ''), JSON.stringify(r))
}

for (const [w, h, mobile] of [[390, 844, true], [320, 640, true], [1280, 800, false]]) {
  console.log(`\n${w}x${h}`)
  await b.setViewport(w, h, mobile)
  const { problem } = await walk(b, base, 'stretched', { stopAt: 'summary' })
  check('reached the report', !problem)
  await b.wait(800)

  const car = JSON.parse(await b.eval(`(()=>{const car=document.getElementById('kr-carousel'); const cards=[...car.children]; const r1=cards[1].getBoundingClientRect(), rc=car.getBoundingClientRect();
    return JSON.stringify({n:cards.length, scrollable: car.scrollWidth>car.clientWidth+5, peeks: r1.left < rc.right-8 && r1.left > rc.left+40, count: document.getElementById('kr-count').textContent, snap: getComputedStyle(car).scrollSnapType})})()`))
  check('three steps in a scrolling row', car.n === 3 && car.scrollable, JSON.stringify(car))
  check('the next card peeks in from the edge, so it reads as scrollable', car.peeks, JSON.stringify(car))
  check('it snaps card by card and starts on "1 of 3"', /x mandatory/.test(car.snap) && car.count === '1 of 3', JSON.stringify(car))

  await b.eval(`(()=>{const car=document.getElementById('kr-carousel'); const c=[...car.children]; car.scrollTo({left:c[1].offsetLeft-c[0].offsetLeft, behavior:'instant'})})()`)
  await b.wait(400)
  check('swiping to the second card updates the counter and the dots', (await b.eval(`document.getElementById('kr-count').textContent`)) === '2 of 3' && (await b.eval(`[...document.querySelectorAll('.kr-dot')].findIndex(d=>d.classList.contains('on'))`)) === 1)
  await b.eval(`document.getElementById('kr-next').click()`); await b.wait(700)
  check('the arrow moves to the third card and then stops', (await b.eval(`document.getElementById('kr-count').textContent`)) === '3 of 3' && (await b.eval(`document.getElementById('kr-next').disabled`)) === true)
  await b.eval(`document.getElementById('kr-prev').click()`); await b.wait(700)
  check('the back arrow returns to the second card', (await b.eval(`document.getElementById('kr-count').textContent`)) === '2 of 3')

  const fold = JSON.parse(await b.eval(`(async()=>{const btn=document.querySelector('.kr-more-btn'); const box=btn.closest('.kr-more'); const body=box.querySelector('.kr-more-body');
    const before={open:btn.getAttribute('aria-expanded'), h:body.getBoundingClientRect().height}; btn.click(); await new Promise(r=>setTimeout(r,500));
    const during={open:btn.getAttribute('aria-expanded'), h:body.getBoundingClientRect().height}; btn.click(); await new Promise(r=>setTimeout(r,500));
    return JSON.stringify({before, during, after:{open:btn.getAttribute('aria-expanded'), h:body.getBoundingClientRect().height}})})()`))
  check('"Why this matters" opens and folds again', fold.before.open === 'false' && fold.before.h === 0 && fold.during.open === 'true' && fold.during.h > 20 && fold.after.h === 0, JSON.stringify(fold))

  const page = JSON.parse(await b.eval(`JSON.stringify({text:document.querySelector('.screen.active').innerText, over:document.documentElement.scrollWidth-innerWidth, scrollOver:(()=>{const s=document.querySelector('.screen.active .screen-scroll'); return s.scrollWidth-s.clientWidth})(), icons:${EMOJI}.test(document.querySelector('.screen.active').innerText)})`))
  check('no icons anywhere on the report', !page.icons)
  check('the page never scrolls sideways', page.over <= 1 && page.scrollOver <= 1, `page +${page.over}px, scroller +${page.scrollOver}px`)

  await b.eval(`document.querySelector('.summary-detail-cta').click()`); await b.wait(1500)
  await b.eval(`[...document.querySelectorAll('.acc-head')].forEach(h=>{ if(!h.parentElement.classList.contains('open')) h.click() })`); await b.wait(700)
  const det = JSON.parse(await b.eval(`JSON.stringify({screen:document.querySelector('.screen.active').dataset.id, text:document.querySelector('.screen.active').innerText, over:document.documentElement.scrollWidth-innerWidth, icons:${EMOJI}.test(document.querySelector('.screen.active').innerText)})`))
  check('the full breakdown opens, with no icons and no sideways scroll', det.screen === 'detail' && !det.icons && det.over <= 1, JSON.stringify({ s: det.screen, i: det.icons, o: det.over }))
}
const errs = b.consoleMsgs.filter((m) => m.type === 'error' || m.type === 'exception')
check('no console errors', errs.length === 0, JSON.stringify(errs))
await b.close(); server.close()
console.log(bad ? `\n${bad} FAILED` : '\nall report checks passed')
process.exit(bad ? 1 : 0)
