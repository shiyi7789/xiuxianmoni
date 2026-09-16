import { S, busy } from '../core/state.js';
import { META, fortune } from '../core/meta.js';
import { MATERIALS, MAT_ORDER, MAT_SHOP } from '../data/materials.js';
import { GEAR_RECIPES, PILL_RECIPES } from '../data/recipes.js';
import { chance, clamp, num, ri } from '../core/utils.js';
import { addItem, itemLabel, makeItem, qName, stats } from './character.js';
import { cvBonus } from './cave.js';
import { checkAch } from './achievement.js';
import { realmAt, realmNameOf } from './cultivate.js';
import { addLog, toast } from './log.js';
import { advance } from './time.js';
import { after } from '../ui/render.js';

/* =========================================================
   材 料 · 炼 制 —— 逻辑层
   ---------------------------------------------------------
   设计要点（改之前先读）：
   1. 材料是**本局**的，不存 META —— 与装备/灵石一致，轮回清零
   2. 掉落与现有产出**并行**，不挤占既有概率（老玩家的收益节奏不变）
   3. 炼制消耗**灵力 + 天数**，不消耗灵石 —— 材料本身才是稀缺项，
      也让「出门打怪」与「留家开炉」形成节奏竞争
   4. 成功率三路加成：配方基础 + 丹道传承 + 境界差（越级炼有惩罚）
   5. 失败返还 40% 材料 —— 有痛感，但不劝退
   6. 炼器出器的品质随机（qiMin 起步，气运与越级加成）→ 把随机产出变成可控产出
   ========================================================= */

/* ---------- 材料基础操作 ---------- */
export function materialName(k){
  const m = MATERIALS[k];
  return m ? m.n : k;
}
export function materialDef(k){ return MATERIALS[k] || null; }

export function countMat(k){
  if(!S || !S.materials) return 0;
  return S.materials[k] || 0;
}
export function totalMats(){
  if(!S || !S.materials) return 0;
  let n = 0;
  for(const k of MAT_ORDER) n += (S.materials[k] || 0);
  return n;
}
export function addMaterial(k, n){
  if(!S || !MATERIALS[k]) return false;
  n = Math.floor(Number(n) || 0);
  if(n <= 0) return false;
  if(!S.materials) S.materials = {};
  S.materials[k] = clamp((S.materials[k] || 0) + n, 0, 999999);
  return true;
}
export function addMaterials(map, quiet){
  if(!map) return 0;
  let total = 0;
  const got = {};
  for(const k in map){
    if(addMaterial(k, map[k])){ total += Math.floor(Number(map[k]) || 0); got[k] = Math.floor(Number(map[k]) || 0); }
  }
  if(!quiet && total > 0) addLog('获得材料：' + matPlain(got) + '。', 'item');
  return total;
}
export function hasMats(need){
  if(!need) return true;
  for(const k in need) if(countMat(k) < need[k]) return false;
  return true;
}
export function costMats(need){
  if(!hasMats(need)) return false;
  for(const k in need) S.materials[k] -= need[k];
  return true;
}
/* 失败返还（默认四成） */
export function refundMats(need, rate){
  rate = (rate === undefined) ? 0.4 : rate;
  const back = {};
  for(const k in need){
    const n = Math.floor(need[k] * rate);
    if(n > 0) back[k] = n;
  }
  addMaterials(back, true);
  return back;
}
function scaleNeed(need, n){
  const out = {};
  for(const k in need) out[k] = need[k] * n;
  return out;
}

/* ---------- 文案 ---------- */
/* { lingcao:3 } → "灵草×3"（不足者标红，界面用） */
export function matText(need){
  if(!need) return '';
  const parts = [];
  for(const k of MAT_ORDER){
    if(!need[k]) continue;
    const m = MATERIALS[k];
    const cnt = need[k];
    const enough = countMat(k) >= cnt;
    parts.push('<span' + (enough ? '' : ' style="color:var(--zhu)"') + '>'
      + (m ? m.n : k) + '×' + cnt + '</span>');
  }
  return parts.join(' · ');
}
/* 纯文本版（日志用，切勿放进 HTML 位置） */
export function matPlain(need){
  if(!need) return '';
  const parts = [];
  for(const k of MAT_ORDER){
    if(!need[k]) continue;
    const m = MATERIALS[k];
    parts.push((m ? m.n : k) + '×' + need[k]);
  }
  return parts.join(' · ');
}
/* 带品阶色的材料名（左栏与货架用；仙品以上自带流光） */
export function matLabel(k, n){
  const m = MATERIALS[k];
  if(!m) return k;
  const cnt = (n === undefined) ? countMat(k) : n;
  return qName(m.n, m.t) + '<span class="muted-sm"> ×' + num(cnt) + '</span>';
}
export function matTierName(t){
  return ['凡品','灵品','宝品','仙品','神品'][clamp(t, 0, 4)] || '凡品';
}

