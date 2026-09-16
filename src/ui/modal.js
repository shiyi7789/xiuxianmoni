import { closeSheet } from './sheet.js';


/* =========================================================
   弹 层（第二版外壳）
   ---------------------------------------------------------
   结构：.mask > .modal > h2（粘性标题 + ✕）+ .txt（内容）+ .btns（粘性底栏）
   约定：buttons 为 [{label, fn, primary}]，fn 缺省时只关窗
         opt.sub        标题下的副标题（小字）
         opt.onClose    ✕ 的行为，默认 closeModal
   ========================================================= */
export function showModal(title, html, buttons, cls, opt){
  closeSheet();
  opt = opt || {};
  const root = $('modalRoot');
  if(!root) return;

  let b = '';
  (buttons || []).forEach((x, i) => {
    b += '<button class="mbtn' + (x.primary ? ' primary' : '') + '" data-i="' + i + '">' + x.label + '</button>';
  });

  /* ✕ 用 data-close 标记，事件在下面挂，避免再引一个全局函数 */
  const head = '<h2 class="serif">' + title
    + (opt.sub ? '<span class="sub">' + opt.sub + '</span>' : '')
    + '<button class="modal-x" data-close="1" aria-label="关闭">✕</button>'
    + '</h2>';

  root.innerHTML = '<div class="mask"><div class="modal' + (cls ? ' ' + cls : '') + '">'
    + head
    + '<div class="txt">' + html + '</div>'
    + (b ? '<div class="btns">' + b + '</div>' : '')
    + '</div></div>';

  (buttons || []).forEach((x, i) => {
    const el = root.querySelector('.mbtn[data-i="' + i + '"]');
    if(el) el.onclick = () => { if(x.fn) x.fn(); };
  });
  const x = root.querySelector('.modal-x');
  if(x) x.onclick = () => { if(opt.onClose) opt.onClose(); else closeModal(); };
}
export function closeModal(){ $('modalRoot').innerHTML = ''; }
