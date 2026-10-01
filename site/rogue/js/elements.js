/* =========================================================
   elements.js — 元素系统（6 元素 / 15 反应 / 统一状态 tick）
   ---------------------------------------------------------
   设计约束（见《扩充设计文档-元素与内容扩容》§3）：
   1) 元素**不进卡池**：Lv4 / Lv9 两个固定等级由独立面板获取，上限 2 个
   2) 元素作用于**全部武器**（含无人机接触、电弧、黑洞），主动技不参与
   3) 同一弹丸/持续源对同一敌人 **每 0.25s 最多 1 层**（防回旋刃/黑洞/电弧刷层）
   4) 状态结算走**统一 0.12s tick**，且每 tick 最多详算 24 个敌人（其余顺延）
   5) 全局反应频率上限 40 次/秒；湮灭回路的连锁深度上限 3 层
   6) 元素**不允许改变弹丸核心色**，只改尾迹色 / 状态特效 / 头顶图标
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   一、六个元素
   --------------------------------------------------------- */
const ELEMENT_ORDER = ['thunder', 'ice', 'fire', 'toxin', 'void', 'light'];

const ELEMENTS = {
  thunder: {
    id: 'thunder', name: '雷', mark: '电', glyph: 'elem_thunder', color: '#4DE0C0',
    status: '电荷', max: 4, dur: 2.5,
    pos: '密集阵的答案：敌人越多，放电收益越大',
    line: '每层使该目标受到伤害 +2%；满 4 层放电，向 130 内最多 3 个敌人溅射 0.6× 伤害',
  },
  ice: {
    id: 'ice', name: '冰', mark: '霜', glyph: 'elem_ice', color: '#7FC8FF',
    status: '寒霜', max: 5, dur: 3.5,
    pos: '买时间：对高速高威胁单位收益最大',
    line: '每层移速 −8%、开火 −4%；满 5 层冻结 0.9s，受击伤害 +25%',
  },
  fire: {
    id: 'fire', name: '火', mark: '燃', glyph: 'elem_fire', color: '#FF8A3D', trail: '#FFB27A',
    status: '燃烧', max: 6, dur: 3.0,
    pos: '越拖越强：对成群小怪最佳',
    line: '每层每秒造成 5% 施加伤害；满 6 层爆燃，向 90 内 2 个敌人各传 3 层',
  },
  toxin: {
    id: 'toxin', name: '毒', mark: '腐', glyph: 'elem_toxin', color: '#A6E84D',
    status: '腐蚀', max: 8, dur: 6.0,
    pos: '破甲：对盾卫与 Boss 是唯一解',
    line: '每层护甲 −4%（上限 −32%），每秒 3% 施加伤害；满 8 层崩解，结算剩余 DoT ×1.5',
  },
  void: {
    id: 'void', name: '虚空', mark: '虚', glyph: 'elem_void', color: '#B06BFF',
    status: '虚空印', max: 3, dur: 5.0,
    pos: '把「击杀」变成清场手段，顺带吃弹幕',
    line: '带印敌人被轻微牵引；击杀带印敌人时原地生成坍缩（半径 70，最大生命 20%）并清除范围内敌弹',
  },
  light: {
    id: 'light', name: '光', mark: '光', glyph: 'elem_light', color: '#FFF0B8', trail: '#D9C2FF',
    status: '光印', max: 3, dur: 4.0,
    pos: '把暴击从数值变成可见弹道',
    line: '带印目标暴击率 +10%/层；暴击消耗 1 层并折射 0.4× 伤害到最近的另一个敌人',
  },
};

/* 元素状态色 → 视觉动势（写在状态特效里，各有各的形态语言） */
const ELEM_SHAPE = { thunder: 'arc', ice: 'crystal', fire: 'rise', toxin: 'drip', void: 'inward', light: 'spin' };

/* ---------------------------------------------------------
   二、十五种元素反应（二维表，无遗漏无重复）
   触发条件：同一敌人身上同时存在两种元素状态层（双元素局天然发生）
   --------------------------------------------------------- */
