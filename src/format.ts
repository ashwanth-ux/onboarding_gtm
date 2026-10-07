export function fmtIndianInput(n){
  if(!n) return '';
  n = Math.round(n).toString();
  let last3 = n.slice(-3), rest = n.slice(0,-3);
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return rest ? rest+','+last3 : last3;
}
// Recognises Indian shorthand (1l/1 lakh/1cr/50k) so typing it doesn't silently
// get stripped to "1"; also hard-caps at 999,99,99,99,999 so no field can ever
// overflow the layout with a pathological string of digits.
// Only strips/expands shorthand and guards against a pathologically long
// string — the REAL, field-specific ceiling is applied by wireCurrency below,
// since "a plausible number" means something different for a credit-card
// limit than it does for a lifetime savings balance.
export function parseNum(str){
  str = String(str).trim().toLowerCase().replace(/,/g,'');
  if(!str) return 0;
  const m = str.match(/^([0-9]*\.?[0-9]+)\s*(lakhs?|lacs?|crores?|cr|l|k)?$/);
  let num = 0;
  if(m){
    num = parseFloat(m[1]) || 0;
    const suf = m[2];
    if(suf === 'k') num *= 1e3;
    else if(suf && suf[0] === 'l') num *= 1e5;
    else if(suf && suf.slice(0,2) === 'cr') num *= 1e7;
  } else {
    num = parseFloat(str.replace(/[^0-9.]/g,'')) || 0;
  }
  return Math.min(1e13, Math.round(num));
}
