/* 无头冒烟测试：用 DOM/Canvas 桩驱动整个游戏跑数千帧，抓运行时异常与数值异常 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/icons.js', 'js/utils.js', 'js/audio.js', 'js/elements.js', 'js/meta.js', 'js/codex.js', 'js/entities.js', 'js/upgrades.js', 'js/waves.js', 'js/game.js'];

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
      /* 玩家弹幕硬上限（PBULLET_HARD_CAP=1400）的哨兵：正常玩法远达不到，
         真撞上就是"分裂类"又在生弹（v3.2 修掉的导弹分导指数分裂就是这个形态） */
      if (G.pBullets.length > 1200) throw new Error('pBullets 失控 =' + G.pBullets.length);
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

  /* ---- v3.1：中途续玩 + 菜单显隐（用户要求二/三） ---- */
  REPORT.resume = {};
  try {
    startGame();
    G.wave = 7; G.score = 1234; G.kills = 56; G.bossIndex = 2;
    G.player.hp = 42; G.player.wlv.arc = 2; G.player.elems = ['ice'];
    G.player._gate1Done = 1; G.player.phaseLv = 1;
    saveRun();
    const snap = readRun();
    REPORT.resume.saved = !!snap && snap.wave === 7 && snap.score === 1234 && Math.round(snap.p.hp) === 42;

    G.player = null; G.state = 'menu';
    REPORT.resume.resumed = resumeSavedRun();
    REPORT.resume.wave = G.wave;
    REPORT.resume.score = G.score;
    REPORT.resume.hp = Math.round(G.player.hp);
    REPORT.resume.arcLv = G.player.wlv.arc;
    REPORT.resume.elems = G.player.elems.join(',');
    REPORT.resume.gate1 = G.player._gate1Done;
    REPORT.resume.graceInvuln = G.player.invuln >= 1.9;     // 回来给 2s 无敌
    REPORT.resume.cooldownReset = G.player.dashCd === 0 && G.player.phaseCd === 0;

    /* 死亡必须终结续玩（否则"关掉重来续命"就是漏洞） */
    gameOver();
    REPORT.resume.clearedOnDeath = readRun() === null;

    /* 菜单显隐：原来是真 bug（只隐藏、从未显示） */
    showMenu(true);
    REPORT.resume.menuShown = !document.getElementById('menu').classList.contains('hidden');
    showMenu(false);
    REPORT.resume.menuHidden = document.getElementById('menu').classList.contains('hidden');

    /* 回归：非法快照必须被忽略 */
    localStorage.setItem('rt_run_v1', '{"v":1,"wave":0}');
    REPORT.resume.badSnapshotIgnored = readRun() === null;
    localStorage.removeItem('rt_run_v1');
  } catch (e) { REPORT.errors.push('resume: ' + e.message); }

  /* ---- v3：机库（元进度）冒烟：UI 渲染 + 三条动作 + 存档落盘 ---- */
  REPORT.hangar = {};
  try {
    META.dust = 0; META.core = 0;
    META.lines = { hull: 0, fire: 0, engine: 0 };
    META.mods = []; META.abyss = 0;
    renderHangar();
    REPORT.hangar.render = 'ok';
    /* 回归：升级按钮的 HTML 必须闭合 —— v3.1 的 data-line 少一个引号，属性会吞掉后面的标签，
       点击时 metaUpgrade 收到脏 id → 先扣钱写脏 key、再在 META_LINES.find(...).name 抛异常
       （表现就是玩家说的"点击无反应"）。这里用 innerHTML 做静态守卫，覆盖 DOM 桩点不到按钮的盲区。 */
    const hgHtml = document.getElementById('hgBody').innerHTML;
    REPORT.hangar.htmlLines = ['hull', 'fire', 'engine'].every(id => hgHtml.indexOf('data-line="' + id + '"') >= 0);
    REPORT.hangar.htmlNoSwallow = hgHtml.indexOf('data-line="hull>') < 0;
    if (!REPORT.hangar.htmlLines || !REPORT.hangar.htmlNoSwallow) {
      REPORT.errors.push('hangar: 升级按钮 data-line 属性损坏（HTML 未闭合）');
    }
    /* 白名单守卫：脏 id 一律拒绝，绝不能写进存档 */
    const __k0 = Object.keys(META.lines).length;
    metaUpgrade('hull>升 级</button>');
    REPORT.hangar.dirtyIdRejected = Object.keys(META.lines).length === __k0;
    REPORT.hangar.noDust = metaUpgrade('hull') === false;      // 星尘不足时必须拒绝
    META.dust = 500000; META.core = 500;
    REPORT.hangar.up = metaUpgrade('hull') && metaUpgrade('fire') && metaUpgrade('engine');
    REPORT.hangar.lv = META.lines.hull + '/' + META.lines.fire + '/' + META.lines.engine;
    META.core = 10;
    REPORT.hangar.poor = metaBuyMod('m_third') === false;      // 碎片不足（10 < 240）必须拒绝
    REPORT.hangar.nothingBought = META.mods.length === 0;
    META.core = 300;
    REPORT.hangar.mod = metaBuyMod('m_third') === true;        // 300 片应装配成功
    REPORT.hangar.coreLeft = META.core;                        // 300 − 240 = 60
    REPORT.hangar.modDup = metaBuyMod('m_third') === false;    // 不可重复装配
    REPORT.hangar.cap = (function () { const q = newPlayer(); applyMetaToPlayer(q, META); return elemCap(q); })();
    REPORT.hangar.abyssLocked = metaSetAbyss(1) === false;     // 未满 15 级应拒绝
    META.lines.hull = 10; META.lines.fire = 5;
    REPORT.hangar.abyss = metaSetAbyss(1) && metaSetAbyss(1);
    REPORT.hangar.abyssVal = META.abyss;
    const raw = JSON.parse(localStorage.getItem('rt_save_v2'));
    REPORT.hangar.saved = raw.dust + '/' + raw.core + '/' + raw.mods.join(',') + '/' + raw.abyss;
    REPORT.hangar.sumOk = metaSum(raw) === raw._sum;
  } catch (e) { REPORT.errors.push('hangar: ' + e.message); }

  /* ---- v3.2：持续光束改为手动释放（用户报告「它会一直释放能量、攒不满」） ---- */
  REPORT.lance = {};
  try {
    const q = newPlayer();
    q.stats.lance = 1; q.energy = 0; q.lanceOn = false; q.lanceOver = 0;
    G.player = q;
    G.enemies.length = 0;
    for (let i = 0; i < 120; i++) tLanceUpdate(G, q, 1, 1 / 60);   // 空闲 2 秒
    REPORT.lance.charge2s = +q.energy.toFixed(2);                  // 2.5/s × 2 ≈ 5
    REPORT.lance.noAutoFire = q.lanceOn === false;                 // 关键：不许自动开火
    q.energy = 5;
    REPORT.lance.lowRejected = tLanceToggle(q) === false;          // <10 能量不响应
    q.energy = (q.stats.energyMax || 100);
    REPORT.lance.fullToggles = tLanceToggle(q) === true;
    REPORT.lance.overload = q.lanceOver === 1;                     // 满能释放 = 过载
    tLanceToggle(q);                                               // 手动收束
    q.energy = 40; tLanceToggle(q);
    REPORT.lance.normalShot = q.lanceOver === 0;                   // 非满能 = 普通
    tLanceToggle(q);
    q.energy = 100; q.lanceOn = true; q.lanceOver = 1;
    for (let i = 0; i < 2100 && q.lanceOn; i++) tLanceUpdate(G, q, 1, 1 / 60);
    REPORT.lance.autoStop = q.lanceOn === false && q.lanceOver === 0;   // 耗尽必须自动收束
    q.energy = 0;
    for (let i = 0; i < 60; i++) tLanceUpdate(G, q, 1, 1 / 60);
    REPORT.lance.recharge = q.energy > 0;
    if (!REPORT.lance.noAutoFire || !REPORT.lance.fullToggles || !REPORT.lance.overload ||
        !REPORT.lance.normalShot || !REPORT.lance.autoStop) {
      REPORT.errors.push('lance: 手动释放/过载语义未满足');
    }
  } catch (e) { REPORT.errors.push('lance: ' + e.message); }

  /* ---- v3.3 武器进化（"让每一局都值得讲一遍"的质变时刻） ---- */
  REPORT.evo = {};
  try {
    REPORT.evo.locked = availableEvos(newPlayer()).length === 0;   // 新号不该有可进化项
    const q = newPlayer();
    q.wlv.laser = 5; q.taken.p_shield = 1;
    REPORT.evo.available = availableEvos(q).length;
    REPORT.evo.take = takeEvo(q, 'evo_laser') === true;
    REPORT.evo.dup = takeEvo(q, 'evo_laser') === false;             // 不许重复进化
    REPORT.evo.flag = q.evo.laser === 1;
    REPORT.evo.gone = !availableEvos(q).some(e => e.id === 'evo_laser');
    /* 八条进化逐条验证：条件可达 + apply 不报错 + 标记写对 */
    let allOk = true;
    const q2 = newPlayer();
    for (const e of EVOLUTIONS) {
      q2.evo = {}; q2.wlv = { main: 0, laser: 0, spread: 0, missile: 0, drone: 0, arc: 0, boomer: 0, black: 0 };
      q2.wlv[e.w] = e.lv;
      if (e.card) q2.taken[e.card] = e.need || 1;
      if (!availableEvos(q2).some(x => x.id === e.id)) allOk = false;
      if (!takeEvo(q2, e.id) || q2.evo[e.w] !== 1) allOk = false;
    }
    REPORT.evo.all = allOk;
    /* 抽卡里必须真的能出现"进化"档（不能只存在于数据表里） */
    const q3 = newPlayer();
    q3.wlv.laser = 5; q3.taken.p_shield = 1;
    const hand = drawCards(G, q3, undefined, null);
    REPORT.evo.inHand = hand.some(u => u.tag === '进化');
    if (!REPORT.evo.locked || !REPORT.evo.take || !REPORT.evo.dup || !REPORT.evo.flag ||
        !REPORT.evo.all || !REPORT.evo.inHand) {
      REPORT.errors.push('evo: 武器进化契约未满足');
    }
  } catch (e) { REPORT.errors.push('evo: ' + e.message); }

  /* ---- v3.3 图鉴 / 成就 / 死亡叙事 ---- */
  REPORT.codex = {};
  try {
    const n0 = ENEMY_SEEN.drone | 0;
    codexKill('drone'); codexKill('drone');
    REPORT.codex.kills = (ENEMY_SEEN.drone | 0) === n0 + 2;
    REPORT.codex.persist = !!JSON.parse(localStorage.getItem('rt_codex_v1') || 'null');
    REPORT.codex.rows = ENEMY_CODEX.length === 19;
    REPORT.codex.ach = ACHIEVEMENTS.length >= 20;
    /* 造一个"高光局"，成就必须能解锁（含无伤与进化类） */
    G.player = newPlayer();
    G.player.evo = { missile: 1 };
    G.player.elems = ['ice', 'thunder'];
    G.wave = 30; G.kills = 700; G.score = 60000; G.bossKills = 6;
    G.rxTotal = 40; G.bestCombo = 55; G.playerHits = 0; G.usedOverload = 1; G.isDaily = 1;
    const got = achCheck(G);
    REPORT.codex.unlocked = got.length;
    REPORT.codex.w30 = !!ACH.w30 && !!ACH.noHit10 && !!ACH.evo1;
    REPORT.codex.html = codexEnemyHtml().length > 200 && codexAchHtml().length > 200;
    if (!REPORT.codex.kills || !REPORT.codex.persist || !REPORT.codex.w30 || !REPORT.codex.html) {
      REPORT.errors.push('codex: 图鉴/成就契约未满足');
    }
  } catch (e) { REPORT.errors.push('codex: ' + e.message); }

  REPORT.rxKinds = Object.keys(REPORT.rxCount).length;
  REPORT.rxMissing = REACTIONS.filter(r => !REPORT.rxCount[r.name]).map(r => r.name);
  // 用埋点累加（G.rxTotal 会被重开一局清零，跨局不可比）
  REPORT.rxTotal = Object.keys(REPORT.rxCount).reduce((a, k) => a + REPORT.rxCount[k], 0);
  const __RES = { ok: REPORT.errors.length === 0, ...REPORT };
  console.log(JSON.stringify(__RES, null, 1));
  return __RES;
})();
`;

const src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const script = new vm.Script(src + '\n' + driver, { filename: 'bundle.js' });
const __out = script.runInContext(sandbox, { timeout: 240000 });
/* 失败必须以非零码退出，否则接进 CI 也只是个永远绿的摆设 */
if (!__out || !__out.ok) process.exitCode = 1;
