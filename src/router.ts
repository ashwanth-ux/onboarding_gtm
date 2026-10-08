import { SCREENS } from './screens'

import { ST } from './state'
import { newSession } from './lead'
import { el } from './ui/dom'
import { updateProgress, updateSidePanel } from './ui/chrome'

let currentScreenId = null;
let screenHistory = [];
const VALIDATORS = { 'inc-q': () => ST.income>0 && ST.spending>0 };

export function continueClick(){ const s=SCREENS[currentScreenId]; if(s && s.onContinue) s.onContinue(); }
export function goBack(){ const prev = screenHistory.pop(); if(prev) goTo(prev, true); }

let isTransitioning = false;
export function goTo(id, isBack?){
  if(isTransitioning) return; // ignore rapid double-taps mid-transition
  isTransitioning = true;
  if(!isBack && currentScreenId) screenHistory.push(currentScreenId);
  const container = document.getElementById('screens');
  container.querySelectorAll('.screen:not(.active)').forEach(n=>n.remove()); // defensive: clear any stragglers
  const prev = container.querySelector('.screen.active');
  const node = el(SCREENS[id].render());
  container.appendChild(node);
  currentScreenId = id;
  updateProgress(id);
  updateSidePanel(id);
  requestAnimationFrame(()=>{
    node.classList.add('active');
    if(prev){ prev.classList.remove('active'); prev.classList.add('leaving'); }
  });
  if(SCREENS[id].mount) SCREENS[id].mount(node);
  validateCurrent();
  const scrollEl = node.querySelector('.screen-scroll'); if(scrollEl) scrollEl.scrollTop = 0;
  setTimeout(()=>{ if(prev && prev.parentNode) prev.remove(); isTransitioning = false; }, 460);
}
export function validateCurrent(){
  const btn = document.getElementById('btn-continue') as HTMLButtonElement;
  if(!btn) return;
  const v = VALIDATORS[currentScreenId];
  btn.disabled = v ? !v() : false;
}
export function restartFlow(){
  newSession();
  Object.assign(ST, {age:28,deps:0,income:0,spending:0,savings:0,sip:0,retirementCorpus:0,emi:0,knownScore:null,cardBalance:0,cardLimit:0,noCardBalance:false,lifeCover:0,healthCover:0});
  screenHistory = []; document.getElementById('screens').innerHTML=''; currentScreenId = null;
  goTo('welcome');
}