const REACTIONS = [
  { a: 'thunder', b: 'ice',   name: '超导',     tier: 3, note: '冻结瞬间：全场被冻结的敌人无视距离同步连锁 0.5×' },
  { a: 'thunder', b: 'fire',  name: '等离子爆燃', tier: 1, note: '放电附带半径 60 爆炸（伤害 +40%），范围内各挂 2 层燃烧' },
  { a: 'thunder', b: 'toxin', name: '电解',     tier: 2, note: '崩解伤害 +25% 且无视护甲；放电跳跃目标 3 → 5' },
  { a: 'thunder', b: 'void',  name: '湮灭回路', tier: 3, note: '放电击杀立刻触发坍缩，且坍缩可继续连锁（深度上限 3）' },
  { a: 'thunder', b: 'light', name: '圣裁',     tier: 1, note: '折射光束可再跳 1 次（共 2 跳），每跳伤害 +15%' },
  { a: 'ice',     b: 'fire',  name: '热震',     tier: 2, note: '冻结结束瞬间冰壳炸裂：最大生命 8% 碎裂伤害（Boss 2%）' },
  { a: 'ice',     b: 'toxin', name: '腐蚀冻土', tier: 1, note: '冻结期间护甲削减翻倍（−64%），且冻结不会提前结束' },
  { a: 'ice',     b: 'void',  name: '引力冰狱', tier: 1, note: '被冻目标成为引力源，把半径 140 内敌人拉向它' },
  { a: 'ice',     b: 'light', name: '霜镜',     tier: 2, note: '冻住的目标成为折射镜：命中它时 40% 概率分裂为 2 枚（各 0.5×）' },
  { a: 'fire',    b: 'toxin', name: '焚毒雾',   tier: 2, note: '爆燃改为留下 2.5s 毒雾（半径 90），雾内每秒 +2 层燃烧' },
  { a: 'fire',    b: 'void',  name: '内爆',     tier: 3, note: '坍缩每层燃烧 +8% 伤害、半径 +50%' },
  { a: 'fire',    b: 'light', name: '灼阳',     tier: 2, note: '暴击必定挂 2 层燃烧（而非 1 层），燃烧持续 +2s' },
  { a: 'toxin',   b: 'void',  name: '黑洞腐蚀', tier: 3, note: '崩解原地生成 1.5s 微型黑洞（半径 80，牵引 + 每秒 4 层毒）' },
  { a: 'toxin',   b: 'light', name: '弱点标记', tier: 1, note: '被折射命中者立刻 +2 层毒，且你对它暴击率 +15%' },
  { a: 'void',    b: 'light', name: '奇点',     tier: 3, note: '坍缩拉入敌弹并转化为伤害：每吸收 1 枚 +8%（上限 +160%）' },
];

const _rxKey = (a, b) => (a < b ? a + '+' + b : b + '+' + a);
const RX = {};
for (const r of REACTIONS) RX[_rxKey(r.a, r.b)] = r;
const RX_NAME = {};
for (const r of REACTIONS) RX_NAME[r.name] = r;

/* 反应强度分档 → 音效与屏显强度 */
const RX_TIER_SFX = { 1: 'rxLow', 2: 'rxMid', 3: 'rxBig' };

/* ---------------------------------------------------------
   三、常量与限流
   --------------------------------------------------------- */
const ELEM_TICK = 0.12;          // 状态结算周期（不做逐帧）
const ELEM_BATCH = 24;           // 每 tick 最多详算的敌人数
const ELEM_GAP = 0.25;           // 每源对同一敌人的最小施加间隔
const SRC_GAP = { hole: 0.5, arc: 0.35, dot: 9, rx: 9, mine: 9 };
const RX_PER_SEC = 40;           // 全局反应频率上限
const RX_CHAIN_MAX = 3;          // 湮灭回路连锁深度上限

/* ---------------------------------------------------------
   四、查询辅助
   --------------------------------------------------------- */
function elemHas(e, id) { return !!(e && e.st && e.st[id] && e.st[id].n > 0); }
function elemAny(e) { return !!(e && e.st); }

/** 目标身上与 id 共存的另一种元素（上限 2 个元素 → 最多 1 个伙伴） */
function elemPartner(e, id) {
  if (!e || !e.st) return null;
  for (const k in e.st) if (k !== id && e.st[k].n > 0) return k;
  return null;
}
function elemRxName(e, id) {
  const o = elemPartner(e, id);
  return o ? (_rxKey(id, o) in RX ? RX[_rxKey(id, o)].name : null) : null;
}

/** 冰：移速倍率（Boss 上限 −35%） */
function elemSlowMul(e) {
  if (!e.st || !e.st.ice) return 1;
  let m = 1 - 0.08 * e.st.ice.n;
  if (e.isBoss) m = Math.max(0.65, m);
  return Math.max(0.2, m);
}
/** 冰：开火频率倍率 */
function elemFireMul(e) {
  if (!e.st || !e.st.ice) return 1;
  return Math.max(0.35, 1 - 0.04 * e.st.ice.n);
}
/** 冻结 / 雷层 → 易伤倍率 */
function elemDmgMul(e) {
  let m = 1;
  if (e.st && e.st.thunder) m += 0.02 * e.st.thunder.n;
  if (e.freezeT > 0) m += 0.25;
  return m;
}
/** 毒的破甲量（冻结且冰+毒共存时翻倍） */
function elemArmorShred(e) {
  if (!e.st || !e.st.toxin) return 0;
  const doubled = e.freezeT > 0 && elemPartner(e, 'toxin') === 'ice';
  return Math.min(doubled ? 0.64 : 0.32, 0.04 * e.st.toxin.n * (doubled ? 2 : 1));
}
function elemFrozen(e) { return e.freezeT > 0; }

