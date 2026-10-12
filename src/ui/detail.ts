import { krBar, krRs } from '../engine/report'
import { ST } from '../state'


// ── Detail-report helpers: one full audit card per pillar, whether or not
// it made the priority list — "detailed" means every input is accounted for,
// not just the ones that became an action. ──
export const PILLAR_INFO = {
  savings: {title:'Safety cushion', whyMatters:`What you'd live on if your income stopped.`},
  credit: {title:'Credit &amp; loans', whyMatters:`How cheaply you can borrow.`},
  protection: {title:'Insurance', whyMatters:`What your family can fall back on if things go wrong.`},
  investment: {title:'Investing', whyMatters:`Whether your money is working for your future.`},
};
// Numbers as small tiles (value over a label), not sentences to read. No icons.
export function pillarStatChips(key, inp){
  // The picture above already shows the ratio (months, %, years), so a tile only adds what it does not.
  if(key==='savings') return [
    {v:krRs(ST.savings), l:'saved'},
  ];
  if(key==='credit'){
    return []; // the three factors below carry their own values
  }
  if(key==='protection') return [];
  if(key==='investment'){
    if(inp.age>=52) return [{v:krRs(ST.retirementCorpus), l:'retirement savings'}];
    return [{v:krRs(ST.sip), l:'invested a month'}];
  }
  return [];
}
// Credit health is not one number you can act on, so show what it is made of: three things, each with
// where you are, whether that is fine, and the one thing that moves it. EMIs weigh most, then the score,
// then card use. Each tag uses the same line as the advice beside it, so the two can never disagree.
export function creditBreakdown(inp, focus?){
  const known = ST.knownScore != null;
  const ok = {txt:'On track', cls:'good'}, watch = {txt:'Watch', cls:'fair'}, work = {txt:'Needs work', cls:'weak'};
  const rows = [
    {key:'emi', name:'Your EMIs', val:`${krRs(ST.emi)} a month, ${inp.foi}% of your income`,
     state: inp.foi <= 30 ? ok : inp.foi <= 35 ? watch : work,
     level: inp.foi > 35 ? `Over the comfortable level.` : inp.foi > 30 ? `Just above 30%, the safe level.` : `Under 30%, the safe level.`,
     how: inp.foi > 35 ? `Paying down your most expensive loan first brings it down fastest.` : inp.foi > 30 ? `A little more paid off, or a raise, gets you under it.` : `Keep new loans from pushing it back up.`},
    {key:'score', name:'Your credit score', val: known ? `${inp.crd}` : `About 700 (our guess)`,
     state: inp.crd >= 700 ? ok : inp.crd >= 650 ? watch : work,
     level: !known ? `We assumed 700 because you didn't know yours.` : inp.crd >= 750 ? `Excellent.` : inp.crd >= 700 ? `Good.` : inp.crd >= 650 ? `Fair.` : `Low.`,
     how: !known ? `Check it free in a credit-score app to sharpen this.` : inp.crd >= 750 ? `Keep paying on time.` : inp.crd >= 650 ? `Paying every bill on time lifts it towards 750.` : `Auto-pay on every card and loan is the fastest fix. It improves over months, not days.`},
    {key:'card', name:'Your card use', val:`${inp.util}% of your limit`,
     state: inp.util <= 30 ? ok : inp.util <= 60 ? watch : work,
     level: inp.util <= 30 ? `Under 30%, the level that helps your score.` : `Over 30%.`,
     how: inp.util <= 30 ? `` : `Pay the bill down, or part-pay a few days before the statement date.`},
  ];
  const html = rows.map(r => {
    // The step above already says how; the row only says it works on this one, so the advice is not repeated.
    // On a row that is already fine, the step is an optional extra, so it should not read as a fix.
    const tail = focus === r.key ? `<b>${r.state === ok ? 'Your step above is an optional extra here.' : 'Your step above works on this.'}</b>` : r.how;
    return `<div class="cred-row"><div class="cred-top"><span class="cred-name">${r.name}</span><span class="cred-tag ${r.state.cls}">${r.state.txt}</span></div><div class="cred-val">${r.val}</div><div class="cred-do">${r.level}${tail?' '+tail:''}</div></div>`;
  }).join('');
  return `<div class="cred-parts"><div class="cred-lead">Credit health comes from three things. EMIs count most, then your score, then card use.</div>${html}</div>`;
}
export function pillarVisual(key, inp, focus?){
  const c = 'var(--k-accent)';
  if(key==='savings') return krBar(Math.floor(inp.liq), 6, `${Math.floor(inp.liq)} months of spending saved`, '6 months', c);
  if(key==='credit') return creditBreakdown(inp, focus);
  if(key==='protection'){
    const health = krBar(inp.healthCover, inp.healthNeed, `${krRs(inp.healthCover)} health cover`, krRs(inp.healthNeed), c);
    const life = inp.lifeNeed>0 ? krBar(inp.lifeCover, inp.lifeNeed, `${krRs(inp.lifeCover)} life cover`, krRs(inp.lifeNeed), c) : '';
    return life + health;
  }
  if(key==='investment'){
    if(inp.age>=52) return krBar(inp.corpus, 25, `${inp.corpus} years of spending saved`, '25 years', c);
    return krBar(inp.inv, 20, `${inp.inv}% of income invested`, '20% of income', c);
  }
  return '';
}
export function pillarRankReason(cand, moves){
  if(!cand) return `On track. Nothing to do here right now.`;
  const picked = moves.includes(cand);
  const rank = moves.indexOf(cand);
  if(picked && rank===0) return `Your first step: it makes the biggest difference right now.`;
  if(picked) return `A quick win to do alongside your first step.`;
  return moves[0] ? `Worth fixing, but the "${moves[0].title}" step matters more today.` : `Worth fixing when you get the chance.`;
}
export function buildPillarDetail(key, inp, cands, moves){
  const info = PILLAR_INFO[key];
  const cand = cands.find(c=>c.key===key);
  const picked = !!cand && moves.includes(cand);
  const rank = cand ? moves.indexOf(cand) : -1;
  // Insurance covers two things (life, health) but only ever surfaces one step. Say so when
  // life cover is left out, so a ₹0 beside it never looks like an oversight.
  const note = (key==='protection' && inp.deps===0) ? `You said nobody depends on your income, so we only looked at health cover here.` : null;
  return {
    key, title:info.title, whyMatters:info.whyMatters, note,
    sevLabel: cand ? cand.lbl : 'ON TRACK',
    sevCls: cand ? cand.cls : 'healthy',
    chips: pillarStatChips(key, inp),
    visual: pillarVisual(key, inp, cand ? cand.factor : undefined),
    reason: pillarRankReason(cand, moves),
    actionLine: cand ? `${cand.action}.` : null,
    picked, rank,
  };
}
// The overview ring — one segment per pillar, coloured by status. Replaces a
// wordy methodology paragraph with a single picture of the whole picture.
export function buildOverviewRing(cards){
  const colorMap = {critical:'var(--k-harm)', caution:'var(--k-tradeoff)', improve:'var(--k-accent)', healthy:'var(--k-safe)'};
  const r = 80, cx = 100, cy = 100, sw = 16;
  const circ = 2*Math.PI*r;
  const n = cards.length;
  const gap = 10;
  const segLen = circ/n - gap;
  const segs = cards.map((c,i)=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colorMap[c.sevCls]}" stroke-width="${sw}" stroke-dasharray="${segLen} ${circ-segLen}" stroke-dashoffset="${-(i*(circ/n))}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>`).join('');
  const onTrack = cards.filter(c=>c.sevCls==='healthy').length;
  const legend = cards.map(c=>`<div class="ring-legend-item"><span class="dot" style="background:${colorMap[c.sevCls]}"></span><span>${c.title}</span></div>`).join('');
  return `<div class="overview-ring-wrap">
    <div class="overview-ring">
      <svg viewBox="0 0 200 200"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--k-raised)" stroke-width="${sw}"/>${segs}</svg>
      <div class="overview-ring-center"><div class="n">${onTrack}/${n}</div><div class="l">ON TRACK</div></div>
    </div>
    <div class="ring-legend">${legend}</div>
  </div>`;
}
