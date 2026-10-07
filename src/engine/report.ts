// Report helpers (moves, step plans, premiums, verdict), ported from KYFR Report mode.
import { SEVERITY, whatIfFri } from './crisp'
import { ST } from '../state'

export function krRs(n){
  n = Math.round(n);
  if(n >= 1e7) return '₹' + (n/1e7).toFixed(2).replace(/\.?0+$/,'') + ' Cr';
  if(n >= 1e5) return '₹' + (n/1e5).toFixed(1).replace(/\.0$/,'') + 'L';
  if(n >= 1000) return '₹' + Math.round(n/1000) + 'K';
  return '₹' + Math.max(0, n);
}
export function krRound(n, step){ return Math.round(n/step)*step; }
export function krStepPlan(seedRaw, target, stepPct){
  stepPct = stepPct || 0.20;
  const seed = krRound(Math.max(500, Math.min(seedRaw, target)), 500);
  if(target <= seed*1.15) return {seed, steps:0, years:0, stepPct:Math.round(stepPct*100)};
  const steps = Math.max(1, Math.ceil(Math.log(target/seed) / Math.log(1+stepPct)));
  return {seed, steps, years: +(steps*0.5).toFixed(1), stepPct:Math.round(stepPct*100)};
}
// Month-by-month FV of the ACTUAL step-up schedule (start small, +stepPct
// every 6 months, cap at target) — not a shortcut that assumes the full
// target contribution from month 1. Any "if you wait" number quoted against
// a ramp-up recommendation has to be earned by simulating the ramp itself,
// or it's advertising a bigger number than the plan it's attached to delivers.
export function krRampFV(seedMonthly, targetMonthly, stepPct, months, annualRate){
  const r = annualRate/12;
  let balance = 0, current = seedMonthly;
  for(let m=1; m<=months; m++){
    balance = (balance+current)*(1+r);
    if(m%6===0 && current<targetMonthly) current = Math.min(targetMonthly, current*(1+stepPct));
  }
  return balance;
}
export function krCover(cr){ return cr >= 1 ? '₹'+(+cr.toFixed(2)).toString().replace(/\.?0+$/,'')+'Cr' : '₹'+Math.round(cr*100)+'L'; }
export const fmtHlt = v => v>=100 ? `₹${(v/100).toFixed(1)}Cr` : `₹${Math.round(v)}L`;
export const KR_SEVCLASS = {CRITICAL:'critical', CAUTION:'caution', IMPROVE:'improve', OK:'improve'};
export function krBar(current, target, curLabel, targetLabel, color){
  const scale = Math.max(current, target, 0.0001) * 1.15;
  const fillPct = Math.max(3, Math.min(100, current/scale*100));
  const targetPct = Math.min(97, target/scale*100);
  return `<div class="kr-bar-wrap"><div class="kr-bar-labels"><span><b>${curLabel}</b></span><span>target ${targetLabel}</span></div><div class="kr-bar-track"><div class="kr-bar-fill" style="width:${fillPct}%;background:${color}"></div><div class="kr-bar-target" style="left:${targetPct}%"></div></div></div>`;
}
export function krSteps(plan, target, unit?){
  if(!plan || !plan.steps) return '';
  unit = unit || '/mo';
  const mid = Math.sqrt(plan.seed * target);
  const vals = [plan.seed, mid, target];
  const bars = vals.map((v,i)=>`<div class="kr-step-bar${i===2?' last':''}" style="height:${Math.max(20, Math.round(v/target*100))}%"><span class="kr-step-lbl">${krRs(v)}${unit}</span></div>`).join('');
  return `<div class="kr-steps">${bars}</div><div class="kr-steps-cap">Small → medium → full, over about ${plan.years} years, stepping up ${plan.stepPct}% every 6 months.</div>`;
}
export function termPremiumMonthly(age, coverCr){
  const perCr = age<=25?550: age<=30?700: age<=35?950: age<=40?1400: age<=45?2100: age<=50?3200: 4800;
  return Math.max(300, Math.round(perCr * coverCr / 50) * 50);
}
export function healthPremiumAnnual(age, coverLakh, deps){
  const basePer5 = age<=30?6500: age<=40?9000: age<=50?14000: 21000;
  const fam = deps > 0 ? 1.5 : 1;
  return krRound(basePer5 * Math.sqrt(Math.max(1, coverLakh/5)) * fam, 500);
}
export function krSimExtra(principal, annualRate, emi, cap?){
  cap = cap || 600; const r = annualRate/12;
  let bal = principal, interest = 0, m = 0;
  while(bal > 0 && m < cap){ m++; const i = bal*r; if(emi-i <= 0) return {months:null, interest};
    interest += i; bal = (emi-i >= bal) ? 0 : bal-(emi-i); if(bal>0 && m%12===0) bal -= Math.min(emi, bal); }
  return {months: bal<=0?m:null, interest};
}

