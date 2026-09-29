/* 无头冒烟测试：用 DOM/Canvas 桩驱动整个游戏跑数千帧，抓运行时异常与数值异常 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/utils.js', 'js/audio.js', 'js/elements.js', 'js/entities.js', 'js/upgrades.js', 'js/waves.js', 'js/game.js'];

/* ---------------- DOM / Canvas 桩 ---------------- */
function makeCtx() {
  const target = {
    canvas: null,
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    measureText: () => ({ width: 12 }),
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return undefined;
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function makeCanvas() {
  const c = {
    width: 300, height: 150,
    style: { width: '', height: '' },
    getContext: () => makeCtx(),
    addEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960 }),
  };
  return c;
}

const els = new Map();
function makeEl(id) {
  const e = {
    id, textContent: '', innerHTML: '', className: '', value: '',
    dataset: {}, children: [],
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
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    appendChild(n) { this.children.push(n); },
    setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960 }),
    setPointerCapture() {}, releasePointerCapture() {}, focus() {}, blur() {},
  };
  return e;
}

const rafQueue = [];
let now = 0;

const documentStub = {
  getElementById(id) {
    if (!els.has(id)) {
      els.set(id, id === 'cv' ? makeCanvas() : makeEl(id));
    }
    return els.get(id);
  },
  createElement(tag) {
    return tag === 'canvas' ? makeCanvas() : makeEl('_' + tag);
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener(t, f) { (this._h = this._h || {})[t] = f; },
  body: makeEl('body'),
  documentElement: makeEl('html'),
};

const windowStub = {
  devicePixelRatio: 1,
  innerWidth: 540, innerHeight: 960,
  addEventListener(t, f) { (this._h = this._h || {})[t] = f; },
  removeEventListener() {},
  requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
  localStorage: null,
};

const storage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const sandbox = {
  console,
  document: documentStub,
  window: windowStub,
  localStorage: storage,
  __ELEMS: (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean),
  __raf: [],
  __now: 0,
  requestAnimationFrame: (cb) => { sandbox.__raf.push(cb); return sandbox.__raf.length; },
  cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => sandbox.__now },
  Math, Date, JSON, Number, String, Array, Object, Set, Map, Error, isNaN,
  parseInt, parseFloat, Boolean, Symbol, Proxy, Reflect, Promise,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

/* ---------------- 拼接 + 驱动 ---------------- */
const driver = `
/* ===== 冒烟驱动 ===== */
(function () {
  const rafQueue = __raf;
  const REPORT = { errors: [], waves: [], maxWave: 0, maxLevel: 1, restarts: 0, frames: 0,
                   ebSpawned: 0, eBulletPeak: 0, dmgTaken: 0, bossFought: 0, bossKilled: 0,
                   gateOpens: 0, gateLevels: [], maxElems: 0, rxCount: {}, rxKinds: 0,
                   maxShards: 0, maxHazards: 0, maxFogs: 0, maxBulletTrail: 0, poolW1: 0, poolW12: 0 };

  // 埋点：确认弹幕与受伤链路真的在跑
  const _spawnEB = spawnEBullet;
  spawnEBullet = function (g, x, y, a, s, o) { REPORT.ebSpawned++; return _spawnEB(g, x, y, a, s, o); };
  const _hurt = hurtPlayer;
  hurtPlayer = function (a) {
    if (!isFinite(a)) {
      REPORT.badHurt = (REPORT.badHurt || 0) + 1;
      if (REPORT.badHurt <= 2) console.log('BAD HURT AMOUNT=', a, 'STACK:', String(new Error().stack).split(String.fromCharCode(10)).slice(1, 6).join(' >> '));
    }
    const before = G.player ? G.player.hp : 0;
    _hurt(a);
    if (G.player && G.player.hp < before) REPORT.dmgTaken += before - G.player.hp;
  };
  const _kill = killEnemy;
  killEnemy = function (g, e) { if (e.isBoss && !e.dead) REPORT.bossKilled++; return _kill(g, e); };
  // 埋点：反应覆盖度（设计文档回归项 #3：15 条反应必须全部可触发）
  const _rxFire = rxFire;
  rxFire = function (g, e, def, pw, rd) {
    if (def && def.name) REPORT.rxCount[def.name] = (REPORT.rxCount[def.name] || 0) + 1;
    return _rxFire(g, e, def, pw, rd);
  };
  const _elemApply = elemApply;
  REPORT.elemApplied = {};
  elemApply = function (g, e, id, dmg, opt) {
    REPORT.elemApplied[id] = (REPORT.elemApplied[id] || 0) + 1;
    return _elemApply(g, e, id, dmg, opt);
  };
  REPORT.maxStLayers = 0;
  REPORT.tickCalls = 0; REPORT.tickOneCalls = 0; REPORT.dischargeCalls = 0; REPORT.freezeCalls = 0;
  const _elemTick = elemTick;
  elemTick = function (g, d) { REPORT.tickCalls++; return _elemTick(g, d); };
  const _elemTickOne = elemTickOne;
  elemTickOne = function (g, e, d) { REPORT.tickOneCalls++; return _elemTickOne(g, e, d); };
  const _elemDischarge = elemDischarge;
  elemDischarge = function (g, e, dep) { REPORT.dischargeCalls++; return _elemDischarge(g, e, dep); };
  const _elemFreeze = elemFreeze;
  elemFreeze = function (g, e) { REPORT.freezeCalls++; return _elemFreeze(g, e); };
  // 埋点：元素门开了几次、开在哪一级（回归项 #1）
  let _prevGate = false;

  function frame() {
    const q = rafQueue.slice(); rafQueue.length = 0;
    __now += 16.7;
    for (const cb of q) cb(__now);
  }
  function press(k, on) { keys[k] = on; }

  /* 模拟一个"会瞄准 + 会闪避"的合格玩家 */
  function bot() {
    const p = G.player;
    if (!p) return;
    let tx = p.x, ty = 960 - 210;
    const alive = G.enemies.filter(e => !e.dead);
    let low = null;
    for (const e of alive) if (!low || e.y > low.y) low = e;
    if (low) tx = low.x;
    // 闪避：躲最近的近身敌弹
    let bestD = 1e9, db = null;
    for (const b of G.eBullets) {
      const dx = b.x - p.x, dy = b.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD && dy < 0 && dy > -260 && d < 150 * 150) { bestD = d; db = b; }
    }
    if (db) tx = p.x + Math.sign(p.x - db.x || 1) * 110;
    // 躲敌人的"撞击"
    for (const e of alive) {
      if (Math.abs(e.y - p.y) < 150 && Math.abs(e.x - p.x) < 70) tx = p.x + Math.sign(p.x - e.x || 1) * 120;
    }
    tx = Math.max(30, Math.min(510, tx));
    press('a', p.x > tx + 5);
    press('d', p.x < tx - 5);
    press('w', p.y > ty + 8);
    press('s', p.y < ty - 8);
  }

  startGame();

  // 回归项 #7：分层解锁 —— W1 池应明显小于 W12 池，且 W12 时全部 54 张都在池里
  REPORT.poolW1 = cardPool(G, G.player).length;
  { const _w = G.wave; G.wave = 12; REPORT.poolW12 = cardPool(G, G.player).length; G.wave = _w; }

  const TOTAL = 30000;      // ≈500 秒游戏时间
  for (let i = 0; i < TOTAL; i++) {
    try {
      if (G.state === 'levelup') {
        if (G.gateOn && !_prevGate) {
          REPORT.gateOpens++;
          REPORT.gateLevels.push(G.lvQueue[0] || 0);
        }
        _prevGate = !!G.gateOn;
        if (G.gateOn) {
          /* 元素门：必须选一个才继续（回归项 #2：第三次选择必须被拒）
             __ELEMS（命令行参数）可指定本局的两个元素，用于扫掉 15 种反应的组合 */
          const want = (__ELEMS && __ELEMS.length) ? __ELEMS : ELEMENT_ORDER;
          let id = want.find(x => ELEMENT_ORDER.indexOf(x) >= 0 && G.player.elems.indexOf(x) < 0);
          if (!id) id = ELEMENT_ORDER.find(x => G.player.elems.indexOf(x) < 0);
          if (id) pickElement(id);
          else document.getElementById('btnBan')._h.click({});
        } else if (typeof curCards !== 'undefined' && curCards.length) {
          if (Math.random() < 0.10) document.getElementById('btnBan')._h.click({});
          else pickCard(curCards[Math.floor(Math.random() * curCards.length)]);
        }
      } else {
        _prevGate = false;
      }
      if (G.state === 'playing') bot();
      if (i % 240 === 0) doDash();
      if (i % 900 === 0) doBomb();
      if (i % 700 === 0) doSlow();

      if (G.boss && !G.boss.dead) REPORT.bossFought++;

      frame();
      REPORT.frames++;
      REPORT.eBulletPeak = Math.max(REPORT.eBulletPeak, G.eBullets.length);
      REPORT.maxShards = Math.max(REPORT.maxShards, G.shards.length);
      REPORT.maxHazards = Math.max(REPORT.maxHazards, G.hazards.length);
      REPORT.maxFogs = Math.max(REPORT.maxFogs, G.fogs.length);
      for (const b of G.pBullets) if (b.hist) REPORT.maxBulletTrail = Math.max(REPORT.maxBulletTrail, b.hist.length);

      if (G.wave > REPORT.maxWave) {
        REPORT.maxWave = G.wave;
        REPORT.waves.push({ w: G.wave, t: +G.t.toFixed(0), lv: G.player ? G.player.level : 0,
                            hp: G.player ? Math.round(G.player.hp) : 0, score: G.score });
      }
      if (G.player) {
        REPORT.maxLevel = Math.max(REPORT.maxLevel, G.player.level);
        REPORT.maxElems = Math.max(REPORT.maxElems, G.player.elems.length);
      }

      if (G.player) {
        for (const k of ['x', 'y', 'hp', 'maxHp', 'shield', 'shieldMax', 'invuln', 'xp', 'xpNext', 'level', 'dashT', 'slowT']) {
          if (!isFinite(G.player[k])) {
            throw new Error('player.' + k + ' NaN; dump=' + JSON.stringify({
              hp: G.player.hp, maxHp: G.player.maxHp, shield: G.player.shield,
              shieldMax: G.player.shieldMax, stats: G.player.stats, wlv: G.player.wlv,
              taken: G.player.taken,
            }));
          }
        }
        if (!isFinite(G.score)) throw new Error('score NaN @' + i);
        // 回归项 #2：双元素上限硬性生效
        if (G.player.elems.length > 2) throw new Error('元素上限被突破 @' + i + ' → ' + G.player.elems.join('+'));
        // 元素列出的 id 必须全部合法
        for (const id of G.player.elems) if (!ELEMENTS[id]) throw new Error('非法元素 id=' + id);
      }
      for (const e of G.enemies) {
        if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) {
          const bad = ['x', 'y', 'hp', 'vx', 'vy', 'cx', 'cy', 'a0', 'rad', 'spd', 't', 'acc', 'maxSpd', 'bulletSpd']
            .filter(k => e[k] !== undefined && !isFinite(e[k]));
          throw new Error('enemy ' + e.type + ' NaN fields=[' + bad.join(',') + '] t=' + i);
        }
        if (e.st) for (const k in e.st) {
          const s = e.st[k];
          if (s && s.n > REPORT.maxStLayers) REPORT.maxStLayers = s.n;
          if (s && !isFinite(s.n)) throw new Error('元素层数 NaN ' + k + ' @' + i);
        }
      }
      if (G.pBullets.some(b => !isFinite(b.x) || !isFinite(b.y))) throw new Error('pBullet NaN @' + i);
      if (G.eBullets.some(b => !isFinite(b.x) || !isFinite(b.y))) throw new Error('eBullet NaN @' + i);
      // 场地物件与危害区不得泄漏（有硬上限，超了就是没回收）
      if (G.shards.length > 24) throw new Error('shards 泄漏 =' + G.shards.length);
      if (G.hazards.length > 120) throw new Error('hazards 泄漏 =' + G.hazards.length);
      if (G.wakes.length > 24) throw new Error('wakes 泄漏 =' + G.wakes.length);
      if (G.wave > 60) throw new Error('波次失控');
    } catch (err) {
      REPORT.errors.push({ frame: i, wave: G.wave, msg: err && err.message,
        stack: String((err && err.stack) || '').split('\\n').slice(1, 3).join(' | ') });
      if (REPORT.errors.length > 5) break;
    }
    if (G.state === 'over') {
      REPORT.restarts++;
      startGame();
      if (REPORT.restarts > 8) break;
    }
  }

  REPORT.rxKinds = Object.keys(REPORT.rxCount).length;
  REPORT.rxMissing = REACTIONS.filter(r => !REPORT.rxCount[r.name]).map(r => r.name);
  // 用埋点累加（G.rxTotal 会被重开一局清零，跨局不可比）
  REPORT.rxTotal = Object.keys(REPORT.rxCount).reduce((a, k) => a + REPORT.rxCount[k], 0);
  console.log(JSON.stringify({ ok: REPORT.errors.length === 0, ...REPORT }, null, 1));
})();
`;

const src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const script = new vm.Script(src + '\n' + driver, { filename: 'bundle.js' });
script.runInContext(sandbox, { timeout: 240000 });
