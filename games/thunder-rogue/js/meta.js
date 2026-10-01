/* =========================================================
   meta.js — 元进度：双资源 / 三线升级 / 改装槽 / 深渊深度 / 存档 v2
   ---------------------------------------------------------
   设计依据：《设计提案-无尽阶梯与元进度.md》§5

   三条铁律（改动前先读）：
   1. 元进度只能改变"起点"，不能替代"过程" —— 满级 meta 允许更稳地打到 W15，
      **不能**让玩家无脑过 W30（实测满级 ≈ 白送 4–5 波，见 §5.4）。
   2. 每一点 meta 收益必须有可见的代价或选择 —— 否则只是数值堆积。
   3. 元进度必须让游戏变难，而不只是变简单 —— 由「深渊深度」锚定（§5.7）。

   ⚠ 所有 [PLACEHOLDER] 数值未经 playtest，需按真实波次分布校准。
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   存档键（不要改名：改名 = 所有玩家进度清零）
   --------------------------------------------------------- */
const SAVE_KEY = 'rt_save_v2';
const SAVE_BAK = 'rt_save_v2_bak';
const SAVE_V1_KEY = 'rt_best';        // v1 只有一个最高分

/* ---------------------------------------------------------
   三线升级（§5.3）
   --------------------------------------------------------- */
const META_LINES = [
  { id: 'hull',   name: '机体线', icon: 'line_hull',   per: '每级 +6 最大生命 · +1.5% 减伤' },
  { id: 'fire',   name: '火力线', icon: 'line_fire',   per: '每级 +2% 伤害 · +1.5% 射速' },
  { id: 'engine', name: '引擎线', icon: 'line_engine', per: '每级 +1.5% 移速 · −0.12s 冲刺冷却' },
];
const META_MAX_LV = 10;
/** 单级花费：380 × 1.42^(n−1)（§5.3 [公式]） */
function metaCost(n) { return Math.round(380 * Math.pow(1.42, n - 1)); }
/** 三线点满的总花费（用于大厅展示"还要多少局"） */
function metaFullCost() { let s = 0; for (let i = 1; i <= META_MAX_LV; i++) s += metaCost(i); return s * 3; }

/* ---------------------------------------------------------
   改装槽（§5.3）—— 改变"开局形态"而不是"数值"
   --------------------------------------------------------- */
const META_MODS = [
  { id: 'm_card',   cost: 12,  name: '搭载挂点', desc: '开局自带 1 张指定武器卡（Lv1）' },
  { id: 'm_reroll', cost: 30,  name: '重构核心', desc: '每次升级额外多 1 次重随（与基础 1 次叠加）' },
  { id: 'm_elem',   cost: 60,  name: '元素注入', desc: '指定元素起手，跳过 Lv4 元素门（Lv9 门仍在）' },
  { id: 'm_slot',   cost: 120, name: '扩展插槽', desc: '开局技能槽 +1（常驻六选一）' },
  { id: 'm_third',  cost: 240, name: '三相共鸣', desc: '元素上限 2 → 3（反应组合从 15 升至 20）' },
];
const META_MOD_BY_ID = {};
META_MODS.forEach(m => META_MOD_BY_ID[m.id] = m);

/* 可起手的武器（对应 p.wlv 的键） */
const META_CARDS = [
  { id: 'laser', name: '贯穿激光' }, { id: 'spread', name: '散射炮' },
  { id: 'missile', name: '追踪导弹' }, { id: 'drone', name: '环绕无人机' },
  { id: 'arc', name: '电弧链' }, { id: 'boomer', name: '回旋飞刃' },
  { id: 'black', name: '引力黑洞' },
];

/* ---------------------------------------------------------
   深渊深度（§5.7）—— 把"难度"从惩罚变成资源
   --------------------------------------------------------- */
const ABYSS_MAX = 10;
const ABYSS_UNLOCK_LV = 15;                    // 三线总等级 ≥ 15 解锁
function abyssHpMul(d)   { return 1 + 0.12 * (d | 0); }
function abyssSpdMul(d)  { return 1 + 0.03 * (d | 0); }
function abyssDustMul(d) { return 1 + 0.25 * (d | 0); }
function abyssCoreBonus(d) { return 0.6 * (d | 0); }   // 每个 Boss 额外碎片

