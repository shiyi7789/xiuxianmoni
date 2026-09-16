import { CODEX_CATS, CODEX_TIER_NAME } from '../../data/codex.js';
import { codexAll, codexCountByCat, codexGrouped, codexLuck, codexOwnedList, codexTotal } from '../../sys/codex.js';
import { qName } from '../../sys/character.js';
import { closeModal, showModal } from '../modal.js';

/* =========================================================
   图 鉴 · 面 板
   ---------------------------------------------------------
   规则：
   · 面板操作函数一律 cdUi 前缀（构建后同作用域，重名会静默覆盖）
   · 只用具名导入（禁止 import * as / 默认导入）
   · 复用既有样式：.achhd / .achsum / .achbar / .achsec / .achg / .ach
     （不新增配色，分类色走 CODEX_CATS 里已有的令牌）
   ========================================================= */

export function openCodex(){
  const owned = codexOwnedList();
  const total = codexTotal();
  const own = owned.length;
  const luck = codexLuck();
  const pct = total ? Math.round(own / total * 100) : 0;

  let h = '<div class="achhd">'
    + '<span class="achsum">已点亮 <b style="color:var(--zhu-d)">' + own + '</b> / ' + total + '</span>'
    + '<span class="achbar"><i style="width:' + pct + '%"></i></span>'
    + '<span class="achsum">气 运 <b style="color:var(--jin)">+' + luck + '</b></span>'
    + '</div>';
  h += '<div class="meta-note" style="margin-bottom:10px">'
    + '获得器物、习得功法、剥取材料、遭遇妖兽、进入秘境、撞上奇遇，都会在此点亮一格。'
    + '<b>每 10 项 +1 气运</b>（并入统一气运乘区）；每 <b>25 项</b>有一次里程碑提示。'
    + '图鉴<b>轮回不灭</b>——它是「知识 / 成就 / 传承」这一侧的永久进度。'
    + '</div>';

  /* 分类概览 chips（点击滚动到对应分类） */
  h += '<div class="filters" style="margin-bottom:10px">';
  for(const c of CODEX_CATS){
    const d = codexCountByCat(c.k);
    const full = d.total > 0 && d.own >= d.total;
    h += '<span class="chip' + (full ? ' on' : '') + '" onclick="cdUiJump(\'' + c.k + '\')"'
      + (full ? '' : ' style="color:' + c.color + '"')
      + '>' + c.n + ' ' + d.own + '/' + d.total + '</span>';
  }
  h += '</div>';

  h += '<div class="pb-scroll">';
  const by = codexGrouped();
  for(const c of CODEX_CATS){
    const list = by[c.k] || [];
    if(!list.length) continue;
    const d = codexCountByCat(c.k);
    h += '<div class="achsec" id="cd-sec-' + c.k + '" style="color:' + c.color + '">'
      + c.n + ' · ' + d.own + ' / ' + d.total + '</div>';
    h += '<div class="achg">';
    for(const e of list){
      const on = owned.indexOf(e.k) >= 0;
      h += '<div class="ach' + (on ? ' got' : '') + '">'
        + (on ? '<span class="tick">已 收 录</span>' : '')
        + '<div class="ant">'
        +   '<span class="tier qc' + (e.t || 0) + '">' + CODEX_TIER_NAME[e.t || 0] + '</span>'
        +   (on ? qName(e.n, e.t || 0) : '<span class="dim">？ ？ ？</span>')
        + '</div>'
        + (on ? '' : '<div class="ad">尚 未 收 录</div>')
        + '</div>';
    }
    h += '</div>';
  }
  h += '</div>';

  showModal('图 鉴 · 收 藏 录', h, [{ label:'关 闭', primary:true, fn: closeModal }], 'wide');
}

/* 滚动到某分类（面板内锚点） */
export function cdUiJump(cat){
  try{
    const d = (typeof document !== 'undefined') ? document : null;
    const el = d ? d.getElementById('cd-sec-' + cat) : null;
    if(el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }catch(e){}
}
