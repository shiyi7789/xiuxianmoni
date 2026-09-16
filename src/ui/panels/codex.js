import { CODEX_CATS, CODEX_TIER_NAME } from '../../data/codex.js';
import { codexAll, codexCountByCat, codexGrouped, codexLuck, codexOwnedList, codexTotal } from '../../sys/codex.js';
import { qName } from '../../sys/character.js';
import { closeModal, showModal } from '../modal.js';
import { uiJump, uiSec } from '../kit.js';

/* =========================================================
   图 鉴 · 收 藏 录（面板 · 第二版重排）
   ---------------------------------------------------------
   第二版改动
     · 顶部进度条 + 气运总览（补齐了此前只在 HTML 里写、CSS 里却缺定义的 .achsum）
     · 分类条改为可横向滚动的导航描边（手机上不再折行挤成一团）
     · 每条改为「品阶角标 + 名称」，未收录的显示为问号格
   规则
     · 操作函数一律 cdUi 前缀（构建后同作用域，重名会静默覆盖）
     · 只用具名导入；分类色取数据表里已有的令牌
   ========================================================= */

export function openCodex(){
  const owned = codexOwnedList();
  const total = codexTotal();
  const own = owned.length;
  const luck = codexLuck();
  const pct = total ? Math.round(own / total * 100) : 0;

  let h = '<div class="achhd">'
    + '<span class="achsum">已点亮 <b>' + own + '</b> / ' + total + '</span>'
    + '<span class="achbar"><i style="width:' + pct + '%"></i></span>'
    + '<span class="achsum">气 运 <b>+' + luck + '</b></span>'
    + '</div>';
  h += '<div class="meta-note">'
    + '获得器物、习得功法、剥取材料、遭遇妖兽、进入秘境、撞上奇遇，都会在此点亮一格。'
    + '<b>每 10 项 +1 气运</b>（并入统一气运乘区）；每 <b>25 项</b>有一次里程碑提示。'
    + '图鉴<b>轮回不灭</b>——它是「知识 / 成就 / 传承」这一侧的永久进度。'
    + '</div>';

  /* 分类导航：点击滚动到对应分类 */
  h += '<div class="nav-strip">';
  for(const c of CODEX_CATS){
    const d = codexCountByCat(c.k);
    const full = d.total > 0 && d.own >= d.total;
    h += '<span class="chip' + (full ? ' on' : '') + '" onclick="cdUiJump(\'' + c.k + '\')"'
      + (full ? '' : ' style="color:' + c.color + '"')
      + '>' + c.n + ' <span class="muted-sm">' + d.own + '/' + d.total + '</span></span>';
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

  showModal('图 鉴 · 收 藏 录', h, [{ label:'关 闭', primary:true, fn: closeModal }], 'wide',
    { sub: own + ' / ' + total + '　气运 +' + luck });
}

/* 滚动到某分类（面板内锚点） */
export function cdUiJump(cat){
  uiJump('cd-sec-' + cat);
}