/* 玩家侧：元素施加速度 / 持续 / 无视护甲 / 双重反应 */
function pElemExtra(p) { return p.stats.elemExtra || 0; }
function pElemDur(p) { return p.stats.elemDur || 1; }

/* ---------------------------------------------------------
   五、施加（唯一入口，被 damageEnemy 调用）
   --------------------------------------------------------- */
function elemApply(G, e, id, dmg, opt) {
  opt = opt || {};
  const def = ELEMENTS[id];
  if (!def || e.dead) return;
  if (!e.st) e.st = {};
  const src = opt.src || 'x';
  const gap = SRC_GAP[src] != null ? SRC_GAP[src] : ELEM_GAP;
  if (!e._et) e._et = {};
  /* ⚠ 限流键必须是「源 × 元素」：只按源限流会导致一次命中里只有 p.elems[0] 能生效，
     第二个元素永远挂不上 → 双元素局里 15 种反应一次都触发不了（实测踩过）。 */
  const key = src + ':' + id;
  if (e._et[key] != null && G.t - e._et[key] < gap) return;
  e._et[key] = G.t;

  let s = e.st[id];
  if (!s) s = e.st[id] = { n: 0, t: 0, dmg: 0 };
  const add = opt.amount != null ? opt.amount : 1 + pElemExtra(G.player);
  s.n = Math.min(def.max, s.n + add);
  s.t = def.dur * pElemDur(G.player);
  if (dmg) s.dmg = Math.max(s.dmg, dmg);
  e.hitFlash = Math.max(e.hitFlash, 0.5);
  if (chance(0.5)) {
    G.particles.push({
      x: e.x + rand(e.r, -e.r) * 0.6, y: e.y + rand(e.r, -e.r) * 0.6,
      vx: rand(70, -70), vy: rand(20, -90),
      life: 0.4, max: 0.4, size: rand(3.6, 1.8), color: def.color, kind: 'spark',
    });
  }
  SFX.playAt('e' + (id === 'thunder' ? 'Zap' : id === 'ice' ? 'Freeze' : id === 'fire' ? 'Burn'
    : id === 'toxin' ? 'Toxin' : id === 'void' ? 'Void' : 'Light'), e.x, e.y);
}

/** damageEnemy 的钩子：把玩家已选的每个元素都施加一次（受限流） */
function elemOnHit(G, e, dmg, opt) {
  const p = G.player;
  if (!p || !p.elems || !p.elems.length || opt.noElem || e.dead) return;
  const src = opt.src || 'x';
  const light = elemHas(e, 'light');
  for (const id of p.elems) {
    let amt = null;
    /* 灼阳（火+光）：暴击时挂 2 层燃烧而不是 1 层，并登记反应 */
    if (id === 'fire' && opt.crit && elemPartner(e, 'fire') === 'light') {
      amt = 2;
      const rx = RX[_rxKey('fire', 'light')];
      if (rx) rxFire(G, e, rx, Math.max(4, dmg * 0.5), 0);
    }
    elemApply(G, e, id, dmg, { src, amount: amt });
  }
  /* 光：暴击 → 消耗 1 层光印并折射 */
  if (opt.crit && light) elemRefract(G, e, dmg, opt);
}

/* ---------------------------------------------------------
   六、15 种反应的实现
   --------------------------------------------------------- */
let _rxStat = { t: -1, n: 0 };
function rxAllow(G) {
  /* ⚠ 必须容忍「重开一局」：startGame 会把 G.t 归零，而 _rxStat.t 还停在上一局的大值，
     若只判 `G.t - _rxStat.t > 1` 会永远为负 → 反应被静默封禁一整局（实测踩过）。 */
  if (G.t < _rxStat.t || G.t - _rxStat.t > 1) { _rxStat.t = G.t; _rxStat.n = 0; }
  if (_rxStat.n >= RX_PER_SEC) return false;
  _rxStat.n++;
  return true;
}

/** 重开一局时复位全局元素/反应统计（由 startGame 调用） */
function elemResetRuntime(G) {
  _rxStat.t = -1; _rxStat.n = 0;
  if (G) { G._elemI = 0; G.rxTotal = 0; }
}

