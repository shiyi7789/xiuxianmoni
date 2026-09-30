/* =========================================================
   元素系统回归测试（确定性）
   ---------------------------------------------------------
   覆盖《扩充设计文档-元素与内容扩容.md》§11 要求的断言：
     #1 元素门在 Lv4 / Lv9 各只触发一次
     #2 双元素上限硬性生效
     #3 反应表 15 条全部可被触发
     #4 同源对同一元素 0.25s 内只施 1 层（含「两个元素必须都能挂上」）
     #5 连锁深度上限 3、全局反应上限 40/s
     #6 分层解锁：W1 池 ⊂ W12 池，W12 时全部 54 张可抽
     #7 「五张全普通」保底必定生效
     #8 新卡互斥规则真实移除对应卡
   用法：node test/elements.js
   ========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/utils.js', 'js/audio.js', 'js/elements.js', 'js/entities.js',
  'js/upgrades.js', 'js/waves.js', 'js/game.js'];

/* ---------------- DOM / Canvas 桩（与 smoke.js 同源） ---------------- */
function makeCtx() {
  const target = {
    canvas: null,
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 12 }),
  };
  return new Proxy(target, {
    get(t, p) { if (p in t) return t[p]; if (typeof p === 'symbol') return undefined; return () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas() {
  return {
    width: 300, height: 150, style: { width: '', height: '' },
    getContext: () => makeCtx(), addEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960 }),
  };
}
const els = new Map();
function makeEl(id) {
  return {
    id, textContent: '', innerHTML: '', className: '', value: '', dataset: {}, children: [],
    offsetWidth: 540, clientWidth: 540, clientHeight: 960,
    style: new Proxy({}, { get: () => '', set: () => true }),
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
    },
    addEventListener(t, f) { (this._h = this._h || {})[t] = f; },
    removeEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    appendChild(n) { this.children.push(n); }, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960 }),
    setPointerCapture() {}, releasePointerCapture() {}, focus() {}, blur() {},
  };
}
const storage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
const sandbox = {
  console,
  document: {
    getElementById(id) { if (!els.has(id)) els.set(id, id === 'cv' ? makeCanvas() : makeEl(id)); return els.get(id); },
    createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl('_' + tag); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    addEventListener(t, f) { (this._h = this._h || {})[t] = f; },
    body: makeEl('body'), documentElement: makeEl('html'),
  },
  window: {
    devicePixelRatio: 1, innerWidth: 540, innerHeight: 960,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 1, localStorage: null,
  },
  localStorage: storage,
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => 0 },
  Math, Date, JSON, Number, String, Array, Object, Set, Map, Error, isNaN,
  parseInt, parseFloat, Boolean, Symbol, Proxy, Reflect, Promise,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

const src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

