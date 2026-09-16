import { S } from '../core/state.js';
import { num } from '../core/utils.js';
import { GF_BY_KEY, GF_MAX, GF_SEG_NAME, GF_SHU, GF_SLOT, GF_XIN, GONGFA } from '../data/gongfa.js';
import { closeModal, showModal } from '../modal.js';
import { gfAllOff, gfCost, gfEffectText, gfEquipAt, gfExpCost, gfGrade, gfLearned, gfLearnedList, gfLevel, gfPerLvText, gfSeg, gfSchoolKey, gfSchoolOf, gfSlotOf, gfToggleEquip, gfUnequipAt, gfUpgrade } from '../sys/gongfa.js';
import { godCls, qName } from '../sys/character.js';
import { toast } from '../sys/log.js';
import { uiDots, uiSec, uiSeg, uiEmpty } from '../kit.js';

/* =========================================================
   功 法 · 悟 道 录（面板 · 第二版重排）
   ---------------------------------------------------------
   第二版改动
     · 顶部固定「槽位总览」，一眼看到 3 被动 + 2 主动装了什么
     · 新增分段筛选（全部 / 已习得 / 被动 / 主动 / 未习得），30 部不必一路滚
     · 条目改为两块式：抬头行（名 · 学派 · 重数 · 操作）+ 说明行
   规则
     · 操作函数一律 gfUi 前缀（构建后同作用域，重名会让后者静默覆盖前者）
     · 复用既有样式类，不写死颜色
     · data-seg 供 uiSegPick 过滤（空格分隔可属多段）
   ========================================================= */

function gfSchoolTag(gf){
  const sc = gfSchoolOf(gf);
  return '<span class="gfs gfs-' + gfSchoolKey(gf) + '">' + sc.n + '</span>';
}

/* 单行：已习得的可装/卸与参悟；未习得的只作图鉴并提示来路 */
function gfRow(gf, owned){
  const lv = owned ? gfLevel(gf.k) : 0;
  const max = GF_MAX[gf.t];
  const slotInfo = owned ? gfSlotOf(gf.k) : { idx: -1 };
  const on = slotInfo.idx >= 0;
  const full = lv >= max;
  const cost = gfCost(gf.k), ce = gfExpCost(gf.k);
  const short = owned && (S.stones < cost || S.exp < ce);
  const isPas = gf.kind === 'xin';
  const profName = isPas ? GF_XIN[gf.p].n : GF_SHU[gf.sk].n;
  const seg = (owned ? 'owned' : 'unowned') + ' ' + (isPas ? 'xin' : 'shu');

  let acts = '';
  if(owned){
    acts = '<span class="hbrow">'
      + '<button class="btn btn-sm" onclick="gfUiToggle(\'' + gf.k + '\')">'
        + (on ? '卸 下' : (isPas ? '装 被 动' : '装 主 动')) + '</button>'
      + (full
          ? '<button class="btn btn-sm dis">已 圆 满</button>'
          : '<button class="btn btn-sm' + (short ? ' dis' : '') + '" onclick="'
            + (short ? "toast('灵石或修为不足')" : "gfUiUp('" + gf.k + "')") + '">参 悟 · ' + num(cost) + '</button>')
      + '</span>';
  }

  return '<div class="heritage' + godCls(gf.t) + (owned ? '' : ' off') + '" data-seg="' + seg + '">'
    + '<div class="hr">'
    + '<span class="hn">' + qName(gf.n, gf.t) + '</span>'
    + gfSchoolTag(gf)
    + '<span class="hl">' + (owned ? lv + ' / ' + max + ' 重' : '第 ' + (gf.seg + 1) + ' 段') + '</span>'
    + (owned ? uiDots(lv, max) : '')
    + acts
    + '</div>'
    + '<div class="hd">' + gfGrade(gf) + ' · ' + profName + ' · '
      + (owned ? gfEffectText(gf, lv) : '尚未习得')
      + (owned && on ? '　<span class="gold">已在' + (isPas ? '被动' : '主动') + '槽 ' + (slotInfo.idx + 1) + '</span>' : '')
      + (owned && !full ? '　参悟需 <b>' + num(cost) + '</b> 灵石 + <b>' + num(ce) + '</b> 修为' : '')
      + (owned ? '' : '　秘境妖王或坊市藏经阁可得')
    + '</div>'
    + '<div class="hd" style="opacity:.78">' + gf.d + '</div>'
    + '<div class="hd" style="opacity:.62">　' + gfPerLvText(gf) + '</div>'
    + '</div>';
}

/* 槽位概览行 */
function gfSlotLine(kind, idx){
  const arr = kind === 'xin' ? S.gongfa.passive : S.gongfa.active;
  const key = arr[idx];
  const gf = GF_BY_KEY[key];
  const label = (kind === 'xin' ? '被 动 ' : '主 动 ') + (idx + 1);
  const sk = gf && gf.kind === 'shu' ? GF_SHU[gf.sk] : null;
  return '<div class="hr" style="padding:4px 0">'
    + '<span class="hl" style="flex:0 0 52px">' + label + '</span>'
    + (gf
        ? '<span class="hn" style="font-size:12.5px">' + qName(gf.n, gf.t)
          + '<span class="muted-sm">　' + gfLevel(gf.k) + ' 重' + (sk ? ' · ' + sk.n + '（冷却 ' + sk.cd + '）' : '') + '</span></span>'
          + '<span style="margin-left:auto"><button class="btn btn-sm" onclick="gfUiOff(\'' + kind + '\',' + idx + ')">卸 下</button></span>'
        : '<span class="hl">— 空 —</span>')
    + '</div>';
}

