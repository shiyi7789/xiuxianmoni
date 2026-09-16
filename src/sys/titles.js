import { META, achList, saveMeta } from '../core/meta.js';
import { S } from '../core/state.js';
import { TITLE_BY_KEY, TITLE_TIER_NAME, TITLES } from '../data/titles.js';
import { achAgg } from './achievement.js';
import { addLog, toast } from './log.js';
import { after } from '../ui/render.js';

/* =========================================================
   称 号 —— 逻辑层
   ---------------------------------------------------------
   设计要点（改它之前先读）：
   1. 同时只戴 1 个 —— 防止叠加膨胀
   2. 效果**不并入**既有 stats() 公式，而是独立提供 titleBonus()，
      由各调用点手动合并 —— 便于调试，也避免污染既有平衡
   3. 已解锁记录存 META（永久，轮回不灭）
   4. 解锁判定与成就共用 achAgg()（只需在 checkTitles 里补字段）
   ========================================================= */

export function titleDefOf(k){ return TITLE_BY_KEY[k] || null; }
export function titleOwnedList(){
  if(!META || !META.titles) return [];
  return Array.isArray(META.titles.owned) ? META.titles.owned : [];
}
export function titleOwned(k){ return titleOwnedList().indexOf(k) >= 0; }
export function titleActiveKey(){
  if(!META || !META.titles) return null;
  const k = META.titles.active;
  return (k && titleOwned(k)) ? k : null;
}
export function titleActiveDef(){
  const k = titleActiveKey();
  return k ? titleDefOf(k) : null;
}

/* 解锁扫描：在 checkAch() 之后调用即可，返回本次新解锁的称号 */
export function checkTitles(){
  if(!S || !META) return [];
  const a = achAgg();
  /* 补充 achAgg 里没有、称号需要的字段 */
  a.pillMake = ((S.stat && S.stat.pillMake) || 0) + ((META.life && META.life.pillMake) || 0);
  a.achCount = achList().length;
  a.rebirths = META.rebirths || 0;
  a.asc = META.ascensions || 0;

  if(!META.titles) META.titles = { owned:[], active:null };
  if(!Array.isArray(META.titles.owned)) META.titles.owned = [];

  const got = [];
  for(const t of TITLES){
    if(titleOwned(t.k)) continue;
    let ok = false;
    try{ ok = !!t.cond(a); }catch(e){ ok = false; }
    if(ok) META.titles.owned.push(t.k), got.push(t);
  }
  if(got.length){
    if(!META.titles.active) META.titles.active = got[got.length - 1].k;
    saveMeta();
    for(const t of got){
      addLog('【称号 · ' + TITLE_TIER_NAME[t.t] + '品】' + t.n + ' —— ' + t.d, 'ach');
    }
    /* 中央浮层：宝品及以上才弹，避免刷屏 */
    const show = got.filter(t => t.t >= 2);
    if(show.length && typeof fbCenterQueue === 'function'){
      const t = show[show.length - 1];
      fbCenterQueue({
        tier:2, quality:t.t,
        title:'得 称 号',
        body:'<b>' + t.n + '</b><br><span class="muted-sm">' + t.d + '</span>',
        autoMs:2200,
        sound: t.t >= 3 ? 'xian' : 'item'
      });
    }
  }
  return got;
}

/* ---------- 佩戴 ---------- */
export function titleEquip(k){
  const t = titleDefOf(k);
  if(!t){ toast('无此称号'); return false; }
  if(!titleOwned(k)){ toast('尚未解锁此称号'); return false; }
  if(!META.titles) META.titles = { owned:[], active:null };
  META.titles.active = k;
  saveMeta();
  addLog('你将「' + t.n + '」刻于名帖之上。', 'act');
  after();
  return true;
}
export function titleUnequip(){
  if(!META || !META.titles) return;
  META.titles.active = null;
  saveMeta();
  addLog('你收起了名帖上的称号。', 'dim');
  after();
}

/* 加成汇总：由调用点手动合并（不并入 stats() 公式） */
export function titleBonus(){
  const z = { atk:0, def:0, hp:0, cult:0, brk:0, speed:0, stone:0, drop:0, pill:0, boss:0, all:0 };
  const t = titleActiveDef();
  if(!t || !t.ef) return z;
  for(const k in t.ef) if(z[k] !== undefined) z[k] = t.ef[k];
  return z;
}

/* ---------- 存档清洗 ---------- */
export function titleSanitizeMeta(d){
  const out = { owned:[], active:null };
  if(!d || typeof d !== 'object') return out;
  const L = Array.isArray(d.owned) ? d.owned : [];
  for(const k of L){
    if(typeof k !== 'string') continue;
    if(!titleDefOf(k)) continue;
    if(out.owned.indexOf(k) >= 0) continue;
    out.owned.push(k);
  }
  if(typeof d.active === 'string' && out.owned.indexOf(d.active) >= 0) out.active = d.active;
  return out;
}