/* ---------------- 断言驱动 ---------------- */
const driver = `
(function () {
  const results = [];
  function ok(name, cond, extra) { results.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) }); }

  startGame();
  const P = G.player;

  /* 干净的战斗世界：清场 + 只保留我们要验的元素 */
  function world(elems) {
    G.enemies.length = 0; G.pBullets.length = 0; G.eBullets.length = 0;
    G.particles.length = 0; G.texts.length = 0; G.zaps.length = 0;
    G.holes.length = 0; G.refracts.length = 0; G.fogs.length = 0;
    G.shards.length = 0; G.hazards.length = 0; G.wakes.length = 0; G.volleys.length = 0;
    G.orbs.length = 0; G.pickups.length = 0;
    G.rxTotal = 0; G.t = 100; G.state = 'playing'; G.wave = 12;
    P.elems = elems.slice();
    P.x = 270; P.y = 900;
    _rxStat.t = -1; _rxStat.n = 0;
  }
  function spawn(cx, cy) {
    const e = makeEnemy(G, 'chaser', cx == null ? 270 : cx, cy == null ? 300 : cy);
    e.hp = 1e6; e.maxHp = 1e6;
    G.enemies.push(e);
    return e;
  }
  function st(o) {
    const out = {};
    for (const k in o) out[k] = { n: o[k], t: 5, dmg: 24 };
    return out;
  }

  /* ============ #1 元素门：Lv4 / Lv9 各只触发一次 ============ */
  world([]);
  const g4a = isElementGate(4), g9a = isElementGate(9);
  P.elems = ['thunder'];
  const g4b = isElementGate(4);           // 只看 flag，未开过 → 仍应可用
  pickElement('ice');                      // 走一次真实拾取
  const g4c = isElementGate(4);            // 已开过一次 → 必须关闭
  ok('#1 元素门 Lv4/Lv9 初始可用', g4a && g9a && g4b);
  ok('#1 元素门开过即关闭（同等级不重复）', g4c === false);

  /* ============ #2 双元素上限硬性生效 ============ */
  world([]);
  pickElement('thunder'); pickElement('fire');
  const before = P.elems.length;
  pickElement('ice');                      // 第三次必须被拒
  ok('#2 第三个元素被拒（上限 2）', P.elems.length === 2 && before === 2, P.elems.join('+'));
  ok('#2 双元素时不再开门', isElementGate(9) === false);

  /* ============ #3 15 条反应全部可触发 ============ */
  const fired = {};
  const _rx = rxFire;
  rxFire = function (g, e, def, pw, rd) { if (def && def.name) fired[def.name] = 1; return _rx(g, e, def, pw, rd); };

  // 雷 × {冰,火,毒,虚空}：满层放电
  for (const [o, name] of [['ice','超导'],['fire','等离子爆燃'],['toxin','电解'],['void','湮灭回路']]) {
    world(['thunder', o]);
    const e = spawn();
    e.st = st({ thunder: 4, [o]: 1 });
    elemDischarge(G, e, 0);
  }
  // 雷 + 光：暴击折射（圣裁）
  { world(['thunder','light']); const e = spawn(); e.st = st({ light: 3, thunder: 1 }); elemRefract(G, e, 120, {}); }
  // 冰 + 火：冻结结束（热震）
  { world(['ice','fire']); const e = spawn(); e.st = st({ ice: 5, fire: 2 }); e._freezeRx = 'fire'; e.freezeT = 0; elemFreezeEnd(G, e); }
  // 冰 × {毒,虚空,光}：冻结瞬间
  for (const [o, name] of [['toxin','腐蚀冻土'],['void','引力冰狱'],['light','霜镜']]) {
    world(['ice', o]);
    const e = spawn();
    e.st = st({ ice: 5, [o]: 1 });
    elemFreeze(G, e);
  }
  // 火 + 毒：爆燃 → 焚毒雾
  { world(['fire','toxin']); const e = spawn(); e.st = st({ fire: 6, toxin: 1 }); elemCombust(G, e); }
  // 火 + 虚空：坍缩 → 内爆
  { world(['fire','void']); const e = spawn(); e.st = st({ fire: 2, void: 1 }); elemCollapse(G, e.x, e.y, 100, 0, 'fire'); }
  // 火 + 光：暴击 → 灼阳
  { world(['fire','light']); const e = spawn(); e.st = st({ light: 3 }); elemOnHit(G, e, 40, { src: 'main', crit: true }); }
  // 毒 + 虚空：崩解 → 黑洞腐蚀
  { world(['toxin','void']); const e = spawn(); e.st = st({ toxin: 8, void: 1 }); elemShatter(G, e); }
  // 毒 + 光：折射 → 弱点标记
  { world(['toxin','light']); const e = spawn(); e.st = st({ light: 3, toxin: 1 }); elemRefract(G, e, 120, {}); }
  // 虚空 + 光：坍缩吸弹 → 奇点
  {
    world(['void','light']);
    const e = spawn();
    e.st = st({ void: 1, light: 1 });
    G.eBullets.push({ x: e.x + 8, y: e.y, vx: 0, vy: 0, r: 5, life: 1, dead: false, dmg: 5, color: '#ff5c8a', t: 0 });
    elemCollapse(G, e.x, e.y, 100, 0, 'light');
  }
  rxFire = _rx;

  const missing = REACTIONS.filter(r => !fired[r.name]).map(r => r.name);
  ok('#3 15 条反应全部可触发', missing.length === 0, missing.length ? '未触发: ' + missing.join('/') : '15/15');

  /* ============ #4 施加限流：同源同元素 0.25s 只 1 层；两个元素都要能挂上 ============ */
  world(['thunder','ice']);
  {
    const e = spawn();
    G.t = 200;
    elemApply(G, e, 'thunder', 20, { src: 'main' });
    elemApply(G, e, 'thunder', 20, { src: 'main' });   // 同源同元素 → 必须被拦
    const n1 = e.st.thunder.n;
    G.t = 200.3;                                       // 越过 0.25s
    elemApply(G, e, 'thunder', 20, { src: 'main' });
    const n2 = e.st.thunder.n;
    ok('#4 同源同元素 0.25s 限流生效', n1 === 1 && n2 === 2, 'n1=' + n1 + ' n2=' + n2);
  }
  {
    const e = spawn();
    G.t = 300;
    elemOnHit(G, e, 20, { src: 'main' });               // 一次命中要挂上两个元素
    ok('#4 一次命中可同时挂上两个元素', elemHas(e, 'thunder') && elemHas(e, 'ice'),
      'st=' + Object.keys(e.st || {}).join(','));
  }
  {
    const e = spawn();
    G.t = 400;
    for (let i = 0; i < 40; i++) { G.t += 0.01; elemApply(G, e, 'ice', 20, { src: 'main' }); }
    ok('#4 高频命中不会刷满层（缓受 0.25s 限流）', e.st.ice.n <= 2, 'ice=' + (e.st.ice && e.st.ice.n));
  }

  /* ============ #5 连锁深度 3 / 全局反应 40 每秒 ============ */
  {
    world(['void']);
    const e = spawn();
    const n0 = G.particles.length;
    elemCollapse(G, e.x, e.y, 100, RX_CHAIN_MAX + 1, 'void');   // 超深 → 必须直接返回
    ok('#5 连锁深度超过上限时不再结算', G.particles.length === n0);
  }
  {
    world(['thunder','ice']);
    const e = spawn();
    const def = RX[_rxKey('thunder', 'ice')];
    let firedN = 0;
    for (let i = 0; i < 200; i++) if (rxFire(G, e, def, 10, 0)) firedN++;
    ok('#5 全局反应频率上限 ' + RX_PER_SEC + '/s 不被突破', firedN <= RX_PER_SEC, 'fired=' + firedN);
  }

  /* ============ #6 分层解锁：W1 池 ⊂ W12 池，W12 = 全部卡 ============ */
  {
    world(['thunder']);
    P.level = 1; P.wlv = { main: 1 }; P.taken = {}; P.removed = {}; P.elems = [];
    G.wave = 1;
    const w1 = cardPool(G, P).map(u => u.id);
    G.wave = 12;
    const w12 = cardPool(G, P).map(u => u.id);
    const w1InW12 = w1.every(id => w12.indexOf(id) >= 0);
    ok('#6 W1 池 ⊆ W12 池', w1InW12, 'W1=' + w1.length + ' W12=' + w12.length);
    /* 分层意图的守门：T0 必须显著小于满池，否则前期就被 54 张卡淹没。
       ⚠ 文档 §2.4 写「T0 ≈ 20 张」，但 §4.2 的逐卡 unlock 列把 25 张标为 W1
         （8 武器 + 7 被动 + 3 功能 + 7 低风险卡）。此处以 §4.2 的逐卡表为准，
         断言改判「T0 ≤ 26 且 T0 < 满池一半」，两条都能证明分层真实生效。 */
    ok('#6 T0 池显著小于满池（分层生效）', w1.length <= 26 && w1.length < UPGRADES.length * 0.5,
      'T0=' + w1.length + ' / 满池=' + UPGRADES.length);
    // W12 + 未受限的玩家 → 除元素前置/互斥外应等于全表
    const needElem = UPGRADES.filter(u => u.needElem || u.needElem2).length;
    ok('#6 W12 时全表可用（扣除元素前置）', w12.length === UPGRADES.length - needElem,
      'W12=' + w12.length + ' 表=' + UPGRADES.length + ' 元素前置=' + needElem);
    /* v3：54 → 60（设计提案 §3.4 新增 6 张史诗，把史诗 12 张扩到 18 张，
       否则品质曲线把史诗出现率提高约 2 倍后，12 张会被玩家在 W20 前点满） */
    ok('#6 卡池总数 = 60', UPGRADES.length === 60, 'count=' + UPGRADES.length);
    {
      const byR = { common: 0, rare: 0, epic: 0 };
      for (const u of UPGRADES) byR[u.rarity]++;
      ok('#6 品质分档 = 18/24/18', byR.common === 18 && byR.rare === 24 && byR.epic === 18,
        'common=' + byR.common + ' rare=' + byR.rare + ' epic=' + byR.epic);
      // 史诗平均等级上限必须够高，否则「出现了也拿不了」
      let mx = 0; for (const u of UPGRADES) if (u.rarity === 'epic') mx += u.max;
      ok('#6 史诗 max 总和 >= 60', mx >= 60, 'sum=' + mx);
    }
  }

  /* ============ #7 「五张全普通」保底 ============ */
  {
    world(['thunder','ice']);
    P.level = 20; P.wlv = { main: 4, laser: 3, spread: 3, missile: 3 };
    P.taken = {}; P.removed = {}; P.sixPick = 0; P.rerolls = 0;
    G.wave = 12;
    let allCommon = 0, wrongSize = 0;
    for (let i = 0; i < 400; i++) {
      const cs = drawCards(G, P);
      if (cs.length !== 5) wrongSize++;
      if (cs.every(u => u.rarity === 'common')) allCommon++;
    }
    ok('#7 五张全普通时保底必然生效', allCommon === 0, 'allCommon=' + allCommon + ' wrongSize=' + wrongSize);
    ok('#7 默认五选一', wrongSize === 0, 'wrongSize=' + wrongSize);
    P.sixPick = 1;
    const six = drawCards(G, P);
    P.sixPick = 0;
    ok('#7 y_slot 后为六选一', six.length === 6, 'len=' + six.length);
  }

  /* ============ #8 互斥：专精协议 / 玻璃加农 ============ */
  {
    world(['thunder']);
    P.level = 20; P.wlv = { main: 6, laser: 2 }; P.taken = {}; P.removed = {};
    applyUpgrade(G, P, UPGRADE_BY_ID.b_synergy);
    applyUpgrade(G, P, UPGRADE_BY_ID.b_spec);
    ok('#8 专精协议移除「武器协同」', canTake(P, UPGRADE_BY_ID.b_synergy) === false &&
      cardPool(G, P).indexOf(UPGRADE_BY_ID.b_synergy) < 0);
    P.shieldMax = 30; P.shield = 30;
    applyUpgrade(G, P, UPGRADE_BY_ID.r_glass);
    ok('#8 玻璃加农移除护盾类卡并清零护盾',
      canTake(P, UPGRADE_BY_ID.p_shield) === false && P.shieldMax === 0 && P.shield === 0);
  }

  /* ============ 元素类卡前置：未选元素时不得进池 ============ */
  {
    world([]);
    P.level = 20; P.taken = {}; P.removed = {};
    P.elems = [];
    const noEl = cardPool(G, P).indexOf(UPGRADE_BY_ID.e_resonance) < 0;
    P.elems = ['fire'];
    const oneEl = cardPool(G, P).indexOf(UPGRADE_BY_ID.e_resonance) >= 0;
    const duplexOff = cardPool(G, P).indexOf(UPGRADE_BY_ID.e_duplex) < 0;
    P.elems = ['fire', 'ice'];
    const duplexOn = cardPool(G, P).indexOf(UPGRADE_BY_ID.e_duplex) >= 0;
    ok('#9 元素类卡按前置数量进池', noEl && oneEl && duplexOff && duplexOn,
      [noEl, oneEl, duplexOff, duplexOn].join());
  }

  const failed = results.filter(r => !r.pass);
  const __RES = { ok: failed.length === 0, total: results.length, failed: failed.length, results };
  console.log(JSON.stringify(__RES, null, 1));
  return __RES;
})();
`;

const script = new vm.Script(src + '\n' + driver, { filename: 'elements-test.js' });
const __out = script.runInContext(sandbox, { timeout: 120000 });
/* 失败必须以非零码退出 */
if (!__out || !__out.ok) process.exitCode = 1;
