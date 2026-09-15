import { META, applyMeta, blankStat } from './meta.js';
import { S } from './state.js';
import { clamp, ri } from './utils.js';
import { GF_BY_KEY } from '../data/gongfa.js';
import { blankPills } from '../data/pills.js';
import { matSanitize } from '../sys/craft.js';
import { gfRollBook, gfSanitizeS } from '../sys/gongfa.js';
import { clampVitals } from '../sys/character.js';
import { addLog, toast } from '../sys/log.js';
import { rollMount } from '../sys/mount.js';
import { refreshShop } from '../sys/shop.js';
import { closeModal } from '../ui/modal.js';
import { renderAll } from '../ui/render.js';


/* =========================================================
   存档 · 自动存档 + 3 枚玉简 + 存档码导入导出
   ========================================================= */
export const SAVE_KEY = 'xiuxian_save_v2';
export const SAVE_OLD = 'xiuxian_save_v1';
export const SLOT_N = 3;
export const slotKey = i => 'xiuxian_slot_'+i+'_v2';

export function saveData(){
  return {
    v:4,                                   /* v4：新增材料字段（旧档自动补默认，见 restore） */
    level:S.level, exp:S.exp, day:S.day, stones:S.stones,
    hp:S.hp, mp:S.mp, equip:S.equip, bag:S.bag, pills:S.pills,
    shop:S.shop, shopMount:S.shopMount, shopDay:S.shopDay,
    pillStack:S.pillStack, breakStreak:S.breakStreak,
    autoEquipOn:S.autoEquipOn,
    kills:S.kills, deaths:S.deaths, tab:S.tab,
    stat:S.stat, encDay:S.encDay,
    gongfa:S.gongfa, shopBook:S.shopBook,
    materials:S.materials,
    logs:S.logs.slice(-90), ended:S.ended,
    t: Date.now()
  };
}
export function save(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(saveData())); }catch(e){}
}
export function hardWipeSave(){
  try{ localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_OLD); }catch(e){}
}

export let REH_UID = 700000;
export function rehydrate(it){
  if(!it) return null;
  const o = Object.assign({}, it);
  o.id = ++REH_UID;
  if(o.power === undefined){
    o.power = Math.round((o.atk||0)*2 + (o.def||0)*2.6 + (o.hp||0)*0.16
      + (o.mp||0)*0.1 + (o.crit||0)*6 + (o.cult||0)*5 + (o.speed||0)*14);
  }
  return o;
}

/* 把一份存档数据装回运行时状态（读档 / 玉简 / 导入共用） */
export function restore(d){
  if(!d || typeof d.level !== 'number') return false;
  const eq = d.equip || {};
  S = {
    level: d.level||0,
    exp: d.exp||0,
    day: d.day||1,
    stones: d.stones||0,
    hp: d.hp||1,
    mp: d.mp||0,
    equip:{
      weapon: eq.weapon ? rehydrate(eq.weapon) : null,
      armor:  eq.armor  ? rehydrate(eq.armor)  : null,
      mount:  eq.mount  ? rehydrate(eq.mount)  : null,
      treasures: (eq.treasures || [null,null,null]).map(x => x ? rehydrate(x) : null)
    },
    bag: (d.bag||[]).map(rehydrate),
    /* 药囊默认值由 data/pills.js 的表派生：新增丹药（如归元丹）自动补 0，老档不丢 */
    pills: Object.assign(blankPills(), d.pills||{}),
    /* 材料：本局所有；缺字段补空、非法键与负数由 matSanitize 剔除 */
    materials: matSanitize(d.materials),
    logs: d.logs||[],
    combat:null,
    dungeon:null,
    shop:(d.shop||[]).map(rehydrate),
    shopMount: d.shopMount ? rehydrate(d.shopMount) : null,
    shopDay: d.shopDay||1,
    /* 旧版 buffBreak 迁移为破境丹药力层数 */
    pillStack: (d.pillStack !== undefined) ? d.pillStack : ((d.buffBreak||0) > 0 ? 1 : 0),
    breakStreak: d.breakStreak||0,
    autoEquipOn: d.autoEquipOn !== false,
    kills: d.kills||0,
    deaths: d.deaths||0,
    tab: d.tab||'cult',
    ended: !!d.ended,
    stat: Object.assign(blankStat(), d.stat||{}),
    encDay: d.encDay||0,
    encOpen: null,
    /* 功法：缺字段自动补默认（旧存档可直接读），非法键一律剔除 */
    gongfa: gfSanitizeS(d.gongfa),
    shopBook: (Array.isArray(d.shopBook) ? d.shopBook : [])
      .filter(k => GF_BY_KEY[k]).slice(0, 2)
  };
  while(S.equip.treasures.length < 3) S.equip.treasures.push(null);
  if(!S.logs.length) addLog('你重新睁开双眼，前尘如故。','sys');
  if(!S.shop.length) refreshShop(true);
  /* 旧存档没有藏经阁货架，补一批 */
  else if(!S.shopBook.length) S.shopBook = gfRollBook();
  /* 旧存档（坐骑系统之前）没有 shopMount 字段，补一头 */
  else if(d.shopMount === undefined){
    S.shopMount = rollMount(clamp(ri(0,1)+Math.floor(S.level/12), 0, 4), 0.10 + S.level/70);
  }
  clampVitals();
  return true;
}

export function load(){
  try{
    let raw = localStorage.getItem(SAVE_KEY);
    if(!raw) raw = localStorage.getItem(SAVE_OLD);       /* 兼容旧版自动存档 */
    if(!raw) return false;
    return restore(JSON.parse(raw));
  }catch(e){ return false; }
}

/* -------- 存档码：导出 / 导入 -------- */
export function b64enc(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for(const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function b64dec(txt){
  const bin = atob(String(txt).trim());
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export function exportCode(){
  const pack = { s: saveData(), m: META };
  return 'XXLX1.' + b64enc(JSON.stringify(pack));
}
export function importSave(text){
  try{
    const t = String(text||'').trim();
    if(!t){ toast('请先粘贴存档码'); return; }
    const body = t.indexOf('XXLX1.') === 0 ? t.slice(6) : t;
    const obj = JSON.parse(b64dec(body));
    const sd = obj.s ? obj.s : obj;
    if(!restore(sd)){ toast('存档码无效'); return; }
    if(obj.m) applyMeta(obj.m);
    closeModal();
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(saveData())); }catch(e){}
    addLog('一纸残卷自虚空中落下，其上正是你走过的路——旧日道途，重新展开。','epic');
    renderAll();
    toast('存档已导入');
  }catch(e){ toast('存档码无法解析'); }
}
