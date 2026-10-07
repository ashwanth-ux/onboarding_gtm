import { fmtIndianInput, parseNum } from '../format'
import { ST } from '../state'
import { validateCurrent } from '../router'

export function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }
export function animateCount(node, target, opts){
  opts = opts || {};
  const duration = opts.duration || 1000, prefix = opts.prefix||'', suffix = opts.suffix||'', decimals = opts.decimals||0;
  const start = performance.now();
  function tick(now){
    const t = Math.min(1,(now-start)/duration);
    const eased = 1-Math.pow(1-t,3);
    node.textContent = prefix + (target*eased).toFixed(decimals) + suffix;
    if(t<1) requestAnimationFrame(tick); else node.textContent = prefix+target.toFixed(decimals)+suffix;
  }
  requestAnimationFrame(tick);
}
export function fireConfetti(big){
  const canvas = document.getElementById('confetti-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const colors = big ? ['#9F5FE5','#F03BBD','#FFC24B','#14ED60','#FFD700'] : ['#9F5FE5','#F03BBD','#FFC24B','#14ED60'];
  const n = big ? 160 : 90;
  const spread = big ? 260 : 160;
  const parts = Array.from({length:n},()=>({
    x: innerWidth/2 + (Math.random()-0.5)*spread, y: innerHeight*0.32,
    vx:(Math.random()-0.5)*(big?13:10), vy:-Math.random()*(big?13:10)-4, size:(big?5:4)+Math.random()*4,
    color: colors[Math.floor(Math.random()*colors.length)], rot:Math.random()*360, vr:(Math.random()-0.5)*14, life:1
  }));
  function frame(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive=false;
    parts.forEach(p=>{
      p.vy+=0.35; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr; p.life-=0.012;
      if(p.life>0){ alive=true; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
        ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6); ctx.restore(); }
    });
    if(alive) requestAnimationFrame(frame); else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  frame();
}
addEventListener('resize', ()=>{ const c=document.getElementById('confetti-canvas') as HTMLCanvasElement; if(c){c.width=innerWidth;c.height=innerHeight;} });

export function wireCurrency(id, key, opts){
  opts = opts || {};
  const max = opts.max != null ? opts.max : 1e13;
  const input = document.getElementById(id) as HTMLInputElement;
  if(!input) return;
  input.addEventListener('input', ()=>{
    const raw = Math.min(max, parseNum(input.value));
    input.value = raw ? fmtIndianInput(raw) : '';
    ST[key] = raw;
    if(opts.onInput) opts.onInput(raw);
    validateCurrent();
  });
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); const btn=document.getElementById('btn-continue') as HTMLButtonElement; if(btn && !btn.disabled) btn.click(); } });
}
