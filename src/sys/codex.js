import { META, saveMeta } from '../core/meta.js';
import { S } from '../core/state.js';
import { CODEX_LUCK_PER_STEP, CODEX_LUCK_STEP, CODEX_MILESTONE_STEP } from '../data/codex.js';
import { BASE_NAMES } from '../data/items.js';
import { GONGFA } from '../data/gongfa.js';
import { MATERIALS, MAT_ORDER } from '../data/materials.js';
import { MONSTERS } from '../data/monsters.js';
import { MOUNT_NAMES } from '../data/mounts.js';
import { PILLS } from '../data/pills.js';
import { SECRETS } from '../data/secrets.js';
import { ENCOUNTERS } from '../data/encounters.js';

/* =========================================================
   图 鉴 —— 逻辑层
   ---------------------------------------------------------
   设计三原则（改它之前先读）：
   1. **条目从既有数据表派生**，不另建大表 —— 加一个新妖兽/功法/材料，
      图鉴自动多一项，不需要两处维护（DRY）
   2. 解锁记录存 META（永久，轮回不灭）—— 与「知识/成就/传承」同轴
   3. 每 10 项 +1 气运 —— **并入 fortune()，不新开乘区**
   ========================================================= */

/* ---------- 条目派生 ---------- */
function codexMonEntries(){
  const out = [];
  for(let tier = 0; tier < MONSTERS.length; tier++){
    for(const name of MONSTERS[tier]){
      out.push({ c:'mon', k:'mon_' + name, n:name, t: Math.min(4, tier) });
    }
  }
  return out;
}
function codexItemEntries(){
  const out = [];
  for(const slot in BASE_NAMES){
    for(const name of BASE_NAMES[slot]){
      /* key 带槽位前缀：武器与法宝可能重名 */
      out.push({ c:'item', k:'item_' + slot + '_' + name, n:name, t:0, slot });
    }
  }
  return out;
}
function codexGfEntries(){
  return GONGFA.map(g => ({ c:'gf', k:'gf_' + g.k, n:g.n, t:g.t, kind:g.kind }));
}
function codexMountEntries(){
  const out = [];
  for(let tier = 0; tier < MOUNT_NAMES.length; tier++){
    for(const name of MOUNT_NAMES[tier]){
      out.push({ c:'mount', k:'mount_' + name, n:name, t: Math.min(4, tier) });
    }
  }
  return out;
}
function codexMatEntries(){
  return MAT_ORDER.map(k => {
    const m = MATERIALS[k];
    return { c:'mat', k:'mat_' + k, n:m.n, t:m.t };
  });
}
function codexPillEntries(){
  return PILLS.map(p => ({ c:'pill', k:'pill_' + p.name, n:p.name, t:0 }));
}
function codexSecEntries(){
  return SECRETS.map((s, i) => ({ c:'sec', k:'sec_' + i, n:s.name, t: Math.min(4, s.tier) }));
}
function codexEncEntries(){
  return ENCOUNTERS.map(e => ({ c:'enc', k:'enc_' + e.k, n:e.t, t: Math.min(4, e.seg) }));
}

let _CODEX_ALL = null;
let _CODEX_BY_KEY = null;
export function codexAll(){
  if(_CODEX_ALL) return _CODEX_ALL;
  _CODEX_ALL = [].concat(
    codexMonEntries(), codexItemEntries(), codexGfEntries(), codexMountEntries(),
    codexMatEntries(), codexPillEntries(), codexSecEntries(), codexEncEntries()
  );
  _CODEX_BY_KEY = {};
  for(const e of _CODEX_ALL) _CODEX_BY_KEY[e.k] = e;
  return _CODEX_ALL;
}
export function codexTotal(){ return codexAll().length; }
export function codexByKey(k){ codexAll(); return _CODEX_BY_KEY[k] || null; }

