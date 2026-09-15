import { META, saveMeta } from '../core/meta.js';
import { S, busy } from '../core/state.js';
import { clamp, num } from '../core/utils.js';
import { GF_BY_KEY, GF_MAX, GF_SEG_NAME, GF_SHU, GF_SLOT, GF_TIER_M, GF_XIN, GONGFA } from '../data/gongfa.js';
import { QUALITIES } from '../data/qualities.js';
import { addLog, toast } from './log.js';
import { expNeed, realmAt } from './cultivate.js';
import { after } from '../ui/render.js';

/* =========================================================
   功 法 · 悟 道 录 —— 逻辑层
   ---------------------------------------------------------
   设计三原则（改动前请先读）：
   1. 永不改格局：心法只 1 格、术法只 2 格，多学不等于多强 → 逼出取舍
   2. 已习得永久留存（存 META，轮回不灭）；重数与本局装备槽归本局
      —— 与「知识不灭、力量重来」的三轴设计一致，也避免永久伤害通胀
   3. 参悟同时消耗灵石与修为 → 让「冲境界」与「厚积功法」形成真实取舍
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
  /* 空槽自动祭炼，省得玩家来回点 */
  if(S && S.gongfa){
    if(gf.kind === 'xin' && !S.gongfa.xin){
      S.gongfa.xin = key;
      if(!quiet) addLog('心法本无，你自然而然地运转起【' + gf.n + '】。', 'sys');
    }else if(gf.kind === 'shu' && S.gongfa.shu.indexOf(null) >= 0){
      S.gongfa.shu[S.gongfa.shu.indexOf(null)] = key;
      if(!quiet) addLog('术法一栏尚空，【' + gf.n + '】已备于识海。', 'sys');
    }
  }
  return true;
}
export function gfGrant(gf, quiet){ return gf ? gfLearn(gf.k, quiet) : false; }