/** 统一反应出口：登记图鉴 + 音效 + 屏显（power/radius 传入时为「可回响」的反应）
    双重反应（e_duplex）：40% 概率立刻再触发一次，第二次以 0.7× 结算且不计入连锁深度。 */
function rxFire(G, e, def, power, radius) {
  if (!rxAllow(G)) return false;
  codexMark(def.name);
  SFX.playAt(RX_TIER_SFX[def.tier] || 'rxMid', e ? e.x : W / 2, e ? e.y : 300);
  G.texts.push({
    x: (e ? e.x : W / 2) + rand(14, -14), y: (e ? e.y : 320) - (e ? e.r : 20) - 16,
    vy: -34, life: 0.9, max: 0.9, txt: def.name,
    color: def.tier >= 3 ? '#ffd166' : '#bff4ff', size: def.tier >= 3 ? 15 : 13,
  });
  if (G.rxTotal != null) G.rxTotal++;
  const p = G.player;
  if (power > 0 && p && p.stats.duplex && !G._echoing && chance(0.4)) {
    G._echoing = 1;
    const x = e ? e.x : W / 2, y = e ? e.y : 320;
    const r = radius || 0;
    for (const t of G.enemies.slice()) {
      if (t.dead) continue;
      if (r > 0 ? dist(t, { x, y }) > r + t.r : t !== e) continue;
      damageEnemy(G, t, power * 0.7, { noElem: true, noRetro: true, src: 'rx', showText: false, big: true });
    }
    G.particles.push({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, size: (r || 44) * 2.2, color: '#bff4ff', kind: 'ring' });
    G.texts.push({ x, y: y - 28, vy: -30, life: 0.5, max: 0.5, txt: '反应 ×2', color: '#D9C2FF', size: 12 });
    G._echoing = 0;
  }
  return true;
}

/** 雷：满层放电 */
function elemDischarge(G, e, depth) {
  if (e.dead || !e.st || !e.st.thunder) return;
  const s = e.st.thunder;
  const o = elemPartner(e, 'thunder');
  const rx = o ? RX[_rxKey('thunder', o)] : null;
  let hits = 3, mul = 0.6, aoe = 0, pure = false;
  if (o === 'toxin') { hits = 5; mul *= 1.25; pure = true; }
  if (o === 'fire') { mul *= 1.4; aoe = 60; }

  const dmg0 = Math.max(4, s.dmg) * mul;
  if (o === 'ice') {
    /* 超导：全场被冻结的敌人无视距离同步连锁 */
    if (rx && rxFire(G, e, rx, Math.max(4, s.dmg) * 0.5, 0)) {
      for (const t of G.enemies) {
        if (t.dead || t === e || !elemFrozen(t)) continue;
        damageEnemy(G, t, Math.max(4, s.dmg) * 0.5, { noElem: true, src: 'rx', showText: true });
      }
    }
  } else {
    if (rx) rxFire(G, e, rx, dmg0, aoe);
    let done = 0, cur = e;
    const hit = new Set([e]);
    while (done < hits) {
      const t = nearestEnemy(G, cur.x, cur.y, 150, hit);
      if (!t) break;
      hit.add(t);
      damageEnemy(G, t, dmg0, { noElem: true, src: 'rx', pure, crit: false });
      G.zaps.push({ pts: [{ x: cur.x, y: cur.y }, { x: t.x, y: t.y }], life: 0.14, max: 0.14 });
      /* 湮灭回路：放电击杀立刻触发坍缩 */
      if (o === 'void' && t.dead) elemCollapse(G, t.x, t.y, t.maxHp * 0.2, (depth || 0) + 1, 'void');
      cur = t; done++;
    }
  }
  if (aoe > 0) {
    for (const t of G.enemies) {
      if (t.dead || dist(t, e) > aoe) continue;
      elemApply(G, t, 'fire', s.dmg, { src: 'rx', amount: 2 });
    }
    G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: aoe * 2.2, color: '#FF8A3D', kind: 'ring' });
  }
  /* 连锁途中 e 可能已被击杀（elemOnKill 会把 e.st 置 null）→ 清层前必须再确认一次 */
  if (e.st && e.st.thunder) e.st.thunder.n = 0;
}