/* ---------------------------------------------------------
   存档 v2（§5.6）
   --------------------------------------------------------- */
function blankMeta() {
  return {
    ver: 2,
    dust: 0, core: 0,
    lines: { hull: 0, fire: 0, engine: 0 },
    mods: [],
    abyss: 0,
    pickCard: 'laser', pickElem: 'ice',   // 改装槽的可选项（默认值，避免未选时崩）
    best: { wave: 0, score: 0 },
    /* v3.1：本机最近 20 局的抵达波次。用途见《肉鸽数据报告》§6.4 ——
       玩家自己看得到中位数成长曲线，反馈时能贴一个数字；**不采集、不上传**。
       ⚠ 刻意**不计入 metaSum**：校验和一旦变化，所有已存在的 v2 存档都会失效 → 玩家进度清零。 */
    recent: [],
    coreGift: false,                      // 是否已发过 W3 保底碎片
    _sum: 0,
  };
}

/** 校验和：任何字段被手改都会对不上 → 触发备份回退。
    注意：单机离线游戏**不防作弊**（改自己的存档不伤害任何人），这里只防"文件损坏"。 */
function metaSum(m) {
  return (m.dust | 0) + (m.core | 0) * 7
    + ((m.lines && m.lines.hull) | 0) * 3 + ((m.lines && m.lines.fire) | 0) * 5 + ((m.lines && m.lines.engine) | 0) * 11
    + ((m.mods && m.mods.length) | 0) * 13 + (m.abyss | 0) * 17
    + ((m.best && m.best.wave) | 0) * 19 + ((m.best && m.best.score) | 0);
}

function saveMeta(m) {
  m._sum = metaSum(m);
  const txt = JSON.stringify(m);
  try {
    localStorage.setItem(SAVE_KEY, txt);
    localStorage.setItem(SAVE_BAK, txt);        // 双份写入
  } catch (e) { /* 隐私模式 / 配额满：静默降级，不影响本局游玩 */ }
}

function normalizeMeta(m) {
  m.lines = Object.assign({ hull: 0, fire: 0, engine: 0 }, m.lines || {});
  /* 清掉历史脏 key：v3.1 机库按钮的 HTML 少引号，曾把整段标签当 lineId 写进 lines */
  for (const k of Object.keys(m.lines)) if (!META_LINES.some(l => l.id === k)) delete m.lines[k];
  if (!Array.isArray(m.mods)) m.mods = [];
  if (!m.best) m.best = { wave: 0, score: 0 };
  if (!Array.isArray(m.recent)) m.recent = [];           // v3.1 新增字段：老存档没有 → 补空数组
  m.recent = m.recent.filter(w => typeof w === 'number' && w > 0).slice(-20);
  for (const l of META_LINES) m.lines[l.id] = clamp(m.lines[l.id] | 0, 0, META_MAX_LV);
  m.abyss = clamp(m.abyss | 0, 0, ABYSS_MAX);
  m.dust = Math.max(0, m.dust | 0);
  m.core = Math.max(0, m.core | 0);
  m.mods = m.mods.filter(id => !!META_MOD_BY_ID[id]);
  if (META_CARDS.every(c => c.id !== m.pickCard)) m.pickCard = 'laser';
  if (typeof ELEMENT_ORDER !== 'undefined' && ELEMENT_ORDER.indexOf(m.pickElem) < 0) m.pickElem = ELEMENT_ORDER[0];
  return m;
}

function readMetaRaw(key) {
  try {
    const t = localStorage.getItem(key);
    if (!t) return null;
    const m = JSON.parse(t);
    if (!m || m.ver !== 2) return null;
    if (metaSum(m) !== m._sum) return null;     // 校验和不符 → 视为损坏
    return normalizeMeta(m);
  } catch (e) { return null; }
}

/** 读档：主档 → 备份 →（都没有则）从 v1 迁移 */
function loadMeta() {
  const a = readMetaRaw(SAVE_KEY);
  if (a) return a;
  const b = readMetaRaw(SAVE_BAK);
  if (b) { saveMeta(b); return b; }            // 主档坏了：回退备份并顺手修好主档
  const m = blankMeta();
  let v1 = 0;
  try { v1 = Number(localStorage.getItem(SAVE_V1_KEY) || 0) || 0; } catch (e) { }
  if (v1 > 0) {
    /* v1 只有一个最高分 → 按 1/10 换算一笔起始星尘，避免老玩家"白玩" */
    m.dust = Math.floor(v1 / 10);
    m.best.score = v1;
    m._migrated = true;
  }
  saveMeta(m);
  return m;
}

