export const ST = { age:28, deps:0, income:0, spending:0, savings:0, sip:0, retirementCorpus:0,
  emi:0, knownScore:null, cardBalance:0, cardLimit:0, noCardBalance:false, lifeCover:0, healthCover:0 };

// Runway (liq) and the retirement corpus multiple are both hedged on SPENDING,
// not income — that's the financially correct denominator (what you'd
// actually have to cover if income stopped), and it's the standard "25×
// annual spending" definition retirement planners use. Always surfaced to the
// user as "based on your spending," never left ambiguous.
export function deriveInp(){
  const inc = ST.income;
  const spend = ST.spending;
  const foi = inc>0 ? Math.min(100, Math.round(ST.emi/inc*100)) : 0;
  const liq = spend>0 ? Math.min(60, +(ST.savings/spend).toFixed(1)) : 0;
  const inv = inc>0 ? Math.min(60, Math.round(ST.sip/inc*100)) : 0;
  const util = (ST.noCardBalance || ST.cardLimit<=0) ? 0 : Math.min(100, Math.round(ST.cardBalance/ST.cardLimit*100));
  const crd = ST.knownScore != null ? ST.knownScore : 700;
  const cvr = inc>0 ? Math.min(50, +(ST.lifeCover/(inc*12)).toFixed(1)) : 0;
  const hlt = Math.min(100000, +(ST.healthCover/1e5).toFixed(1));
  const corpus = (ST.age>=50 && spend>0) ? Math.min(60, +(ST.retirementCorpus/(spend*12)).toFixed(1)) : 0;
  return {inc, spend, liq, foi, crd, util, cvr, hlt, inv, age:ST.age, corpus, deps:ST.deps};
}
