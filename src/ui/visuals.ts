// visual builders for reveal screens
import { clamp } from '../engine/crisp'

export function renderLadder(percentile){
  const n = 12;
  const idx = Math.min(n-1, Math.round(percentile/100*(n-1)));
  let bars = '';
  for(let i=0;i<n;i++){
    const h = 16 + Math.pow(i/(n-1), 1.6)*84;
    const isYou = i===idx;
    bars += `<div class="ladder-bar${isYou?' you':''}" style="height:${h}%">${isYou?'<div class="ladder-marker"><span class="pin">📍</span></div>':''}</div>`;
  }
  return `<div class="ladder">${bars}</div>`;
}
export function renderShield(color){
  const path = "M50 4 L92 20 V54 C92 84 74 100 50 106 C26 100 8 84 8 54 V20 Z";
  return `<div class="shield-wrap">
    <svg viewBox="0 0 100 110"><path d="${path}" fill="none" stroke="var(--k-line)" stroke-width="5"/></svg>
    <svg viewBox="0 0 100 110" style="position:absolute;inset:0;clip-path:inset(100% 0 0 0)" id="shield-fill-svg"><path d="${path}" fill="${color}"/></svg>
  </div>`;
}
export function animateShield(pct){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const svg = document.getElementById('shield-fill-svg');
    if(svg){ svg.style.transition='clip-path 1.1s var(--ease)'; svg.style.clipPath = `inset(${100-pct}% 0 0 0)`; }
  }));
}
// Takes the CONSOLIDATED 0-1 credit-health score (EMI burden + bureau score +
// card usage, blended the same 50/37/13 way the engine weighs them) — not
// the raw bureau score alone, so the gauge reflects the same number the
// reveal is actually reporting.
export function renderGauge(pct01){
  const pct = clamp(pct01,0,1);
  const color = pct>=0.80?'var(--k-safe)':pct>=0.55?'var(--k-accent)':pct>=0.35?'var(--k-tradeoff)':'var(--k-harm)';
  return `<div class="gauge-wrap"><svg viewBox="0 0 220 120" width="100%" height="100%">
    <path d="M14 110 A96 96 0 0 1 206 110" fill="none" stroke="var(--k-line)" stroke-width="14" stroke-linecap="round"/>
    <path id="gauge-arc" d="M14 110 A96 96 0 0 1 206 110" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="0 301"/>
    <line class="gauge-needle" id="gauge-needle" x1="110" y1="108" x2="110" y2="28" stroke="#fff" stroke-width="4" stroke-linecap="round" style="transform:rotate(-90deg)"/>
    <circle cx="110" cy="108" r="8" fill="#fff"/>
  </svg></div>`;
}
export function animateGauge(pct01){
  const pct = clamp(pct01,0,1);
  const angle = -90 + pct*180;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const arc = document.getElementById('gauge-arc'), needle = document.getElementById('gauge-needle');
    if(arc){ arc.style.transition='stroke-dasharray 1.1s var(--ease)'; arc.setAttribute('stroke-dasharray', `${pct*301} 301`); }
    if(needle){ needle.style.transform = `rotate(${angle}deg)`; }
  }));
}
export function edgeFlourish(kind, text){
  if(!kind) return '';
  return `<div class="edge-flourish ${kind}">${kind==='good'?'🏆':'⚠️'} ${text}</div>`;
}
