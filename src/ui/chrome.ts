export function updateProgress(id){
  const rail = document.getElementById('progress-rail');
  rail.hidden = ['welcome','about','cta'].includes(id);
  const map = {'inc-q':0,'inc-r':0,'sav-q':1,'sav-r':1,'crd-q1':2,'crd-q2':2,'crd-r':2,'ins-q':3,'ins-r':3};
  const keys = ['income','savings','credit','insurance'];
  if(['summary','detail'].includes(id)){ keys.forEach(k=>document.getElementById('pf-'+k).style.width='100%'); return; }
  if(!(id in map)) return;
  const activeIdx = map[id];
  keys.forEach((k,i)=>{ document.getElementById('pf-'+k).style.width = i<activeIdx?'100%': i===activeIdx?(id.endsWith('-r')?'100%':'45%'):'0%'; });
}
export const SIDE_CONTENT = {
  welcome: {label:'Welcome', headline:'Two minutes.<br>Four honest answers.'},
  about: {label:'Before we begin', headline:'Just the basics.'},
  'inc-q': {label:'Section 1 of 4', headline:'Income'}, 'inc-r': {label:'Section 1 of 4', headline:'Income'},
  'sav-q': {label:'Section 2 of 4', headline:'Savings'}, 'sav-r': {label:'Section 2 of 4', headline:'Savings'},
  'crd-q1': {label:'Section 3 of 4', headline:'Credit &amp; Loans'}, 'crd-q2': {label:'Section 3 of 4', headline:'Credit &amp; Loans'}, 'crd-r': {label:'Section 3 of 4', headline:'Credit &amp; Loans'},
  'ins-q': {label:'Section 4 of 4', headline:'Insurance'}, 'ins-r': {label:'Section 4 of 4', headline:'Insurance'},
  'inc-extreme': {label:'Section 1 of 4', headline:'Income'},
  summary: {label:'Your report', headline:'Where you stand.'},
  detail: {label:'The full breakdown', headline:'Every pillar,<br>examined.'},
  cta: {label:"What's next", headline:'Go deeper<br>in the app.'},
};
export function updateSidePanel(id){
  const c = SIDE_CONTENT[id] || SIDE_CONTENT.welcome;
  const labelEl = document.getElementById('side-label'), headEl = document.getElementById('side-headline');
  if(labelEl) labelEl.textContent = c.label;
  if(headEl) headEl.innerHTML = c.headline;
}
