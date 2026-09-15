import { closeSheet } from './sheet.js';


/* ---------------- 弹层 ---------------- */
export function showModal(title, html, buttons, cls){
  closeSheet();
  const root = $('modalRoot');
  let b = '';
  (buttons||[]).forEach((x,i) => {
    b += '<button class="mbtn'+(x.primary?' primary':'')+'" data-i="'+i+'">'+x.label+'</button>';
  });
  root.innerHTML = '<div class="mask"><div class="modal'+(cls ? ' '+cls : '')+'">'
    + '<h2 class="serif">'+title+'</h2>'
    + '<div class="txt">'+html+'</div>'
    + (b ? '<div class="btns">'+b+'</div>' : '')
    + '</div></div>';
  (buttons||[]).forEach((x,i) => {
    const el = root.querySelector('.mbtn[data-i="'+i+'"]');
    if(el) el.onclick = () => { if(x.fn) x.fn(); };
  });
}
export function closeModal(){ $('modalRoot').innerHTML = ''; }