export function krPositive(inp, pillars){
  const {liq, foi, crd, util, cvr, hlt, inv, age, corpus, inc} = inp;
  if(age >= 52 && corpus >= 25) return {head:"You've crossed the finish line.", payoff:`Your corpus is past <b>25×</b> your annual spending — work is now a choice, not a necessity. Very few people ever get here.`};
  if(pillars.life_score >= 85 && pillars.health_score >= 85 && (cvr>0 || hlt>0)) return {head:"Your family is fully protected.", payoff:`Both your life and health cover meet the mark for your income and dependents — the hardest box is already ticked.`};
  if(liq >= 6) return {head:`You've got ${Math.floor(liq)} months of breathing room.`, payoff:`You could lose your income tomorrow and stay standing for <b>${Math.floor(liq)} months</b> — that's freedom, not just savings.`};
  if(age < 48 && inv >= 18){
    const monthly = inv/100*inc, yrs = Math.max(1, 60-age);
    const fv = monthly*12*((Math.pow(1.11, yrs)-1)/0.11);
    return {head:`You're investing ${inv}% of your income.`, payoff:`At or near the 20% mark most people never hit. Keep this pace and you're looking at roughly <b>${krRs(fv)}</b> by 60.`};
  }
  if(crd >= 760 && foi < 30 && util < 30) return {head:"You'll always get the cheapest money in the room.", payoff:`Top-tier score, light EMI load, low card usage — the full trifecta. Every loan you take is at the best rate on offer.`};
  if(foi < 22 && (foi > 0)) return {head:"Your debt is barely a rounding error.", payoff:`EMIs take under 22% of your take-home — well inside the safe zone, with room to borrow for what actually matters.`};
  const KEYS = ['savings','credit','investment','protection'];
  const best = KEYS.map(k=>[k,pillars[k]]).sort((a,b)=>b[1]-a[1])[0];
  if(best && best[1] >= 0.62){
    const names = {savings:'emergency buffer', credit:'debt health', investment:'investing habit', protection:'family cover'};
    return {head:`Your ${names[best[0]]} is your foundation.`, payoff:`It's the steadiest part of your picture right now — we'll build everything else on top of it.`};
  }
  return {head:"You're already ahead of most people.", payoff:`Most people never run these numbers. You just did — now let's point them in the right direction.`};
}