/* ---------- 材料买卖（坊市材料铺：应急补差） ---------- */
export function matPrice(k){
  const row = MAT_SHOP.find(x => x.k === k);
  return row ? row.price : 0;
}
export function buyMaterial(k, n){
  const gfMat = MATERIALS[k];
  if(!gfMat) return false;
  n = Math.max(1, Math.floor(Number(n) || 1));
  const p = matPrice(k);
  if(p <= 0){ toast('此物坊市不售'); return false; }
  const cost = p * n;
  if(S.stones < cost){ toast('灵石不足（需 ' + num(cost) + '）'); return false; }
  S.stones -= cost;
  addMaterial(k, n);
  addLog('你在材料铺买了 ' + gfMat.n + '×' + n + '，付灵石 ' + num(cost) + ' 枚。', 'item');
  after();
  return true;
}

/* =========================================================
   掉 落 表（与现有产出并行，独立判定）
   ========================================================= */

/* 妖兽：击杀后调用一次（不挤占成品掉落分支） */
export function rollMaterialDrop(tier, boss){
  const got = {};
  tier = clamp(tier, 0, 4);
  /* 兽皮：凡兽起就有 */
  if(chance(boss ? 100 : 70)) got.shoupi = ri(1, 2 + tier) * (boss ? 3 : 1);
  /* 妖丹：凶兽起 */
  if(tier >= 1 && chance(boss ? 100 : 45 + tier * 8)) got.yaodan = ri(1, 1 + Math.floor(tier / 2)) * (boss ? 3 : 1);
  /* 玄铁：妖将起 */
  if(tier >= 2 && chance(boss ? 90 : 25 + tier * 6)) got.xuantie = ri(1, tier - 1) * (boss ? 2 : 1);
  /* 星辰砂：妖王/高阶 */
  if(tier >= 3 && chance(boss ? 70 : 12 + tier * 4)) got.xingchen = boss ? 2 : 1;
  /* 混沌石：仅最高档妖王 */
  if(boss && tier >= 4 && chance(35)) got.hundun = 1;
  return got;
}

/* 秘境每层保底（在 dungeonForward 里给） */
export function rollSearchMats(tier){
  const got = {};
  tier = clamp(tier, 0, 4);
  got.lingcao = ri(2, 4 + tier);
  if(tier >= 1 && chance(55)) got.xuantie = ri(1, 1 + tier);
  if(tier >= 2 && chance(30 + tier * 4)) got.xingchen = 1;
  return got;
}

/* 秘境妖王贯通时的大材料包 */
export function rollBossMats(tier){
  const got = {};
  tier = clamp(tier, 0, 4);
  got.shoupi  = ri(4, 8);
  got.yaodan  = ri(3, 6);
  got.xuantie = ri(2, 4 + tier);
  if(tier >= 2) got.xingchen = ri(1, 1 + Math.floor(tier / 2));
  if(tier >= 4 && chance(45)) got.hundun = 1;
  return got;
}
/* 历练岩缝：额外掉矿 */
export function rollSeamMats(tier){
  tier = clamp(tier, 0, 4);
  const got = { lingcao: ri(1, 2) };
  if(tier >= 1) got.xuantie = ri(1, 1 + tier);
  return got;
}

/* =========================================================
   炼 制 · 通 用 计 算
   ========================================================= */
/* 丹道传承（复用既有传承，不新增字段） */
function heritagePillBonus(){
  return ((META && META.up && META.up.pill) ? META.up.pill : 0) * 0.015;
}
/* 境界差：当前大境界组 - 配方推荐段 */
function realmDiff(lv){ return realmAt(S.level).group - (lv || 0); }

/* 最终成功率：配方基础 + 丹道 + 洞府（丹房/器坊）+ 境界差
   extra 是外部加成（洞府设施），不是基础率 */
export function finalRate(recipe, extra){
  let r = (recipe.base || 0) + heritagePillBonus() + (extra || 0);
  const d = realmDiff(recipe.lv);
  if(d < 0) r += d * 0.06;                    /* 越级炼：每差一档 -6% */
  else r += Math.min(0.10, d * 0.02);         /* 高境界炼低配方：至多 +10% */
  return clamp(r, 0.05, 0.98);
}
/* 每次消耗灵力 */
export function craftMp(recipe){
  const st = stats();
  return Math.round(st.mpMax * recipe.mpF) + 5;
}
/* 境界是否足以驾驭 */
export function craftLocked(recipe){
  return (recipe.lv || 0) > realmAt(S.level).group + 2;
}
export function pillCraftRate(k){
  const r = PILL_RECIPES.find(x => x.k === k);
  return r ? finalRate(r, cvBonus().pillRate) : 0;        /* 洞府 · 丹房 */
}
export function gearCraftRate(k){
  const r = GEAR_RECIPES.find(x => x.k === k);
  return r ? finalRate(r, cvBonus().gearRate) : 0;        /* 洞府 · 器坊 */
}
export function canCraftPill(k, n){ return canCraft(PILL_RECIPES, k, n); }
export function canCraftGear(k, n){ return canCraft(GEAR_RECIPES, k, n); }
function canCraft(list, k, n){
  const r = list.find(x => x.k === k);
  if(!r || !S) return false;
  n = Math.max(1, Math.floor(Number(n) || 1));
  if(craftLocked(r)) return false;
  if(!hasMats(scaleNeed(r.need, n))) return false;
  if(S.mp < craftMp(r) * n) return false;
  return true;
}
/* 界面用：给出不能炼的原因 */
export function craftBlockReason(r){
  if(craftLocked(r)) return '境界不足以驾驭此方（需 ' + realmNameOf(r.lv) + '）';
  if(!hasMats(r.need)) return '材料不足';
  if(S.mp < craftMp(r)) return '灵力不足';
  return '';
}

