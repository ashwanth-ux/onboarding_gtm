import { fmtHlt, krBar, krRs } from '../engine/report'
import { ST } from '../state'


// ── Detail-report helpers: one full audit card per pillar, whether or not
// it made the priority list — "detailed" means every input is accounted for,
// not just the ones that became an action. ──
export const PILLAR_INFO = {
  savings: {icon:'🛟', title:'Safety Cushion', whyMatters:`Your cushion if income stops.`},
  credit: {icon:'💳', title:'Credit &amp; Loans', whyMatters:`How cheaply you can borrow.`},
  protection: {icon:'🛡️', title:'Insurance', whyMatters:`Your family's cover if things go wrong.`},
  investment: {icon:'🌱', title:'Investing', whyMatters:`Whether your money works for your future.`},
};
// Pictorial over textual: every pillar's numbers render as a row of small
// stat chips (icon + value + label), the same visual language as the reveal
// screens — not a sentence to parse.
export function pillarStatChips(key, inp){
  if(key==='savings') return [
    {ic:'💰', v:krRs(ST.savings), l:'saved'},
    {ic:'📅', v:`${Math.floor(inp.liq)} mo`, l:'runway'},
  ];
  if(key==='credit'){
    const scoreTxt = ST.knownScore!=null ? inp.crd : '~700';
    return [
      {ic:'📋', v:krRs(ST.emi), l:'EMI/mo'},
      {ic:'📈', v:scoreTxt, l:'score'},
      {ic:'💳', v:`${inp.util}%`, l:'card use'},
    ];
  }
  if(key==='protection') return [
    {ic:'🛡️', v:krRs(ST.lifeCover), l:'life cover'},
    {ic:'⚕️', v:krRs(ST.healthCover), l:'health cover'},
  ];
  if(key==='investment'){
    if(inp.age>=52) return [{ic:'🏦', v:krRs(ST.retirementCorpus), l:'corpus'}, {ic:'📊', v:`${inp.corpus}×`, l:'yearly spend'}];
    return [{ic:'🌱', v:krRs(ST.sip), l:'invested/mo'}, {ic:'📊', v:`${inp.inv}%`, l:'of income'}];
  }
  return [];
}
export function pillarVisual(key, inp, pillars){
  const c = 'var(--k-accent)';
  if(key==='savings') return krBar(Math.floor(inp.liq), 6, `${Math.floor(inp.liq)} months saved`, '6 months', c);
  if(key==='credit'){ const p=Math.round(pillars.credit*100); return krBar(p, 80, `${p}% credit health`, '80%+', c); }
  if(key==='protection') return krBar(inp.hlt, pillars.hc_target, `${fmtHlt(inp.hlt)} health cover`, fmtHlt(pillars.hc_target), c);
  if(key==='investment'){
    if(inp.age>=52) return krBar(inp.corpus, 25, `${inp.corpus}× yearly spending saved`, '25×', c);
    return krBar(inp.inv, 20, `${inp.inv}% of income invested`, '20%', c);
  }
  return '';
}
export function pillarRankReason(cand, moves){
  if(!cand) return `On track — no action needed right now.`;
  const picked = moves.includes(cand);
  const rank = moves.indexOf(cand);
  if(picked && rank===0) return `Your #1 priority — biggest impact of anything right now.`;
  if(picked) return `A genuinely low-effort win, alongside your top move.`;
  return `A real gap, but ${moves[0]?moves[0].title.toLowerCase():'your top pick'} matters more today.`;
}
export function buildPillarDetail(key, inp, pillars, cands, moves){
  const info = PILLAR_INFO[key];
  const cand = cands.find(c=>c.key===key);
  const picked = !!cand && moves.includes(cand);
  const rank = cand ? moves.indexOf(cand) : -1;
  // Protection covers two different covers (life, health) but only ever
  // surfaces one move — say outright when life cover is sitting out of the
  // evaluation entirely, so a ₹0 chip next to it never reads as an oversight.
  const note = (key==='protection' && inp.deps===0) ? `No dependents on file, so life cover isn't factored in here — only health.` : null;
  return {
    key, icon:info.icon, title:info.title, whyMatters:info.whyMatters, note,
    sevLabel: cand ? cand.lbl : 'ON TRACK',
    sevCls: cand ? cand.cls : 'healthy',
    chips: pillarStatChips(key, inp),
    visual: pillarVisual(key, inp, pillars),
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
  const legend = cards.map(c=>`<div class="ring-legend-item"><span class="dot" style="background:${colorMap[c.sevCls]}"></span><span class="ic">${c.icon}</span><span>${c.title}</span></div>`).join('');
  return `<div class="overview-ring-wrap">
    <div class="overview-ring">
      <svg viewBox="0 0 200 200"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--k-raised)" stroke-width="${sw}"/>${segs}</svg>
      <div class="overview-ring-center"><div class="n">${onTrack}/${n}</div><div class="l">ON TRACK</div></div>
    </div>
    <div class="ring-legend">${legend}</div>
  </div>`;
}
