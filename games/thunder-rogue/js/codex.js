/* =========================================================
   codex.js — 敌机图鉴 / 成就 / 死亡叙事（v3.3）
   ---------------------------------------------------------
   三件事共用一个理由：**让每一局都留下点东西**。
   以前打完只掉一个分数，玩家没有任何"我在积累什么"的感觉。

   存储：两个独立键（刻意不进 metaSum）
     rt_codex_v1  { drone: 击杀数, … }        —— 图鉴解锁进度
     rt_ach_v1    { 成就 id: 1, … }           —— 已达成成就
   为什么独立存：metaSum 一旦变化，所有已存在的 v2 存档都会被判为损坏 → 玩家进度清零。
   v3.1 的 recent、v3.3 的 settings 都是同一个原则。
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   一、敌机图鉴（19 条）
   hint 写"怎么打"，不写"是什么" —— 图鉴的价值在于教，而不在于凑数。
   --------------------------------------------------------- */
const ENEMY_CODEX = [
  { t: 'drone',   n: '侦察机',   hint: '直线下落，数量最多的填充怪；清场别把火力浪费在它身上' },
  { t: 'zig',     n: '游走机',   hint: '左右摆动着下来，预判它的横向速度再瞄' },
  { t: 'mini',    n: '蜂群梭',   hint: 'fractal 一碰就碎，但成群时是最容易偷走你血量的东西' },
  { t: 'chaser',  n: '追猎者',   hint: '会加速扑向你；把它往回带，别让它贴住你的退路' },
  { t: 'shooter', n: '炮手',     hint: '停下来三连点射；点射之间有节奏，读条比躲弹重要' },
  { t: 'tank',    n: '重装舰',   hint: '装甲 25%，纯平A收益低；元素与穿透对它更划算' },
  { t: 'splitter', n: '分裂体',  hint: '死时会裂成 3 只小的；在它落地前解决掉最省事' },
  { t: 'orbiter', n: '环绕者',   hint: '绕着固定点转圈，弹道会绕过来；别站在它的圆心正下方' },
  { t: 'turret',  n: '哨塔',     hint: '停在半空放环形弹；优先拆塔，否则每波都要多读一圈弹' },
  { t: 'rammer',  n: '突进虫',   hint: '蓄力后直线冲刺；看它闪白的一瞬间就该横向让位' },
  { t: 'xpblob',  n: '经验胶质', hint: '几乎不主动伤人，掉大量经验；别把它当成威胁' },
  { t: 'marksman', n: '狙击舰',  hint: '会对准你所在的那一列蓄力；横向移开一格即可' },
  { t: 'tick',    n: '窃能虫',   hint: '贴上来偷你的护盾与能量；近战武器优先处理' },
  { t: 'mender',  n: '修复舰',   hint: '给周围敌机回血；放着不管，它们整波都清不动' },
  { t: 'bulwark', n: '盾卫',     hint: '能量盾按命中次数削减，不吃伤害；用多段小弹磨盾更划算' },
  { t: 'sweeper', n: '横扫者',   hint: '横向扫射整行；躲进它扫过的空隙，不要逆着跑' },
  { t: 'leech',   n: '汲能者',   hint: '命中会让你掉能量；持续光束流派尤其要防' },
  { t: 'cluster', n: '集群母体', hint: '死亡时炸出一圈小弹；离它远一点再收人头' },
  { t: 'phaser',  n: '相位舰',   hint: '会阶段性虚化免伤；它虚化时先处理别的目标' },
];
const ENEMY_NAME = {};
for (const e of ENEMY_CODEX) ENEMY_NAME[e.t] = e.n;

/* ---------------------------------------------------------
   二、成就（24 条）
   test 接收一个统计快照 s；在"每波结算 / 进化 / 局终"三个时机统一检查。
   --------------------------------------------------------- */
const ACHIEVEMENTS = [
  { id: 'w05', n: '第一次深入',   d: '单局抵达第 5 波',        test: s => s.wave >= 5 },
  { id: 'w10', n: '初见断层',     d: '单局抵达第 10 波',       test: s => s.wave >= 10 },
  { id: 'w15', n: '深空老兵',     d: '单局抵达第 15 波',       test: s => s.wave >= 15 },
  { id: 'w20', n: '断崖之外',     d: '单局抵达第 20 波',       test: s => s.wave >= 20 },
  { id: 'w30', n: '奇点边缘',     d: '单局抵达第 30 波',       test: s => s.wave >= 30 },
  { id: 'k200', n: '清道夫',      d: '单局击杀 200',           test: s => s.kills >= 200 },
  { id: 'k600', n: '弹幕收割者',  d: '单局击杀 600',           test: s => s.kills >= 600 },
  { id: 'sc50k', n: '六位数',     d: '单局得分 50,000',        test: s => s.score >= 50000 },
  { id: 'boss3', n: '三连破',     d: '单局击败 3 个 Boss',     test: s => s.bossKills >= 3 },
  { id: 'boss6', n: '要塞杀手',   d: '单局击败 6 个 Boss',     test: s => s.bossKills >= 6 },
  { id: 'evo1', n: '质变',        d: '完成第一次武器进化',     test: s => s.evos >= 1 },
  { id: 'evo3', n: '三位一体',    d: '单局完成 3 次武器进化',  test: s => s.evos >= 3 },
  { id: 'elems2', n: '双元素',    d: '单局觉醒两种元素',       test: s => s.elems >= 2 },
  { id: 'rx30', n: '反应堆',      d: '单局触发 30 次元素反应', test: s => s.rx >= 30 },
  { id: 'combo20', n: '连击手感', d: '单局最高连击 ×20',       test: s => s.bestCombo >= 20 },
  { id: 'combo50', n: '丝滑',     d: '单局最高连击 ×50',       test: s => s.bestCombo >= 50 },
  { id: 'noHit10', n: '未受一击', d: '无伤抵达第 10 波',       test: s => s.wave >= 10 && s.hits === 0 },
  { id: 'noHit15', n: '零失误',   d: '无伤抵达第 15 波',       test: s => s.wave >= 15 && s.hits === 0 },
  { id: 'lance',  n: '光束掌控',  d: '用持续光束打出一次过载', test: s => !!s.usedOverload },
  { id: 'swarm',  n: '母舰指挥官', d: '用蜂群母舰打完一局',    test: s => !!s.evo.missile },
  { id: 'mod5',   n: '满配出厂',  d: '五个改装槽全部装配',     test: s => s.mods >= 5 },
  { id: 'line30', n: '全线贯通',  d: '三线等级合计 30',        test: s => s.lines >= 30 },
  { id: 'abyss5', n: '越陷越深',  d: '在深渊深度 ≥5 打满 10 波', test: s => s.abyss >= 5 && s.wave >= 10 },
  { id: 'daily',  n: '今日份',    d: '完成一次每日挑战',       test: s => !!s.daily },
];
const ACH_BY_ID = {};
for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;

