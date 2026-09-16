import { META, saveMeta } from '../core/meta.js';
import { S, busy } from '../core/state.js';
import { clamp, num } from '../core/utils.js';
import {
  GF_BY_KEY, GF_MAX, GF_PROFILE_SCHOOL, GF_SCHOOL, GF_SEG_NAME, GF_SHU, GF_SLOT, GF_TIER_M, GF_XIN, GONGFA
} from '../data/gongfa.js';
import { QUALITIES } from '../data/qualities.js';
import { addLog, toast } from './log.js';
import { codexUnlockGf } from './codex.js';
import { expNeed, realmAt } from './cultivate.js';
import { after } from '../ui/render.js';
import { fbGrantGongfa } from '../ui/feedback.js';

/* =========================================================
   功 法 · 悟 道 录 —— 逻辑层
   ---------------------------------------------------------
   设计四原则（改动前请先读）：
   1. 永不改格局：被动（心法）只 3 格、主动（术法）只 2 格
      —— 习得多寡不等同于强弱，如何取舍才是关键
   2. 已习得永久留存（存 META，轮回不灭）；重数与装备槽归本局
      —— 与「知识不灭、力量重来」的三轴设计一致，也避免永久伤害通胀
   3. 参悟同时消耗灵石与修为 → 让「冲境界」与「厚积功法」形成真实取舍
   4. 主动技能带冷却（cd）与附加效果（fx：护盾/闪避/冰封/灼烧/吸血/破防/自伤/回灵）
      —— 战斗节奏从「一直挥击」变成「何时放招」
   ========================================================= */

/* ---------- 段位与池子 ---------- */
export function gfSeg(){
  if(!S) return 0;
  const g = realmAt(S.level).group;
  return g <= 1 ? 0 : g <= 3 ? 1 : g <= 6 ? 2 : g <= 9 ? 3 : 4;
}
export function gfSegName(){ return GF_SEG_NAME[gfSeg()]; }

export function gfLearnedList(){
  const l = META.gongfa && META.gongfa.learned;
  return Array.isArray(l) ? l : [];
}
export function gfLearned(key){ return gfLearnedList().indexOf(key) >= 0; }
export function gfCount(){ return gfLearnedList().length; }

/* 当前境界可得的未习得功法 */
export function gfPool(){
  const cur = gfSeg();
  return GONGFA.filter(g => g.seg <= cur && !gfLearned(g.k));
}

