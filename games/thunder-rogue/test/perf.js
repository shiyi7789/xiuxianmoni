/* =========================================================
   perf.js — 渲染成本回归探针（无头）
   =========================================================
   用途：量化《星际裂隙》每帧的填充率(overdraw)、绘制调用、渐变新建与字符串分配，
        并用「冻结同一帧 + 逐个关图层」做消融归因。

   用法：
     node test/perf.js              正常输出报告
     node test/perf.js --assert     CI 模式：超过阈值则 exit 1

   设计要点（踩过的坑，别改）：
   1) 必须先在装载前初始化帧累加器 —— buildNebula() 在模块顶层就会绘制。
   2) 消融必须「跑一遍 → 冻结一帧 → 同一个 G 上反复 render」，绝不能让各变体各跑一遍
      （否则各组到达波次不同，负载不可比，数据全废）。
   3) 面积必须裁剪到画布视口 —— 屏外部分浏览器不会填充，不裁剪会显著高估。
   4) Math.random 换成定种子 PRNG —— 否则每次跑的战场不同，CI 断言会飘。
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/utils.js', 'js/audio.js', 'js/elements.js', 'js/meta.js', 'js/entities.js', 'js/upgrades.js', 'js/waves.js', 'js/game.js'];
const W = 540, H = 960, SCREEN = W * H;

/* 回归阈值（overdraw 倍数）。超过即判定"画面变卡"，--assert 模式下 exit 1。
   取值由来：2026-09-30 优化后实测 重载 3.19x / 后处理全开 4.17x，各留约 12~15% 余量。
   优化前基线为 4.98x / 7.98x —— 若这条断言被打破，说明有人在渲染层加了全屏叠加。 */
const OVERDRAW_LIMIT = 3.60;   // 重载
const POST_LIMIT     = 4.80;   // 重载 + 后处理全开（4 层全屏叠加场景）

/* ---------------- 记录型 Canvas 2D 上下文 ---------------- */
const R = { cur: null };
function newFrame() {
  R.cur = { ops: {}, area: 0, fsOps: 0, grads: 0, saveDepth: 0, saveMax: 0, imgs: 0, fills: 0, strokes: 0, arcs: 0 };
}
newFrame();
const bump = (k) => { if (R.cur) R.cur.ops[k] = (R.cur.ops[k] || 0) + 1; };
/* 裁剪到画布视口 —— 屏外不产生填充 */
function clipArea(x, y, w, h) {
  const x0 = Math.max(0, Math.min(x, x + w)), x1 = Math.min(W, Math.max(x, x + w));
  const y0 = Math.max(0, Math.min(y, y + h)), y1 = Math.min(H, Math.max(y, y + h));
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}
const addArea = (a) => { if (R.cur && a > 0) { R.cur.area += a; if (a >= SCREEN) R.cur.fsOps++; } };