/* ---------------------------------------------------------
   元进度 → 本局的落地
   --------------------------------------------------------- */
/** 把 meta 的加成写进新造的玩家（在 newPlayer() 之后调用） */
function applyMetaToPlayer(p, M) {
  const L = M.lines;
  /* 机体线 */
  p.maxHp += 6 * L.hull;
  p.hp = p.maxHp;
  p.stats.contactRes *= (1 - 0.015 * L.hull);
  /* 火力线 */
  p.stats.dmg *= (1 + 0.02 * L.fire);
  p.stats.rate *= (1 + 0.015 * L.fire);
  /* 引擎线 */
  p.stats.mvSpd *= (1 + 0.015 * L.engine);
  p.dashCdMax = Math.max(2.4, p.dashCdMax - 0.12 * L.engine);
  /* 改装槽 */
  if (M.mods.indexOf('m_reroll') >= 0) p.metaExtraReroll = (p.metaExtraReroll || 0) + 1;
  if (M.mods.indexOf('m_slot') >= 0) p.sixPick = 1;
  if (M.mods.indexOf('m_card') >= 0 && p.wlv[M.pickCard] === undefined) p.wlv[M.pickCard] = 1;
  p.elemCap = M.mods.indexOf('m_third') >= 0 ? 3 : 2;
  p.abyss = M.abyss | 0;
  p.gateSkip = M.mods.indexOf('m_elem') >= 0 ? M.pickElem : null;
  return p;
}

/** 元素上限（改装槽「三相共鸣」可提到 3） */
function elemCap(p) { return (p && p.elemCap) || 2; }

/** 本局深渊相关的乘子（写进 G，供 makeEnemy / 资源结算读） */
function applyAbyssToRun(G, d) {
  G.abyssHpMul = abyssHpMul(d);
  G.abyssSpdMul = abyssSpdMul(d);
  G.abyssDustMul = abyssDustMul(d);
  G.abyssCoreBonus = abyssCoreBonus(d);
  G.abyss = d | 0;
}

/** 阶跃波（10 的倍数）全来源 ×1.5（§5.2） */
function stepMul(wave) { return wave % 10 === 0 ? 1.5 : 1; }

/** 提交本局收获到存档（每波结算 + 死亡时各调一次） */
function commitRun(M) {
  if (!M) return;
  M.dust = Math.max(0, (M.dust | 0) + Math.round(G.dustEarn || 0));
  M.core = Math.max(0, (M.core | 0) + Math.round(G.coreEarn || 0));
  G.dustEarn = 0; G.coreEarn = 0;
  if (G.wave > (M.best.wave | 0)) M.best.wave = G.wave;
  if (G.score > (M.best.score | 0)) M.best.score = G.score;
  /* v3.1：记录本局抵达波次（同一局同一波只记一次 —— 用 _runLogged 去重）。
     放在 commitRun 里：它每波结算 + 死亡时都会调用。 */
  if (G.wave >= 1) {
    G._runLogged = G._runLogged || 0;
    if (G.wave > G._runLogged) {
      M.recent.push(G.wave);
      if (M.recent.length > 20) M.recent.splice(0, M.recent.length - 20);
      G._runLogged = G.wave;
    }
  }
  saveMeta(M);
}

/** 本机最近 20 局的抵达波次中位数（没有样本时返回 0）。
    用途见《肉鸽数据报告》§6.4：让玩家自己看到"我的中位数"，同时给开发者一个可索取的数字。 */
function metaMedianWave(M) {
  const a = ((M && M.recent) || []).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

/** 三线总等级（深渊解锁条件） */
function metaTotalLv(M) { return M.lines.hull + M.lines.fire + M.lines.engine; }
function abyssUnlocked(M) { return metaTotalLv(M) >= ABYSS_UNLOCK_LV; }

/** 下一级花费；已满级返回 null */
function nextCost(M, lineId) {
  const cur = M.lines[lineId] | 0;
  if (cur >= META_MAX_LV) return null;
  return metaCost(cur + 1);
}