/* =========================================================
   炼 丹
   ========================================================= */
export function craftPill(k, n){
  n = Math.max(1, Math.floor(Number(n) || 1));
  const r = PILL_RECIPES.find(x => x.k === k);
  if(!r){ toast('无此丹方'); return; }
  if(busy()){ toast('战中无暇开炉'); return; }
  const needAll = scaleNeed(r.need, n);
  if(craftLocked(r)){ toast('境界不足以驾驭此方'); return; }
  if(!hasMats(needAll)){ toast('材料不足（需 ' + matPlain(needAll) + '）'); return; }
  const mpCost = craftMp(r) * n;
  if(S.mp < mpCost){ toast('灵力不足（需 ' + num(mpCost) + '）'); return; }

  S.mp -= mpCost;
  costMats(needAll);
  const days = r.days * n;
  advance(days);
  addLog('你布下丹炉，以灵力 ' + num(mpCost) + ' 催动真火，炼了 ' + days + ' 日——', 'act');

  const rate = finalRate(r, cvBonus().pillRate);
  let ok = 0, bad = 0;
  for(let i = 0; i < n; i++){ if(chance(rate * 100)) ok++; else bad++; }

  if(ok > 0){
    S.pills[r.out] = (S.pills[r.out] || 0) + ok;
    addLog('成丹 ' + ok + ' 枚「' + r.out + '」，炉中清香四溢。', 'item');
  }
  if(bad > 0){
    const back = refundMats(scaleNeed(r.need, bad), 0.4);
    addLog('炸炉 ' + bad + ' 次，丹毁。残渣中收回：' + matPlain(back) + '。', 'warn');
  }
  if(S.stat) S.stat.pillMake = (S.stat.pillMake || 0) + ok;
  checkAch();
  after();
}

/* =========================================================
   炼 器
   ========================================================= */
export function craftGear(k, n){
  n = Math.max(1, Math.floor(Number(n) || 1));
  const r = GEAR_RECIPES.find(x => x.k === k);
  if(!r){ toast('无此器方'); return; }
  if(busy()){ toast('战中无暇开炉'); return; }
  const needAll = scaleNeed(r.need, n);
  if(craftLocked(r)){ toast('境界不足以驾驭此方'); return; }
  if(!hasMats(needAll)){ toast('材料不足（需 ' + matPlain(needAll) + '）'); return; }
  const mpCost = craftMp(r) * n;
  if(S.mp < mpCost){ toast('灵力不足（需 ' + num(mpCost) + '）'); return; }

  S.mp -= mpCost;
  costMats(needAll);
  const days = r.days * n;
  advance(days);
  addLog('你架起炉火，以灵力 ' + num(mpCost) + ' 锤锻 ' + days + ' 日——', 'act');

  const rate = finalRate(r, cvBonus().gearRate);
  const over = realmDiff(r.lv) >= 4;                    /* 境界远超配方：火候更纯 */
  let ok = 0, bad = 0;
  for(let i = 0; i < n; i++){
    if(!chance(rate * 100)){ bad++; continue; }
    /* 品质：qiMin 起步；气运有概率 +1 阶；越级炼器再 +1 阶 */
    let qi = r.qiMin;
    if(chance(12 + fortune() * 0.25)) qi++;
    if(over) qi++;
    qi = clamp(qi, r.qiMin, 4);
    const lv = Math.max(0, S.level + (r.lvBias || 0));
    const item = makeItem(r.slot, lv, qi);
    addItem(item, true);
    addLog('器成：' + itemLabel(item), 'item');
    ok++;
  }
  if(bad > 0){
    const back = refundMats(scaleNeed(r.need, bad), 0.4);
    addLog('器碎 ' + bad + ' 件。残料收回：' + matPlain(back) + '。', 'warn');
  }
  if(S.stat) S.stat.gearMake = (S.stat.gearMake || 0) + ok;
  checkAch();
  after();
}

/* =========================================================
   存 档 进 出（防御式：undefined / 非法键 / 负数一律剔除）
   ========================================================= */
export function matSanitize(d){
  const out = {};
  if(!d || typeof d !== 'object') return out;
  for(const k in d){
    if(!MATERIALS[k]) continue;
    const v = Math.floor(Number(d[k]) || 0);
    if(v > 0) out[k] = clamp(v, 0, 999999);
  }
  return out;
}