const ENEMY_CODEX_KEY = 'rt_codex_v1';
const ACH_KEY = 'rt_ach_v1';

let ENEMY_SEEN = loadCodex();
let ACH = loadAch();
const ACH_NEW = [];                       // 本局新解锁的成就（结算页展示）

function loadCodex() {
  const c = {};
  try {
    const raw = JSON.parse(localStorage.getItem(ENEMY_CODEX_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      for (const e of ENEMY_CODEX) { const v = raw[e.t] | 0; if (v > 0) c[e.t] = v; }
    }
  } catch (e) { }
  return c;
}
function saveCodex() { try { localStorage.setItem(ENEMY_CODEX_KEY, JSON.stringify(ENEMY_SEEN)); } catch (e) { } }
function loadAch() {
  const a = {};
  try {
    const raw = JSON.parse(localStorage.getItem(ACH_KEY) || 'null');
    if (raw && typeof raw === 'object') for (const k in raw) if (ACH_BY_ID[k] && raw[k]) a[k] = 1;
  } catch (e) { }
  return a;
}
function saveAch() { try { localStorage.setItem(ACH_KEY, JSON.stringify(ACH)); } catch (e) { } }

/** 击杀埋点：由 killEnemy 调用 */
function codexKill(type) {
  if (!type || !ENEMY_NAME[type]) return;
  ENEMY_SEEN[type] = (ENEMY_SEEN[type] | 0) + 1;
  if (ENEMY_SEEN[type] === 1) saveCodex();          // 首次解锁才落盘，避免每杀一只都写 localStorage
  else if ((ENEMY_SEEN[type] & 15) === 0) saveCodex();
}

/** 取当前统计快照（成就判定的唯一输入） */
function achSnapshot(G) {
  const p = G.player || {};
  let evos = 0;
  for (const k in (p.evo || {})) if (p.evo[k]) evos++;
  return {
    wave: G.wave | 0, kills: G.kills | 0, score: G.score | 0,
    bossKills: G.bossKills | 0, elems: (p.elems || []).length,
    rx: G.rxTotal | 0, bestCombo: G.bestCombo | 0, hits: G.playerHits | 0,
    evos: evos, evo: p.evo || {}, usedOverload: G.usedOverload | 0,
    mods: (META.mods || []).length,
    lines: (META.lines.hull | 0) + (META.lines.fire | 0) + (META.lines.engine | 0),
    abyss: META.abyss | 0, daily: G.isDaily | 0,
  };
}

/** 统一检查：返回本次新解锁的成就数组 */
function achCheck(G) {
  const s = achSnapshot(G);
  const now = [];
  for (const a of ACHIEVEMENTS) {
    if (ACH[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(s); } catch (e) { ok = false; }
    if (ok) {
      ACH[a.id] = 1;
      now.push(a);
      ACH_NEW.push(a);
      if (typeof G.toast === 'function') G.toast('成就解锁 · ' + a.n);
      SFX.play('rxBig');
    }
  }
  if (now.length) saveAch();
  return now;
}

/** 图鉴面板 HTML（并入元素图鉴弹层） */
function codexEnemyHtml() {
  const seen = Object.keys(ENEMY_SEEN).length;
  const out = ['<div class="cd-sec"><h3>敌机图鉴 <b>' + seen + ' / ' + ENEMY_CODEX.length + '</b></h3>'];
  for (const e of ENEMY_CODEX) {
    const n = ENEMY_SEEN[e.t] | 0;
    out.push('<div class="cd-row' + (n ? '' : ' lock') + '">' +
      '<b>' + (n ? e.n : '？ ？ ？') + '</b>' +
      '<span>' + (n ? e.hint : '击杀一次后解锁') + '</span>' +
      '<i>' + (n ? '×' + n : '') + '</i></div>');
  }
  out.push('</div>');
  return out.join('');
}

function codexAchHtml() {
  const got = ACHIEVEMENTS.filter(a => ACH[a.id]).length;
  const out = ['<div class="cd-sec"><h3>成就 <b>' + got + ' / ' + ACHIEVEMENTS.length + '</b></h3>'];
  for (const a of ACHIEVEMENTS) {
    const on = !!ACH[a.id];
    out.push('<div class="cd-row' + (on ? ' on' : ' lock') + '">' +
      '<b>' + (on ? a.n : '未达成') + '</b><span>' + a.d + '</span><i>' + (on ? '✓' : '') + '</i></div>');
  }
  out.push('</div>');
  return out.join('');
}