/** 冰：满层冻结 */
function elemFreeze(G, e) {
  if (e.dead || !e.st || !e.st.ice) return;
  /* ⚠⚠ 重入防护（曾造成线上崩溃，2026-09-30 定位）：
     下面的 rxFire / damageEnemy 可能把 e **本人**打死，而击杀钩子 elemOnKill()
     会执行 e.st = null。此时再读 e.st.ice 就是 "Cannot read properties of null"。
     实测崩点：本函数末尾的 e.st.ice.n = 0（冰 + 非火伙伴时，rxFire 先击杀 → 回来即崩）。
     修法：入口把要用的数值快照到局部变量，之后一律不再依赖 e.st。 */
  const iceDmg = e.st.ice.dmg;
  const o = elemPartner(e, 'ice');
  const rx = o ? RX[_rxKey('ice', o)] : null;
  let dur = 0.9;
  if (e.isBoss) {
    if (G.t < (e._frostCd || 0)) { e.st.ice.n = 0; return; }
    e._frostCd = G.t + 8;
    dur = 0.135;
  }
  e.freezeT = Math.max(e.freezeT || 0, dur);
  e._freezeRx = o;
  if (o === 'void') e.pullSrc = 1;                 // 引力冰狱
  if (o === 'light') e.mirror = 1;                 // 霜镜
  if (rx && o !== 'fire') rxFire(G, e, rx, Math.max(4, iceDmg) * 0.5, 0);
  if (o === 'thunder' && rx) {                     // 超导：全场冻结者连锁（rxFire 已在上一步登记，勿重复）
    for (const t of G.enemies) {
      if (t.dead || t === e || !elemFrozen(t)) continue;
      damageEnemy(G, t, Math.max(4, iceDmg) * 0.5, { noElem: true, src: 'rx' });
    }
  }
  /* e 已被 rxFire / 连锁打死时，视觉照放（e.x / e.r 仍然有效），但不要再碰 e.st */
  SFX.playAt('eFreeze', e.x, e.y);
  for (let i = 0; i < 10; i++) {
    const a = rand(TAU);
    G.particles.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.5, max: 0.5,
      size: 3.6, color: '#7FC8FF', kind: 'spark' });
  }
  if (e.st && e.st.ice) e.st.ice.n = 0;
}

/** 冰：冻结结束（热震 / 腐蚀冻土的锁定解除） */
function elemFreezeEnd(G, e) {
  if (e.dead) return;
  const o = e._freezeRx;
  if (o === 'fire') {
    const key = 'rx' + _rxKey('ice', 'fire');
    const cap = e.isBoss ? 10 : 0;
    if (!e._hexCd || G.t - e._hexCd > cap) {
      e._hexCd = G.t;
      const rx = RX[_rxKey('ice', 'fire')];
      const pct = e.isBoss ? 0.02 : 0.08;
      if (rxFire(G, e, rx, e.maxHp * pct, 92)) {
        damageEnemy(G, e, e.maxHp * pct, { noElem: true, src: 'rx', pure: true, big: true });
      }
    }
  }
  e._freezeRx = null;
  e.pullSrc = 0; e.mirror = 0;
  if (!(elemPartner(e, 'ice') === 'toxin')) e.st && e.st.ice && (e.st.ice.n = 0);
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: e.r * 5, color: '#7FC8FF', kind: 'ring' });
  if (typeof kShatterHook === 'function') kShatterHook(G, e);
}

/** 火：满层爆燃（或焚毒雾） */
function elemCombust(G, e) {
  if (e.dead || !e.st || !e.st.fire) return;
  const s = e.st.fire;
  const o = elemPartner(e, 'fire');
  if (o === 'toxin') {
    /* 焚毒雾：爆燃不再直接伤害，改为留下 2.5s 毒雾 */
    const rx = RX[_rxKey('fire', 'toxin')];
    if (rxFire(G, e, rx)) {
      if (!G.fogs) G.fogs = [];
      G.fogs.push({ x: e.x, y: e.y, r: 90, life: 2.5, max: 2.5, t: 0, dps: s.dmg * 0.05 });
    }
  } else {
    let n = 0;
    for (const t of G.enemies) {
      if (t.dead || t === e || dist(t, e) > 90) continue;
      elemApply(G, t, 'fire', s.dmg, { src: 'rx', amount: 3 });
      if (++n >= 2) break;
    }
  }
  s.n = Math.max(0, s.n - 3);
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.32, max: 0.32, size: e.r * 5.4, color: '#FF8A3D', kind: 'ring' });
}

/** 毒：满层崩解（或黑洞腐蚀） */
function elemShatter(G, e) {
  if (e.dead || !e.st || !e.st.toxin) return;
  const s = e.st.toxin;
  const o = elemPartner(e, 'toxin');
  const remain = s.dmg * 0.03 * s.n * Math.max(0.2, s.t);
  let mul = 1.5, pure = false;
  if (o === 'thunder') { mul *= 1.25; pure = true; }     // 电解
  if (o === 'void') {
    const rx = RX[_rxKey('toxin', 'void')];
    if (rxFire(G, e, rx, Math.max(4, remain * mul), 80)) {
      if (!G.holes) G.holes = [];
      G.holes.push({ x: e.x, y: e.y, r: 80, life: 1.5, max: 1.5, dps: s.dmg * 0.4, spin: 0, born: 0, poison: 4 });
    }
  }
  damageEnemy(G, e, Math.max(4, remain * mul), { noElem: true, src: 'rx', pure, big: true });
  s.n = 0;
}

