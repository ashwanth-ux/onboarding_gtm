// Benchmark engine: real India data, cited in-product.
//   Emergency fund: Paisabazaar 2024 (60% of salaried can't cover 3mo) +
//     Finology/Business Standard 2024 (75% lack adequate fund, 40% zero).
//   Insurance: NFHS-6 2023-24 (60.2% of households have health cover,
//     up from 41% in NFHS-5) + IRDAI FY25 (life penetration 2.7% of GDP).
//   Income: INCOME_ANCHORS below, with a log-interpolation between anchors.
// All-India basis throughout (PLFS and WID both count the full population,
// informal and agricultural work included).
// Denominator: all individual income earners in India. A "salaried-only"
// curve was tried and reverted — the only breakdown found for that specific
// population (Economic Survey 2020-21, salaried percentiles) traced back to
// a single LinkedIn post with no primary source, so it wasn't trustworthy
// enough to stand behind. These anchors are all independently checkable:
//  ₹3,000/mo  → P27.5  (PLFS 2023-24: bottom 27.5% of the labour force earn below this)
//  ₹9,000/mo  → P50    (PLFS 2023-24: median individual earning)
//  ₹15,000/mo → P78    (PLFS 2023-24: top 22% of the labour force earn above this)
//  ₹27,000/mo → P90    (PLFS "₹25-30k = top 10%" AND World Inequality Lab's own
//                        ~₹3.2L/yr adult top-10% threshold independently agree)
//  ₹55,000/mo → P95    (commonly-cited all-India top-5% threshold, ~₹6-7L/yr)
//  ₹1,72,500/mo → P99  (World Inequality Lab: top-1% entry threshold, ₹20.7L/yr,
//                        2022-23 — cross-checked against independent public data)
//  ₹4,16,667/mo → P99.85 (derived: CBDT/ITR — top 1.4% of the ~6% who file ITR
//                          earn >₹50L/yr; 1.4% of the top 6% ≈ top 0.08% of all India)
//  ₹8,33,333/mo → P99.95 (derived the same way from "top 0.47% of filers >₹1Cr/yr")
import { SEVERITY, clamp } from './crisp'