/* 按分类分组（面板用） */
export function codexGrouped(){
  const by = {};
  for(const e of codexAll()){
    if(!by[e.c]) by[e.c] = [];
    by[e.c].push(e);
  }
  return by;
}
export function codexCountByCat(cat){
  let total = 0, own = 0;
  const list = codexOwnedList();
  for(const e of codexAll()){
    if(e.c !== cat) continue;
    total++;
    if(list.indexOf(e.k) >= 0) own++;
  }
  return { own, total };
}

/* ---------- 名称 → key 反查（按名字解锁的场景） ---------- */
export function codexKeyByItemName(name){
  for(const e of codexAll()) if(e.c === 'item' && e.n === name) return e.k;
  return null;
}
export function codexKeyByMonName(name){
  for(const e of codexAll()) if(e.c === 'mon' && e.n === name) return e.k;
  return null;
}
export function codexKeyByMountName(name){
  for(const e of codexAll()) if(e.c === 'mount' && e.n === name) return e.k;
  return null;
}

/* ---------- 解锁 ---------- */
export function codexOwnedList(){
  if(!META || !META.codex || !Array.isArray(META.codex.unlocked)) return [];
  return META.codex.unlocked;
}
export function codexOwned(k){ return codexOwnedList().indexOf(k) >= 0; }
export function codexCount(){ return codexOwnedList().length; }

/* 主入口：解锁一条，返回 true 表示**首次**解锁 */
export function codexUnlock(k){
  if(!k || !META) return false;
  if(!META.codex) META.codex = { unlocked:[], milestones:0 };
  if(!Array.isArray(META.codex.unlocked)) META.codex.unlocked = [];
  if(META.codex.unlocked.indexOf(k) >= 0) return false;
  if(!codexByKey(k)) return false;                     /* 非法 key 一律拒绝 */
  META.codex.unlocked.push(k);
  if(S && S.stat) S.stat.codex = (S.stat.codex || 0) + 1;

  /* 里程碑：每 +CODEX_MILESTONE_STEP 项一次 L3 提示 */
  const n = META.codex.unlocked.length;
  const step = Math.floor(n / CODEX_MILESTONE_STEP);
  if(!META.codex.milestones) META.codex.milestones = 0;
  const hit = step > META.codex.milestones;
  if(hit) META.codex.milestones = step;
  saveMeta();
  if(hit && typeof fbCodexMilestone === 'function') fbCodexMilestone(step * CODEX_MILESTONE_STEP);
  return true;
}

/* 便捷入口（供各处调用） */
export function codexUnlockItem(it){
  if(!it || !it.name) return false;
  const k = codexKeyByItemName(it.name);
  return k ? codexUnlock(k) : false;
}
export function codexUnlockMount(m){
  if(!m || !m.name) return false;
  const k = codexKeyByMountName(m.name);
  return k ? codexUnlock(k) : false;
}
export function codexUnlockMon(name){
  if(!name) return false;
  const k = codexKeyByMonName(name);
  return k ? codexUnlock(k) : false;
}
export function codexUnlockMat(k){ return codexUnlock('mat_' + k); }
export function codexUnlockPill(name){ return codexUnlock('pill_' + name); }
export function codexUnlockGf(key){ return codexUnlock('gf_' + key); }
export function codexUnlockSec(i){ return codexUnlock('sec_' + i); }
export function codexUnlockEnc(key){ return codexUnlock('enc_' + key); }

/* ---------- 气运（并入 fortune()） ---------- */
export function codexLuck(){
  return Math.floor(codexCount() / CODEX_LUCK_STEP) * CODEX_LUCK_PER_STEP;
}

/* ---------- 存档清洗（META 侧，防御式） ---------- */
export function codexSanitizeMeta(d){
  const out = { unlocked:[], milestones:0 };
  if(!d || typeof d !== 'object') return out;
  const L = Array.isArray(d.unlocked) ? d.unlocked : [];
  for(const k of L){
    if(typeof k !== 'string') continue;
    if(!codexByKey(k)) continue;                 /* 剔除已不存在的条目 */
    if(out.unlocked.indexOf(k) >= 0) continue;   /* 去重 */
    out.unlocked.push(k);
  }
  out.milestones = Math.max(0, Math.floor(Number(d.milestones) || 0));
  return out;
}