/** 虚空：坍缩（击杀带印敌人 / 湮灭回路） */
function elemCollapse(G, x, y, power, depth, o) {
  depth = depth || 0;
  if (depth > RX_CHAIN_MAX) return;
  if (!rxAllow(G)) return;
  let r = 70, dmg = power, absorb = 0;
  const self = { x, y, r: 20 };
  if (o === 'fire') {
    const rx = RX[_rxKey('fire', 'void')];
    r *= 1.5;
    rxFire(G, self, rx, dmg, r);
  }
  if (o === 'light') {
    /* 奇点：把范围内的敌弹吸进来转化为伤害（每枚 +8%，上限 +160%） */
    let got = 0;
    for (const b of G.eBullets) {
      if (b.dead) continue;
      if ((b.x - x) ** 2 + (b.y - y) ** 2 < r * r) { b.dead = true; got++; }
    }
    if (got) { absorb = Math.min(1.6, got * 0.08); dmg *= 1 + absorb; }
    if (got) rxFire(G, self, RX[_rxKey('void', 'light')], dmg, r);
  }
  for (const b of G.eBullets) {
    if (b.dead) continue;
    if ((b.x - x) ** 2 + (b.y - y) ** 2 < r * r) b.dead = true;
  }
  G.particles.push({ x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: r * 3.4, color: '#B06BFF', kind: 'ring' });
  G.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: r * 2.2, color: '#ffffff', kind: 'smoke' });
  SFX.playAt('eVoid', x, y);
  for (const t of G.enemies.slice()) {
    if (t.dead || dist(t, { x, y }) > r) continue;
    const mul = o === 'fire' && t.st && t.st.fire ? 1 + 0.08 * t.st.fire.n : 1;
    damageEnemy(G, t, dmg * mul, { noElem: true, src: 'rx', pure: true, big: true });
    if (t.dead && elemHas(t, 'void')) elemCollapse(G, t.x, t.y, t.maxHp * 0.2, depth + 1, elemPartner(t, 'void'));
  }
}

/** 光：暴击折射 */
function elemRefract(G, e, dmg, opt) {
  if (e.dead) return;
  if (!G.refracts) G.refracts = [];
  const s = e.st.light;
  if (!s || s.n <= 0) { e.mirror = 0; return; }
  s.n -= 1;
  const o = elemPartner(e, 'light');
  const rx = o ? RX[_rxKey('light', o)] : null;
  let hops = o === 'thunder' ? 2 : 1;
  let mul = 0.4, cur = e;
  const hit = new Set([e]);
  if (rx) rxFire(G, e, rx, Math.max(3, dmg * mul), 260);
  for (let i = 0; i < hops; i++) {
    const t = nearestEnemy(G, cur.x, cur.y, 420, hit);
    if (!t) break;
    hit.add(t);
    const d = Math.max(3, dmg * mul * (o === 'thunder' ? 1 + 0.15 * (i + 1) : 1));
    G.refracts.push({ x0: cur.x, y0: cur.y, x1: t.x, y1: t.y, life: 0.2, max: 0.2 });
    if (o === 'toxin') elemApply(G, t, 'toxin', d, { src: 'rx', amount: 2 });  // 弱点标记
    damageEnemy(G, t, d, { noElem: true, src: 'rx' });
    if (o === 'toxin') t._weakT = G.t + 4;   // 你对它暴击率 +15%
    cur = t;
  }
}

/* ---------------------------------------------------------
   七、统一 tick（0.12s，分批 24）
   --------------------------------------------------------- */
function elemTick(G, dt) {
  if (!G.enemies.length) return;
  const list = G.enemies;
  const n = list.length;
  let idx = G._elemI || 0;
  if (idx >= n) idx = 0;
  let done = 0, scanned = 0;
  while (done < ELEM_BATCH && scanned < n) {
    const e = list[idx % n];
    idx++; scanned++;
    if (e && !e.dead) {
      if (e.freezeT > 0) {
        e.freezeT -= dt;
        if (e.freezeT <= 0) { e.freezeT = 0; elemFreezeEnd(G, e); }
        else if (e.pullSrc) elemPull(G, e, dt);
      }
      if (e.st) { elemTickOne(G, e, dt); done++; }
    }
  }
  G._elemI = idx % Math.max(1, n);
}