function makeRecCtx() {
  let box = null;
  const grow = (x, y) => {
    if (!box) box = { x0: x, y0: y, x1: x, y1: y };
    else { if (x < box.x0) box.x0 = x; if (y < box.y0) box.y0 = y; if (x > box.x1) box.x1 = x; if (y > box.y1) box.y1 = y; }
  };
  const bA = () => (box ? clipArea(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0) : 0);
  const bP = () => (box ? 2 * ((box.x1 - box.x0) + (box.y1 - box.y0)) : 0);
  const t = {
    canvas: null, lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', font: '', filter: 'none',
    save() { R.cur.saveDepth++; if (R.cur.saveDepth > R.cur.saveMax) R.cur.saveMax = R.cur.saveDepth; },
    restore() { R.cur.saveDepth--; },
    setTransform() {}, resetTransform() {}, transform() {}, translate() {}, rotate() {}, scale() {},
    clearRect(x, y, w, h) { bump('clearRect'); addArea(clipArea(x, y, w, h)); },
    fillRect(x, y, w, h) { bump('fillRect'); R.cur.fills++; addArea(clipArea(x, y, w, h)); },
    strokeRect(x, y, w, h) { bump('strokeRect'); R.cur.strokes++; addArea(Math.min(clipArea(x, y, w, h) * 2, 2 * (Math.abs(w) + Math.abs(h)) * (this.lineWidth || 1))); },
    beginPath() { box = null; bump('beginPath'); },
    moveTo(x, y) { grow(x, y); }, lineTo(x, y) { grow(x, y); },
    arc(cx, cy, r) { grow(cx - r, cy - r); grow(cx + r, cy + r); R.cur.arcs++; bump('arc'); },
    ellipse(cx, cy, rx, ry) { grow(cx - rx, cy - ry); grow(cx + rx, cy + ry); bump('ellipse'); },
    arcTo(x1, y1, x2, y2) { grow(x1, y1); grow(x2, y2); },
    quadraticCurveTo(cx, cy, x, y) { grow(cx, cy); grow(x, y); },
    bezierCurveTo(a, b, c, d, x, y) { grow(a, b); grow(c, d); grow(x, y); },
    rect(x, y, w, h) { grow(x, y); grow(x + w, y + h); },
    roundRect(x, y, w, h) { grow(x, y); grow(x + w, y + h); },
    closePath() {},
    fill() { bump('fill'); R.cur.fills++; addArea(bA()); },
    stroke() { bump('stroke'); R.cur.strokes++; addArea(bP() * (this.lineWidth || 1)); },
    clip() { bump('clip'); },
    fillText() { bump('fillText'); R.cur.fills++; addArea(40); },
    strokeText() { bump('strokeText'); },
    measureText() { return { width: 12 }; },
    drawImage(img, dx, dy, dw, dh) {
      bump('drawImage'); R.cur.imgs++;
      const w = (dw === undefined ? (img && img.width) || 0 : dw);
      const h = (dh === undefined ? (img && img.height) || 0 : dh);
      addArea(clipArea(dx, dy, w, h));
    },
    createLinearGradient() { R.cur.grads++; bump('createLinearGradient'); return { addColorStop() {} }; },
    createRadialGradient() { R.cur.grads++; bump('createRadialGradient'); return { addColorStop() {} }; },
    createPattern() { return {}; }, setLineDash() {}, getLineDash() { return []; }, isPointInPath() { return false; },
  };
  return new Proxy(t, {
    get(o, p) { if (p in o) return o[p]; if (typeof p === 'symbol') return undefined; return () => {}; },
    set(o, p, v) { o[p] = v; return true; },
  });
}
function makeCanvas() {
  const c = {
    width: 300, height: 150, style: { width: '', height: '' },
    getContext: () => makeRecCtx(), addEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
  return c;
}
const els = new Map();
function makeEl(id) {
  return {
    id, textContent: '', innerHTML: '', className: '', value: '', dataset: {}, children: [],
    offsetWidth: W, clientWidth: W, clientHeight: H,
    style: new Proxy({}, { get: () => '', set: () => true }),
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } },
    addEventListener(t, f) { (this._h = this._h || {})[t] = f; }, removeEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, appendChild(n) { this.children.push(n); },
    setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
    setPointerCapture() {}, releasePointerCapture() {}, focus() {}, blur() {},
  };
}
const documentStub = {
  getElementById(id) { if (!els.has(id)) els.set(id, id === 'cv' ? makeCanvas() : makeEl(id)); return els.get(id); },
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl('_' + tag); },
  querySelectorAll() { return []; }, querySelector() { return null; },
  addEventListener(t, f) { (this._h = this._h || {})[t] = f; },
  body: makeEl('body'), documentElement: makeEl('html'),
};

/* 定种子 PRNG —— 让战场可复现，CI 断言才不飘 */
let _seed = 0x2f6e2b1;
function seededRandom() {
  _seed ^= _seed << 13; _seed >>>= 0;
  _seed ^= _seed >>> 17;
  _seed ^= _seed << 5; _seed >>>= 0;
  return _seed / 4294967296;
}
const mathStub = Object.create(Math);
mathStub.random = seededRandom;

const sandbox = {
  console, document: documentStub, __raf: [], __now: 0,
  requestAnimationFrame: (cb) => { sandbox.__raf.push(cb); return sandbox.__raf.length; },
  cancelAnimationFrame() {}, setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => sandbox.__now },
  Math: mathStub, Date, JSON, Number, String, Array, Object, Set, Map, Error, isNaN,
  parseInt, parseFloat, Boolean, Symbol, Proxy, Reflect, Promise,
};
sandbox.window = {
  devicePixelRatio: 1, innerWidth: W, innerHeight: H,
  addEventListener(t, f) { (this._h = this._h || {})[t] = f; }, removeEventListener() {},
  requestAnimationFrame: sandbox.requestAnimationFrame, localStorage: null,
};
sandbox.localStorage = { _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

const loadErr = [];
for (const f of FILES) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }); }
  catch (e) { loadErr.push(f + ': ' + e.message); }
}

