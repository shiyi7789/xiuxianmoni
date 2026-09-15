import { S } from '../core/state.js';


/* ---------------- 日志 ---------------- */
export function addLog(text, cls){
  S.logs.push({ t:text, c: cls || 'act' });
  if(S.logs.length > 220) S.logs.splice(0, S.logs.length - 220);
}
export function addSep(){
  S.logs.push({ sep:true });
  if(S.logs.length > 220) S.logs.splice(0, S.logs.length - 220);
}
export function renderLog(){
  const el = $('log');
  let html = '';
  for(const l of S.logs){
    if(l.sep){ html += '<div class="sep">· · ·</div>'; continue; }
    html += '<p class="l-'+l.c+'">'+l.t+'</p>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}
export function toast(msg){
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(()=>{ d.style.transition='opacity .3s'; d.style.opacity='0'; }, 900);
  setTimeout(()=>d.remove(), 1250);
}