export function openGongfa(){
  const learned = gfLearnedList();
  const cur = gfSeg();
  const owned = GONGFA.filter(g => gfLearned(g.k)).sort((a, b) => b.seg - a.seg || b.t - a.t);
  const rest  = GONGFA.filter(g => !gfLearned(g.k));
  const nXin  = GONGFA.filter(g => g.kind === 'xin').length;
  const nShu  = GONGFA.length - nXin;

  /* 顶部说明（收敍成三行，替掉原来的大段文字） */
  let h = '<div class="meta-note" style="margin-bottom:10px">'
    + '功法分 <b>被动</b>（心法）与 <b>主动</b>（术法）二类：被动只可运转 <b>' + GF_SLOT.passive + ' 部</b>，'
    + '主动只可备于识海 <b>' + GF_SLOT.active + ' 式</b>——习得多寡不等同于强弱，<b>如何取舍才是关键</b>。<br>'
    + '主动功法带<b>冷却</b>与附加效果（护体 / 虚空 / 冰封 / 灼烧 / 吸血 / 破防 / 反噬），'
    + '战斗中于「灵 力 斩」之外另出此二式。已习得者<b>刻入道基、轮回不灭</b>；重数与装备归本局。'
    + '当前境界段 <b>' + GF_SEG_NAME[cur] + '</b>，已习得 <b>' + learned.length + '</b> / ' + GONGFA.length + ' 部。'
    + '</div>';

  /* 槽位总览 */
  h += '<div class="heritage">';
  for(let i = 0; i < GF_SLOT.passive; i++) h += gfSlotLine('xin', i);
  for(let i = 0; i < GF_SLOT.active; i++) h += gfSlotLine('shu', i);
  h += '<div class="hd" style="margin-top:4px">被动提供属性 / 修速 / 突破率 / 气运；主动提供战斗技能与效果。'
    + '<span style="margin-left:6px"><button class="btn btn-sm" onclick="gfUiAllOff()">尽 数 卸 下</button></span></div>';
  h += '</div>';

  /* 分段筛选 */
  h += uiSeg('gfSeg', [
    { k:'all',     n:'全 部',   c:GONGFA.length },
    { k:'owned',   n:'已 习 得', c:owned.length },
    { k:'xin',     n:'被 动',   c:nXin },
    { k:'shu',     n:'主 动',   c:nShu },
    { k:'unowned', n:'未 习 得', c:rest.length }
  ], 'all');

  h += '<div class="pb-scroll">';

  h += '<div class="achsec" style="color:var(--zhu-d)" data-seg="owned">已 习 得 · ' + owned.length + '</div>';
  if(!owned.length){
    h += '<div data-seg="owned">' + uiEmpty('尚 无 一 部 在 身',
      '秘境妖王与坊市藏经阁，是功法唯二的来路。') + '</div>';
  }
  for(const gf of owned) h += gfRow(gf, true);

  h += '<div class="achsec" style="color:var(--ink3)" data-seg="unowned">未 习 得 · ' + rest.length + '</div>';
  for(const gf of rest) h += gfRow(gf, false);

  h += '</div>';

  showModal('功 法 · 悟 道 录', h, [{ label: '关 闭', primary: true, fn: closeModal }], 'wide');
}

/* ---------- UI 操作（gfUi 前缀，避免与 sys 层重名） ---------- */
export function gfUiToggle(key){
  const r = gfToggleEquip(key);
  if(r === 'full'){ gfUiPick(key); return; }
  openGongfa();
}
export function gfUiUp(key){
  gfUpgrade(key);
  openGongfa();
}
export function gfUiOff(kind, idx){
  gfUnequipAt(kind, idx);
  openGongfa();
}
export function gfUiAllOff(){
  gfAllOff();
  openGongfa();
}
export function gfUiSet(key, idx){
  const gf = GF_BY_KEY[key];
  if(!gf) return;
  if(gfEquipAt(key, idx)) toast('已装入' + (gf.kind === 'xin' ? '被动' : '主动') + '槽 ' + (idx + 1));
  openGongfa();
}
/* 槽满时让玩家选一格替换 */
export function gfUiPick(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return;
  const isPas = gf.kind === 'xin';
  const arr = isPas ? S.gongfa.passive : S.gongfa.active;
  let h = '<div class="meta-note">' + (isPas ? '被动' : '主动') + '槽已满。选择一格换上【' + gf.n + '】——被换下的功法<b>不会丢失</b>，仍在已习得之列。</div>';
  h += '<div class="heritage">';
  for(let i = 0; i < arr.length; i++){
    const old = GF_BY_KEY[arr[i]];
    h += '<div class="hr" style="padding:6px 0">'
      + '<span class="hn">第 ' + (i + 1) + ' 格</span>'
      + '<span class="hl">' + (old ? old.n + ' · ' + gfLevel(old.k) + ' 重' : '空') + '</span>'
      + '<span style="margin-left:auto"><button class="btn btn-sm" onclick="gfUiSet(\'' + key + '\',' + i + ')">换 上</button></span>'
      + '</div>';
  }
  h += '</div>';
  showModal('选 择 槽 位', h, [{ label: '取 消', fn: () => openGongfa() }], 'wide',
    { sub:(isPas ? '被动' : '主动') + '槽 ' + arr.length + ' 格' });
}