export const INCOME_ANCHORS = [
  [3000,27.5],[9000,50],[15000,78],[27000,90],
  [55000,95],[172500,99],[416667,99.85],[833333,99.95]
];
export function interpPercentile(income){
  if(income<=INCOME_ANCHORS[0][0]) return INCOME_ANCHORS[0][1];
  for(let i=0;i<INCOME_ANCHORS.length-1;i++){
    const [x0,y0]=INCOME_ANCHORS[i], [x1,y1]=INCOME_ANCHORS[i+1];
    if(income<=x1){ const t=(Math.log(income)-Math.log(x0))/(Math.log(x1)-Math.log(x0)); return y0+t*(y1-y0); }
  }
  return INCOME_ANCHORS[INCOME_ANCHORS.length-1][1];
}
export function incomeInsight(inc){
  const pRaw = clamp(interpPercentile(Math.max(1,inc)), 1, 99.9);
  const topRaw = 100-pRaw;
  // Round ONCE, to the exact value the badge displays, then derive every
  // banding decision from that same rounded number — otherwise a raw
  // percentile just under a threshold (97.97) can round up to a headline
  // number ("top 2%") that implies a tier the copy below it disagrees with.
  const top = topRaw>=10 ? Math.round(topRaw) : topRaw>=1 ? Math.round(topRaw*2)/2 : +topRaw.toFixed(1);
  const p = 100-top;
  // One metric, shown exactly once: the "top X%" figure is the hero number
  // above this. Headline and body add new framing, never restate that digit.
  let headline, body;
  if(p>=99.5){ headline="You're in the rarest tier of earners."; body=`A position almost no one in India ever reaches.`; }
  else if(p>=98){ headline="You're deep in India's top earners."; body=`A bracket most people never get close to.`; }
  else if(p>=95){ headline="You're in top-5% territory."; body=`A position most Indian earners never reach.`; }
  else if(p>=90){ headline="You're already ahead of 9 out of 10 Indians."; body=`Firmly in the country's upper income tier.`; }
  else if(p>=75){ headline="You're earning more than most of India."; body=`Most of the country is earning less than you right now.`; }
  else if(p>=50){ headline="You're already earning more than half of India."; body=`You've cleared a bar most people are still working toward.`; }
  else { headline="This is exactly where most of India starts."; body=`You're not behind — you're building from a common, real starting point.`; }
  return {percentile:p, top, topLabel:`top ${top}%`, headline, body};
}
// liqFloor is a whole, floored number of months — never a decimal — and the
// body always cashes it out as one concrete, non-abstract consequence (a
// career break) instead of restating the number the big stat already shows.
export function bufferInsight(liqFloor){
  const breakLine = liqFloor >= 1
    ? `Even taking a ${liqFloor}-month break wouldn't hurt you financially.`
    : `Right now, even a short break could really hurt — that's exactly what this fixes.`;
  if(liqFloor<=0) return {headline:"Most people start exactly here.", body: breakLine};
  if(liqFloor<3) return {headline:"You've already started — the hardest part.", body: breakLine};
  if(liqFloor<6) return {headline:"You've hit a benchmark most Indians haven't.", body: breakLine};
  return {headline:"You're in a genuinely small minority.", body: breakLine};
}
// The score the user typed in is an input, not an insight — echoing it back
// isn't new information. What IS new: a single consolidated credit-health
// read that blends EMI burden, bureau score and card usage the same way the
// engine does (50/37/13), plus which of the three is actually holding it
// back — something no credit report hands you directly.
export function creditInsight(pillars){
  const pct = Math.round(pillars.credit*100);
  const [sevLbl] = SEVERITY(pillars.credit);
  const bandMap = {CRITICAL:'Needs Work', CAUTION:'Fair', IMPROVE:'Good', OK:'Excellent'};
  const band = bandMap[sevLbl];
  const factors = [
    {name:'EMI burden', score: pillars.credit_foir},
    {name:'Credit score', score: pillars.credit_bureau},
    {name:'Card usage', score: pillars.credit_util},
  ];
  const weakest = factors.slice().sort((a,b)=>a.score-b.score)[0];
  let headline, body;
  if(band==='Excellent'){ headline="Your credit health is excellent."; body=`EMI burden, score and card usage are all pulling their weight — lenders compete for you.`; }
  else if(band==='Good'){ headline="Your credit health is good."; body=`Solid overall — ${weakest.name} is the one area with the most room to grow.`; }
  else if(band==='Fair'){ headline="Your credit health is fair."; body=`${weakest.name} is what's dragging down an otherwise decent picture.`; }
  else { headline="Your credit health needs work."; body=`${weakest.name} is the single biggest drag right now — fixing that moves the needle most.`; }
  return {band, pct, headline, body, weakest};
}
export function insuranceInsight(inp, pillars){
  const hasLife = inp.cvr>0, hasHealth = inp.hlt>0;
  const lifeOk = pillars.life_score>=78, healthOk = pillars.health_score>=78;
  // Life cover only protects people who depend on your income — with none,
  // it's genuinely not being weighed, not silently ignored. Said outright so
  // a ₹0 life-cover number is never confusing.
  const note = inp.deps===0 ? `You have no dependents, so life cover isn't being weighed here — health cover is, for everyone.` : null;
  if((inp.deps===0 || lifeOk) && healthOk){
    return {headline:"You've covered ground most households haven't.", body:`Only 6 in 10 Indian households have any health cover at all — you're ahead of the curve.`, note};
  }
  if(hasLife || hasHealth){
    return {headline:"You've already started — most people haven't.", body:`You're part of a rising minority. Next, let's make sure the cover is enough.`, note};
  }
  return {headline:"You're not alone — and that's exactly why this matters.", body:`Most Indian families are one bad diagnosis away from real financial damage.`, note};
}