/* ---------------- 驱动 ---------------- */
/* 预热帧数：让玩家拿到武器/元素，使 drawPlayer / drawLance 走真实路径 */
const WARMUP = 12000;

const driver = `
(function () {
  const REPORT = { rgba: 0, hex: 0, glow: 0, err: [], snaps: [] };
  const _rgba = rgba; rgba = function (h, a) { REPORT.rgba++; return _rgba(h, a); };
  const _hex = hexRgb; hexRgb = function (h) { REPORT.hex++; return _hex(h); };
  const _dg = drawGlow; drawGlow = function (c, x, y, d, col, al, sf) { REPORT.glow++; return _dg(c, x, y, d, col, al, sf); };

  const ORIG = { drawBackground: drawBackground, drawVignette: drawVignette,
                 drawGlow: drawGlow, drawWorld: drawWorld };
  const VARIANTS = ['base', 'noVig', 'noBg', 'noGlow', 'noWorld', 'noBgNoVig'];
  function applyVariant(v) {
    drawBackground = ORIG.drawBackground; drawVignette = ORIG.drawVignette;
    drawGlow = ORIG.drawGlow; drawWorld = ORIG.drawWorld;
    if (v === 'noVig') drawVignette = function () {};
    if (v === 'noBg') drawBackground = function () {};
    if (v === 'noGlow') drawGlow = function () {};
    if (v === 'noWorld') drawWorld = function () {};
    if (v === 'noBgNoVig') { drawBackground = function () {}; drawVignette = function () {}; }
  }

  startGame();
  hurtPlayer = function () {};

  function frame() { const q = __raf.slice(); __raf.length = 0; __now += 16.7; for (const cb of q) cb(__now); }
  function press(k, on) { keys[k] = on; }
  function load() {
    return { wave: G.wave, lv: G.player ? G.player.level : 0, hp: G.player ? Math.round(G.player.hp) : 0,
      nE: (G.enemies || []).length, nEB: (G.eBullets || []).length, nPB: (G.pBullets || []).length,
      nP: (G.particles || []).length, nOrb: (G.orbs || []).length, nSt: (G.enemies || []).filter(e => e.st).length };
  }

  /* 定量灌注：负载完全确定，不依赖"自然打到高波次"（那是随机的，回归测试会飘） */
  const PAIRS = [['ice','fire'], ['ice','thunder'], ['fire','toxin'], ['ice','void'], ['fire','light'], ['toxin','light']];
  const TYPES = Object.keys(ENEMY_DEFS);
  function inject(spec) {
    G.state = 'playing';
    G.shake = 0; G.flash = 0;
    G.enemies.length = 0; G.eBullets.length = 0; G.pBullets.length = 0;
    G.particles.length = 0; G.orbs.length = 0; G.zaps.length = 0;
    if (G.hazards) G.hazards.length = 0;
    if (G.fogs) G.fogs.length = 0;
    if (G.shards) G.shards.length = 0;
    const p = G.player;
    p.dead = false; p.invuln = 0; p.hurtFlash = 0;
    p.hp = spec.post ? p.maxHp * 0.2 : p.maxHp;
    p.slowT = spec.post ? 5 : 0;
    p.shield = 0; p.shieldPulse = 0;
    G.zeroSlow = !!spec.post;
    G.resonateT = 0;
    G.flash = 0;

    for (let i = 0; i < spec.nE; i++) {
      const e = makeEnemy(G, TYPES[i % TYPES.length], 56 + (i % 6) * 86, 110 + Math.floor(i / 6) * 92, { hpMul: 60 });
      e.st = {};
      for (const k of PAIRS[i % PAIRS.length]) e.st[k] = { n: 3, t: 99, dmg: 10, src: k };
      G.enemies.push(e);
    }
    for (let i = 0; i < spec.nEB; i++) spawnEBullet(G, 30 + (i * 37) % 480, 70 + (i * 53) % 520, (i % 12) * 0.5236, 110 + (i % 7) * 22, {});
    for (let i = 0; i < spec.nPB; i++) spawnPBullet(G, 30 + (i * 29) % 480, 790 + (i % 3) * 11, -Math.PI / 2, {});
    for (let i = 0; i < spec.nP; i++) {
      G.particles.push({ x: 20 + (i * 41) % 500, y: 50 + (i * 67) % 830, vx: 40, vy: -60,
        life: 0.4, max: 0.6, size: 4 + (i % 3) * 3.2,
        color: i % 3 === 0 ? '#ffe08a' : (i % 3 === 1 ? '#7ef9ff' : '#ff8a3d'),
        kind: i % 3 === 0 ? 'ring' : (i % 3 === 1 ? 'spark' : 'smoke') });
    }
    for (let i = 0; i < spec.nOrb; i++) G.orbs.push({ x: 40 + (i * 73) % 460, y: 150 + (i * 61) % 700, vx: 30, vy: 40, val: 1, t: i * 0.31, mag: false, life: 12, r: 5.4 });
  }

  function snapshot(tag, spec) {
    inject(spec);
    const g = load(); g.tag = tag; g.rows = [];
    for (const v of VARIANTS) {
      applyVariant(v);
      __reset();
      const N = 180;
      for (let k = 0; k < N; k++) { __nf(); try { render(1 / 60); } catch (e) { if (REPORT.err.length < 3) REPORT.err.push(v + ': ' + e.message); } __acc(); }
      g.rows.push({ v: v, m: __agg(N) });
    }
    applyVariant('base');
    REPORT.snaps.push(g);
  }

  /* --- 预热：正常游玩，攒出武器 / 元素 / 等级 --- */
  let guard = 0;
  while (guard < __W) {
    guard++;
    try {
      if (G.state === 'levelup') {
        if (G.gateOn) {
          const id = ELEMENT_ORDER.find(x => G.player.elems.indexOf(x) < 0);
          if (id) pickElement(id); else document.getElementById('btnBan')._h.click({});
        } else if (typeof curCards !== 'undefined' && curCards.length) pickCard(curCards[Math.floor(Math.random() * curCards.length)]);
      }
      if (G.state === 'playing' && G.player) {
        const pl = G.player; let tx = pl.x;
        const alive = G.enemies.filter(e => !e.dead);
        let low = null; for (const e of alive) if (!low || e.y > low.y) low = e;
        if (low) tx = low.x;
        tx = Math.max(30, Math.min(510, tx));
        press('a', pl.x > tx + 5); press('d', pl.x < tx - 5);
        press('w', pl.y > 742); press('s', pl.y < 758);
      }
      frame();
    } catch (e) { if (REPORT.err.length < 3) REPORT.err.push('warmup: ' + e.message); }
  }

  snapshot('轻载',        { nE: 6,  nEB: 30,  nPB: 12, nP: 40,  nOrb: 6,  post: false });
  snapshot('重载',        { nE: 30, nEB: 130, nPB: 40, nP: 260, nOrb: 24, post: false });
  snapshot('重载+后处理全开', { nE: 30, nEB: 130, nPB: 40, nP: 260, nOrb: 24, post: true });

  REPORT.cacheKeysEnd = _glowCache.size;
  return REPORT;
})()
`;
sandbox.__W = WARMUP;

