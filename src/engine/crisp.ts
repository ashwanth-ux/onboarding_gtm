// CrISP scoring engine, ported verbatim from the KYFR simulator.
export const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi,v));

export function foirScoreBase(f){
  if(f<=.30) return 1.0;
  if(f<=.50) return 1.0-((f-.30)/.20)*.40;
  if(f<=.70) return 0.60-((f-.50)/.20)*.50;
  return 0.08;
}
export function foirScorePreRet(f){
  if(f<=.10) return 1.0;
  if(f<=.20) return 1.0-((f-.10)/.10)*.28;
  if(f<=.30) return 0.72-((f-.20)/.10)*.27;
  if(f<=.40) return 0.45-((f-.30)/.10)*.27;
  if(f<=.70) return 0.18-((f-.40)/.30)*.13;
  return 0.03;
}
export function foirScore(f, age){
  if(age < 50) return foirScoreBase(f);
  if(age >= 55) return foirScorePreRet(f);
  const t = (age-50)/5;
  return foirScoreBase(f)*(1-t) + foirScorePreRet(f)*t;
}
export function utilScore(u){
  if(u <= 0.10) return 100;
  if(u <= 0.30) return 100 - (u-0.10)/0.20*15;
  if(u <= 0.60) return 85  - (u-0.30)/0.30*40;
  if(u <= 0.90) return 45  - (u-0.60)/0.30*45;
  return 0;
}
export function coverageToScore(r){
  r = Math.max(0, r);
  if(r >= 1.00) return clamp(90 + 10*Math.min(1,(r-1)/0.5), 90, 100);
  if(r >= 0.75) return 75 + (r-0.75)/0.25*14;
  if(r >= 0.50) return 55 + (r-0.50)/0.25*19;
  return clamp(r/0.50*54, 0, 54);
}
export function healthTarget(monthly_inc){
  const a = monthly_inc*12/100000;
  if(a <= 10) return 15;
  if(a <= 25) return 15 + (a-10)/15*60;
  return 75 + Math.min(1,(a-25)/175)*525;
}
export const PROT_W = [0.7, 1.0, 1.3, 1.5, 1.5];
export function protWeight(deps){ return PROT_W[Math.min(deps,4)]; }
export function protFloor(deps){ return deps===0 ? 0.10 : 0.05; }
export const incomeType = 'salaried';
export function bufTarget(){ return 6; }
export function enterpriseScore(){ return 0.92; }

export function calcWeights({deps, age}){
  const pw = protWeight(deps);
  let s=1.0, c=1.5, i=1.2, p=pw, e=0.8;
  if(age >= 50){
    const t = clamp((age-50)/5, 0, 1);
    s = s + t*0.1; c = c + t*0.3; i = i + t*(0.9-i); p = p + t*(1.0-p);
  }
  return {savings:s, credit:c, investment:i, protection:p, enterprise:e};
}
export function calcPillars(inp){
  const {liq, foi, crd, util, cvr, hlt, inv, age, deps, corpus, inc} = inp;
  const bt = bufTarget();
  const savings = clamp(liq/bt, 0, 1);
  let foirComp;
  if(age<28 && foi<20){
    const savDisc = clamp((inv/100)/0.05, 0, 1);
    const blend   = clamp((29-age)/3, 0, 1);
    foirComp = blend*savDisc + (1-blend)*foirScore(foi/100, age);
  } else { foirComp = foirScore(foi/100, age); }
  let crdEff = crd;
  if(age<29 && crd<680){ const t = clamp((29-age)/4, 0, 1); crdEff = crd + t*Math.max(0, 640-crd); }
  let bureau_score = clamp((crdEff-300)/600*100, 0, 100);
  if(crdEff >= 750) bureau_score = Math.min(100, bureau_score + (crdEff-750)/150*10);
  const bureau = bureau_score/100;
  const u_score = utilScore(util/100)/100;
  const credit = foirComp*0.50 + bureau*0.37 + u_score*0.13;
  const rateScore   = Math.max(0.05, clamp((inv/100)/0.20, 0, 1));
  const corpusScore = clamp(corpus/25, 0, 1);
  let investment;
  if(age < 48)      investment = rateScore;
  else if(age >= 52) investment = Math.max(0.05, corpusScore);
  else { const t = (age-48)/4; investment = Math.max(0.05, rateScore*(1-t) + corpusScore*t); }
  const life_r     = clamp(cvr/10, 0, 1.5);
  const prem_credit = clamp(Math.max(0, age-40)*0.006, 0, 0.20);
  const life_score  = coverageToScore(Math.min(life_r + prem_credit, 1.5));
  const hc_target   = healthTarget(inc);
  const health_r    = clamp(hlt/hc_target, 0, 1.5);
  const health_score = coverageToScore(health_r);
  const prot_raw  = 0.5*Math.min(life_score, health_score) + 0.5*(life_score+health_score)/2;
  const protection = clamp(Math.max(protFloor(deps), prot_raw/100), 0, 1);
  const enterprise = enterpriseScore();
  return {savings, credit, investment, protection, enterprise, hc_target, life_score, health_score,
    credit_foir:foirComp, credit_bureau:bureau, credit_util:u_score};
}
export function calcFRI(pillars: Record<string, number>, weights: Record<string, number>){
  const W_SUM = Object.values(weights).reduce((a,b)=>a+b, 0);
  let denom = 0;
  for(const [k,w] of Object.entries(weights)) if(k in pillars) denom += w/Math.max(0.001, pillars[k]);
  const whm = W_SUM/denom;
  let mult = 1.0;
  if(pillars.savings < 0.167) mult *= 0.28; else if(pillars.savings < 0.333) mult *= 0.62;
  if(pillars.credit < 0.30) mult *= 0.78;
  return clamp(Math.round(whm*mult*100), 0, 100);
}
export function whatIfFri(pillars: Record<string, number>, weights: Record<string, number>, key: string){
  const fixed = Object.assign({}, pillars, {[key]: Math.max(pillars[key], 0.60)});
  return calcFRI(fixed, weights);
}
export const CASCADE = ['savings','credit','protection','investment'];
export const SEVERITY = s => s < 0.35 ? ['CRITICAL'] : s < 0.55 ? ['CAUTION'] : s < 0.80 ? ['IMPROVE'] : ['OK'];