export function krCandidates(inp, pillars, weights, fri){
  const {liq, foi, crd, util, cvr, hlt, inv, age, corpus, inc, spend, deps} = inp;
  const out = [];
  const sev = k => { const [lbl] = SEVERITY(pillars[k]); return {lbl, cls:KR_SEVCLASS[lbl], crit: lbl==='CRITICAL', score: pillars[k]}; };
  const delta = k => Math.max(0, whatIfFri(pillars, weights, k) - fri);
  const cascadeIdx = {savings:0, credit:1, protection:2, investment:3};

  if(liq < 5.5){
    const s = sev('savings');
    const gapRs = Math.max(0, (6-liq)*inc);
    const monthly = krRound(Math.min(Math.max(gapRs/12, inc*0.05), inc*0.15), 1000);
    const emergencyCost = inc*3*0.18*1.5;
    const plan = krStepPlan(inc*0.03, monthly, 0.20);
    const seed = plan.seed || monthly;
    out.push({ key:'savings', ...s, delta:delta('savings'), effort:'MED', cascade:cascadeIdx.savings,
      icon:'🛟', title:'Build your safety cushion',
      visualHtml: plan.steps > 0 ? krSteps(plan, monthly) : krBar(liq, 6, `${Math.floor(liq)} months of spending saved`, '6 months', 'var(--k-accent)'),
      microWhy:`One job loss or bill, and you'd be borrowing at 24–36% just to get by.`,
      costNum:krRs(emergencyCost), costCap:`in emergency-loan interest, the first time you're caught short`,
      trigger:'THIS WEEK', mins:'1 min', action:`Set up a ${krRs(seed)}/month auto-transfer to a liquid fund` });
  }
  (function(){
    const s = sev('credit'), d = delta('credit');
    const emi = inc*foi/100;
    // The rupee cost of 3 months' EMI is a number the user already gave us —
    // the non-obvious part is what it does to the safety cushion they just saw.
    const emi3 = emi*3;
    const curRunway = Math.floor(liq);
    const runwayAfterHit = spend>0 ? Math.floor(Math.max(0, ST.savings-emi3)/spend) : 0;
    const runwayCost = (ST.savings > 0)
      ? { num:`${curRunway}→${runwayAfterHit} mo`, cap:`is what happens to your safety-net runway if 3 months of EMIs came straight out of it` }
      : { num:krRs(emi3), cap:`you don't have savings to absorb this — it would have to come from new borrowing` };
    if(foi > 50){
      out.push({ key:'credit', ...s, delta:d, effort:'HIGH', cascade:cascadeIdx.credit, icon:'⚠️', title:'Ease your debt load',
        visualHtml: krBar(foi, 30, `${foi}% of income to EMIs`, '30% (safe zone)', 'var(--k-harm)'),
        microWhy:`Above the safe line — one missed month cascades fast.`,
        costNum:runwayCost.num, costCap:runwayCost.cap,
        trigger:'TODAY', mins:'5 min', action:`List your loans by rate — send every spare rupee to the highest one first` });
    } else if(util > 60){
      out.push({ key:'credit', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.credit, icon:'💳', title:'Free up your credit',
        visualHtml: krBar(util, 30, `${util}% of card limit used`, 'under 30%', 'var(--k-tradeoff)'),
        microWhy:`Lenders read high usage as stress, even when you pay in full.`,
        costNum:'+1–2%', costCap:`higher rate on every future loan — lakhs over a home-loan lifetime`,
        trigger:'BEFORE YOUR NEXT STATEMENT', mins:'2 min', action:`Pay your card down until usage is under 30%` });
    } else if(crd < 650){
      out.push({ key:'credit', ...s, delta:d, effort:'HIGH', cascade:cascadeIdx.credit, icon:'📈', title:'Lift your credit score',
        visualHtml: krBar(crd, 650, `${crd} credit score`, '650+ credit score', 'var(--k-accent)'),
        microWhy:`No shortcuts, no products — just on-time payments for 6 months.`,
        costNum:krRs(inc*12*5*0.015), costCap:`extra on a future home loan from a score lower than it could be`,
        trigger:'TODAY', mins:'2 min', action:`Turn on auto-pay for every card and loan` });
    } else if(foi > 35){
      out.push({ key:'credit', ...s, delta:d, effort:'MED', cascade:cascadeIdx.credit, icon:'⚖️', title:'Bring your EMIs down',
        visualHtml: krBar(foi, 30, `${foi}% of income to EMIs`, '30% (safe zone)', 'var(--k-tradeoff)'),
        microWhy:`A bit above the healthy zone — manageable, but little room for a surprise.`,
        costNum:runwayCost.num, costCap:runwayCost.cap,
        trigger:'ON YOUR NEXT BONUS', mins:'5 min', action:`Part-prepay your priciest loan — most let you do it for free` });
    } else if(util > 30){
      out.push({ key:'credit', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.credit, icon:'💳', title:'Trim your card usage',
        visualHtml: krBar(util, 30, `${util}% of card limit used`, 'under 30%', 'var(--k-accent)'),
        microWhy:`The cheapest score improvement there is — no cost, just timing.`,
        costNum:'A lower score', costCap:`than you could have — for a completely free fix`,
        trigger:'BEFORE YOUR NEXT STATEMENT', mins:'1 min', action:`Pay part of your card bill a few days early` });
    } else if(foi >= 10 && pillars.savings >= 0.33){
      const rate = 0.13, n = 48, principal = emi>0 ? emi*(1-Math.pow(1+rate/12,-n))/(rate/12) : 0;
      const base = emi*n - principal;
      const ex = krSimExtra(principal, rate, emi);
      const saved = ex.months ? Math.max(0, base - ex.interest) : 0;
      const monthsEarly = ex.months ? Math.max(0, n - ex.months) : 0;
      if(saved > 1000 && monthsEarly > 0){
        out.push({ key:'credit', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.credit, icon:'🏁', title:'Get ahead on your loan',
          visualHtml: `<div style="display:flex;gap:10px;margin-bottom:10px"><div style="flex:1;background:var(--k-raised);border-radius:10px;padding:10px 12px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--k-accent)">${monthsEarly} mo</div><div style="font-size:10.5px;color:var(--k-muted)">earlier payoff</div></div><div style="flex:1;background:var(--k-raised);border-radius:10px;padding:10px 12px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--k-safe)">${krRs(saved)}</div><div style="font-size:10.5px;color:var(--k-muted)">interest saved</div></div></div>`,
          microWhy:`Money paid early kills more interest than the same money paid later.`,
          costNum:krRs(saved), costCap:`in interest you'd otherwise hand the lender for nothing`,
          trigger:'RIGHT NOW', mins:'2 min', action:`Set a yearly reminder to pay one extra EMI (about ${krRs(emi)})` });
      }
    }
  })();
  {
    const needHealth = pillars.health_score < 78;
    const needLife   = deps > 0 && pillars.life_score < 78;
    const doLife = needLife && (pillars.life_score <= pillars.health_score || !needHealth);
    if(doLife){
      const s = sev('protection'), d = delta('protection');
      const targetCr = +(inc*12*10/1e7).toFixed(2);
      const prem = termPremiumMonthly(age, targetCr);
      const gapRs = Math.max(0, (10-cvr))*inc*12;
      const dailyLife = Math.max(1, Math.round(prem/30));
      out.push({ key:'protection', ...s, delta:d, effort:'MED', cascade:cascadeIdx.protection, icon:'🛡️', title:"Protect your family's income",
        visualHtml: krBar(cvr, 10, `${cvr}× your yearly income covered`, '10× your income', 'var(--k-accent)') + `<div class="kr-daily"><span class="kr-daily-icon">🪙</span><span>About <b>₹${dailyLife}/day</b> — less than a cup of chai — covers the ${krRs(prem)}/month premium.</span></div>`,
        microWhy:`${deps} ${deps===1?'person depends':'people depend'} on your income — a simple term plan closes this cheaply.`,
        costNum:krRs(gapRs), costCap:`your family would have to replace on their own`,
        trigger:'IN THE NEXT 10 MINUTES', mins:'10 min', action:`Get one online term-insurance quote for ${krCover(targetCr)} cover` });
    } else if(needHealth){
      const s = sev('protection'), d = delta('protection');
      const target = pillars.hc_target;
      const prem = healthPremiumAnnual(age, target, deps);
      const gapRs = Math.max(0, target-hlt)*1e5;
      const dailyHealth = Math.max(1, Math.round(prem/365));
      out.push({ key:'protection', ...s, delta:d, effort:'MED', cascade:cascadeIdx.protection, icon:'⚕️', title:'Guard against a big medical bill',
        visualHtml: krBar(hlt, target, `${fmtHlt(hlt)} covered`, fmtHlt(target), 'var(--k-accent)') + `<div class="kr-daily"><span class="kr-daily-icon">🪙</span><span>Save about <b>₹${dailyHealth}/day</b> from today — by renewal, the full ${krRs(prem)} premium is already set aside, not a surprise bill.</span></div>`,
        microWhy:`${fmtHlt(target)} is a realistic cost for a serious hospital stay — you're ${fmtHlt(Math.max(0,target-hlt))} short.`,
        costNum:krRs(gapRs), costCap:`paid straight from savings in one bad hospital stay`,
        trigger:'TODAY', mins:'5 min', action:`Get a super top-up quote — it stacks on what you already have` });
    }
  }
  if(age < 48 && inv < 19){
    const s = sev('investment'), d = delta('investment');
    const addRs = krRound(Math.max(0, (20-inv))/100*inc, 500);
    const yrsToRetire = Math.max(1, 60-age);
    const yrs10 = Math.min(10, yrsToRetire);
    const plan = krStepPlan(inc*0.02, addRs, 0.20);
    const seed = plan.seed || addRs;
    // Simulated against the ACTUAL ramp (start at seed, +20% every 6 months,
    // cap at addRs) — not an idealised "full amount from month 1" shortcut,
    // so the number quoted is exactly what following the recommended plan
    // below is projected to build, not a bigger, unearned one.
    const shortfall10 = krRampFV(seed, addRs, 0.20, Math.round(yrs10*12), 0.11);
    const shortfallRetire = krRampFV(seed, addRs, 0.20, Math.round(yrsToRetire*12), 0.11);
    // A 25-year-old can't feel "by 60" — 35 years out is abstract. Ten years
    // is something they can actually picture, so it leads; retirement is the
    // second, longer payoff that explains why compounding is worth starting now.
    const costNum = yrs10>=yrsToRetire ? krRs(shortfallRetire) : krRs(shortfall10);
    const costCap = yrs10>=yrsToRetire
      ? `less by retirement if you leave this where it is`
      : `less in just ${yrs10} years — growing to ${krRs(shortfallRetire)} by retirement if this stays as is`;
    out.push({ key:'investment', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.investment, icon:'🌱', title:'Invest a little more',
      visualHtml: plan.steps > 0 ? krSteps(plan, addRs) : krBar(inv, 20, `${inv}% of income invested`, '20% of income', 'var(--k-accent)'),
      microWhy:`20% of income quietly funds a real retirement — compounding now is the part you can't buy back later.`,
      costNum, costCap,
      trigger:'RIGHT NOW', mins:'2 min', action:`Start a ${krRs(seed)}/month SIP in your investing app` });
  } else if(age >= 52 && corpus < 25 && corpus > 0){
    const s = sev('investment'), d = delta('investment');
    const recoverYrs = Math.max(1, Math.round(Math.log(1/(1-0.25)) / Math.log(1.07)));
    out.push({ key:'investment', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.investment, icon:'🎯', title:'Stay on track for retirement',
      visualHtml: krBar(corpus, 25, `${corpus}× yearly spending saved`, '25× (retirement-ready)', 'var(--k-accent)'),
      microWhy:`25 times your yearly spending saved up is the standard "retirement-ready" mark — you're almost there. A big loss now is hard to recover from this close.`,
      costNum:`~${recoverYrs} years`, costCap:`to recover from a bad drawdown this close to the finish line, instead of steadily compounding your way there`,
      trigger:'THIS WEEK', mins:'5 min', action:`Review your allocation once — make sure you're not overexposed` });
  }
  return out;
}
export function krPrioritise(cands){
  if(!cands.length) return [];
  const byConsequence = arr => arr.slice().sort((a,b)=> (b.crit - a.crit) || (b.delta - a.delta) || (a.score - b.score) || (a.cascade - b.cascade));
  const ranked = byConsequence(cands);
  const keystone = ranked[0];
  const rest = ranked.filter(c => c !== keystone);
  const effortRank = {LOW:0, MED:1, HIGH:2};
  const easy = rest.slice().sort((a,b)=> (effortRank[a.effort]-effortRank[b.effort]) || (b.crit-a.crit) || (b.delta-a.delta))[0];
  const picks = [keystone];
  if(easy) picks.push(easy);
  const third = byConsequence(rest.filter(c => c !== easy)).find(c => c.lbl !== 'IMPROVE');
  if(third && picks.length < 3) picks.push(third);
  return picks.slice(0,3);
}
export function krVerdict(moves, hasCritical){
  if(hasCritical) return "There's real strain here — but it's fixable, and there's an order to it. Start with one thing, today.";
  if(moves.length === 0) return "You're in rare shape — every pillar is pulling its weight. The job now is simply to protect it.";
  if(moves.length === 1) return "You're most of the way there. One move takes you from solid to genuinely resilient.";
  return "You've built a real foundation. A couple of focused moves and you're resilient — here's the order.";
}