let ACC = null;
sandbox.__nf = newFrame;
sandbox.__reset = () => { ACC = { area: 0, fs: 0, grads: 0, imgs: 0, fills: 0, strokes: 0, arcs: 0, saveMax: 0, ops: {} }; };
sandbox.__acc = () => {
  ACC.area += R.cur.area; ACC.fs += R.cur.fsOps; ACC.grads += R.cur.grads;
  ACC.imgs += R.cur.imgs; ACC.fills += R.cur.fills; ACC.strokes += R.cur.strokes; ACC.arcs += R.cur.arcs;
  ACC.saveMax = Math.max(ACC.saveMax, R.cur.saveMax);
  for (const k in R.cur.ops) ACC.ops[k] = (ACC.ops[k] || 0) + R.cur.ops[k];
};
sandbox.__agg = (N) => ({
  overdraw: (ACC.area / N) / SCREEN, fs: ACC.fs / N,
  fillRect: (ACC.ops.fillRect || 0) / N, drawImage: (ACC.ops.drawImage || 0) / N,
  fills: ACC.fills / N, strokes: ACC.strokes / N, arcs: ACC.arcs / N,
  grads: ACC.grads / N, beginPath: (ACC.ops.beginPath || 0) / N,
  cLG: (ACC.ops.createLinearGradient || 0) / N, cRG: (ACC.ops.createRadialGradient || 0) / N,
  saveMax: ACC.saveMax,
});