/* ---------- 装备 / 卸下 ---------- */
export function gfEnsure(){
  if(!S.gongfa) S.gongfa = { xin: null, shu: [null, null], lv: {} };
  if(!Array.isArray(S.gongfa.shu)) S.gongfa.shu = [null, null];
  while(S.gongfa.shu.length < GF_SLOT.shu) S.gongfa.shu.push(null);
  if(!S.gongfa.lv) S.gongfa.lv = {};
}
export function gfEquip(key){
  const gf = GF_BY_KEY[key];
  if(!gf) return;
  if(!gfLearned(key)){ toast('尚未习得此法'); return; }
  gfEnsure();
  if(gf.kind === 'xin'){
    const on = S.gongfa.xin === key;
    S.gongfa.xin = on ? null : key;
    addLog(on ? '你散去【' + gf.n + '】的运转，重归平常。'
              : '你运转【' + gf.n + '】，周身气机为之一变。', on ? 'dim' : 'act');
  }else{
    const shu = S.gongfa.shu;
    const i = shu.indexOf(key);
    if(i >= 0){
      shu[i] = null;
      addLog('你收起术法【' + gf.n + '】。', 'dim');
    }else{
      const e = shu.indexOf(null);
      if(e >= 0) shu[e] = key;
      else{
        const off = shu.shift();
        shu.push(key);
        const offName = GF_BY_KEY[off] ? GF_BY_KEY[off].n : '旧法';
        addLog('术法只容两部，【' + offName + '】自识海中散去。', 'dim');
      }
      addLog('你祭炼术法【' + gf.n + '】，已备于识海。', 'sys');
    }
  }
  after();
}
export function gfAllOff(){
  gfEnsure();
  S.gongfa.xin = null;
  S.gongfa.shu = [null, null];
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

/* ---------- 加成汇总 ---------- */
const ZERO = () => ({ hp: 0, mp: 0, atk: 0, def: 0, cult: 0, crit: 0, brk: 0, luck: 0 });

/* 已装备心法的加成（术法不提供被动加成，其价值在战斗中） */
export function gfBonus(){
  const z = ZERO();
  if(!S || !S.gongfa) return z;
  const g = S.gongfa;
  const xin = GF_BY_KEY[g.xin];
  if(xin && xin.kind === 'xin'){
    const prof = GF_XIN[xin.p];
    const lv = (g.lv || {})[xin.k] || 0;
    if(prof && lv){
      const m = GF_TIER_M[xin.t] * lv;
      for(const k in z) if(prof[k]) z[k] += prof[k] * m;
    }
  }
  for(const k in z) z[k] = (k === 'crit' || k === 'brk' || k === 'luck') ? +z[k].toFixed(2) : +z[k].toFixed(1);
  return z;
}
/* 气运：并入 fortune()，不新开乘区 */
export function gfLuck(){ return gfBonus().luck; }

/* 术法参数（槽 0 / 1），未装备返回 null */
export function gfSkill(i){
  if(!S || !S.gongfa) return null;
  const key = (S.gongfa.shu || [])[i];
  const gf = GF_BY_KEY[key];
  if(!gf || gf.kind !== 'shu') return null;
  const prof = GF_SHU[gf.sk];
  if(!prof) return null;
  const lv = (S.gongfa.lv || {})[key] || 0;
  const grow = 1 + GF_TIER_M[gf.t] * 0.5 * (lv / GF_MAX[gf.t]);   /* 满重时 ×(1+0.5×品阶系数) */
  return {
    key, gf, lv,
    mult: +(prof.mult * grow).toFixed(2),
    mpF: prof.mpF || 0.14,
    mpFlat: prof.mpFlat || 6,
    crit: prof.crit || 0,
    heal: prof.heal || 0,
    hits: prof.hits || 1,
    pierce: prof.pierce || 0,
    guard: prof.guard || 0
  };
}
export function gfSkillMp(sk, mpMax){ return Math.round(mpMax * sk.mpF) + sk.mpFlat; }
export function gfShuEquipped(){ return [0, 1].map(i => gfSkill(i)).filter(Boolean); }

/* ---------- 文案 ---------- */
const GF_STAT_NAME = { hp: '气血', mp: '灵力', atk: '攻击', def: '防御', cult: '修速', crit: '暴击', brk: '突破', luck: '气运' };
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
  parts.push('耗灵力 ' + Math.round((sk.mpF || 0.14) * 100) + '%+' + (sk.mpFlat || 6));
  if(sk.hits) parts.push(sk.hits + ' 段');
  if(sk.crit) parts.push('暴击 +' + sk.crit + 'pt');
  if(sk.heal) parts.push('吸血 ' + Math.round(sk.heal * 100) + '%');
  if(sk.pierce) parts.push('破防 ' + Math.round(sk.pierce * 100) + '%');
  if(sk.guard) parts.push('减伤 ' + Math.round(sk.guard * 100) + '%');
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
  if(sk.hits) parts.push(sk.hits + ' 段');
  if(sk.crit) parts.push('暴击 +' + sk.crit + 'pt');
  if(sk.heal) parts.push('吸血 ' + Math.round(sk.heal * 100) + '%');
  if(sk.pierce) parts.push('破防 ' + Math.round(sk.pierce * 100) + '%');
  if(sk.guard) parts.push('减伤 ' + Math.round(sk.guard * 100) + '%');
  return '重数愈高威能愈盛（每重 ×' + (1 + GF_TIER_M[gf.t] * 0.5 / GF_MAX[gf.t]).toFixed(3) + '）· ' + parts.join(' · ');
}
export function gfTierName(t){ return QUALITIES[t] ? QUALITIES[t].name : '凡品'; }
export function gfGrade(gf){   /* 品阶 + 类别，用于卡片角标 */
  return (gf.kind === 'xin' ? '心法' : '术法') + ' · ' + gfTierName(gf.t);
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
  gfLearn(key);
  if(gf.kind === 'xin'){
    S.gongfa.xin = key;   /* 新买的心法直接运转，方便玩家立刻感受 */
  }else{
    const e = S.gongfa.shu.indexOf(null);
    if(e >= 0) S.gongfa.shu[e] = key;
  }
  after();
}

/* ---------- 存档进出（防御式，缺字段不炸） ---------- */
export function gfSanitizeS(d){
  const g = d || {};
  const lvIn = g.lv || {};
  const lv = {};
  for(const k in lvIn){
    const gf = GF_BY_KEY[k];
    if(!gf || typeof lvIn[k] !== 'number') continue;
    lv[k] = clamp(Math.floor(lvIn[k]), 0, GF_MAX[gf.t]);
  }
  const xin = (g.xin && GF_BY_KEY[g.xin] && GF_BY_KEY[g.xin].kind === 'xin') ? g.xin : null;
  const shuIn = Array.isArray(g.shu) ? g.shu : [];
  const shu = [null, null];
  for(const k of shuIn){
    if(!k || !GF_BY_KEY[k] || GF_BY_KEY[k].kind !== 'shu') continue;
    if(shu.indexOf(k) >= 0) continue;
    const e = shu.indexOf(null);
    if(e >= 0) shu[e] = k;
  }
  return { xin, shu, lv };
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
