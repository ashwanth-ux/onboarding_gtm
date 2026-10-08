import { LOGO_SRC } from './assets'
import { goTo } from './router'
import { ST, deriveInp } from './state'
import { CASCADE, calcFRI, calcPillars, calcWeights, clamp } from './engine/crisp'
import { fmtIndianInput, parseNum } from './format'
import { animateCount, fireConfetti, wireCurrency } from './ui/dom'
import { bufferInsight, creditInsight, incomeInsight, insuranceInsight } from './engine/benchmark'
import { animateGauge, animateShield, edgeFlourish, renderGauge, renderLadder, renderShield } from './ui/visuals'
import { krCandidates, krPositive, krPrioritise, krRs, krVerdict } from './engine/report'
import { buildOverviewRing, buildPillarDetail } from './ui/detail'
import { LEADS_URL, postLead } from './api'
import { buildLead, normaliseEmail, normalisePhone } from './lead'

export let LAST_REPORT = null;
export const SCREENS = {
  welcome: {
    render(){ return `<div class="screen" data-id="welcome"><div class="screen-scroll"><div class="welcome">
      <div class="brand-mark"><div class="brand-glyph"><img src="${LOGO_SRC}" alt="KYFR"></div><div class="brand-word">KYFR</div></div>
      <h1>Know your money.<br><em>Really</em> know it.</h1>
      <div class="welcome-spacer"></div>
    </div></div>
    <div class="btn-row"><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Let's begin →</button></div>
    </div>`; },
    onContinue(){ goTo('about'); }
  },
  about: {
    render(){ return `<div class="screen" data-id="about"><div class="screen-scroll"><div class="v-center">
      <div class="eyebrow"><span class="dot"></span>Quick context</div>
      <h1 class="q-title">First, a little about you.</h1>
      <div class="q-sub">Helps us compare you against the right benchmarks.</div>
      <div class="q-field"><div class="q-field-label">Your age</div>
        <div class="stepper"><button class="stepper-btn" id="age-dn">−</button><div class="stepper-val" id="age-val">${ST.age}</div><button class="stepper-btn" id="age-up">+</button></div>
      </div>
      <div class="q-field"><div class="q-field-label">People financially dependent on you</div>
        <div class="stepper"><button class="stepper-btn" id="deps-dn">−</button><div class="stepper-val" id="deps-val">${ST.deps}</div><button class="stepper-btn" id="deps-up">+</button></div>
        <div class="stepper-cap">Kids, parents, spouse — anyone who relies on your income</div>
      </div>
    </div></div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Back</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue</button></div>
    </div>`; },
    mount(root){
      const ageVal = root.querySelector('#age-val'), depsVal = root.querySelector('#deps-val');
      root.querySelector('#age-dn').onclick = ()=>{ ST.age = clamp(ST.age-1,18,80); ageVal.textContent=ST.age; };
      root.querySelector('#age-up').onclick = ()=>{ ST.age = clamp(ST.age+1,18,80); ageVal.textContent=ST.age; };
      root.querySelector('#deps-dn').onclick = ()=>{ ST.deps = clamp(ST.deps-1,0,6); depsVal.textContent=ST.deps; };
      root.querySelector('#deps-up').onclick = ()=>{ ST.deps = clamp(ST.deps+1,0,6); depsVal.textContent=ST.deps; };
    },
    onContinue(){ goTo('inc-q'); }
  },
  'inc-q': {
    render(){ return `<div class="screen" data-id="inc-q"><div class="screen-scroll"><div class="v-center">
      <div class="eyebrow"><span class="dot"></span>Section 1 · Income</div>
      <h1 class="q-title">What do you take home each month?</h1>
      <div class="q-sub">After tax — your regular monthly income.</div>
      <div class="q-field"><div class="q-field-label">Monthly take-home income</div>
        <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-income" inputmode="numeric" placeholder="50,000" value="${ST.income?fmtIndianInput(ST.income):''}"></div>
      </div>
      <div class="q-field"><div class="q-field-label">Roughly what you spend monthly</div>
        <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-spending" inputmode="numeric" placeholder="30,000" value="${ST.spending?fmtIndianInput(ST.spending):''}"></div>
        <span class="q-hint">Rent, bills, groceries, EMIs — everything that leaves your account.</span>
      </div>
    </div></div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Back</button><button class="btn btn-primary" id="btn-continue" disabled onclick="continueClick()">Continue</button></div>
    </div>`; },
    mount(root){ wireCurrency('in-income','income',{max:20000000}); wireCurrency('in-spending','spending',{max:5000000}); root.querySelector('#in-income').focus(); },
    onContinue(){ goTo(ST.income >= 1000000 ? 'inc-extreme' : 'inc-r'); }
  },
  'inc-extreme': {
    render(){ return `<div class="screen" data-id="inc-extreme"><div class="screen-scroll"><div class="v-center" style="align-items:center;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🎩</div>
      <h1 class="q-title" style="text-align:center">Okay, that's a lot of zeroes.</h1>
      <div class="q-sub" style="text-align:center;margin-left:auto;margin-right:auto">This was built for the other 99.9% of India — at this income you've probably already got a wealth manager. Let's see what we've got anyway.</div>
    </div></div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Fix my number</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue anyway →</button></div>
    </div>`; },
    onContinue(){ goTo('inc-r'); }
  },
  'inc-r': {
    render(){
      const insight = incomeInsight(ST.income);
      const glowCls = insight.percentile>=95 ? 'glow-good' : insight.percentile<50 ? 'glow-start' : '';
      return `<div class="screen" data-id="inc-r"><div class="screen-scroll"><div class="reveal">
        <div class="reveal-badge">💰 Income check</div>
        ${edgeFlourish(glowCls==='glow-good'?'good':null, 'Exceptional earner')}
        <div class="reveal-visual ${glowCls}">${renderLadder(insight.percentile)}</div>
        <div class="reveal-number">${insight.topLabel}</div>
        <div class="reveal-headline">${insight.headline}</div>
        <div class="reveal-body">${insight.body}</div>
      </div></div>
      <div class="btn-row reveal-continue"><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue →</button></div>
      </div>`;
    },
    mount(){ const insight = incomeInsight(ST.income); if(insight.percentile>=90) setTimeout(()=>fireConfetti(insight.percentile>=99.5),500); },
    onContinue(){ goTo('sav-q'); }
  },
  'sav-q': {
    render(){
      const showCorpus = ST.age>=50;
      return `<div class="screen" data-id="sav-q"><div class="screen-scroll"><div class="v-center">
        <div class="eyebrow"><span class="dot"></span>Section 2 · Savings</div>
        <h1 class="q-title">How much have you saved up?</h1>
        <div class="q-sub">Money you could get to quickly — bank balance, FDs. Not locked-in investments.</div>
        <div class="q-field"><div class="q-field-label">Total savings right now</div>
          <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-savings" inputmode="numeric" placeholder="0" value="${ST.savings?fmtIndianInput(ST.savings):''}"></div>
        </div>
        <div class="q-field"><div class="q-field-label">How much you invest each month</div>
          <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-sip" inputmode="numeric" placeholder="0" value="${ST.sip?fmtIndianInput(ST.sip):''}"></div>
          <span class="q-hint">SIPs, mutual funds, stocks — 0 if none yet</span>
        </div>
        ${showCorpus?`<div class="q-field"><div class="q-field-label">Total retirement savings so far</div>
          <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-corpus" inputmode="numeric" placeholder="0" value="${ST.retirementCorpus?fmtIndianInput(ST.retirementCorpus):''}"></div>
          <span class="q-hint">PF, mutual funds, stocks — everything built up for retirement</span>
        </div>`:''}
      </div></div>
      <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Back</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue</button></div>
      </div>`;
    },
    mount(root){ wireCurrency('in-savings','savings',{max:500000000}); wireCurrency('in-sip','sip',{max:5000000}); if(ST.age>=50) wireCurrency('in-corpus','retirementCorpus',{max:500000000}); root.querySelector('#in-savings').focus(); },
    onContinue(){ goTo('sav-r'); }
  },
  'sav-r': {
    render(){
      const inp = deriveInp();
      const liqFloor = Math.floor(inp.liq);
      const insight = bufferInsight(liqFloor);
      const glowCls = liqFloor>=12 ? 'glow-good' : liqFloor<=0 ? 'glow-empty' : '';
      return `<div class="screen" data-id="sav-r"><div class="screen-scroll"><div class="reveal">
        <div class="reveal-badge">🛟 Safety check</div>
        ${edgeFlourish(glowCls==='glow-good'?'good':glowCls==='glow-empty'?'empty':null, glowCls==='glow-good'?'Outstanding cushion':'Zero cushion right now')}
        <div class="reveal-visual ${glowCls}">${renderShield('var(--k-safe)')}</div>
        <div class="reveal-number"><span id="reveal-num">0</span> month${liqFloor===1?'':'s'}</div>
        <div class="reveal-headline">${insight.headline}</div>
        <div class="reveal-body">${insight.body}</div>
        <div class="reveal-caption">Based on your monthly spending of ${krRs(inp.spend)} — not your income.</div>
      </div></div>
      <div class="btn-row reveal-continue"><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue →</button></div>
      </div>`;
    },
    mount(root){
      const inp = deriveInp(); const liqFloor = Math.floor(inp.liq); const pct = clamp(liqFloor/6*100,0,100);
      animateShield(pct); animateCount(root.querySelector('#reveal-num'), liqFloor, {duration:900, decimals:0});
      if(liqFloor>=6) setTimeout(()=>fireConfetti(liqFloor>=12),500);
    },
    onContinue(){ goTo('crd-q1'); }
  },
  'crd-q1': {
    render(){ return `<div class="screen" data-id="crd-q1"><div class="screen-scroll"><div class="v-center">
      <div class="eyebrow"><span class="dot"></span>Section 3 · Credit &amp; Loans</div>
      <h1 class="q-title">What do your loan EMIs add up to?</h1>
      <div class="q-sub">Total across every loan — home, auto, personal, everything.</div>
      <div class="q-field"><div class="q-field-label">Total monthly EMI outflow</div>
        <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-emi" inputmode="numeric" placeholder="0" value="${ST.emi?fmtIndianInput(ST.emi):''}"></div>
        <span class="q-hint" id="emi-hint">0 if you have no loans right now</span>
      </div>
      <div class="q-field"><div class="q-field-label">Credit score, if you know it <button class="skip" id="skip-score" type="button">Skip — I don't know it</button></div>
        <div class="q-input-wrap" id="score-wrap"><span class="q-prefix">#</span><input class="q-input" id="in-score" inputmode="numeric" placeholder="750" value="${ST.knownScore?ST.knownScore:''}" maxlength="3"></div>
      </div>
    </div></div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Back</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue</button></div>
    </div>`; },
    mount(root){
      const emiHint = root.querySelector('#emi-hint');
      wireCurrency('in-emi','emi',{max:5000000, onInput: v=>{
        emiHint.textContent = (v>0 && ST.spending>0 && v>ST.spending)
          ? `That's more than your ₹${fmtIndianInput(ST.spending)} monthly spending — worth double-checking.`
          : '0 if you have no loans right now';
        emiHint.style.color = (v>0 && ST.spending>0 && v>ST.spending) ? 'var(--k-tradeoff)' : '';
      }});
      const scoreInput = root.querySelector('#in-score');
      scoreInput.addEventListener('input', ()=>{ const v=parseNum(scoreInput.value).toString().slice(0,3); scoreInput.value=v; ST.knownScore = v?clamp(+v,300,900):null; });
      scoreInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('btn-continue').click(); } });
      root.querySelector('#skip-score').onclick = ()=>{ ST.knownScore=null; scoreInput.value=''; root.querySelector('#score-wrap').classList.add('disabled'); };
      root.querySelector('#in-emi').focus();
    },
    onContinue(){ goTo('crd-q2'); }
  },
  'crd-q2': {
    render(){ return `<div class="screen" data-id="crd-q2"><div class="screen-scroll"><div class="v-center">
      <div class="eyebrow"><span class="dot"></span>Section 3 · Credit &amp; Loans</div>
      <h1 class="q-title">And your credit cards?</h1>
      <div class="q-sub">Just your revolving balance — the part you're carrying month to month.</div>
      <div class="toggle-row" id="no-balance-row"><span>I always pay in full / no card</span><div class="toggle" id="no-balance-toggle"></div></div>
      <div class="q-field"><div class="q-field-label">Current card balance carried</div>
        <div class="q-input-wrap" id="bal-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-balance" inputmode="numeric" placeholder="0" value="${ST.cardBalance?fmtIndianInput(ST.cardBalance):''}"></div>
      </div>
      <div class="q-field"><div class="q-field-label">Total credit limit across cards</div>
        <div class="q-input-wrap" id="lim-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-limit" inputmode="numeric" placeholder="0" value="${ST.cardLimit?fmtIndianInput(ST.cardLimit):''}"></div>
      </div>
    </div></div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Back</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue</button></div>
    </div>`; },
    mount(root){
      wireCurrency('in-balance','cardBalance',{max:10000000}); wireCurrency('in-limit','cardLimit',{max:10000000});
      const toggle = root.querySelector('#no-balance-toggle');
      function sync(){ toggle.classList.toggle('on', ST.noCardBalance); root.querySelector('#bal-wrap').classList.toggle('disabled', ST.noCardBalance); root.querySelector('#lim-wrap').classList.toggle('disabled', ST.noCardBalance); }
      root.querySelector('#no-balance-row').onclick = ()=>{ ST.noCardBalance = !ST.noCardBalance; sync(); };
      sync();
    },
    onContinue(){ goTo('crd-r'); }
  },
  'crd-r': {
    render(){
      const inp = deriveInp(); const pillars = calcPillars(inp); const insight = creditInsight(pillars);
      const glowCls = pillars.credit>=0.80 ? 'glow-good' : pillars.credit<0.20 ? 'glow-empty' : '';
      const scoreTxt = ST.knownScore!=null ? inp.crd : '~700 (est.)';
      return `<div class="screen" data-id="crd-r"><div class="screen-scroll"><div class="reveal">
        <div class="reveal-badge">📈 Credit health check</div>
        ${edgeFlourish(glowCls==='glow-good'?'good':glowCls==='glow-empty'?'empty':null, glowCls==='glow-good'?'Excellent all round':'Needs attention')}
        <div class="reveal-visual ${glowCls}">${renderGauge(pillars.credit)}</div>
        <div class="reveal-number is-word">${insight.band}</div>
        <div class="reveal-headline">${insight.headline}</div>
        <div class="reveal-body">${insight.body}</div>
        <div class="stat-chips" style="margin-top:6px">
          <div class="stat-chip"><span class="ic">📋</span><span class="v">${inp.foi}%</span><span class="l">EMI/income</span></div>
          <div class="stat-chip"><span class="ic">📈</span><span class="v">${scoreTxt}</span><span class="l">score</span></div>
          <div class="stat-chip"><span class="ic">💳</span><span class="v">${inp.util}%</span><span class="l">card use</span></div>
        </div>
      </div></div>
      <div class="btn-row reveal-continue"><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue →</button></div>
      </div>`;
    },
    mount(){ const inp=deriveInp(); const pillars=calcPillars(inp); animateGauge(pillars.credit); if(pillars.credit>=0.80) setTimeout(()=>fireConfetti(pillars.credit>=0.92),500); },
    onContinue(){ goTo('ins-q'); }
  },
  'ins-q': {
    render(){ return `<div class="screen" data-id="ins-q"><div class="screen-scroll"><div class="v-center">
      <div class="eyebrow"><span class="dot"></span>Section 4 · Insurance</div>
      <h1 class="q-title">How protected is your family?</h1>
      <div class="q-sub">The total cover amount on your policies — 0 if you don't have one.</div>
      <div class="q-field"><div class="q-field-label">Life insurance cover amount</div>
        <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-life" inputmode="numeric" placeholder="0" value="${ST.lifeCover?fmtIndianInput(ST.lifeCover):''}"></div>
      </div>
      <div class="q-field"><div class="q-field-label">Health insurance cover amount</div>
        <div class="q-input-wrap"><span class="q-prefix">₹</span><input class="q-input" id="in-health" inputmode="numeric" placeholder="0" value="${ST.healthCover?fmtIndianInput(ST.healthCover):''}"></div>
        <span class="q-hint">For yourself and anyone covered under the same policy</span>
      </div>
    </div></div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="goBack()">Back</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue</button></div>
    </div>`; },
    mount(root){ wireCurrency('in-life','lifeCover',{max:1000000000}); wireCurrency('in-health','healthCover',{max:100000000}); root.querySelector('#in-life').focus(); },
    onContinue(){ goTo('ins-r'); }
  },
  'ins-r': {
    render(){
      const inp = deriveInp(); const pillars = calcPillars(inp); const insight = insuranceInsight(inp, pillars);
      // With no dependents, life cover isn't weighed at all (matches the
      // engine's own logic below) — averaging it in anyway would unfairly
      // drag the number down for someone whose health cover is actually fine.
      const healthPct = inp.hlt/Math.max(1,pillars.hc_target)*100;
      const pct = inp.deps>0 ? clamp(((inp.cvr/10)*100+healthPct)/2,0,100) : clamp(healthPct,0,100);
      const glowCls = pct>=90 ? 'glow-good' : pct<15 ? 'glow-empty' : '';
      return `<div class="screen" data-id="ins-r"><div class="screen-scroll"><div class="reveal">
        <div class="reveal-badge">🛡️ Protection check</div>
        ${edgeFlourish(glowCls==='glow-good'?'good':glowCls==='glow-empty'?'empty':null, glowCls==='glow-good'?'Fully covered':'Uninsured right now')}
        <div class="reveal-visual ${glowCls}">${renderShield('var(--k-gold)')}</div>
        <div class="reveal-headline">${insight.headline}</div>
        <div class="reveal-body">${insight.body}</div>
        ${insight.note?`<div class="reveal-caption">${insight.note}</div>`:''}
      </div></div>
      <div class="btn-row reveal-continue"><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">See your report →</button></div>
      </div>`;
    },
    mount(){
      const inp=deriveInp(); const pillars=calcPillars(inp);
      const healthPct = inp.hlt/Math.max(1,pillars.hc_target)*100;
      const pct = inp.deps>0 ? clamp(((inp.cvr/10)*100+healthPct)/2,0,100) : clamp(healthPct,0,100);
      animateShield(pct); if(pct>=90) setTimeout(()=>fireConfetti(pct>=99),500);
    },
    onContinue(){ goTo('summary'); }
  },
  summary: {
    render(){
      const inp = deriveInp();
      const weights = calcWeights(inp);
      const pillars = calcPillars(inp);
      const fri = calcFRI(pillars, weights);
      const pos = krPositive(inp, pillars);
      const cands = krCandidates(inp, pillars, weights, fri);
      const moves = krPrioritise(cands);
      LAST_REPORT = {inp, pillars, weights, fri, pos, cands, moves};
      const hasCritical = moves.some(m=>m.crit);
      const effortRank = {LOW:0,MED:1,HIGH:2};
      const todayMove = (moves[0] && moves[0].crit) ? moves[0] : moves.slice().sort((a,b)=>effortRank[a.effort]-effortRank[b.effort])[0];

      let html = `<div class="kr-verdict"><div class="kr-eyebrow">Your KYFR Report</div><h1>${krVerdict(moves,hasCritical)}</h1></div>`;
      html += `<div class="kr-positive"><div class="kr-badge"><span class="dot"></span>What you're already getting right</div><div class="kr-pos-headline">${pos.head}</div><div class="kr-pos-payoff">${pos.payoff}</div></div>`;
      if(todayMove){
        html += `<div class="kr-today"><div class="kr-today-eyebrow"><span class="kr-today-icon">${todayMove.icon||'◆'}</span>Start today — just this one thing</div><div class="kr-today-trigger">${todayMove.trigger}</div><div class="kr-today-body">${todayMove.action}.</div><div class="kr-today-chips"><span class="kr-today-chip">⏱ ${todayMove.mins||'a few min'}</span><span class="kr-today-chip">${todayMove.title}</span></div></div>`;
      }
      if(moves.length){
        html += `<div class="kr-alsolbl">${moves.length===1?'Do this next':'Do these next, in order'}</div>`;
        html += `<div class="kr-moves">`;
        moves.forEach((m,i)=>{
          html += `<div class="kr-move sev-${m.cls}"><div class="kr-move-head"><span class="kr-move-icon">${m.icon}</span><span class="kr-move-title">${m.title}</span><span class="kr-move-n">${i+1}</span></div><div class="kr-move-body"><div class="kr-move-hero"><span class="arrow">→</span>${m.action}.</div>${m.visualHtml}<div class="kr-move-why-mini"><span class="ic">💡</span><span>${m.microWhy}</span></div><div class="kr-cost-lbl">If you wait</div><div class="kr-cost"><span class="kr-cost-icon">${m.crit?'🔴':'⏳'}</span><span class="kr-cost-num">${m.costNum}</span><span class="kr-cost-cap">${m.costCap}</span></div></div></div>`;
        });
        html += `</div>`;
      }
      html += `<div class="summary-detail-cta" onclick="goTo('detail')"><div class="ic">🔍</div><div class="tx"><b>See the full breakdown</b><span>Every pillar, the numbers behind it, and why we prioritised what we did</span></div><div class="chev">→</div></div>`;
      return `<div class="screen" data-id="summary"><div class="screen-scroll">${html}</div>
        <div class="btn-row" style="flex-direction:column;gap:10px">
          <button class="btn btn-primary" id="btn-continue" onclick="continueClick()">What's next →</button>
          <button class="summary-footer-link" type="button" onclick="goTo('detail')">🔍 See the full breakdown →</button>
        </div>
      </div>`;
    },
    onContinue(){ goTo('cta'); }
  },
  detail: {
    render(){
      const {inp, pillars, cands, moves} = LAST_REPORT;
      const cards = CASCADE.map(key => buildPillarDetail(key, inp, pillars, cands, moves));
      const items = cards.map(c => `<div class="acc">
          <div class="acc-head" ${c.picked && c.rank===0 ? 'data-priority-1' : ''} onclick="toggleAcc(this)">
            <div class="acc-pillar-icon">${c.icon}</div>
            <div class="ttl">${c.title}${c.picked?`<span class="priority-tag">#${c.rank+1} priority</span>`:''}</div>
            <div class="sev-pill ${c.sevCls}">${c.sevLabel}</div>
            <svg class="acc-chev" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
          </div>
          <div class="acc-body"><div class="acc-body-in">
            ${c.actionLine?`<div class="acc-action-hero"><span class="arrow">→</span>${c.actionLine}</div>`:''}
            ${c.visual}
            <div class="stat-chips">${c.chips.map(ch=>`<div class="stat-chip"><span class="ic">${ch.ic}</span><span class="v">${ch.v}</span><span class="l">${ch.l}</span></div>`).join('')}</div>
            ${c.note?`<div class="acc-caption" style="font-style:normal;color:var(--k-tradeoff)">ℹ️ ${c.note}</div>`:''}
            <div class="acc-caption">${c.whyMatters}</div>
            <div class="rank-reason"><span class="n">💡</span><span>${c.reason}</span></div>
          </div></div>
        </div>`).join('');
      return `<div class="screen" data-id="detail"><div class="screen-scroll">
        <div class="eyebrow"><span class="dot"></span>The full breakdown</div>
        <h1 class="q-title">Every pillar, at a glance.</h1>
        ${buildOverviewRing(cards)}
        ${items}
      </div>
      <div class="btn-row"><button class="btn btn-ghost" onclick="goTo('summary')">← Back to report</button><button class="btn btn-primary" id="btn-continue" onclick="continueClick()">Continue →</button></div>
      </div>`;
    },
    mount(root){
      const target = root.querySelector('[data-priority-1]') || root.querySelector('.acc-head');
      if(target) toggleAcc(target);
    },
    onContinue(){ goTo('cta'); }
  },
  cta: {
    render(){ return `<div class="screen" data-id="cta"><div class="screen-scroll"><div class="cta-screen" style="min-height:100%">
      <div class="cta-phone"><img src="${LOGO_SRC}" alt="KYFR"></div>
      <h1>This was just a <em>preview</em>.</h1>
      <p>The real KYFR app tracks this automatically, updates it every month, and goes far deeper than four questions ever could.</p>
      <div class="cta-features">
        <div class="cta-feature"><span class="ic">🔄</span><span>Auto-updates as your accounts change</span></div>
        <div class="cta-feature"><span class="ic">📉</span><span>Watches your money get stronger, month by month</span></div>
        <div class="cta-feature"><span class="ic">🎯</span><span>Personalised moves, not generic advice</span></div>
      </div>
      <form class="notify-form" onsubmit="handleNotify(event); return false;" novalidate>
        <input class="notify-input" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" required id="notify-email" aria-label="Email">
        <div class="notify-phone"><span>+91</span><input type="tel" inputmode="tel" autocomplete="tel-national" placeholder="Mobile number" required id="notify-phone" aria-label="Mobile number"></div>
        <input class="notify-trap" type="text" name="website" id="notify-website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="notify-error" id="notify-error" role="alert"></div>
        <button class="btn btn-primary" type="submit" id="notify-btn">Notify me</button>
        <div class="notify-consent">We'll use these only to tell you when the app is ready.</div>
      </form>
      <button class="btn-text cta-restart" type="button" onclick="restartFlow()">Start over with different numbers</button>
    </div></div></div>`; },
    mount(){ setTimeout(fireConfetti, 300); }
  }
};

export function toggleAcc(headEl){
  const acc = headEl.closest('.acc');
  const body = acc.querySelector('.acc-body');
  const isOpen = acc.classList.contains('open');
  if(isOpen){ acc.classList.remove('open'); body.style.maxHeight = null; }
  else { acc.classList.add('open'); body.style.maxHeight = body.scrollHeight+'px'; }
}
export async function handleNotify(e){
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('#notify-btn');
  const errEl = form.querySelector('#notify-error');
  const fail = (msg) => { errEl.textContent = msg; };
  fail('');
  const email = normaliseEmail(form.querySelector('#notify-email').value);
  const phone = normalisePhone(form.querySelector('#notify-phone').value);
  if(!email) return fail('Enter a valid email address.');
  if(!phone) return fail('Enter a 10-digit Indian mobile number.');
  // A bot fills every field; a person never sees this one. Pretend it worked.
  if(form.querySelector('#notify-website').value) { btn.textContent = "You're on the list ✓"; btn.disabled = true; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const lead = buildLead({email, phone}, ST, LAST_REPORT, {device: innerWidth < 768 ? 'Mobile' : 'Desktop', search: location.search, referrer: document.referrer});
    await postLead(LEADS_URL, lead);
    form.querySelectorAll('input').forEach(i => i.disabled = true);
    btn.textContent = "You're on the list ✓";
  } catch {
    btn.disabled = false; btn.textContent = 'Notify me';
    fail("We couldn't save that. Check your connection and try again.");
  }
}