const res = vm.runInContext(driver, sandbox, { filename: 'driver' });

/* ---------------- 报告 ---------------- */
const L = [];
L.push('===== 渲染成本回归报告 =====');
L.push('画布 ' + W + 'x' + H + ' | 屏幕像素 ' + SCREEN + ' | dpr 上限 2 → 真机设备像素 ' + (W * 2 * H * 2) + ' (填充率 x4)');
if (loadErr.length) L.push('!! 装载错误: ' + loadErr.join(' | '));
if (res.err && res.err.length) L.push('!! 运行期错误: ' + res.err.join(' | '));
L.push('');

let heavyBase = 0, postBase = 0;
for (const s of res.snaps) {
  L.push('── 负载 [' + s.tag + ']  Wave ' + s.wave + '  Lv' + s.lv + '  敌' + s.nE + ' 敌弹' + s.nEB + ' 我弹' + s.nPB + ' 粒子' + s.nP + ' 晶体' + s.nOrb + ' 碎片' + s.nSh + ' 危害' + s.nHaz + ' 雾' + s.nFog);
  L.push('   variant     overdraw  全屏op  fillRect drawImg   fill stroke  arc  渐变 beginPath');
  for (const r of s.rows) {
    const m = r.m;
    L.push('   ' + (r.v + '           ').slice(0, 11) +
      (m.overdraw.toFixed(2) + 'x').padStart(9) + m.fs.toFixed(1).padStart(7) +
      m.fillRect.toFixed(0).padStart(9) + m.drawImage.toFixed(0).padStart(8) +
      m.fills.toFixed(0).padStart(6) + m.strokes.toFixed(0).padStart(7) + m.arcs.toFixed(0).padStart(6) +
      m.grads.toFixed(2).padStart(7) + m.beginPath.toFixed(0).padStart(9));
  }
  const b = s.rows[0].m.overdraw;
  const att = s.rows.slice(1).map(r => r.v + ' ' + (r.m.overdraw - b).toFixed(2)).join('  |  ');
  L.push('   Δ归属: ' + att);
  if (s.tag === '重载') heavyBase = b;
  if (s.tag === '重载+后处理全开') postBase = b;
  L.push('');
}
const frames = WARMUP;
L.push('── 分配压力（全程 ' + frames + ' 帧）');
L.push('   rgba() ' + (res.rgba / frames).toFixed(1) + '/帧    hexRgb() ' + (res.hex / frames).toFixed(1) + '/帧    drawGlow ' + (res.glow / frames).toFixed(1) + '/帧');
L.push('   glowSprite 缓存 key ' + res.cacheKeysEnd + '（不随帧数增长 = 健康）');
L.push('');
const passHeavy = heavyBase > 0 && heavyBase <= OVERDRAW_LIMIT;
const passPost  = postBase  > 0 && postBase  <= POST_LIMIT;
const passes = passHeavy && passPost;
L.push('── 断言');
L.push('   [1] 重载帧 overdraw        ' + heavyBase.toFixed(2) + 'x  (上限 ' + OVERDRAW_LIMIT.toFixed(2) + 'x)  → ' + (passHeavy ? 'PASS' : 'FAIL'));
L.push('   [2] 重载+后处理全开 overdraw ' + postBase.toFixed(2) + 'x  (上限 ' + POST_LIMIT.toFixed(2) + 'x)  → ' + (passPost ? 'PASS' : 'FAIL'));

const out = L.join('\n');
process.stdout.write(out + '\n');

if (process.argv.includes('--assert')) {
  const bad = !passes || (res.err && res.err.length) || loadErr.length;
  process.exit(bad ? 1 : 0);
}
