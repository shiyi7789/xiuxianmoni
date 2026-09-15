import { ACH_BY_KEY, ACH_TIER } from '../data/achievements.js';
import { HERITAGE } from '../data/heritage.js';
import { gfLuck, gfSanitizeMeta } from '../sys/gongfa.js';


/* 气运 → 掉落运气（滚品质时叠加到 luck 上），见 fortune() */
export function luckBoost(){ return fortune() * 0.005; }

/* =========================================================
   轮回 / 传承 —— 元进度，独立于本局存档，轮回不灭
   ========================================================= */
export const META_KEY = 'xiuxian_meta_v2';

/* 元进度：成就与奇遇记录同样存于此，轮回不灭 */
export function blankStat(){
  return { med:0, sec:0, secEnter:0, ins:0, boss:0, secret:0, chainMax:0,
           stones:0, items:0, xian:0, shen:0, mountMax:0, pillUse:0, breakFail:0, enc:0 };
}
export function blankMeta(){
  return {
    rebirths:0, points:0,
    up:{ cult:0, pill:0, stone:0, luck:0, body:0 },
    best:{ lv:0, day:0, kills:0 },
    totalKills:0, totalDeaths:0, ascensions:0,
    ach:[],
    life: blankStat(),
    secSet:[],
    encSeen:0, encKeys:[],
    gongfa:{ learned:[], best:{} }      /* 已习得功法：轮回不灭 */
  };
}
export let META = blankMeta();

export function loadMeta(){
  try{
    const raw = localStorage.getItem(META_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(!d) return;
    META.rebirths = d.rebirths||0;
    META.points = d.points||0;
    META.totalKills = d.totalKills||0;
    META.totalDeaths = d.totalDeaths||0;
    META.ascensions = d.ascensions||0;
    META.best = Object.assign({lv:0,day:0,kills:0}, d.best||{});
    const u = d.up||{};
    META.up = { cult:u.cult||0, pill:u.pill||0, stone:u.stone||0, luck:u.luck||0, body:u.body||0 };
    META.ach = Array.isArray(d.ach) ? d.ach.filter(x => typeof x === 'string') : [];
    const L = d.life || {};
    META.life = blankStat();
    for(const k in META.life) META.life[k] = L[k] || 0;
    META.encSeen = d.encSeen||0;
    META.encKeys = Array.isArray(d.encKeys) ? d.encKeys.filter(x => typeof x === 'string') : [];
    META.secSet = Array.isArray(d.secSet) ? d.secSet.filter(x => typeof x === 'number') : [];
    META.gongfa = gfSanitizeMeta(d.gongfa);
  }catch(e){}
}
export function saveMeta(){ try{ localStorage.setItem(META_KEY, JSON.stringify(META)); }catch(e){} }

/* 用一份外部数据整体重建 META（导入存档码用）——必须走这里，
   否则漏字段会让 fortune()/achBonus() 之类在迭代时炸掉 */
export function applyMeta(m){
  m = m || {};
  const u = m.up || {}, b = m.best || {}, L = m.life || {};
  META = blankMeta();
  META.rebirths = m.rebirths||0;
  META.points = m.points||0;
  META.up = { cult:u.cult||0, pill:u.pill||0, stone:u.stone||0, luck:u.luck||0, body:u.body||0 };
  META.best = { lv:b.lv||0, day:b.day||0, kills:b.kills||0 };
  META.totalKills = m.totalKills||0;
  META.totalDeaths = m.totalDeaths||0;
  META.ascensions = m.ascensions||0;
  META.ach = Array.isArray(m.ach) ? m.ach.filter(x => typeof x === 'string') : [];
  for(const k in META.life) META.life[k] = L[k]||0;
  META.secSet = Array.isArray(m.secSet) ? m.secSet.filter(x => typeof x === 'number') : [];
  META.encSeen = m.encSeen||0;
  META.encKeys = Array.isArray(m.encKeys) ? m.encKeys.filter(x => typeof x === 'string') : [];
  META.gongfa = gfSanitizeMeta(m.gongfa);
  saveMeta();
}
/* 成就列表的安全读取：任何情况下都必须是数组 */
export function achList(){
  if(!Array.isArray(META.ach)) META.ach = [];
  return META.ach;
}

/* =========================================================
   气运 —— 统一的福缘乘区
   来源：成就（主）+ 气运传承；作用：掉落品质 / 灵石收益 / 掉落概率
   ========================================================= */
export function fortune(){
  let f = (META.up.luck||0) * 5;
  for(const k of achList()){
    const d = ACH_BY_KEY[k];
    if(d) f += ACH_TIER[d.t].f;
  }
  f += gfLuck();                       /* 心法所带气运 —— 一并计入，不另开乘区 */
  return Math.round(f * 10) / 10;
}
export function fortStone(v){ return Math.max(1, Math.round(v * (1 + fortune()*0.006))); }  /* 灵石收益 */
export function fortDrop(p){ return p * (1 + fortune()*0.008); }                            /* 掉落概率 */


/* 轮回印记：每一世永久 +2% 修炼速度（至多 +20%） */
export function rebirthCult(){ return Math.min(20, META.rebirths*2); }
export function heritageCult(){ return META.up.cult*6 + rebirthCult(); }
export function hCost(h){ return h.base + Math.floor((META.up[h.k]||0)/2); }
export function heritageSummary(){
  const on = HERITAGE.filter(h => (META.up[h.k]||0) > 0).map(h => h.name+' '+META.up[h.k]+' 重');
  if(rebirthCult() > 0) on.push('轮回印记 +'+rebirthCult()+'% 修速');
  return on.length ? on.join('、') : '空空如也';
}
