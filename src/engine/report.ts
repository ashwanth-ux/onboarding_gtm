// Report helpers (moves, step plans, premiums, verdict), ported from KYFR Report mode.
import { coverPlan } from './cover'
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
  return `<div class="kr-bar-wrap"><div class="kr-bar-labels"><span><b>${curLabel}</b></span>${targetLabel?`<span>target ${targetLabel}</span>`:''}</div><div class="kr-bar-track"><div class="kr-bar-fill" style="width:${fillPct}%;background:${color}"></div><div class="kr-bar-target" style="left:${targetPct}%"></div></div></div>`;
}
export function krSteps(plan, target, unit?){
  if(!plan || !plan.steps) return '';
  unit = unit || '/mo';
  const mid = Math.sqrt(plan.seed * target);
  const vals = [plan.seed, mid, target];
  const bars = vals.map((v,i)=>`<div class="kr-step-bar${i===2?' last':''}" style="height:${Math.max(20, Math.round(v/target*100))}%"><span class="kr-step-lbl">${krRs(v)}${unit}</span></div>`).join('');
  return `<div class="kr-steps">${bars}</div><div class="kr-steps-cap">Start small and raise it ${plan.stepPct}% every 6 months. You'll reach the full amount in about ${plan.years} years.</div>`;
}
export function krSimExtra(principal, annualRate, emi, cap?){
  cap = cap || 600; const r = annualRate/12;
  let bal = principal, interest = 0, m = 0;
  while(bal > 0 && m < cap){ m++; const i = bal*r; if(emi-i <= 0) return {months:null, interest};
    interest += i; bal = (emi-i >= bal) ? 0 : bal-(emi-i); if(bal>0 && m%12===0) bal -= Math.min(emi, bal); }
  return {months: bal<=0?m:null, interest};
}

export function krPositive(inp, pillars){
  const {liq, foi, crd, util, lifeCover, healthCover, inv, age, corpus, inc} = inp;
  if(age >= 52 && corpus >= 25) return {head:"You've crossed the finish line.", payoff:`Your savings are past <b>25 years</b> of your spending. Work is now a choice, not a necessity. Very few people ever get here.`};
  if(pillars.life_score >= 85 && pillars.health_score >= 85 && (lifeCover>0 || healthCover>0)) return {head:"Your family is well protected.", payoff:`Your life and health cover are both at the level we'd suggest for you. The hardest box is already ticked.`};
  if(liq >= 6) return {head:`You've got ${Math.floor(liq)} months of breathing room.`, payoff:`That's counted against what you spend each month. A lost job or a surprise bill won't force your hand.`};
  if(age < 48 && inv >= 18){
    const monthly = inv/100*inc, yrs = Math.max(1, 60-age);
    const fv = monthly*12*((Math.pow(1.11, yrs)-1)/0.11);
    return {head:`You're investing ${inv}% of your income.`, payoff:`That's a pace most people never reach. Keep it up and you could have roughly <b>${krRs(fv)}</b> by the time you retire.`};
  }
  if(crd >= 760 && foi < 30 && util < 30) return {head:"You'll always get the cheapest money in the room.", payoff:`A top score, light EMIs and low card use. Every loan you take will be at the best rate on offer.`};
  if(foi < 22 && (foi > 0)) return {head:"Your debt is under control.", payoff:`EMIs take under 22% of your income. That's well inside the safe zone, with room to borrow for what matters.`};
  const KEYS = ['savings','credit','investment','protection'];
  const best = KEYS.map(k=>[k,pillars[k]]).sort((a,b)=>b[1]-a[1])[0];
  if(best && best[1] >= 0.62){
    const names = {savings:'emergency savings', credit:'debt health', investment:'investing habit', protection:'family cover'};
    return {head:`Your ${names[best[0]]} is your foundation.`, payoff:`It's the steadiest part of your picture right now. We'll build everything else on top of it.`};
  }
  return {head:"You're already ahead of most people.", payoff:`Most people never run these numbers. You just did. Now let's point them in the right direction.`};
}