/** 引力冰狱：被冻目标成为引力源 */
function elemPull(G, e, dt) {
  for (const t of G.enemies) {
    if (t.dead || t === e || t.isBoss) continue;
    const d = dist(t, e);
    if (d < 140 && d > 1) {
      const f = (1 - d / 140) * 190;
      t.x += (e.x - t.x) / d * f * dt;
      t.y += (e.y - t.y) / d * f * dt;
    }
  }
}

function elemTickOne(G, e, dt) {
  const p = G.player;
  /* ⚠ 必须先把 key 快照出来：满层触发会在结算途中击杀敌人，而 elemOnKill 会把 e.st 置为 null，
     直接 `for (const id in e.st) { e.st[id] }` 会在中途读到 null 而抛异常（实测踩过）。 */
  const ids = [];
  for (const id in e.st) ids.push(id);
  for (const id of ids) {
    if (e.dead || !e.st) return;
    const s = e.st[id];
    if (!s || s.n <= 0) { delete e.st[id]; continue; }
    const def = ELEMENTS[id];
    /* --- DoT --- */
    if (id === 'fire' || id === 'toxin') {
      const rate = id === 'fire' ? 0.05 : 0.03;
      const d = s.dmg * rate * s.n * dt;
      if (d > 0) damageEnemy(G, e, d, { noElem: true, src: 'dot', showText: false, pure: !!p.stats.elemPure });
    }
    /* --- 持续时间 --- */
    s.t -= dt;
    if (s.t <= 0) { delete e.st[id]; continue; }
    /* --- 满层触发（统一在这里判定，天然避免在伤害递归里触发） --- */
    if (id === 'thunder' && s.n >= def.max) elemDischarge(G, e, 0);
    else if (id === 'ice' && s.n >= def.max && !(e._freezeRx === 'toxin' && e.freezeT > 0)) elemFreeze(G, e);
    else if (id === 'fire' && s.n >= def.max) elemCombust(G, e);
    else if (id === 'toxin' && s.n >= def.max) elemShatter(G, e);
  }
  /* 霜镜：冻住的目标成为折射镜（命中它时 40% 分裂，在建弹处处理，这里只维护标记） */
  if (e.freezeT <= 0 && e.mirror) e.mirror = 0;
  if (e._weakT && G.t > e._weakT) e._weakT = 0;
}

/* ---------------------------------------------------------
   八、击杀 / 暴击 的事件钩子
   --------------------------------------------------------- */
function elemOnKill(G, e) {
  /* 虚空：击杀带印敌人 → 微型坍缩 */
  if (elemHas(e, 'void')) {
    elemCollapse(G, e.x, e.y, e.maxHp * 0.2, 0, elemPartner(e, 'void'));
  }
  /* 冰：冻结中死亡也走一次碎冰（视觉一致） */
  if (e.freezeT > 0) { e.freezeT = 0; e._freezeRx = null; }
  e.st = null;
}

/** 光印 / 弱点标记：额外暴击率（在 damageEnemy 里以"回溯暴击"实现） */
function elemCritBonus(e, t) {
  let b = 0;
  if (e.st && e.st.light) b += 0.10 * e.st.light.n;
  if (e._weakT && t <= e._weakT) b += 0.15;
  return b;
}

/* ---------------------------------------------------------
   九、颜色与视觉
   --------------------------------------------------------- */
function elemTrailColor(p) {
  const l = p.elems;
  if (!l || !l.length) return null;
  if (l.length === 1) return ELEMENTS[l[0]].trail || ELEMENTS[l[0]].color;
  const a = hexRgb(ELEMENTS[l[0]].trail || ELEMENTS[l[0]].color);
  const b = hexRgb(ELEMENTS[l[1]].trail || ELEMENTS[l[1]].color);
  const mix = '#' + [0, 1, 2].map(i => Math.round((a[i] + b[i]) / 2).toString(16).padStart(2, '0')).join('');
  return mix;
}

/** 敌人头顶状态图标：小字形 + 层数点（最终判读依据） */
function drawElemStatus(ctx, e) {
  if (!e.st) return;
  let x = e.x - 0, first = true;
  const y = e.y - e.r - (e.maxHp > 24 && !e.isBoss ? 20 : 15);
  for (const id in e.st) {
    const s = e.st[id]; const def = ELEMENTS[id];
    if (!def || !s || s.n <= 0) continue;
    const w = 30;
    const ox = x + (first ? -w / 2 : w / 2) - (first ? 0 : 0);
    ctx.save();
    ctx.font = '700 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillText(def.mark, ox + 1, y + 1);
    ctx.fillStyle = def.color;
    ctx.fillText(def.mark, ox, y);
    /* 层数点 */
    const dw = 3.4;
    const tot = def.max;
    const startX = ox - (Math.min(tot, 6) * dw) / 2 + dw / 2;
    for (let i = 0; i < Math.min(tot, 6); i++) {
      ctx.beginPath();
      ctx.arc(startX + i * dw, y + 9, 1.35, 0, TAU);
      ctx.fillStyle = i < s.n ? def.color : 'rgba(255,255,255,.22)';
      ctx.fill();
    }
    ctx.restore();
    first = false;
    x += w;
  }
}

