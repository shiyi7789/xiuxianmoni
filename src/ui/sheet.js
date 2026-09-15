import { renderUtil } from './render.js';


/* =========================================================
   移动端抽屉 · 明暗主题
   ========================================================= */
export function openSheet(){
  renderUtil();
  document.body.classList.add('sheet-on');
}
export function closeSheet(){
  document.body.classList.remove('sheet-on');
}
export function toggleSheet(){
  if(document.body.classList.contains('sheet-on')) closeSheet();
  else openSheet();
}