// Each move has a face (title, one action, one picture) and a "why" that stays folded until asked for.
// Nothing in `why` or `wait` repeats a number already on the face.
export function krCandidates(inp, pillars, weights, fri){
  const {liq, foi, crd, util, inv, age, corpus, inc, spend, deps} = inp;
  const out = [];
  const sev = k => { const [lbl] = SEVERITY(pillars[k]); return {lbl, cls:KR_SEVCLASS[lbl], crit: lbl==='CRITICAL', score: pillars[k]}; };
  const delta = k => Math.max(0, whatIfFri(pillars, weights, k) - fri);
  const cascadeIdx = {savings:0, credit:1, protection:2, investment:3};
  const para = (...ps) => ps.filter(Boolean).map(t=>`<p>${t}</p>`).join('');
  const note = html => `<div class="kr-daily">${html}</div>`;

  if(liq < 5.5){
    const s = sev('savings');
    const gapRs = Math.max(0, (6-liq)*inc);
    const monthly = krRound(Math.min(Math.max(gapRs/12, inc*0.05), inc*0.15), 1000);
    const emergencyCost = inc*3*0.18*1.5;
    const plan = krStepPlan(inc*0.03, monthly, 0.20);
    const seed = plan.seed || monthly;
    out.push({ key:'savings', ...s, delta:delta('savings'), effort:'MED', cascade:cascadeIdx.savings,
      title:'Build your safety cushion',
      action:`Automatically move ${krRs(seed)} a month into a savings fund you can withdraw from any day`,
      visualHtml: plan.steps > 0 ? krSteps(plan, monthly) : krBar(liq, 6, `${Math.floor(liq)} months of spending saved`, '6 months', 'var(--k-accent)'),
      whyLabel:'Why this matters',
      why: para(`This is the money you'd live on if your income stopped or a big bill landed. Without it, most people borrow, often at 24–36% interest.`),
      wait:`The first time you're caught short could cost about ${krRs(emergencyCost)} in loan interest.`,
      trigger:'THIS WEEK', mins:'1 min' });
  }
  (function(){
    const s = sev('credit'), d = delta('credit');
    const emi = ST.emi;
    const emi3 = emi*3;
    const monthsNow = Math.floor(liq);
    const monthsAfter = spend>0 ? Math.floor(Math.max(0, ST.savings-emi3)/spend) : 0;
    const hit = (ST.savings > 0)
      ? `Paying 3 months of EMIs from your savings would shrink the months of spending they cover from ${monthsNow} to ${monthsAfter}.`
      : `You have no savings to fall back on, so 3 months of EMIs (${krRs(emi3)}) would have to come from new borrowing.`;
    if(foi > 50){
      out.push({ key:'credit', ...s, delta:d, effort:'HIGH', cascade:cascadeIdx.credit, title:'Ease your debt load', factor:'emi',
        action:`List your loans by interest rate, then put every spare rupee towards the most expensive one first`,
        visualHtml: krBar(foi, 30, `${foi}% of income goes to EMIs`, '30% (a safe level)', 'var(--k-harm)'),
        whyLabel:'Why this matters',
        why: para(`When this much of your income is already spoken for, one surprise bill or missed payment can snowball quickly.`),
        wait: hit, trigger:'TODAY', mins:'5 min' });
    } else if(util > 60){
      out.push({ key:'credit', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.credit, title:'Bring down your card bill', factor:'card',
        action:`Pay your card bill down until you're using less than 30% of your limit`,
        visualHtml: krBar(util, 30, `${util}% of your card limit used`, 'under 30%', 'var(--k-tradeoff)'),
        whyLabel:'Why this matters',
        why: para(`Lenders read a high card balance as a sign you're stretched, even if you always pay on time.`),
        wait:`A lower credit score can add 1–2% to the interest on every future loan. On a home loan that's lakhs.`,
        trigger:'BEFORE YOUR NEXT BILL', mins:'2 min' });
    } else if(crd < 650){
      out.push({ key:'credit', ...s, delta:d, effort:'HIGH', cascade:cascadeIdx.credit, title:'Lift your credit score', factor:'score',
        action:`Turn on auto-pay for every card and loan`,
        visualHtml: krBar(crd, 650, `Credit score ${crd}`, '650 or more', 'var(--k-accent)'),
        whyLabel:'Why this matters',
        why: para(`Paying on time, every time, is what lifts a score. There's no shortcut, and most people see it improve within 6 months.`),
        wait:`A weak score could cost about ${krRs(inc*12*5*0.015)} extra in interest on a future home loan.`,
        trigger:'TODAY', mins:'2 min' });
    } else if(foi > 35){
      out.push({ key:'credit', ...s, delta:d, effort:'MED', cascade:cascadeIdx.credit, title:'Bring your EMIs down', factor:'emi',
        action:`Pay a chunk of your most expensive loan early. Most lenders allow this for free`,
        visualHtml: krBar(foi, 30, `${foi}% of income goes to EMIs`, '30% (a safe level)', 'var(--k-tradeoff)'),
        whyLabel:'Why this matters',
        why: para(`A little above the comfortable level. It's manageable, but leaves little room for a surprise.`),
        wait: hit, trigger:'ON YOUR NEXT BONUS', mins:'5 min' });
    } else if(util > 30){
      out.push({ key:'credit', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.credit, title:'Use less of your card limit', factor:'card',
        action:`Pay part of your card bill a few days before the statement date`,
        visualHtml: krBar(util, 30, `${util}% of your card limit used`, 'under 30%', 'var(--k-accent)'),
        whyLabel:'Why this matters',
        why: para(`Your score looks at how much of your limit is in use when the bill is made. Paying early lowers that, and it costs nothing.`),
        wait:'', trigger:'BEFORE YOUR NEXT BILL', mins:'1 min' });
    } else if(foi >= 10 && pillars.savings >= 0.33){
      const rate = 0.13, n = 48, principal = emi>0 ? emi*(1-Math.pow(1+rate/12,-n))/(rate/12) : 0;
      const base = emi*n - principal;
      const ex = krSimExtra(principal, rate, emi);
      const saved = ex.months ? Math.max(0, base - ex.interest) : 0;
      const monthsEarly = ex.months ? Math.max(0, n - ex.months) : 0;
      if(saved > 1000 && monthsEarly > 0){
        const box = (big, small) => `<div class="kr-stat"><div class="kr-stat-n">${big}</div><div class="kr-stat-l">${small}</div></div>`;
        out.push({ key:'credit', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.credit, title:'Get ahead on your loan', factor:'emi',
          action:`Pay one extra EMI a year (about ${krRs(emi)})`,
          visualHtml: `<div class="kr-stats">${box(`${monthsEarly} mo`, 'sooner you finish')}${box(krRs(saved), 'interest saved')}</div>`,
          whyLabel:'Why pay an extra EMI?',
          why: para(
            `Interest is charged on the amount you still owe. An extra EMI goes straight off that amount, so every month after it has less interest to pay.`,
            `Once a year is enough, for example with a bonus or a tax refund.`,
            `Check that your lender doesn't charge a fee for paying early, and do this only once your emergency savings are in place.`),
          wait:'', trigger:'WHEN YOU NEXT GET A BONUS', mins:'2 min' });
      }
    }
  })();
  {
    const plan = coverPlan({age, deps, income:inc, spending:spend, savings:ST.savings, emi:ST.emi, retirement:ST.retirementCorpus, lifeCover:ST.lifeCover, healthCover:ST.healthCover});
    const needHealth = pillars.health_score < 78 && plan.health.kind !== 'none';
    const needLife   = deps > 0 && pillars.life_score < 78 && !plan.life.covered;
    const doLife = needLife && (pillars.life_score <= pillars.health_score || !needHealth);
    const perDay = yearly => Math.max(1, Math.round(yearly/365));
    if(doLife){
      const s = sev('protection'), d = delta('protection');
      const L = plan.life;
      const people = deps===1 ? '1 person relies' : `${deps} people rely`;
      out.push({ key:'protection', ...s, delta:d, effort:'MED', cascade:cascadeIdx.protection, title:"Protect your family's income",
        action:`Get a quote for ${krRs(L.need)} of life insurance`,
        // The amount is already in the action above, so the bar shows progress without repeating it.
        visualHtml: krBar(L.own, L.need, `${krRs(L.own)} covered`, '', 'var(--k-accent)')
          + note(`Set aside about <b>₹${perDay(L.yearlyCost)} a day</b> and the yearly cost (${krRs(L.yearlyCost)}) is ready when it's due.`),
        whyLabel:'Why this matters',
        why: para(
          `${people} on your income. If you weren't around, this pays your family a lump sum so they can keep the home and plans going.`,
          `We sized it from your spending, plus things we assumed because we didn't ask: ${deps===1 ? "a spouse who isn't earning" : "a spouse who isn't earning and young children"}. Treat it as a starting point; a quote will confirm what you can get.`),
        wait: L.own > 0 ? `Until the gap is closed, your family would have to manage without about ${krRs(L.need - L.own)}.` : '',
        trigger:'IN THE NEXT 10 MINUTES', mins:'10 min' });
    } else if(needHealth){
      const s = sev('protection'), d = delta('protection');
      const H = plan.health;
      const first = H.kind === 'plan';
      out.push({ key:'protection', ...s, delta:d, effort:'MED', cascade:cascadeIdx.protection, title:'Guard against a big hospital bill',
        action: first
          ? (H.own > 0 ? `Raise your health cover to at least ${krRs(H.buy)}` : `Get a ${krRs(H.buy)} health insurance plan for your family`)
          : `Add a ${krRs(H.buy)} top-up health plan on top of the one you have`,
        visualHtml: krBar(H.own, H.own + H.buy, `${krRs(H.own)} covered`, krRs(H.own + H.buy), 'var(--k-accent)')
          + note(`Set aside about <b>₹${perDay(H.yearlyCost)} a day</b> and the yearly cost (${krRs(H.yearlyCost)}) is ready by renewal.`),
        whyLabel:'Why this matters',
        why: para(
          first
            ? `A serious illness can cost lakhs. A health plan pays the hospital directly, so the bill doesn't come out of your savings.`
            : `Your current plan pays first. A top-up is a second, cheaper plan that only starts paying once your bills pass what the first one covers, so together they handle the big ones.`,
          `We assumed you live in a big city, use good private hospitals, and have your family (if you have one) on a single plan.`),
        wait:'A serious hospital stay without enough cover usually comes out of savings, and those bills often run into lakhs.',
        trigger:'TODAY', mins:'5 min' });
    }
  }
  if(age < 48 && inv < 19){
    const s = sev('investment'), d = delta('investment');
    const addRs = krRound(Math.max(0, (20-inv))/100*inc, 500);
    const yrsToRetire = Math.max(1, 60-age);
    const yrs10 = Math.min(10, yrsToRetire);
    const plan = krStepPlan(inc*0.02, addRs, 0.20);
    const seed = plan.seed || addRs;
    // Simulated against the ACTUAL ramp (start at seed, +20% every 6 months, cap at addRs),
    // so the number quoted is what following the recommended plan is projected to build.
    const shortfall10 = krRampFV(seed, addRs, 0.20, Math.round(yrs10*12), 0.11);
    const shortfallRetire = krRampFV(seed, addRs, 0.20, Math.round(yrsToRetire*12), 0.11);
    const wait = yrs10>=yrsToRetire
      ? `Leaving things as they are would leave you about ${krRs(shortfallRetire)} short by retirement.`
      : `Leaving things as they are would leave you about ${krRs(shortfall10)} short in ${yrs10} years, and about ${krRs(shortfallRetire)} short by retirement.`;
    out.push({ key:'investment', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.investment, title:'Invest a little more',
      action:`Start investing ${krRs(seed)} every month with an automatic plan (a SIP) in your investing app`,
      visualHtml: plan.steps > 0 ? krSteps(plan, addRs) : krBar(inv, 20, `${inv}% of income invested`, '20% of income', 'var(--k-accent)'),
      whyLabel:'Why this matters',
      why: para(
        `Putting aside about a fifth of what you earn is what builds a comfortable retirement. Starting early matters more than starting big, because your money grows on its own growth.`,
        `A SIP simply moves a fixed amount into a mutual fund automatically every month.`),
      wait, trigger:'RIGHT NOW', mins:'2 min' });
  } else if(age >= 52 && corpus < 25 && corpus > 0){
    const s = sev('investment'), d = delta('investment');
    const recoverYrs = Math.max(1, Math.round(Math.log(1/(1-0.25)) / Math.log(1.07)));
    out.push({ key:'investment', ...s, delta:d, effort:'LOW', cascade:cascadeIdx.investment, title:'Stay on track for retirement',
      action:`Check once that your money isn't too exposed to a big market fall`,
      visualHtml: krBar(corpus, 25, `${corpus} years of spending saved`, '25 years', 'var(--k-accent)'),
      whyLabel:'Why this matters',
      why: para(`About 25 years of spending saved is the usual mark for being retirement-ready, and you're close. A big fall this near the finish line is hard to recover from.`),
      wait:`Recovering could take about ${recoverYrs} years, instead of steady growth.`,
      trigger:'THIS WEEK', mins:'5 min' });
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
  if(hasCritical) return "There's real strain here, but it's fixable, and there's an order to it. Start with one thing, today.";
  if(moves.length === 0) return "You're in rare shape. Every area is pulling its weight. The job now is simply to protect it.";
  if(moves.length === 1) return "You're most of the way there. One move takes you from solid to genuinely resilient.";
  return "You've built a real foundation. A couple of focused moves and you're resilient. Here's the order.";
}