/** 元素状态特效（挂在敌人身上，形态语言各不相同） */
function drawElemFX(ctx, e) {
  if (!e.st) return;
  const t = G.t;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (e.st.thunder) {
    const n = e.st.thunder.n;
    ctx.strokeStyle = rgba(ELEMENTS.thunder.color, 0.35 + n * 0.12);
    ctx.lineWidth = 1.4;
    for (let k = 0; k < n; k++) {
      ctx.beginPath();
      let px = e.x + rand(e.r, -e.r), py = e.y + rand(e.r, -e.r);
      ctx.moveTo(px, py);
      for (let s = 0; s < 3; s++) { px += rand(9, -9); py += rand(9, -9); ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }
  if (e.st.ice) {
    ctx.strokeStyle = rgba(ELEMENTS.ice.color, 0.5);
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const a0 = t * 0.6 + k / 3 * TAU;
      ctx.beginPath();
      for (let s = 0; s < 3; s++) {
        const a = a0 + s / 3 * TAU;
        ctx.moveTo(e.x + Math.cos(a) * e.r * 0.5, e.y + Math.sin(a) * e.r * 0.5);
        ctx.lineTo(e.x + Math.cos(a) * e.r * 1.25, e.y + Math.sin(a) * e.r * 1.25);
      }
      ctx.stroke();
    }
  }
  if (e.st.fire) {
    const n = e.st.fire.n;
    for (let k = 0; k < n; k++) {
      const ph = (t * 1.9 + k * 0.37) % 1;
      const ax = e.x + Math.sin(k * 2.3 + t * 3) * e.r * 0.7;
      drawGlow(ctx, ax, e.y - e.r * 0.3 - ph * e.r * 1.7, 16 * (1 - ph) + 5, '#FF8A3D', (1 - ph) * 0.8);
    }
  }
  if (e.st.toxin) {
    ctx.fillStyle = rgba(ELEMENTS.toxin.color, 0.75);
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.9 + k * 0.33) % 1;
      ctx.beginPath();
      ctx.arc(e.x + Math.sin(k * 1.7) * e.r * 0.6, e.y + e.r * 0.6 + ph * e.r, 2.2 * (1 - ph), 0, TAU);
      ctx.fill();
    }
  }
  if (e.st.void) {
    const k = 1 + 0.12 * (e.st.void.n || 1);
    ctx.strokeStyle = rgba(ELEMENTS['void'].color, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.35 - ((t * 0.9) % 1) * 0.5) * k, 0, TAU); ctx.stroke();
  }
  if (e.st.light) {
    ctx.strokeStyle = rgba('#D9C2FF', 0.7);
    ctx.lineWidth = 1.8;
    for (let k = 0; k < 4; k++) {
      const a = t * 2.2 + k / 4 * TAU;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * e.r * 0.9, e.y + Math.sin(a) * e.r * 0.9);
      ctx.lineTo(e.x + Math.cos(a) * e.r * (1.3 + Math.sin(t * 5 + k) * 0.12), e.y + Math.sin(a) * e.r * (1.3 + Math.sin(t * 5 + k) * 0.12));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ---------------------------------------------------------
   十、元素图鉴（未解锁为 ???；它是"联动"被玩家理解的唯一途径）
   --------------------------------------------------------- */
const CODEX_KEY = 'rt_codex';
let CODEX_SEEN = null;
function codexLoad() {
  if (CODEX_SEEN) return CODEX_SEEN;
  CODEX_SEEN = {};
  try {
    const raw = localStorage.getItem(CODEX_KEY);
    if (raw) JSON.parse(raw).forEach(k => CODEX_SEEN[k] = (CODEX_SEEN[k] || 0) + 1);
  } catch (e) { /* 隐私模式下静默降级 */ }
  return CODEX_SEEN;
}
function codexMark(name) {
  const c = codexLoad();
  if (c[name]) return;
  c[name] = 1;
  try { localStorage.setItem(CODEX_KEY, JSON.stringify(Object.keys(c))); } catch (e) {}
}
function codexSeen() { return codexLoad(); }