/* 妖王 / 秘境掉落：当前段权重最高，越早的段越少出 */
export function gfRollDrop(){
  const pool = gfPool();
  if(!pool.length) return null;
  const cur = gfSeg();
  const w = pool.map(g => g.seg === cur ? 4 : Math.max(1, 3 - (cur - g.seg)));
  const tot = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for(let i = 0; i < pool.length; i++){ r -= w[i]; if(r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/* 藏经阁售价：品阶为主，段位加成 */
export function gfBookPrice(gf){ return Math.round((120 + gf.t * gf.t * 300) * (1 + gf.seg * 0.22)); }

/* ---------- 槽位 ---------- */
/* 本局装备：passive[3]（心法）· active[2]（术法）
   兼容旧存档形态 { xin, shu } —— 由 gfSanitizeS 迁移 */
export function gfEnsure(){
  /* 无本局状态时返回一份临时默认（只读场景不崩；有状态时正常就地补齐） */
  if(!S) return { passive: [null, null, null], active: [null, null], lv: {} };
  if(!S.gongfa) S.gongfa = {};
  const g = S.gongfa;
  if(!Array.isArray(g.passive)) g.passive = [null, null, null];
  while(g.passive.length < GF_SLOT.passive) g.passive.push(null);
  if(!Array.isArray(g.active)) g.active = [null, null];
  while(g.active.length < GF_SLOT.active) g.active.push(null);
  if(!g.lv || typeof g.lv !== 'object') g.lv = {};
  return g;
}
export function gfEquipped(){ return gfEnsure(); }

/* ---------- 习得（永久） ---------- */
export function gfLearn(key, quiet){
  const gf = GF_BY_KEY[key];
  if(!gf || gfLearned(key)) return false;
  if(!META.gongfa || !Array.isArray(META.gongfa.learned)) META.gongfa = { learned: [], best: {} };
  META.gongfa.learned.push(key);
  if(!META.gongfa.best) META.gongfa.best = {};
  if(META.gongfa.best[key] === undefined) META.gongfa.best[key] = 0;
  saveMeta();
  if(!quiet){
    addLog('你参研【' + gf.n + '】（' + QUALITIES[gf.t].name + '）——关窍豁然贯通，此法刻入道基，<b>轮回不灭</b>。', 'ach');
  }
  /* 图鉴 + 反馈：功法是永久所得，quiet 与否都该被看见 */
  codexUnlockGf(key);
  if(!quiet) fbGrantGongfa(gf);
  /* 空槽自动祭炼，省得玩家来回点 */
  if(S){
    const g = gfEnsure();
    const arr = gf.kind === 'xin' ? g.passive : g.active;
    const e = arr.indexOf(null);
    if(e >= 0){
      arr[e] = key;
      if(!quiet) addLog('（' + (gf.kind === 'xin' ? '被动' : '主动') + '槽尚空，【' + gf.n + '】已自行' + (gf.kind === 'xin' ? '运转' : '备于识海') + '）', 'sys');
    }
  }
  return true;
}
export function gfGrant(gf, quiet){ return gf ? gfLearn(gf.k, quiet) : false; }

/* ---------- 装备 / 卸下 ---------- */
/* 把 key 装到 kind 对应的槽位 idx；idx 省略则自动择空位（无空位返回 false） */
export function gfSlotArr(kind){ return gfEnsure()[kind === 'xin' ? 'passive' : 'active']; }
export function gfSlotOf(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return { arr: null, idx: -1 };
  const arr = gfSlotArr(gf.kind);
  return { arr, idx: arr.indexOf(key) };
}
export function gfEquipAt(key, idx){
  const gf = GF_BY_KEY[key];
  if(!gf) return false;
  if(!gfLearned(key)){ toast('尚未习得此法'); return false; }
  const arr = gfSlotArr(gf.kind);
  if(idx < 0 || idx >= arr.length) return false;
  /* 同一部功法只占一格 */
  for(let i = 0; i < arr.length; i++) if(i !== idx && arr[i] === key) arr[i] = null;
  arr[idx] = key;
  return true;
}
/* 槽满时的替换（用于 UI 的选择框） */
export function gfReplaceAt(key, idx){ return gfEquipAt(key, idx); }

/* 点一下装/卸（左栏与列表用）：已在该槽位则卸下，否则装到空位，无空位返回 'full' */
export function gfToggleEquip(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return 'no';
  if(!gfLearned(key)){ toast('尚未习得此法'); return 'no'; }
  const arr = gfSlotArr(gf.kind);
  const i = arr.indexOf(key);
  if(i >= 0){
    arr[i] = null;
    addLog(gf.kind === 'xin' ? '你散去【' + gf.n + '】的运转。' : '你收起术法【' + gf.n + '】。', 'dim');
    after();
    return 'off';
  }
  const e = arr.indexOf(null);
  if(e < 0) return 'full';
  arr[e] = key;
  addLog(gf.kind === 'xin'
    ? '你运转【' + gf.n + '】，周身气机为之一变。'
    : '你祭炼术法【' + gf.n + '】，已备于识海。', 'act');
  after();
  return 'on';
}
export function gfUnequipAt(kind, idx){
  const arr = gfSlotArr(kind);
  if(idx < 0 || idx >= arr.length) return;
  const key = arr[idx];
  if(!key) return;
  arr[idx] = null;
  const gf = GF_BY_KEY[key];
  addLog('你收起了【' + (gf ? gf.n : '功法') + '】。', 'dim');
  after();
}
export function gfAllOff(){
  const g = gfEnsure();
  g.passive = g.passive.map(() => null);
  g.active = g.active.map(() => null);
  addLog('你把所修功法尽数收起，重归素朴。', 'dim');
  after();
}

/* ---------- 重数与参悟 ---------- */
export function gfLevel(key){ return (S && S.gongfa && S.gongfa.lv && S.gongfa.lv[key]) || 0; }
export function gfMax(key){ const gf = GF_BY_KEY[key]; return gf ? GF_MAX[gf.t] : 0; }
export function gfCost(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return 0;
  return Math.round((70 + gf.t * gf.t * 110) * Math.pow(1.6, gfLevel(key)) * (1 + gf.seg * 0.25));
}
export function gfExpCost(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return 0;
  return Math.floor(expNeed(S.level) * 0.02 * (gfLevel(key) + 1));
}
export function gfUpgrade(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return;
  if(!gfLearned(key)){ toast('尚未习得此法'); return; }
  if(busy()){ toast('此刻无暇参悟'); return; }
  const lv = gfLevel(key), max = GF_MAX[gf.t];
  if(lv >= max){ toast('此法已至圆满'); return; }
  const cs = gfCost(key), ce = gfExpCost(key);
  if(S.stones < cs){ toast('灵石不足（需 ' + num(cs) + '）'); return; }
  if(S.exp < ce){ toast('修为不足（需 ' + num(ce) + '）'); return; }
  S.stones -= cs;
  S.exp -= ce;
  gfEnsure();
  S.gongfa.lv[key] = lv + 1;
  if(META.gongfa && META.gongfa.best && (META.gongfa.best[key] || 0) < lv + 1){
    META.gongfa.best[key] = lv + 1;
    saveMeta();
  }
  addLog('你对【' + gf.n + '】再作参悟，第 ' + (lv + 1) + ' 重已成——' + gfEffectText(gf, lv + 1) + '。', 'act');
  after();
}

/* ---------- 被动加成汇总（供 stats / breakChance / fortune 使用） ---------- */
const ZERO = () => ({ hp: 0, mp: 0, atk: 0, def: 0, cult: 0, crit: 0, brk: 0, luck: 0, speed: 0 });

export function gfBonus(){
  const z = ZERO();
  if(!S || !S.gongfa) return z;
  const g = gfEnsure();
  for(const key of g.passive){
    const gf = GF_BY_KEY[key];
    if(!gf || gf.kind !== 'xin') continue;
    const prof = GF_XIN[gf.p];
    const lv = (g.lv || {})[key] || 0;
    if(!prof || !lv) continue;
    const m = GF_TIER_M[gf.t] * lv;
    for(const k in z) if(prof[k]) z[k] += prof[k] * m;
  }
  for(const k in z) z[k] = (k === 'crit' || k === 'brk' || k === 'luck') ? +z[k].toFixed(2) : +z[k].toFixed(1);
  return z;
}
/* 气运：并入 fortune()，不新开乘区 */
export function gfLuck(){ return gfBonus().luck; }

/* ---------- 主动技能 ---------- */
/* 按功法键构造技能参数（未装在槽位上也可构造，便于测试与快捷键） */
export function gfSkillByKey(key){
  const gf = GF_BY_KEY[key];
  if(!gf || gf.kind !== 'shu') return null;
  const prof = GF_SHU[gf.sk];
  if(!prof) return null;
  const g = gfEnsure();
  const lv = (g.lv || {})[key] || 0;
  const grow = 1 + GF_TIER_M[gf.t] * 0.5 * (lv / GF_MAX[gf.t]);   /* 满重时 ×(1+0.5×品阶系数) */
  return {
    key, gf, lv, slot: (g.active || []).indexOf(key),
    n: prof.n,
    mult: +(prof.mult * grow).toFixed(2),
    hits: prof.hits || 1,
    cd: prof.cd || 1,
    mpF: prof.mpF || 0.14,
    mpFlat: prof.mpFlat || 6,
    fx: prof.fx || {}
  };
}
/* 槽 i（0/1）的技能参数；未装备返回 null */
export function gfActiveSkill(i){
  if(!S || !S.gongfa) return null;
  const g = gfEnsure();
  return gfSkillByKey(g.active[i]);
}
export function gfSkillMp(sk, mpMax){ return Math.round(mpMax * sk.mpF) + sk.mpFlat; }
export function gfActiveList(){ return [0, 1].map(i => gfActiveSkill(i)).filter(Boolean); }
/* 兼容旧名（阶段一 API） */
export function gfSkill(i){ return gfActiveSkill(i); }

/* ---------- 文案 ---------- */
const GF_STAT_NAME = { hp: '气血', mp: '灵力', atk: '攻击', def: '防御', cult: '修速', crit: '暴击', brk: '突破', luck: '气运', speed: '遁速' };

/* 附加效果的可读描述（战斗面板与面板都用它，避免两处口径不一） */
export function gfFxText(fx){
  if(!fx) return '';
  const out = [];
  if(fx.crit) out.push('暴击 +' + fx.crit + 'pt');
  if(fx.pierce) out.push('破防 ' + Math.round(fx.pierce * 100) + '%');
  if(fx.heal) out.push('吸血 ' + Math.round(fx.heal * 100) + '%');
  if(fx.shield) out.push('减伤 ' + Math.round(fx.shield * 100) + '% ×' + (fx.dur || 1) + ' 回合');
  if(fx.dodge) out.push('闪避 ' + fx.dodge + ' 回合');
  if(fx.freeze) out.push('冰封 ' + fx.freeze + ' 回合（敌伤减半）');
  if(fx.burn) out.push('灼烧 ' + fx.burn + ' 回合（每回合 ' + Math.round((fx.burnPct || 0.05) * 100) + '% 攻）');
  if(fx.selfDmgPct) out.push('反噬 ' + Math.round(fx.selfDmgPct * 100) + '% 气血上限');
  if(fx.mpBack) out.push('回灵 ' + Math.round(fx.mpBack * 100) + '%');
  return out.join(' · ');
}
export function gfSchoolOf(gf){
  if(!gf) return GF_SCHOOL.xin;
  const key = GF_PROFILE_SCHOOL[gf.kind === 'xin' ? gf.p : gf.sk];
  return GF_SCHOOL[key] || GF_SCHOOL.xin;
}
export function gfSchoolKey(gf){
  if(!gf) return 'xin';
  return GF_PROFILE_SCHOOL[gf.kind === 'xin' ? gf.p : gf.sk] || 'xin';
}

export function gfEffectText(gf, lv){
  if(!gf || !lv) return '尚未参悟';
  const prof = gf.kind === 'xin' ? GF_XIN[gf.p] : null;
  if(prof){
    const m = GF_TIER_M[gf.t] * lv;
    const out = [];
    for(const k in prof){
      if(k === 'n' || k === 'd') continue;
      const v = prof[k] * m;
      if(!v) continue;
      out.push(GF_STAT_NAME[k] + ' +' + v.toFixed(1) + ((k === 'crit' || k === 'brk' || k === 'luck') ? '' : '%'));
    }
    return out.join(' · ');
  }
  const sk = GF_SHU[gf.sk];
  if(!sk) return '';
  const grow = 1 + GF_TIER_M[gf.t] * 0.5 * (lv / GF_MAX[gf.t]);
  const parts = ['伤害 ×' + (sk.mult * grow).toFixed(2)];
  if(sk.hits > 1) parts.push(sk.hits + ' 段');
  parts.push('灵力 ' + Math.round((sk.mpF || 0.14) * 100) + '%+' + (sk.mpFlat || 6));
  parts.push('冷却 ' + (sk.cd || 1) + ' 回合');
  const fx = gfFxText(sk.fx);
  if(fx) parts.push(fx);
  return parts.join(' · ');
}
export function gfPerLvText(gf){
  if(!gf) return '';
  if(gf.kind === 'xin'){
    const prof = GF_XIN[gf.p];
    const m = GF_TIER_M[gf.t];
    const out = [];
    for(const k in prof){
      if(k === 'n' || k === 'd') continue;
      const v = prof[k] * m;
      if(!v) continue;
      out.push(GF_STAT_NAME[k] + ' +' + v.toFixed(1) + ((k === 'crit' || k === 'brk' || k === 'luck') ? '' : '%'));
    }
    return '每重 ' + out.join(' · ');
  }
  const sk = GF_SHU[gf.sk];
  if(!sk) return '';
  const parts = ['伤害 ×' + sk.mult];
  if(sk.hits > 1) parts.push(sk.hits + ' 段');
  parts.push('冷却 ' + (sk.cd || 1));
  const fx = gfFxText(sk.fx);
  if(fx) parts.push(fx);
  return '重数愈高威能愈盛（每重 ×' + (1 + GF_TIER_M[gf.t] * 0.5 / GF_MAX[gf.t]).toFixed(3) + '）· ' + parts.join(' · ');
}
export function gfTierName(t){ return QUALITIES[t] ? QUALITIES[t].name : '凡品'; }
export function gfGrade(gf){   /* 类别 + 品阶，用于卡片角标 */
  return (gf.kind === 'xin' ? '被动' : '主动') + ' · ' + gfTierName(gf.t);
}

/* ---------- 藏经阁 ---------- */
export function gfShopBook(){ return Array.isArray(S.shopBook) ? S.shopBook : []; }
export function gfRollBook(){
  const pool = gfPool().map(g => g.k);
  const out = [];
  for(let i = 0; i < 2 && pool.length; i++){
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
export function gfBuyBook(i){
  const key = gfShopBook()[i];
  const gf = GF_BY_KEY[key];
  if(!gf) return;
  const p = gfBookPrice(gf);
  if(S.stones < p){ toast('灵石不足（需 ' + num(p) + '）'); return; }
  S.stones -= p;
  S.shopBook.splice(i, 1);
  addLog('你以 ' + num(p) + ' 枚灵石买下藏经阁中的《' + gf.n + '》。', 'item');
  gfLearn(key);          /* gfLearn 会自动填入空槽 */
  after();
}

/* ---------- 存档进出（防御式，缺字段不炸） ---------- */
/* 兼容三种形态：
   v1: { xin:key, shu:[k0,k1] }        （阶段一旧档）
   v3: { passive:[...], active:[...] }
   以及任意字段缺失 */
export function gfSanitizeS(d){
  const g = d || {};
  const lvIn = g.lv || {};
  const lv = {};
  for(const k in lvIn){
    const gf = GF_BY_KEY[k];
    if(!gf || typeof lvIn[k] !== 'number') continue;
    lv[k] = clamp(Math.floor(lvIn[k]), 0, GF_MAX[gf.t]);
  }
  const fill = (src, kind, n) => {
    const arr = [];
    for(let i = 0; i < n; i++) arr.push(null);
    const put = k => {
      if(!k || !GF_BY_KEY[k] || GF_BY_KEY[k].kind !== kind) return;
      if(arr.indexOf(k) >= 0) return;
      const e = arr.indexOf(null);
      if(e >= 0) arr[e] = k;
    };
    if(Array.isArray(src)) src.forEach(put); else put(src);
    return arr;
  };
  /* 被动：优先新字段 passive，其次旧字段 xin */
  const passive = fill(g.passive !== undefined ? g.passive : g.xin, 'xin', GF_SLOT.passive);
  /* 主动：优先 active，其次旧字段 shu */
  const active = fill(g.active !== undefined ? g.active : g.shu, 'shu', GF_SLOT.active);
  return { passive, active, lv };
}
export function gfSanitizeMeta(m){
  const out = { learned: [], best: {} };
  const L = (m && Array.isArray(m.learned)) ? m.learned : [];
  for(const k of L){
    if(typeof k !== 'string' || !GF_BY_KEY[k] || out.learned.indexOf(k) >= 0) continue;
    out.learned.push(k);
  }
  const B = (m && m.best) || {};
  for(const k in B){
    const gf = GF_BY_KEY[k];
    if(!gf || typeof B[k] !== 'number') continue;
    out.best[k] = clamp(Math.floor(B[k]), 0, GF_MAX[gf.t]);
  }
  return out;
}
