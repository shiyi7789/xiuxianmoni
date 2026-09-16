/* =========================================================
   UI 组件层（kit）
   ---------------------------------------------------------
   用途：给所有弹层提供一套共用的构件，避免每个面板各写一套排版
     · uiSec      区块标题（替代裸的 .tip / .meta-note）
     · uiSeg      分段筛选条（纯 DOM 切换，不重渲染整块）
     · uiEmpty    空状态
     · uiKV       键值行
     · uiDots     进度点阵
     · uiJump     弹层内滚动锚点
   约定
     · 构建后所有模块同处一个作用域，顶层函数名必须全局唯一 → 统一 ui 前缀
     · 只用具名导入（禁止 import * as / 默认导入）
     · 不写死颜色，一切走类名与 :root 令牌
   ========================================================= */

/* ---------- 区块标题 ---------- */
export function uiSec(t, d, n){
  return '<div class="sec">'
    + '<div class="sec-t">' + t + (n ? '<span class="n">' + n + '</span>' : '') + '</div>'
    + (d ? '<div class="sec-d">' + d + '</div>' : '')
    + '</div>';
}

/* ---------- 空状态 ---------- */
export function uiEmpty(t, hint){
  return '<div class="empty-state">' + t + '</div>'
    + (hint ? '<div class="hint-mini">' + hint + '</div>' : '');
}

/* ---------- 键值行 ---------- */
export function uiKV(rows){
  let h = '<div class="kv">';
  for(const r of rows){
    if(!r) continue;
    h += '<div class="kv-r"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>';
  }
  return h + '</div>';
}

/* ---------- 进度点阵 ---------- */
export function uiDots(lv, max){
  let s = '<span class="dots">';
  for(let i = 0; i < max; i++) s += '<i class="' + (i < lv ? 'f' : '') + '"></i>';
  return s + '</span>';
}

/* ---------- 分段筛选条 ----------
   items: [{ k:'all', n:'全 部', c:3 }]    active: 当前段 key
   配套：被筛选的元素挂 data-seg="key1 key2"（空格分隔，可属多段） */
export function uiSeg(id, items, active){
  let h = '<div class="seg" id="' + id + '">';
  for(const it of items){
    h += '<span class="seg-i' + (it.k === active ? ' on' : '') + '" data-k="' + it.k + '"'
      + ' onclick="uiSegPick(\'' + id + '\',\'' + it.k + '\')">' + it.n
      + (it.c === undefined ? '' : '<span class="n">' + it.c + '</span>')
      + '</span>';
  }
  return h + '</div>';
}

/* 切换分段：只改 display 与高亮，不重建 DOM（因此不丢滚动位置与输入内容） */
export function uiSegPick(id, key){
  const box = (typeof document !== 'undefined') ? document.getElementById(id) : null;
  if(!box) return;
  const items = box.querySelectorAll('.seg-i');
  for(let i = 0; i < items.length; i++){
    const it = items[i];
    if(it.getAttribute('data-k') === key) it.className = 'seg-i on';
    else it.className = 'seg-i';
  }
  /* 同一弹层内所有挂 data-seg 的元素一起过滤 */
  const modal = box.closest ? box.closest('.modal') : null;
  const scope = modal || (typeof document !== 'undefined' ? document : null);
  if(!scope || !scope.querySelectorAll) return;
  const all = scope.querySelectorAll('[data-seg]');
  for(let i = 0; i < all.length; i++){
    const el = all[i];
    const keys = String(el.getAttribute('data-seg') || '').split(/\s+/);
    const show = (key === 'all') || keys.indexOf(key) >= 0;
    el.style.display = show ? '' : 'none';
  }
}

/* ---------- 弹层内锚点滚动 ---------- */
export function uiJump(anchor){
  try{
    const d = (typeof document !== 'undefined') ? document : null;
    const el = d ? d.getElementById(anchor) : null;
    if(el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }catch(e){}
}
