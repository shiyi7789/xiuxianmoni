/* =========================================================
   game.js — 主循环 / 碰撞 / 特效 / UI 状态机
   ========================================================= */
'use strict';

const W = 540, H = 960;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let dpr = 1;

/* ---------------------------------------------------------
   全局状态
   --------------------------------------------------------- */
const G = {
  state: 'menu',            // menu | playing | levelup | paused | over
  t: 0, dt: 0,
  shake: 0, flash: 0, hitStop: 0, timeScale: 1,
  wave: 0, score: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0,
  elapsed: 0,
  enemies: [], pBullets: [], eBullets: [], orbs: [], particles: [],
  texts: [], pickups: [], zaps: [], holes: [], volleys: [],
  /* v2 新增实体容器：晶刺 / 地面危害区 / 毒雾 / 折射光束 / 贯穿残痕 */
  shards: [], hazards: [], fogs: [], refracts: [], wakes: [],
  player: null,
  waveGroups: [], waveTimer: 0, wavePhase: 'idle', phaseT: 0,
  boss: null, bossIndex: 0,
  pendingLevels: 0,
  lvQueue: [],              // 待结算的等级队列（元素门按等级号判定，不能只看 pendingLevels）
  bonusPicks: 0,            // 波次预支带来的额外升级次数
  gateOn: false,            // 本次升级是否为元素门
  waveHpMul: 1, nextHpMul: 1,
  zeroSlow: 0,              // 零域冰封：全场敌方时缓
  resonateT: 0,             // 拾取共鸣：全场敌方时缓剩余时长
  rxTotal: 0,               // 本局元素反应触发总数（结算展示用）
  _banner: document.getElementById('banner'),
  _toast: document.getElementById('toast'),
  _bossbar: document.getElementById('bossbar'),
  banner(text, danger = false) {
    const el = this._banner;
    el.textContent = text;
    el.className = 'banner' + (danger ? ' danger' : '');
    void el.offsetWidth;
    el.classList.add('show');
  },
  toast(text) {
    const el = this._toast;
    el.textContent = text;
    el.className = 'toast';
    void el.offsetWidth;
    el.classList.add('show');
  },
  introHint(text) { this.toast(text); },
};

let G_playerRef = null;

/* ---------------------------------------------------------
   画布尺寸
   --------------------------------------------------------- */
function resize() {
  const stage = document.getElementById('stage');
  const frame = document.getElementById('frame');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const aw = stage.clientWidth, ah = stage.clientHeight;
  const s = Math.max(0.15, Math.min(aw / W, ah / H));
  const cw = Math.floor(W * s), ch = Math.floor(H * s);
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  frame.style.width = cw + 'px';
  frame.style.height = ch + 'px';
}
window.addEventListener('resize', resize);

/* ---------------------------------------------------------
   背景（星空 + 星云）
   --------------------------------------------------------- */
const stars = [];
function initStars() {
  stars.length = 0;
  for (let i = 0; i < 190; i++) {
    const layer = randInt(0, 2);
    stars.push({
      x: rand(W), y: rand(H),
      z: layer,
      r: [0.9, 1.5, 2.3][layer],
      spd: [28, 62, 112][layer],
      a: [0.35, 0.6, 0.95][layer],
      tw: rand(TAU),
    });
  }
}
let nebula = null;
function buildNebula() {
  nebula = document.createElement('canvas');
  nebula.width = W; nebula.height = H;
  const g = nebula.getContext('2d');
  const colors = ['#1b3a6b', '#3a1b5e', '#0d3a44', '#4a1a3a', '#1a2f5e'];
  for (let i = 0; i < 16; i++) {
    const x = rand(W), y = rand(H), r = rand(320, 120);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const c = pick(colors);
    grd.addColorStop(0, rgba(c, 0.5));
    grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 网格地平线，增加"空间站"工业感
  g.strokeStyle = 'rgba(126,249,255,.05)';
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 45) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 45) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}

let bgScroll = 0;
function drawBackground(dt) {
  ctx.fillStyle = '#04060d';
  ctx.fillRect(0, 0, W, H);

  bgScroll = (bgScroll + dt * 26) % H;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(nebula, 0, bgScroll - H);
  ctx.drawImage(nebula, 0, bgScroll);
  ctx.globalAlpha = 1;

  // 星点
  for (const s of stars) {
    s.y += s.spd * dt * (G.timeScale || 1);
    s.tw += dt * 3;
    if (s.y > H + 4) { s.y = -4; s.x = rand(W); }
    const a = s.a * (0.75 + Math.sin(s.tw) * 0.25);
    if (s.z === 2) {
      ctx.fillStyle = rgba('#bff4ff', a);
      ctx.fillRect(s.x, s.y, s.r, s.r * 2.6);
    } else {
      ctx.fillStyle = rgba('#9fd8ff', a);
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }

  // 顶部危险渐隐
  const g2 = ctx.createLinearGradient(0, 0, 0, 150);
  g2.addColorStop(0, 'rgba(255,60,90,.10)');
  g2.addColorStop(1, 'rgba(255,60,90,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, 150);
}

/* ---------------------------------------------------------
   玩家
   --------------------------------------------------------- */
function xpFor(level) {
  return Math.floor(7 + level * 3.6 + Math.pow(level, 1.72));
}

function newPlayer() {
  return {
    x: W / 2, y: H - 160, r: 13,
    hp: 100, maxHp: 100, invuln: 0, hurtFlash: 0, deadT: 0,
    level: 1, xp: 0, xpNext: xpFor(1), xpMul: 1,
    rerolls: 1, taken: {}, buildLog: [], wlv: { main: 1 },
    cd: { main: 0, laser: 0, spread: 0, missile: 0, drone: 0, arc: 0, boomer: 0, black: 0 },
    drones: [], droneAngle: 0,
    stats: {
      dmg: 1, rate: 1, mvSpd: 1, pspd: 1, pierce: 0, crit: 0.06, critMult: 1.8,
      magnet: 78, luck: 0, xpGain: 1, regen: 0, contactRes: 1, extraShots: 0,
      /* v2：构筑 / 转化 / 触发 / 元素 系的动态字段 */
      synergy: 0, shieldDmg: 0, bastion: 0, pierceGrow: 0, volley: 0,
      chain: 0, prism: 0, shatter: 0, riposte: 0, resonate: 0,
      tFocus: 0, tNarrow: 0, tColumn: 0, tSplit: 0, lance: 0,
      spec: 0, specMain: null, specKinds: 0,
      elemExtra: 0, elemDur: 1, elemPure: 0, duplex: 0, energyMax: 100,
    },
    shield: 0, shieldMax: 0, shieldTimer: 0, shieldPulse: 0,
    noShield: 0, removed: {}, sixPick: 0,
    elems: [],                       // 元素（上限 2，Lv4 / Lv9 各一次，不进卡池）
    energy: 0, lanceOn: false, lanceCd: 0,
    stillT: 0, _bastionK: 0, fieldSlow: 0, pickupN: 0,
    // 主动
    dashLv: 0, dashCd: 0, dashCdMax: 6, dashT: 0, dashVX: 0, dashVY: 0,
    bombCount: 0, bombDmg: 1, bombCd: 0,
    slowLv: 0, slowT: 0, slowCd: 0, slowCdMax: 18, slowDur: 3,
    trail: [],
  };
}

/* ---------------------------------------------------------
   波次流程
   --------------------------------------------------------- */
function startWave(n) {
  G.wave = n;
  G.wavePhase = 'intro';
  G.phaseT = (n % 5 === 0) ? 2.0 : 1.15;
  /* 难度偿还：上一波用「波次预支」借来的血量倍率在本波生效（小怪与 Boss 都吃） */
  G.waveHpMul = G.nextHpMul || 1;
  G.nextHpMul = 1;
  if (n % 5 === 0) {
    G.bossIndex++;
    G.banner('BOSS 来袭', true);
    SFX.play('bossWarn');
  } else {
    G.banner((n === 1 || n === 5) ? '第 ' + n + ' 波' : String(n).padStart(2, '0'), false);
  }
}

function beginCombat() {
  const n = G.wave;
  if (n % 5 === 0) {
    const b = makeBoss(G, G.bossIndex);
    G.boss = b;
    G.enemies.push(b);
    G._bossbar.classList.remove('hidden');
    document.getElementById('bbName').textContent = b.name;
  } else {
    const plan = G.wavePlan;
    G.waveGroups = plan.groups;
    G.waveTimer = 0;
  }
  G.wavePhase = 'combat';
}

function waveCleared() {
  G.wavePhase = 'clear';
  G.phaseT = 1.75;
  G.boss = null;
  G._bossbar.classList.add('hidden');
  if (G.wave % 5 === 0) {
    G.banner('核心瓦解', false);
    G.flash = 0.9;
    G.shake = 16;
    SFX.play('bigKill');
  } else {
    G.banner('波次清除', false);
    SFX.play('waveover');
  }
  // 呼吸窗：吸附全部经验 + 每 3 波回血
  for (const o of G.orbs) o.mag = true;
  if (G.wave % 3 === 0) {
    const heal = G.player.maxHp * 0.10;
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + heal);
    G.toast('装甲回复 +' + Math.round(heal));
    SFX.playAt('heal', G.player.x, G.player.y);
  }
  /* 波次预支（y_prepay）：呼吸窗内补发额外升级次数（代价已在下一波血量里偿还） */
  if (G.bonusPicks > 0) {
    const n = G.bonusPicks;
    G.bonusPicks = 0;
    for (let i = 0; i < n; i++) { G.pendingLevels++; G.lvQueue.push(G.player.level); }
    G.toast('波次预支 · 额外 ' + n + ' 次强化');
    openLevelUp();
  }
}

/* ---------------------------------------------------------
   伤害 / 拾取
   --------------------------------------------------------- */
function hurtPlayer(amount) {
  const p = G.player;
  if (!p || p.invuln > 0 || G.state !== 'playing') return;
  // 弹幕伤害随波次极缓成长，保证后期压迫感（上限 1.6x）
  const waveMul = clamp(1 + (G.wave - 1) * 0.012, 1, 1.6);
  let dmg = amount * waveMul * p.stats.contactRes;
  // 护盾优先吸收
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    p.shieldPulse = 1;
    SFX.playAt('shield', p.x, p.y);
    G.shake = Math.min(16, G.shake + 2.5);
    if (dmg <= 0) { p.invuln = 0.5; p.shieldTimer = 0; return; }
  }
  p.hp -= dmg;
  p.invuln = 1.15;
  p.hurtFlash = 1;
  p.shieldTimer = 0;
  G.shake = Math.min(16, G.shake + 6);
  G.flash = Math.max(G.flash, 0.55);
  G.combo = 0;
  SFX.playAt('hurt', p.x, p.y);
  for (let i = 0; i < 14; i++) {
    const a = rand(TAU);
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * rand(280, 60), vy: Math.sin(a) * rand(280, 60),
      life: 0.5, max: 0.5, size: 4, color: '#ff5566', kind: 'spark' });
  }
  if (p.hp <= 0) {
    p.hp = 0;
    gameOver();
    return;
  }
  /* 触发类卡：受伤反噬（把"受伤"变成资源） */
  if (p.stats.riposte && G.t >= (p._ripCd || 0)) {
    p._ripCd = G.t + 7;
    const R = 240;
    for (const b of G.eBullets) {
      if (b.dead) continue;
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < R * R) b.dead = true;
    }
    for (const e of G.enemies.slice()) {
      if (e.dead || e.isBoss) continue;
      const d = dist(e, p);
      if (d > R) continue;
      damageEnemy(G, e, p.maxHp * 0.18 * p.stats.riposte, { noElem: true, src: 'rx', pure: true, big: true });
      const a = angTo(p, e);
      e.x += Math.cos(a) * 44; e.y += Math.sin(a) * 44;   // 击退
    }
    G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: R * 2.4, color: '#ff5566', kind: 'ring' });
    G.shake = Math.min(16, G.shake + 8);
    SFX.playAt('bomb', p.x, p.y);
  }
}

/** 环境伤害（熔渣 / 静电场）：绕过无敌帧，但照样吃护盾与减伤 */
function damagePlayerRaw(G, amount) {
  const p = G.player;
  if (!p || G.state !== 'playing' || amount <= 0) return;
  let d = amount * p.stats.contactRes;
  if (p.shield > 0) {
    const a = Math.min(p.shield, d);
    p.shield -= a; d -= a;
    p.shieldPulse = 1;
  }
  if (d <= 0) return;
  p.hp -= d;
  p.hurtFlash = Math.max(p.hurtFlash, 0.45);
  G.combo = 0;
  if (!p._rawHit || G.t - p._rawHit > 0.45) {
    p._rawHit = G.t;
    SFX.playAt('hurt', p.x, p.y);
    G.shake = Math.min(16, G.shake + 1.5);
  }
  if (p.hp <= 0) { p.hp = 0; gameOver(); }
}

function gainXp(amount) {
  const p = G.player;
  p.xp += amount * p.stats.xpGain;
  let guard = 0;
  while (p.xp >= p.xpNext && guard++ < 40) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = Math.round(xpFor(p.level) * (p.xpMul || 1));
    G.pendingLevels++;
    G.lvQueue.push(p.level);
  }
  if (G.pendingLevels > 0 && G.state === 'playing') openLevelUp();
}

/** 弹丸消失处的小爆（t_narrow「散射聚合」：半径 34，伤害 = 该发 ×0.5） */
function bulletBurst(G, b) {
  const r = b.burst;
  if (!r) return;
  b.burst = 0;
  const dmg = b.dmg * 0.5;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (r + e.r) ** 2) {
      damageEnemy(G, e, dmg, { src: b.src, big: false });
    }
  }
  G.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.18, max: 0.18, size: r * 2.4, color: '#dff6ff', kind: 'ring' });
}

/* ---------------------------------------------------------
   主动技能
   --------------------------------------------------------- */
function doDash() {
  const p = G.player;
  if (!p.dashLv || p.dashCd > 0 || G.state !== 'playing') return;
  let dx = 0, dy = 0;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (dx === 0 && dy === 0) { dx = ptr.active ? (ptr.dx || 0) : 0; dy = ptr.active ? (ptr.dy || 1) : -1; }
  if (dx === 0 && dy === 0) dy = -1;
  const m = Math.hypot(dx, dy) || 1;
  p.dashVX = dx / m * 1350;
  p.dashVY = dy / m * 1350;
  p.dashT = 0.34 + p.dashLv * 0.06;
  p.dashCd = p.dashCdMax;
  p.invuln = Math.max(p.invuln, p.dashT + 0.1);
  SFX.playAt('dash', p.x, p.y);
  for (let i = 0; i < 20; i++) {
    G.particles.push({ x: p.x, y: p.y, vx: rand(220, -220), vy: rand(220, -220),
      life: 0.4, max: 0.4, size: 4.5, color: '#7ef9ff', kind: 'spark' });
  }
}

function doBomb() {
  const p = G.player;
  if (p.bombCount <= 0 || G.state !== 'playing') return;
  p.bombCount--;
  G.flash = 1;
  G.shake = 16;
  G.hitStop = 0.1;
  SFX.playAt('bomb', p.x, p.y);
  G.eBullets.length = 0;
  const dmg = 90 * p.bombDmg * p.stats.dmg;
  for (const e of G.enemies) if (!e.dead) damageEnemy(G, e, dmg, { crit: false, big: true, showText: false });
  for (let i = 0; i < 90; i++) {
    const a = rand(TAU), s = rand(760, 120);
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(1.0, 0.4), max: 1.0, size: rand(7, 2.5), color: chance(0.4) ? '#ffffff' : '#ffd166', kind: 'spark' });
  }
  G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.9, max: 0.9, size: 1500, color: '#ffd166', kind: 'ring' });
  G.banner('湮灭', false);
}

function doSlow() {
  const p = G.player;
  if (!p.slowLv || p.slowCd > 0 || G.state !== 'playing') return;
  p.slowT = p.slowDur;
  p.slowCd = p.slowCdMax;
  SFX.playAt('slow', p.x, p.y);
  SFX.setSlow(true);
  G.toast('时间畸变');
  for (let i = 0; i < 40; i++) {
    const a = rand(TAU);
    G.particles.push({ x: p.x + Math.cos(a) * 300, y: p.y + Math.sin(a) * 300,
      vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260,
      life: 0.6, max: 0.6, size: 5, color: '#4ea8ff', kind: 'spark' });
  }
}

/* ---------------------------------------------------------
   输入
   --------------------------------------------------------- */
const keys = {};
const ptr = { active: false, x: W / 2, y: H - 160, dx: 0, dy: 0, px: 0, py: 0 };

function toGame(clientX, clientY) {
  const r = cv.getBoundingClientRect();
  return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
}

cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const g = toGame(e.clientX, e.clientY);
  ptr.active = true; ptr.x = g.x; ptr.y = g.y;
  ptr.px = g.x; ptr.py = g.y; ptr.dx = 0; ptr.dy = 0;
  SFX.resume();
});
cv.addEventListener('pointermove', (e) => {
  if (!ptr.active) return;
  const g = toGame(e.clientX, e.clientY);
  ptr.dx = clamp((g.x - ptr.px) * 0.22, -1, 1);
  ptr.dy = clamp((g.y - ptr.py) * 0.22, -1, 1);
  ptr.px = g.x; ptr.py = g.y;
  ptr.x = g.x; ptr.y = g.y;
});
const endPtr = (e) => { ptr.active = false; ptr.dx = 0; ptr.dy = 0; };
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === ' ') { doDash(); }
  if (k === 'q') doBomb();
  if (k === 'e') doSlow();
  if (k === 'p') { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); }
  if (k === 'm') { const on = SFX.toggleMute(); G.toast(on ? '音效开启' : '音效关闭'); }
  {
    const cx = document.getElementById('codex');
    if (k === 'c' && (G.state === 'menu' || G.state === 'paused')) {
      if (cx.classList.contains('hidden')) openCodex(); else closeCodex();
    }
    if (k === 'escape' && !cx.classList.contains('hidden')) closeCodex();
  }
  if (G.state === 'levelup') {
    if (k >= '1' && k <= '6') {
      const n = Number(k) - 1;
      if (G.gateOn) {
        const ec = document.querySelectorAll('#elemCards .ecard[data-el]')[n];
        if (ec) ec.click();
      } else {
        const card = document.querySelectorAll('#cards .card')[n];
        if (card) card.click();
      }
    }
    if (k === 'r' && !G.gateOn) document.getElementById('btnReroll').click();
  }
  if (G.state === 'menu' && k === 'enter') document.getElementById('btnStart').click();
  if (G.state === 'over' && k === 'enter') document.getElementById('btnRetry').click();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  endPtr();
  if (G.state === 'playing') pauseGame();
});

/* ---------------------------------------------------------
   更新：玩家
   --------------------------------------------------------- */
function updatePlayer(dt) {
  const p = G.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 3);
  p.shieldPulse = Math.max(0, p.shieldPulse - dt * 3);
  if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.slowCd > 0) p.slowCd = Math.max(0, p.slowCd - dt);
  if (p.slowT > 0) p.slowT -= dt;
  if (p.fieldSlow > 0) p.fieldSlow = Math.max(0, p.fieldSlow - dt);

  // 护盾充能
  if (p.shieldMax > 0) {
    p.shieldTimer += dt;
    if (p.shieldTimer > 4 && p.shield < p.shieldMax) {
      p.shield = Math.min(p.shieldMax, p.shield + p.shieldMax * 0.34 * dt);
    }
  }
  // 生命回复
  if (p.stats.regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);

  // 冲刺
  let moved = false;
  const _px = p.x, _py = p.y;   // 用于测出真实位移 → 驱动引擎尾焰长度
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dashVX * dt;
    p.y += p.dashVY * dt;
    moved = true;
    if (chance(dt * 40)) {
      G.particles.push({ x: p.x, y: p.y, vx: rand(60, -60), vy: rand(60, -60),
        life: 0.35, max: 0.35, size: 6, color: '#7ef9ff', kind: 'smoke' });
    }
  } else {
    // 键盘
    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    const base = 395 * p.stats.mvSpd * (p.fieldSlow > 0 ? 0.6 : 1);
    if (dx || dy) {
      const m = Math.hypot(dx, dy) || 1;
      p.x += dx / m * base * dt;
      p.y += dy / m * base * dt;
      moved = true;
    } else if (ptr.active) {
      // 指针跟随（触屏偏移 44px 避免手指遮挡舰体）
      const tx = ptr.x, ty = ptr.y - 44;
      const ddx = tx - p.x, ddy = ty - p.y;
      const d = Math.hypot(ddx, ddy);
      if (d > 1) {
        const step = Math.min(d, base * 2.4 * dt);
        p.x += ddx / d * step;
        p.y += ddy / d * step;
        if (step > 0.6 * dt) moved = true;
      }
    }
  }
  /* 静止炮台：静止 ≥1.5s 蓄满，移动后 0.6s 内线性衰减（冲刺会中断加成） */
  if (p.stats.bastion) {
    if (moved) p.stillT = 0; else p.stillT += dt;
    const k = p.stillT >= 1.5 ? 1 : 0;
    p._bastionK = clamp((p._bastionK || 0) + (k ? dt / 0.6 : -dt / 0.6), 0, 1);
  }

  p.x = clamp(p.x, 18, W - 18);
  p.y = clamp(p.y, 38, H - 26);
  p._spd = Math.hypot(p.x - _px, p.y - _py) / Math.max(1e-6, dt);

  // 尾迹
  p.trail.unshift({ x: p.x, y: p.y + 12 });
  if (p.trail.length > 14) p.trail.pop();

  updateWeapons(G, p, dt);
}

/* ---------------------------------------------------------
   更新：世界
   --------------------------------------------------------- */
function updateWorld(dt) {
  const p = G.player;
  /* 敌方时缓：时间畸变（×0.35）× 零域冰封（×0.5）× 拾取共鸣（×0.55），三者可叠乘 */
  if (G.resonateT > 0) G.resonateT = Math.max(0, G.resonateT - dt);
  const slowFactor = (p.slowT > 0 ? 0.35 : 1) * (G.zeroSlow ? 0.5 : 1) * (G.resonateT > 0 ? 0.55 : 1);
  G.timeScale = slowFactor;
  const wdt = dt * slowFactor;

  // 延时队列
  for (let i = G.volleys.length - 1; i >= 0; i--) {
    const v = G.volleys[i];
    v.t -= wdt;
    if (v.t <= 0) { v.fire(); G.volleys.splice(i, 1); }
  }

  // 敌人
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.isBoss) updateBoss(G, e, wdt);
    else updateEnemy(G, e, wdt);
  }
  G.enemies = G.enemies.filter(e => {
    if (e.dead) return false;
    // 数值守卫：任何因极端组合导致状态异常的敌人直接回收，避免出现无法击杀的幽灵单位
    if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) return false;
    if (!e.isBoss && (e.y > H + 90 || e.x < -160 || e.x > W + 160)) {
      // 逃出屏幕的敌人：不惩罚，直接回收（保持波次推进）
      return false;
    }
    return true;
  });

  /* ---- v2：元素状态统一 tick（0.12s 分批 24；含冻结倒计时与满层触发） ---- */
  elemTick(G, wdt);
  /* ---- v2：场地物件与地面危害区生命周期 ---- */
  updateShards(G, wdt);
  updateHazards(G, wdt);
  /* ---- v2：毒雾（火+毒 · 焚毒雾）：雾内敌人每秒 +2 层燃烧 ---- */
  if (G.fogs.length) {
    for (const f of G.fogs) {
      f.life -= wdt; f.t += wdt;
      f.acc = (f.acc || 0) + wdt;
      if (f.acc >= 0.5) {
        f.acc -= 0.5;
        for (const e of G.enemies) {
          if (e.dead) continue;
          if ((e.x - f.x) ** 2 + (e.y - f.y) ** 2 < (f.r + e.r) ** 2) {
            elemApply(G, e, 'fire', f.dps * 20, { src: 'fog', amount: 1 });
          }
        }
      }
      if (chance(wdt * 13)) {
        const a = rand(TAU), d2 = rand(f.r, f.r * 0.2);
        G.particles.push({ x: f.x + Math.cos(a) * d2, y: f.y + Math.sin(a) * d2,
          vx: Math.cos(a) * 18, vy: -rand(58, 18), life: 0.75, max: 0.75,
          size: 4.6, color: '#A6E84D', kind: 'smoke' });
      }
    }
    G.fogs = G.fogs.filter(f => f.life > 0);
  }
  /* ---- v2：折射光束 / 贯穿残痕的淡出 ---- */
  if (G.refracts.length) G.refracts = G.refracts.filter(w => (w.life -= wdt) > 0);
  if (G.wakes.length) G.wakes = G.wakes.filter(w => (w.life -= wdt) > 0);

  // 玩家子弹
  for (const b of G.pBullets) {
    b.t += wdt;
    if (b.homing) {
      const tgt = nearestEnemy(G, b.x, b.y, 520);
      if (tgt) {
        const want = angTo(b, tgt);
        const cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(cur, want), -b.homing * wdt, b.homing * wdt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    if (b.boomer) {
      b.boomer.out -= wdt;
      if (b.boomer.out <= 0 && !b.boomer.back) {
        b.boomer.back = true;
        b.hits = new Set();
      }
      if (b.boomer.back) {
        const a = angTo(b, p);
        const sp = Math.hypot(b.vx, b.vy);
        const na = Math.atan2(b.vy, b.vx) + clamp(angDiff(Math.atan2(b.vy, b.vx), a), -6 * wdt, 6 * wdt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        if (dist(b, p) < 22) b.life = 0;
      }
    }
    if (b.kind === 'blade') b.spin += wdt * 14;
    /* 尾迹历史点：每 16ms 采样一个（LOD 降级策略在 drawBullets 里） */
    if (b.trail) {
      b._ht = (b._ht || 0) + wdt;
      if (b._ht >= 0.016) {
        b._ht = 0;
        if (!b.hist) b.hist = [];
        b.hist.unshift({ x: b.x, y: b.y });
        if (b.hist.length > 4) b.hist.pop();
      }
    }
    b.x += b.vx * wdt;
    b.y += b.vy * wdt;
    b.life -= wdt;
    /* 弹丸自然消失处的小爆（t_narrow：半径 34 / 0.5×） */
    if (b.life <= 0 && b.burst) bulletBurst(G, b);
  }

  // 黑洞
  for (const h of G.holes) {
    h.life -= wdt;
    h.spin += wdt * 2.6;
    const pull = 300 + h.r * 1.6;
    for (const e of G.enemies) {
      if (e.dead || e.isBoss) continue;
      const d = dist(e, h);
      if (d < h.r * 2.2 && d > 1) {
        const f = (1 - d / (h.r * 2.2)) * pull;
        e.x += (h.x - e.x) / d * f * wdt;
        e.y += (h.y - e.y) / d * f * wdt;
      }
      if (d < h.r) {
        e._holeCd = e._holeCd || 0;
        if (G.t > e._holeCd) { e._holeCd = G.t + 0.25; damageEnemy(G, e, h.dps * 0.25, { showText: false, src: 'hole' }); }
        /* 黑洞腐蚀（毒+虚空）：黑洞内每秒 +4 层毒（0.5s 限流 × 每次 2 层） */
        if (h.poison) elemApply(G, e, 'toxin', h.dps * 0.25, { src: 'hole', amount: h.poison * 0.5 });
      }
    }
    if (chance(wdt * 26)) {
      const a = rand(TAU), d2 = rand(h.r * 1.8, h.r * 0.6);
      G.particles.push({ x: h.x + Math.cos(a) * d2, y: h.y + Math.sin(a) * d2,
        vx: -Math.cos(a) * 200, vy: -Math.sin(a) * 200,
        life: 0.45, max: 0.45, size: 3.4, color: '#8f9bff', kind: 'spark' });
    }
  }
  G.holes = G.holes.filter(h => h.life > 0);

  // 敌弹
  for (const b of G.eBullets) {
    b.t += wdt;
    b.x += b.vx * wdt;
    b.y += b.vy * wdt;
  }

  // 碰撞：玩家子弹 × 敌人
  for (const b of G.pBullets) {
    if (b.life <= 0) continue;
    const bang = Math.atan2(b.vy, b.vx);
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (b.hits && b.hits.has(e)) continue;
      const rr = e.r + b.r;
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < rr * rr) {
        /* 霜镜（冰+光）：冻住的目标是折射镜 —— 命中它时 40% 概率把这一发裂成 2 枚 0.5× */
        const mirrorSplit = e.mirror && !b._split && chance(0.4);
        damageEnemy(G, e, b.dmg, { crit: b.crit, big: b.r > 6, src: b.src, ang: bang });
        if (mirrorSplit) {
          b._split = 1;
          const sp = Math.hypot(b.vx, b.vy) || 700;
          for (let i = 0; i < 2; i++) {
            spawnPBullet(G, e.x, e.y, bang + (i ? 0.46 : -0.46), {
              spd: sp * 0.8, r: b.r, len: b.len, dmg: b.dmg * 0.5, pierce: 1,
              color: b.color, kind: b.kind, src: b.src, life: 0.75, crit: b.crit,
            });
          }
          G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.22, max: 0.22, size: 54, color: '#D9C2FF', kind: 'ring' });
          SFX.playAt('rxMid', e.x, e.y);
        }
        if (!b.hits) b.hits = new Set();
        b.hits.add(e);
        if (b.pierce > 0) {
          b.pierce--;
          /* 贯穿残痕：每次穿透留下一道 0.28s 的切口（上限 24 个）+ 6 根火花 + 1 个过曝白点 */
          if (G.wakes.length >= 24) G.wakes.shift();
          G.wakes.push({ x: e.x, y: e.y, ang: bang, life: 0.28, max: 0.28 });
          {
            const nx = Math.cos(bang + 1.5708), ny = Math.sin(bang + 1.5708);
            for (let i = 0; i < 6; i++) {
              const dir = i % 2 ? 1 : -1, sp2 = rand(240, 60);
              G.particles.push({ x: e.x + nx * dir * 8, y: e.y + ny * dir * 8,
                vx: nx * dir * sp2, vy: ny * dir * sp2,
                life: rand(0.3, 0.14), max: 0.3, size: rand(3.4, 1.4), color: '#dff6ff', kind: 'spark' });
            }
            G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.06, max: 0.06, size: 7, color: '#ffffff', kind: 'smoke' });
          }
          /* 穿透连锁（b_pierce）：每穿透 1 个敌人剩余伤害 +14%（叠乘） */
          if (p.stats.pierceGrow) b.dmg *= 1 + 0.14 * p.stats.pierceGrow;
        } else {
          /* 导弹分导（t_split）：导弹销毁时裂成 3+2×(lv−1) 枚小追踪弹 */
          if (b.kind === 'missile' && p.stats.tSplit) {
            const lv = p.stats.tSplit;
            const n = 3 + 2 * (lv - 1);
            const dm = b.dmg * (0.45 + 0.15 * (lv - 1));
            for (let i = 0; i < n; i++) {
              spawnPBullet(G, b.x, b.y, bang + rand(0.72, -0.72), {
                spd: 430, r: 4, len: 13, dmg: dm, kind: 'missile', homing: 5.6,
                color: b.color, src: 'missile', life: 0.85, crit: b.crit, trail: true,
              });
            }
            G.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, max: 0.2, size: 46, color: '#b39dff', kind: 'ring' });
          }
          if (b.burst) bulletBurst(G, b);
          b.life = 0;
          break;
        }
      }
    }
  }

  // 碰撞：玩家子弹 × 碎冰柱（BOSS-4 零域：打碎 4 根换 2s ×2.5 伤害窗口）
  if (G.hazards.length) {
    for (const b of G.pBullets) {
      if (b.life <= 0) continue;
      for (const h of G.hazards) {
        if (h.kind !== 'pillar' || h.hp <= 0) continue;
        const rr = h.r + b.r;
        if ((b.x - h.x) ** 2 + (b.y - h.y) ** 2 < rr * rr) {
          h.hp -= b.dmg;
          h.hitT = G.t;
          if (!b.hits) b.hits = new Set();
          b.hits.add(h);
          for (let i = 0; i < 4; i++) {
            const a = rand(TAU);
            G.particles.push({ x: h.x, y: h.y, vx: Math.cos(a) * rand(190, 40), vy: Math.sin(a) * rand(190, 40),
              life: 0.32, max: 0.32, size: 3.4, color: '#bff4ff', kind: 'spark' });
          }
          if (h.hp <= 0) {
            h.life = 0;
            G.shake = Math.min(16, G.shake + 3.5);
            SFX.playAt('bigKill', h.x, h.y);
            for (let i = 0; i < 22; i++) {
              const a = rand(TAU);
              G.particles.push({ x: h.x, y: h.y, vx: Math.cos(a) * rand(420, 90), vy: Math.sin(a) * rand(420, 90),
                life: 0.55, max: 0.55, size: rand(6, 2.4), color: chance(0.45) ? '#ffffff' : '#7fc8ff', kind: 'spark' });
            }
          }
          if (b.pierce > 0) b.pierce--; else { b.life = 0; if (b.burst) bulletBurst(G, b); break; }
        }
      }
    }
  }

  // 碰撞：敌弹 / 敌体 × 玩家
  if (p.invuln <= 0 && G.state === 'playing') {
    for (const b of G.eBullets) {
      const rr = b.r + p.r * 0.72;
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < rr * rr) {
        b.dead = true;
        hurtPlayer(b.dmg);
        break;
      }
    }
  }
  for (const e of G.enemies) {
    if (e.dead || e.isBoss) continue;
    const rr = e.r + p.r;
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
      if (e.type === 'mini' || e.type === 'chaser') {
        killEnemy(G, e);
      } else {
        e._ramCd = e._ramCd || 0;
        if (G.t > e._ramCd) { e._ramCd = G.t + 0.8; }
      }
      hurtPlayer(13);
    }
  }
  // Boss 接触
  if (G.boss && !G.boss.dead) {
    const rr = G.boss.r * 0.82 + p.r;
    if ((G.boss.x - p.x) ** 2 + (G.boss.y - p.y) ** 2 < rr * rr) hurtPlayer(16);
  }

  // 清理
  G.pBullets = G.pBullets.filter(b => b.life > 0 && !offscreen(b, 120));
  G.eBullets = G.eBullets.filter(b => !b.dead && b.life > 0 && !offscreen(b, 80));
  G.zaps = G.zaps.filter(z => (z.life -= wdt) > 0);

  // 经验晶体
  for (const o of G.orbs) {
    o.t += dt;
    const d = dist(o, p);
    if (o.mag || d < p.stats.magnet) {
      o.mag = true;
      const a = angTo(o, p);
      const sp = lerp(240, 1050, clamp(1 - d / 320, 0, 1));
      o.vx = lerp(o.vx, Math.cos(a) * sp, 1 - Math.pow(0.0004, dt));
      o.vy = lerp(o.vy, Math.sin(a) * sp, 1 - Math.pow(0.0004, dt));
    } else {
      // 非磁吸状态：缓慢下坠，保证最终一定会飘到玩家附近
      o.vx *= Math.pow(0.05, dt);
      o.vy = Math.min(155, o.vy + 135 * dt);
    }
    o.x += o.vx * dt; o.y += o.vy * dt;
    o.life -= dt;
    if (d < 24) {
      o.dead = true;
      gainXp(o.val);
      SFX.playAt('pickup', o.x, o.y);
      G.particles.push({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 26, color: '#7ef9ff', kind: 'ring' });
      /* 拾取共鸣（k_resonate）：每 12 个晶体 → 1.2s 全场敌方时缓 45% */
      if (p.stats.resonate && ++p.pickupN >= 12) {
        p.pickupN = 0;
        G.resonateT = 1.2;
        G.toast('拾取共鸣 · 时缓');
        SFX.playAt('slow', p.x, p.y);
      }
    }
  }
  G.orbs = G.orbs.filter(o => !o.dead && o.life > 0);

  // 掉落物
  for (const k of G.pickups) {
    k.t += dt;
    k.y += k.vy * dt;
    k.vy = lerp(k.vy, 46, 1 - Math.pow(0.08, dt));
    k.x += Math.sin(k.t * 2.2) * 22 * dt;
    if (dist(k, p) < p.r + k.r + 6) {
      k.dead = true;
      if (k.kind === 'heal') {
        const v = p.maxHp * 0.28;
        p.hp = Math.min(p.maxHp, p.hp + v);
        G.toast('生命 +' + Math.round(v));
      } else if (k.kind === 'shield') {
        p.shieldMax = Math.max(p.shieldMax, 30);
        p.shield = Math.min(p.shieldMax, p.shield + 30);
        p.shieldPulse = 1;
        G.toast('护盾充能');
      } else {
        p.bombCount += 1;
        G.toast('核弹 +1');
      }
      SFX.playAt('heal', k.x, k.y);
      for (let i = 0; i < 12; i++) {
        const a = rand(TAU);
        G.particles.push({ x: k.x, y: k.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160,
          life: 0.4, max: 0.4, size: 4, color: '#ffffff', kind: 'spark' });
      }
    }
  }
  G.pickups = G.pickups.filter(k => !k.dead && k.y < H + 40);

  // 粒子 / 文本
  updateFX(dt);

  // 连击衰减
  if (G.comboT > 0) {
    G.comboT -= dt;
    if (G.comboT <= 0) { G.bestCombo = Math.max(G.bestCombo, G.combo); G.combo = 0; }
  }
  G.bestCombo = Math.max(G.bestCombo, G.combo);
}

/** 粒子与飘字（结算后仍继续播放，保证死亡爆炸有完整演出） */
function updateFX(dt) {
  for (const q of G.particles) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.kind === 'spark') { q.vx *= Math.pow(0.12, dt); q.vy *= Math.pow(0.12, dt); }
    if (q.kind === 'smoke') { q.vx *= Math.pow(0.3, dt); q.vy *= Math.pow(0.3, dt); }
  }
  G.particles = G.particles.filter(q => q.life > 0);
  if (G.particles.length > 720) G.particles.splice(0, G.particles.length - 720);

  for (const tx of G.texts) { tx.life -= dt; tx.y += tx.vy * dt; tx.vy *= Math.pow(0.2, dt); }
  G.texts = G.texts.filter(t => t.life > 0);
}

/* ---------------------------------------------------------
   波次推进
   --------------------------------------------------------- */
function updateWaveFlow(dt) {
  if (G.wavePhase === 'intro') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) beginCombat();
    return;
  }
  if (G.wavePhase === 'combat') {
    if (G.wave % 5 !== 0) {
      G.waveTimer += dt;
      const gs = G.waveGroups;
      while (gs.length && gs[0].t <= G.waveTimer) {
        const g = gs.shift();
        g.fn();
      }
      // 反死锁保险：单波超过 90 秒仍有残敌时，命令它们撤离，流程永不停摆
      if (G.waveTimer > 90) {
        for (const e of G.enemies) if (!e.dead && !e.retreat) { e.retreat = true; e.hp = Math.min(e.hp, e.maxHp * 0.25); }
      }
      const allSpawned = gs.length === 0;
      const enemiesLeft = G.enemies.some(e => !e.dead);
      if (allSpawned && !enemiesLeft && G.waveTimer > 1.2) waveCleared();
    } else {
      if (!G.boss || G.boss.dead) {
        // 清掉残余护卫
        if (!G.enemies.some(e => !e.dead)) waveCleared();
      }
    }
    return;
  }
  if (G.wavePhase === 'clear') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      G.wavePlan = buildWave(G.wave + 1);
      startWave(G.wave + 1);
    }
  }
}

/* ---------------------------------------------------------
   主更新
   --------------------------------------------------------- */
function update(dt) {
  if (G.state === 'playing') {
    G.t += dt;
    G.elapsed += dt;
    if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.14; }
    updatePlayer(dt);
    updateWorld(dt);
    updateWaveFlow(dt);
    // Boss 血条
    if (G.boss && !G.boss.dead) {
      const b = G.boss;
      document.getElementById('bbFill').style.transform = 'scaleX(' + clamp(b.hp / b.maxHp, 0, 1) + ')';
      document.getElementById('bbPhase').style.left = (b.phase === 1 ? 68 : 34) + '%';
    }
    // 音乐张力 = 波次进程 / 场上敌机密度 / Boss 战，三者取最大。
    // 每帧调用是安全的：引擎内部有脏检查，值不变时不会排任何自动化。
    let _alive = 0;
    for (const e of G.enemies) if (!e.dead) _alive++;
    // 时间畸变的音频态（内部脏检查，可安全每帧调用）
    SFX.setSlow(!!G.player && G.player.slowT > 0);
    SFX.setIntensity(Math.max((G.wave - 1) / 14, _alive / 22, (G.boss && !G.boss.dead) ? 1 : 0));
  } else if (G.state === 'over') {
    G.t += dt;
    updateFX(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
  }
  G.shake = Math.max(0, G.shake - dt * 42);
  G.flash = Math.max(0, G.flash - dt * 2.6);
}

/* ---------------------------------------------------------
   绘制
   --------------------------------------------------------- */
function drawPlayer() {
  const p = G.player;
  ctx.save();

  // 尾迹
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    const a = (1 - i / p.trail.length) * 0.16;
    drawGlow(ctx, t.x, t.y, 30 - i * 1.5, '#4ea8ff', a);
  }

  const blink = p.invuln > 0 && Math.floor(G.t * 22) % 2 === 0;
  ctx.globalAlpha = blink ? 0.42 : 1;

  drawGlow(ctx, p.x, p.y, 76, '#7ef9ff', 0.55);

  // 引擎尾焰：长度随真实速度变化（静止时收束成一个 3px 亮点）→ 让「移动」有物理感
  const spd = p._spd || 0;
  const fl = spd > 24
    ? clamp(14 + spd * 0.05, 6, 40) + Math.sin(G.t * 42) * 3
    : 3 + Math.sin(G.t * 30) * 1;
  ctx.beginPath();
  ctx.moveTo(p.x - 6, p.y + 8); ctx.lineTo(p.x + 6, p.y + 8); ctx.lineTo(p.x, p.y + 8 + fl);
  ctx.closePath();
  if (fl < 6) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
  } else {
    const fg = ctx.createLinearGradient(p.x, p.y + 8, p.x, p.y + 8 + fl);
    fg.addColorStop(0, 'rgba(255,255,255,.95)');
    fg.addColorStop(0.4, 'rgba(126,249,255,.7)');
    fg.addColorStop(1, 'rgba(78,168,255,0)');
    ctx.fillStyle = fg;
  }
  ctx.fill();

  // 舰体
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(7, -4);
  ctx.lineTo(17, 6);
  ctx.lineTo(8, 9);
  ctx.lineTo(4, 14);
  ctx.lineTo(-4, 14);
  ctx.lineTo(-8, 9);
  ctx.lineTo(-17, 6);
  ctx.lineTo(-7, -4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -20, 0, 14);
  g.addColorStop(0, '#eafcff');
  g.addColorStop(0.45, '#5fd8ee');
  g.addColorStop(1, '#1b4a6b');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6; ctx.stroke();
  // 座舱
  ctx.beginPath(); ctx.ellipse(0, -6, 3.4, 6, 0, 0, TAU);
  ctx.fillStyle = '#0a1a2a'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -7.4, 2, 3.2, 0, 0, TAU);
  ctx.fillStyle = 'rgba(190,255,255,.9)'; ctx.fill();
  ctx.restore();

  // 护盾
  if (p.shield > 0) {
    const sr = 30 + Math.sin(G.t * 6) * 2 + p.shieldPulse * 16;
    const a = 0.18 + (p.shield / Math.max(1, p.shieldMax)) * 0.42 + p.shieldPulse * 0.35;
    ctx.beginPath(); ctx.arc(p.x, p.y, sr, 0, TAU);
    ctx.strokeStyle = rgba('#4ea8ff', a); ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, sr - 4, 0, TAU);
    ctx.strokeStyle = rgba('#bff4ff', a * 0.45); ctx.lineWidth = 1; ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  // 无人机
  for (const d of p.drones) {
    drawGlow(ctx, d.x, d.y, 44, '#d9f7ff', 0.6);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(G.t * 3.2);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(176,107,255,.92)'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }

  // 受击红闪
  if (p.hurtFlash > 0) {
    ctx.globalAlpha = p.hurtFlash * 0.4;
    ctx.fillStyle = '#ff5566';
    ctx.beginPath(); ctx.arc(p.x, p.y, 40, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** 激光束形状：头宽尾窄的 4 点锥形多边形（+x = 前进方向） */
function beamShape(ctx, L, headW, tailW) {
  const hx = L * 0.34, tx = -L * 0.66;
  ctx.beginPath();
  ctx.moveTo(hx, -headW / 2);
  ctx.lineTo(hx, headW / 2);
  ctx.lineTo(tx, tailW / 2);
  ctx.lineTo(tx, -tailW / 2);
  ctx.closePath();
}

function drawBullets() {
  const total = G.pBullets.length;
  /* 尾迹 LOD（硬性性能守门）：>160 全关；>90 降到 2 点；否则 4 点 */
  const trailMax = total > 160 ? 0 : (total > 90 ? 2 : 4);
  const elemCol = G.player ? elemTrailColor(G.player) : null;

  /* ① 舰船系留束：开火后 0.16s 内，从舰船到弹头画一条蓄能束（3 个低频抖动节点）
        —— 这是「战机移动时光束要明显」的直接答案：整条束线随舰船扫过 */
  if (G.player && total < 140) {
    const p = G.player;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of G.pBullets) {
      if (b.kind !== 'beam') continue;
      const age = G.t - (b.born || 0);
      if (age > 0.16 || age < 0) continue;
      const k = 1 - age / 0.16;
      const x0 = p.x, y0 = p.y - 18;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        ctx.lineTo(lerp(x0, b.x, t) + Math.sin(G.t * 26 + i * 2.1) * 5, lerp(y0, b.y, t));
      }
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = rgba('#bff4ff', k * 0.8);
      ctx.lineWidth = 6 * k + 0.5;
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', k);
      ctx.lineWidth = 2 * k + 0.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 玩家子弹
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.pBullets) {
    const a = Math.atan2(b.vy, b.vx);
    const sp = Math.hypot(b.vx, b.vy);

    /* ② 高速弹残影：速度 > 1000 的弹丸额外画长 = 速度 ×0.035 的细亮线 */
    if (sp > 1000) {
      const L = sp * 0.035;
      ctx.strokeStyle = rgba(b.color, 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(a) * L, b.y - Math.sin(a) * L);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /* ③ 尾迹：逐段锥形多边形，头宽 = r×1.6、尾宽 → 0，alpha 沿尾递减
          颜色 = 元素尾迹色（无元素时用武器本色）；元素不改弹丸核心色 */
    if (trailMax && b.hist && b.hist.length > 1) {
      const h = b.hist.slice(0, trailMax);
      const tc = elemCol || b.color;
      let px = b.x, py = b.y, pw = b.r * 0.8;
      for (let i = 0; i < h.length; i++) {
        const q = h[i];
        const nw = b.r * 0.8 * (1 - (i + 1) / h.length);
        const ang = Math.atan2(q.y - py, q.x - px);
        const ca = Math.cos(ang + 1.5708), sa = Math.sin(ang + 1.5708);
        ctx.beginPath();
        ctx.moveTo(px + ca * pw, py + sa * pw);
        ctx.lineTo(px - ca * pw, py - sa * pw);
        ctx.lineTo(q.x - ca * nw, q.y - sa * nw);
        ctx.lineTo(q.x + ca * nw, q.y + sa * nw);
        ctx.closePath();
        ctx.fillStyle = rgba(tc, 0.34 * (1 - i / h.length));
        ctx.fill();
        px = q.x; py = q.y; pw = nw;
      }
    }

    drawGlow(ctx, b.x, b.y, b.r * 6.5, b.color, 0.75);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    if (b.kind === 'beam') {
      /* ---- ④ 激光重做：四层「束」而不是胶囊 ---- */
      const hw = b.r * 1.5, tw = b.r * 0.25, L = b.len;
      beamShape(ctx, L, hw * 2.6, tw * 2.6); ctx.fillStyle = rgba(b.color, 0.16); ctx.fill();
      beamShape(ctx, L, hw * 1.7, tw * 1.7); ctx.fillStyle = rgba(b.color, 0.42); ctx.fill();
      beamShape(ctx, L, hw, tw);             ctx.fillStyle = '#ffffff';        ctx.fill();
      /* 色差描边：+1px 红 / −1px 蓝 → 从「矢量图形」变成「有光学的实体」 */
      ctx.lineWidth = 1;
      beamShape(ctx, L, hw, tw);
      ctx.translate(1, 0);  ctx.strokeStyle = 'rgba(255,90,90,.55)';  ctx.stroke();
      ctx.translate(-2, 0); ctx.strokeStyle = 'rgba(90,150,255,.55)'; ctx.stroke();
      ctx.translate(1, 0);
    } else if (b.kind === 'blade') {
      ctx.rotate(b.spin);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang2 = i / 3 * TAU;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang2) * b.r * 1.6, Math.sin(ang2) * b.r * 1.6);
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
    } else {
      roundRect(ctx, -b.len / 2, -b.r * 0.5, b.len, b.r, b.r * 0.5);
      ctx.fillStyle = b.color; ctx.fill();
      roundRect(ctx, -b.len / 2 + 1, -b.r * 0.22, b.len * 0.55, b.r * 0.44, b.r * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
      /* 色差描边：仅 r > 4 的弹丸启用（零成本，但立刻有「光学」感） */
      if (b.r > 4) {
        ctx.lineWidth = 1;
        roundRect(ctx, -b.len / 2, -b.r * 0.5, b.len, b.r, b.r * 0.5);
        ctx.translate(1, 0);  ctx.strokeStyle = 'rgba(255,90,90,.5)';  ctx.stroke();
        ctx.translate(-2, 0); ctx.strokeStyle = 'rgba(90,150,255,.5)'; ctx.stroke();
        ctx.translate(1, 0);
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // 敌弹
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.eBullets) {
    drawGlow(ctx, b.x, b.y, b.r * 6.4, b.color, 0.85);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.86, 0, TAU);
    ctx.fillStyle = b.color; ctx.fill();
    ctx.beginPath(); ctx.arc(b.x - b.r * 0.2, b.y - b.r * 0.2, b.r * 0.42, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
  }
  ctx.restore();
}

/** 持续光束（t_lance）：三层同路径 + 9 点抖动（电浆质感）+ 束首灼烧点；耗尽时束宽 40% 转暗红 */
function drawLance() {
  const p = G.player;
  if (!p || !p.lanceOn) return;
  const low = p.energy <= 0.5;
  const k = low ? 0.4 : 1;
  const y0 = p.y - 14, y1 = -40, x1 = p.x + Math.sin(G.t * 1.6) * 26;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const layers = [
    { c: low ? '#ff5566' : '#9fefff', lw: 26 * k, a: 0.18 },
    { c: low ? '#ff8f6b' : '#7ef9ff', lw: 11 * k, a: 0.55 },
    { c: low ? 'rgba(255,180,180,.9)' : '#ffffff', lw: 3.2 * k, a: 1 },
  ];
  for (const L of layers) {
    ctx.beginPath();
    ctx.moveTo(p.x, y0);
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      ctx.lineTo(lerp(p.x, x1, t) + Math.sin(G.t * 22 + i * 1.7) * 1.6 + rand(0.5, -0.5), lerp(y0, y1, t));
    }
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = L.c.startsWith('rgba') ? L.c : rgba(L.c, L.a);
    ctx.lineWidth = L.lw;
    ctx.stroke();
  }
  /* 束首灼烧点：光斑 + 4 道 45° 芒线 */
  drawGlow(ctx, x1, y1 + 8, 42 * k, low ? '#ff5566' : '#bff4ff', 0.8);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    ctx.strokeStyle = rgba('#ffffff', 0.55 * k);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(a) * 6, y1 + 8 + Math.sin(a) * 6);
    ctx.lineTo(x1 + Math.cos(a) * 19, y1 + 8 + Math.sin(a) * 19);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorld() {
  // 地面危害区（Boss 机制：熔渣 / 预警圈 / 冰锥 / 落雷 / 静电场 / 碎冰柱）—— 最底层
  drawHazards(ctx);

  // 场地物件：晶刺（clusters 裂出的独立实体）
  drawShards(ctx);

  // 毒雾（火+毒 · 焚毒雾）
  for (const f of G.fogs) {
    const k = clamp(f.life / f.max, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, f.x, f.y, f.r * 2.7, '#A6E84D', 0.15 * k);
    ctx.globalAlpha = 0.32 * k;
    ctx.strokeStyle = '#A6E84D';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (0.9 + Math.sin(f.t * 3) * 0.06), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // 黑洞
  for (const h of G.holes) {
    const k = h.life / h.max;
    const scale = h.life > h.max - 0.25 ? (h.max - h.life) / 0.25 : (k < 0.2 ? k / 0.2 : 1);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, h.r * 3.4 * scale, '#5f6bff', 0.55);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(0, 0, h.r * 0.42 * scale, 0, TAU);
    ctx.fillStyle = '#05060f'; ctx.fill();
    ctx.strokeStyle = rgba('#8f9bff', 0.55); ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(h.spin + i * TAU / 3);
      ctx.beginPath();
      ctx.arc(0, 0, h.r * scale, 0, 1.5);
      ctx.strokeStyle = rgba('#b06bff', 0.5); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // 经验晶体
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const o of G.orbs) {
    const pulse = 0.8 + Math.sin(o.t * 12) * 0.2;
    drawGlow(ctx, o.x, o.y, o.r * 7 * pulse, '#7ef9ff', 0.8);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.t * 2.4);
    ctx.beginPath();
    ctx.moveTo(0, -o.r); ctx.lineTo(o.r * 0.75, 0); ctx.lineTo(0, o.r); ctx.lineTo(-o.r * 0.75, 0);
    ctx.closePath();
    ctx.fillStyle = '#d9ffff'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // 掉落物（矢量绘制，不依赖 emoji 字体，任何环境都能正确显示）
  for (const k of G.pickups) {
    const cfg = k.kind === 'heal' ? { c: '#ff5566', icon: 'heal' }
      : k.kind === 'shield' ? { c: '#4ea8ff', icon: 'shield' }
      : { c: '#ffb545', icon: 'bomb' };
    const pulse = 1 + Math.sin(k.t * 7) * 0.1;
    drawGlow(ctx, k.x, k.y, 62 * pulse, cfg.c, 0.8);
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.beginPath(); ctx.arc(0, 0, k.r, 0, TAU);
    ctx.fillStyle = rgba('#0a0e1c', 0.88); ctx.fill();
    ctx.strokeStyle = cfg.c; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = cfg.c;
    ctx.strokeStyle = cfg.c;
    if (cfg.icon === 'heal') {           // 十字
      ctx.fillRect(-2.4, -6.6, 4.8, 13.2);
      ctx.fillRect(-6.6, -2.4, 13.2, 4.8);
    } else if (cfg.icon === 'shield') {  // 盾牌
      ctx.beginPath();
      ctx.moveTo(0, -7.6);
      ctx.lineTo(6.4, -4.4);
      ctx.lineTo(6.4, 1.4);
      ctx.quadraticCurveTo(6.4, 6.2, 0, 8);
      ctx.quadraticCurveTo(-6.4, 6.2, -6.4, 1.4);
      ctx.lineTo(-6.4, -4.4);
      ctx.closePath();
      ctx.fill();
    } else {                             // 辐射标记
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + G.t * 1.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4.6, Math.sin(a) * 4.6);
        ctx.lineTo(Math.cos(a) * 7.8, Math.sin(a) * 7.8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 敌人
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.isBoss) drawBoss(ctx, e);
    else drawEnemy(ctx, e, G.player);
  }

  // 电弧
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const z of G.zaps) {
    const a = z.life / z.max;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < z.pts.length - 1; i++) {
        const p0 = z.pts[i], p1 = z.pts[i + 1];
        const seg = 4;
        ctx.moveTo(p0.x, p0.y);
        for (let s = 1; s <= seg; s++) {
          const t = s / seg;
          const jitter = s === seg ? 0 : 10;
          ctx.lineTo(lerp(p0.x, p1.x, t) + rand(jitter, -jitter),
                     lerp(p0.y, p1.y, t) + rand(jitter, -jitter));
        }
      }
      ctx.strokeStyle = pass === 0 ? rgba('#9fefff', a * 0.7) : rgba('#ffffff', a);
      ctx.lineWidth = pass === 0 ? 7 : 2.2;
      ctx.stroke();
    }
  }
  ctx.restore();

  /* 折射光束（光元素 / k_prism）：我方弹道，必须守冷色规则 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of G.refracts) {
    const k = clamp(w.life / w.max, 0, 1);
    ctx.strokeStyle = rgba('#D9C2FF', k * 0.85);
    ctx.lineWidth = 2.4 * k + 0.6;
    ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', k);
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); ctx.stroke();
    drawGlow(ctx, w.x1, w.y1, 30 * k, '#D9C2FF', k * 0.7);
  }
  /* 贯穿残痕：垂直于弹道的亮线切口（让玩家直接读出「这一发穿了几层」） */
  for (const w of G.wakes) {
    const k = clamp(w.life / w.max, 0, 1);
    const nx = Math.cos(w.ang + 1.5708), ny = Math.sin(w.ang + 1.5708);
    ctx.strokeStyle = rgba('#bff4ff', k * 0.45);
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(w.x - nx * 8, w.y - ny * 8);
    ctx.lineTo(w.x + nx * 8, w.y + ny * 8);
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', k * 0.9);
    ctx.lineWidth = 1.4 + k * 1.6;
    ctx.beginPath();
    ctx.moveTo(w.x - nx * 13, w.y - ny * 13);
    ctx.lineTo(w.x + nx * 13, w.y + ny * 13);
    ctx.stroke();
  }
  ctx.restore();

  drawBullets();

  // 粒子
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const q of G.particles) {
    const a = clamp(q.life / q.max, 0, 1);
    if (q.kind === 'ring') {
      const r = q.size * (1 - a) * 0.5 + 6;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU);
      ctx.strokeStyle = rgba(q.color, a * 0.85);
      ctx.lineWidth = 2 + a * 4;
      ctx.stroke();
    } else if (q.kind === 'smoke') {
      drawGlow(ctx, q.x, q.y, q.size * (1.6 - a * 0.6), q.color, a * 0.3);
    } else {
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * a, 0, TAU);
      ctx.fillStyle = rgba(q.color, a);
      ctx.fill();
    }
  }
  ctx.restore();

  drawLance();
  drawPlayer();

  // 伤害数字
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.font = '700 ' + t.size + 'px ' + 'system-ui,sans-serif';
    ctx.fillStyle = rgba('#000000', a * 0.5);
    ctx.fillText(t.txt, t.x + 1, t.y + 1);
    ctx.fillStyle = rgba(t.color, a);
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.restore();
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.58)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (G.player && G.player.hp / G.player.maxHp < 0.35 && G.state === 'playing') {
    const pulse = 0.10 + Math.sin(G.t * 6) * 0.05;
    const g2 = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.62);
    g2.addColorStop(0, 'rgba(255,0,40,0)');
    g2.addColorStop(1, 'rgba(255,0,40,' + pulse + ')');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }
  if (G.player && G.player.slowT > 0) {
    ctx.fillStyle = 'rgba(78,168,255,.07)';
    ctx.fillRect(0, 0, W, H);
  }
  /* 全场敌方时缓的两次来源各给一层可读的全屏色偏（零域冰封 / 拾取共鸣） */
  if (G.zeroSlow) {
    ctx.fillStyle = 'rgba(127,200,255,.10)';
    ctx.fillRect(0, 0, W, H);
  } else if (G.resonateT > 0) {
    ctx.fillStyle = 'rgba(217,194,255,.08)';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------------------------------------------------
   渲染主函数
   --------------------------------------------------------- */
function render(dt) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const s = G.shake;
  ctx.save();
  if (s > 0.2) ctx.translate(rand(s, -s) * 0.6, rand(s, -s) * 0.6);

  drawBackground(dt);
  if (G.player) drawWorld();

  ctx.restore();

  drawVignette();

  if (G.flash > 0.01) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, G.flash) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  if (G.state === 'menu') {
    // 菜单背景演示：缓慢巡游的装饰敌机剪影
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 5; i++) {
      const x = W * (0.12 + i * 0.19);
      const y = (G.menuT * 34 + i * 190) % (H + 200) - 100;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, 18); ctx.lineTo(15, -12); ctx.lineTo(0, -4); ctx.lineTo(-15, -12);
      ctx.closePath();
      ctx.fillStyle = '#4ea8ff'; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------
   UI 同步
   --------------------------------------------------------- */
const ui = {
  level: document.getElementById('hudLevel'),
  hp: document.getElementById('hudHp'),
  shield: document.getElementById('hudShield'),
  hpTxt: document.getElementById('hudHpTxt'),
  xp: document.getElementById('hudXp'),
  wave: document.getElementById('hudWave'),
  score: document.getElementById('hudScore'),
  kills: document.getElementById('hudKills'),
  combo: document.getElementById('hudCombo'),
  loadout: document.getElementById('hudLoadout'),
  abilities: document.getElementById('hudAbilities'),
  elems: document.getElementById('hudElems'),
  energyBar: document.getElementById('energyBar'),
  energy: document.getElementById('hudEnergy'),
  hud: document.getElementById('hud'),
};
const _prev = {};
function setTxt(el, v, key) {
  if (_prev[key] !== v) { el.textContent = v; _prev[key] = v; }
}

function syncUI() {
  const p = G.player;
  if (!p) return;
  setTxt(ui.level, String(p.level), 'lv');
  ui.hp.style.transform = 'scaleX(' + clamp(p.hp / p.maxHp, 0, 1) + ')';
  ui.shield.style.transform = 'scaleX(' + clamp(p.shield / Math.max(1, p.shieldMax), 0, 1) + ')';
  setTxt(ui.hpTxt, Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp), 'hp');
  ui.xp.style.transform = 'scaleX(' + clamp(p.xp / p.xpNext, 0, 1) + ')';
  setTxt(ui.wave, String(G.wave), 'wave');
  setTxt(ui.score, fmt(G.score), 'score');
  setTxt(ui.kills, '击杀 ' + G.kills, 'kills');
  if (G.combo > 2) {
    setTxt(ui.combo, '×' + G.combo + ' COMBO', 'combo');
    ui.combo.classList.add('on');
  } else {
    ui.combo.classList.remove('on');
  }

  // 能量条（持续光束 t_lance）：耗尽时闪烁提示
  if (p.stats.lance) {
    ui.energyBar.classList.remove('hidden');
    ui.energy.style.transform = 'scaleX(' + clamp(p.energy / Math.max(1, p.stats.energyMax), 0, 1) + ')';
    ui.energyBar.classList.toggle('low', p.energy <= 0.5);
  } else if (!ui.energyBar.classList.contains('hidden')) {
    ui.energyBar.classList.add('hidden');
  }

  // 元素徽章（当前已选元素，最多 2 个）
  const eb = (p.elems || []).map(id => {
    const d = ELEMENTS[id];
    return '<span class="echip" style="--ec:' + d.color + '">' + d.glyph + ' ' + d.name + '</span>';
  }).join('');
  if (_prev.elems !== eb) { ui.elems.innerHTML = eb; _prev.elems = eb; }

  // 武器栏
  const EPIC_SET = { drone: 1, arc: 1, black: 1 };
  const parts = [];
  for (const k in WEAPONS) {
    const lv = p.wlv[k] || 0;
    if (!lv) continue;
    parts.push('<span class="wchip' + (EPIC_SET[k] ? ' epic' : '') + '">' +
      WEAPONS[k].icon + ' <b>Lv' + lv + '</b></span>');
  }
  const html = parts.join('');
  if (_prev.loadout !== html) { ui.loadout.innerHTML = html; _prev.loadout = html; }

  // 主动技能
  const ab = [];
  if (p.dashLv) ab.push({ k: 'SPACE', i: '⇢', cd: p.dashCd / p.dashCdMax, ready: p.dashCd <= 0 });
  if (p.bombCount > 0) ab.push({ k: 'Q', i: '☢', n: p.bombCount, ready: true });
  if (p.slowLv) ab.push({ k: 'E', i: '⧗', cd: p.slowCd / p.slowCdMax, ready: p.slowCd <= 0 });
  const ahtml = ab.map(a => '<div class="ab' + (a.ready ? '' : ' off') + '">' + a.i +
    (a.n != null ? '<small>×' + a.n + '</small>' : '<small>' + a.k + '</small>') +
    (a.cd > 0 ? '<span class="cd" style="transform:scaleY(' + clamp(a.cd, 0, 1) + ')"></span>' : '') +
    '</div>').join('');
  if (_prev.ab !== ahtml) { ui.abilities.innerHTML = ahtml; _prev.ab = ahtml; }
}

/* ---------------------------------------------------------
   升级五选一 / 元素门 UI
   --------------------------------------------------------- */
const elLevelUp = document.getElementById('levelup');
const elCards = document.getElementById('cards');
const elElemPick = document.getElementById('elementPick');
const elElemCards = document.getElementById('elemCards');
let curCards = [];

/* ---------- 元素门：Lv4 与 Lv9 各一次，不进卡池 ---------- */
const ELEM_GATES = { 4: '_gate1Done', 9: '_gate2Done' };

/** 该等级是否打开元素门（等级对、还有空位、且这道门没开过） */
function isElementGate(lv) {
  const p = G.player;
  if (!p) return false;
  const flag = ELEM_GATES[lv];
  if (!flag) return false;
  if (p.elems.length >= 2) return false;
  return !p[flag];
}

/** 两个十六进制色求平均（元素门卡片边框 = 两元素混合色） */
function mixHex(a, b) {
  const A = hexRgb(a), B = hexRgb(b);
  return '#' + [0, 1, 2].map(i =>
    Math.round((A[i] + B[i]) / 2).toString(16).padStart(2, '0')).join('');
}

function openElementPick(lv) {
  G.state = 'levelup';
  G.gateOn = true;
  elLevelUp.classList.add('hidden');
  const p = G.player;
  const have = p.elems.slice();
  const o = have[0] || null;
  document.getElementById('elemPickLv').textContent = String(lv);
  document.getElementById('elemPickTip').textContent = o
    ? '第二道门：它会与【' + ELEMENTS[o].name + '】产生联动 —— 下方已标出全部反应'
    : '第一道门：选一种元素，它会被附加到你的全部武器上（不可重随、不可跳过）';

  const cells = [];
  for (const id of ELEMENT_ORDER) {
    const d = ELEMENTS[id];
    if (have.indexOf(id) >= 0) {
      cells.push('<div class="ecard locked" style="--ec:' + d.color + '">' +
        '<div class="eg">' + d.glyph + '</div>' +
        '<div class="en">' + d.name + '<span class="est">' + d.status + '</span></div>' +
        '<div class="epos">当前已有 · 已锁定</div>' +
        '<div class="el">第二元素的空位已被它占满，本届不可再选</div></div>');
      continue;
    }
    let extra = '';
    let border = d.color;
    if (o) {
      const r = RX[_rxKey(id, o)];
      border = mixHex(d.color, ELEMENTS[o].color);
      extra = '<div class="erx" style="--ec:' + border + '">与【' + ELEMENTS[o].name + '】· <b>' + r.name +
        '</b><br>' + r.note + '</div>';
    }
    cells.push('<div class="ecard" data-el="' + id + '" style="--ec:' + d.color + ';--bd:' + border + '">' +
      '<div class="eg">' + d.glyph + '</div>' +
      '<div class="en">' + d.name + '<span class="est">' + d.status + '</span></div>' +
      '<div class="epos">' + d.pos + '</div>' +
      '<div class="el">' + d.line + '</div>' + extra + '</div>');
  }
  elElemCards.innerHTML = cells.join('');
  elElemCards.querySelectorAll('.ecard[data-el]').forEach(el => {
    el.addEventListener('click', () => pickElement(el.dataset.el));
  });
  elElemPick.classList.remove('hidden');
  SFX.play('levelup');
}

function pickElement(id) {
  const p = G.player;
  if (!p || p.elems.length >= 2 || p.elems.indexOf(id) >= 0) return;
  const d = ELEMENTS[id];
  p.elems.push(id);
  p._gate1Done = 1;
  if (p.elems.length >= 2) p._gate2Done = 1;
  codexMark('元素 · ' + d.name);
  SFX.play('rxBig');
  G.toast('元素觉醒 · ' + d.name + ' ' + d.glyph);
  G.flash = 0.6;
  G.shake = Math.min(16, G.shake + 8);
  for (let i = 0; i < 46; i++) {
    const a = rand(TAU), s = rand(520, 90);
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.9, 0.4), max: 0.9, size: rand(6, 2.2), color: chance(0.5) ? '#ffffff' : d.color, kind: 'spark' });
  }
  G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.7, max: 0.7, size: 520, color: d.color, kind: 'ring' });
  G.gateOn = false;
  elElemPick.classList.add('hidden');
  consumeLevel();
}

/** 消费一次待结算等级（升级队列 + 计数），并按需继续开下一张面板 */
function consumeLevel() {
  if (G.lvQueue.length) G.lvQueue.shift();
  G.pendingLevels = Math.max(0, G.pendingLevels - 1);
  if (G.pendingLevels > 0) { openLevelUp(); }
  else { elLevelUp.classList.add('hidden'); elElemPick.classList.add('hidden'); G.gateOn = false; G.state = 'playing'; }
}

function openLevelUp() {
  G.state = 'levelup';
  const p = G.player;
  const lv = G.lvQueue.length ? G.lvQueue[0] : p.level;
  if (isElementGate(lv)) { openElementPick(lv); return; }
  G.gateOn = false;
  elElemPick.classList.add('hidden');
  document.getElementById('lvupLevel').textContent = String(lv);
  refreshCards();
  elLevelUp.classList.remove('hidden');
  SFX.play('levelup');
}

function refreshCards() {
  const p = G.player;
  curCards = drawCards(G, p);
  elCards.innerHTML = curCards.map((u, i) => {
    const lv = upLv(p, u);
    const rar = RARITY[u.rarity];
    return '<div class="card is-new ' + rar.cls + '" data-i="' + i + '" style="animation-delay:' + (i * 0.04) + 's">' +
      '<span class="key">' + (i + 1) + '</span>' +
      '<div class="ico">' + u.icon + '</div>' +
      '<div class="body">' +
        '<div class="nm">' + u.name +
          '<span class="lvl">' + (lv > 0 ? 'Lv ' + lv + ' → ' + (lv + 1) : 'NEW') + '</span>' +
        '</div>' +
        '<div class="ds">' + u.desc(lv) + '</div>' +
        '<div class="tags"><span class="tag">' + rar.name + '</span><span class="tag">' + u.tag + '</span>' +
          (u.max < 90 ? '<span class="tag">上限 ' + u.max + '</span>' : '') + '</div>' +
      '</div></div>';
  }).join('');
  document.getElementById('rerollCount').textContent = String(p.rerolls);
  document.getElementById('btnReroll').style.opacity = p.rerolls > 0 ? 1 : 0.4;

  elCards.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.i);
      pickCard(curCards[i]);
    });
  });
}

function pickCard(u) {
  const p = G.player;
  applyUpgrade(G, p, u);
  SFX.play('uiClick');
  G.toast(u.name + ' · 已强化');
  consumeLevel();
}

/* ---------------------------------------------------------
   流程控制
   --------------------------------------------------------- */
function startGame() {
  SFX.resume();
  G.state = 'playing';
  G.t = 0; G.elapsed = 0; G.score = 0; G.kills = 0; G.combo = 0; G.bestCombo = 0; G.comboT = 0;
  G.wave = 0; G.bossIndex = 0; G.boss = null; G.pendingLevels = 0;
  G.enemies.length = 0; G.pBullets.length = 0; G.eBullets.length = 0;
  G.orbs.length = 0; G.particles.length = 0; G.texts.length = 0; G.pickups.length = 0;
  G.zaps.length = 0; G.holes.length = 0; G.volleys.length = 0;
  G.shards.length = 0; G.hazards.length = 0; G.fogs.length = 0;
  G.refracts.length = 0; G.wakes.length = 0;
  G.waveGroups = []; G.waveTimer = 0; G.shake = 0; G.flash = 0; G.hitStop = 0;
  G.waveHpMul = 1; G.nextHpMul = 1; G.zeroSlow = 0; G.resonateT = 0;
  G.lvQueue.length = 0; G.bonusPicks = 0; G.gateOn = false; G.rxTotal = 0; G._elemI = 0;
  elemResetRuntime(G);
  G.player = newPlayer();
  G.wavePlan = buildWave(1);
  startWave(1);
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('over').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  elLevelUp.classList.add('hidden');
  elElemPick.classList.add('hidden');
  document.getElementById('codex').classList.add('hidden');
  G._bossbar.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  _prev.loadout = null; _prev.ab = null; _prev.combo = null; _prev.elems = null;
  initStars();
  SFX.startMusic();
  SFX.setScene('playing');
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  SFX.setScene('paused');
  document.getElementById('pause').classList.remove('hidden');
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  SFX.setScene('playing');
  document.getElementById('pause').classList.add('hidden');
}

function gameOver() {
  G.state = 'over';
  SFX.setScene('over');
  G.shake = 16;
  G.flash = 0.8;
  const p = G.player;
  SFX.playAt('gameover', p.x, p.y);
  SFX.stopMusic();

  // 死亡爆炸
  for (let i = 0; i < 120; i++) {
    const a = rand(TAU), s = rand(620, 60);
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(1.2, 0.4), max: 1.2, size: rand(8, 2), color: chance(0.4) ? '#ffffff' : '#ff5566', kind: 'spark' });
  }
  G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 1.1, max: 1.1, size: 1400, color: '#ff5566', kind: 'ring' });

  const best = Number(localStorage.getItem('rt_best') || 0);
  const isNew = G.score > best;
  if (isNew) localStorage.setItem('rt_best', String(G.score));
  document.getElementById('menuBest').textContent = fmt(Math.max(best, G.score));

  const mins = Math.floor(G.elapsed / 60), secs = Math.floor(G.elapsed % 60);
  document.getElementById('overTitle').textContent = G.wave >= 20 ? '传奇终结' : G.wave >= 12 ? '舰体损毁' : '任务失败';
  const ranks = [[25, 'S · 裂隙征服者'], [18, 'A · 要塞级火力'], [12, 'B · 精锐驾驶员'], [7, 'C · 合格的截击机'], [0, 'D · 还需更多实战']];
  document.getElementById('overRank').textContent = (isNew ? '★ 新纪录 · ' : '') +
    (ranks.find(r => G.wave >= r[0]) || ranks[4])[1];

  const stats = [
    ['抵达波次', G.wave + ' 波'],
    ['最终得分', fmt(G.score)],
    ['总击杀', String(G.kills)],
    ['最高连击', '×' + G.bestCombo],
    ['人物等级', 'Lv ' + p.level],
    ['存活时长', mins + ':' + String(secs).padStart(2, '0')],
    ['元素觉醒', p.elems.length ? p.elems.map(id => ELEMENTS[id].name).join(' + ') : '未觉醒'],
    ['元素反应', String(G.rxTotal)],
  ];
  document.getElementById('overStats').innerHTML = stats.map(s =>
    '<div class="stat"><b>' + s[1] + '</b><span>' + s[0] + '</span></div>').join('');

  const counts = {};
  p.buildLog.forEach(id => counts[id] = (counts[id] || 0) + 1);
  const list = Object.keys(counts)
    .filter(id => UPGRADE_BY_ID[id] && UPGRADE_BY_ID[id].tag !== '功能')
    .sort((a, b) => counts[b] - counts[a])
    .map(id => '<span class="wchip">' + UPGRADE_BY_ID[id].icon + ' ' + UPGRADE_BY_ID[id].name + ' <b>×' + counts[id] + '</b></span>');
  document.getElementById('overBuild').innerHTML = list.length ? list.join('') : '<span class="wchip">纯主炮流派</span>';

  document.getElementById('over').classList.remove('hidden');
  ui.hud.classList.add('hidden');
  G._bossbar.classList.add('hidden');
}

/* ---------------------------------------------------------
   按钮绑定
   --------------------------------------------------------- */
document.getElementById('btnStart').addEventListener('click', () => { SFX.play('uiClick'); startGame(); });
document.getElementById('btnRetry').addEventListener('click', () => { SFX.play('uiClick'); startGame(); });
document.getElementById('btnMenu').addEventListener('click', () => {
  SFX.play('uiClick');
  G.state = 'menu';
  document.getElementById('over').classList.add('hidden');
  ui.hud.classList.add('hidden');
  G.player = null;
});
document.getElementById('btnResume').addEventListener('click', () => { SFX.play('uiClick'); resumeGame(); });
document.getElementById('btnQuit').addEventListener('click', () => {
  SFX.play('uiClick');
  document.getElementById('pause').classList.add('hidden');
  gameOver();
});
document.getElementById('btnReroll').addEventListener('click', () => {
  const p = G.player;
  if (p.rerolls <= 0) return;
  p.rerolls--;
  SFX.play('uiClick');
  refreshCards();
});
document.getElementById('btnBan').addEventListener('click', () => {
  const p = G.player;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
  SFX.play('heal');
  G.toast('跳过 · 生命回复 25%');
  consumeLevel();
});

/* ---------------------------------------------------------
   元素图鉴（未解锁显示 ???；它让「联动」这件事第一次变得可见）
   --------------------------------------------------------- */
function renderCodex() {
  const seen = codexSeen();
  const out = [];
  out.push('<div class="cx-h">六元素 · 状态</div><div class="cx-grid">');
  for (const id of ELEMENT_ORDER) {
    const d = ELEMENTS[id];
    const got = !!seen['元素 · ' + d.name];
    out.push('<div class="cx-el' + (got ? '' : ' off') + '" style="--ec:' + (got ? d.color : '#5f7391') + '">' +
      '<b>' + (got ? d.glyph + ' ' + d.name + ' · ' + d.status : '？ ? ?') + '</b>' +
      '<span>' + (got ? '上限 ' + d.max + ' 层 · ' + d.dur + 's · ' + d.pos : '未觉醒') + '</span>' +
      '<em>' + (got ? d.line : '在 Lv4 / Lv9 的元素门里觉醒后解锁') + '</em></div>');
  }
  out.push('</div><div class="cx-h">十五种元素反应</div><div class="cx-grid rx">');
  let n = 0;
  for (const r of REACTIONS) {
    const got = !!seen[r.name];
    if (got) n++;
    const A = ELEMENTS[r.a], B = ELEMENTS[r.b];
    out.push('<div class="cx-rx' + (got ? '' : ' off') + '" style="--mix:' + mixHex(A.color, B.color) + '">' +
      '<b>' + (got ? r.name : '? ? ?') + '</b>' +
      '<span>' + A.name + ' + ' + B.name + '</span>' +
      '<em>' + (got ? r.note : '触发一次即可点亮') + '</em></div>');
  }
  out.push('</div>');
  out.push('<p class="cx-tip">已解锁反应 <b>' + n + ' / ' + REACTIONS.length +
    '</b>　·　图鉴只写在本机 localStorage，不采集、不上传</p>');
  document.getElementById('codexBody').innerHTML = out.join('');
}

function openCodex() {
  SFX.play('uiClick');
  renderCodex();
  document.getElementById('codex').classList.remove('hidden');
}
function closeCodex() {
  SFX.play('uiBack');
  document.getElementById('codex').classList.add('hidden');
}
document.getElementById('btnCodex').addEventListener('click', openCodex);
document.getElementById('btnCodexPause').addEventListener('click', openCodex);
document.getElementById('btnCodexClose').addEventListener('click', closeCodex);

/* ---------------------------------------------------------
   主循环
   --------------------------------------------------------- */
let last = performance.now();
let uiAcc = 0;
G.menuT = 0;

function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;   // 防止切标签后瞬移
  G.menuT += dt;

  update(dt);
  render(G.state === 'playing' ? dt : dt * 0.55);

  uiAcc += dt;
  if (uiAcc > 0.06 && G.state !== 'menu') { syncUI(); uiAcc = 0; }

  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------
   启动
   --------------------------------------------------------- */
function boot() {
  initStars();
  buildNebula();
  resize();
  document.getElementById('menuBest').textContent = fmt(Number(localStorage.getItem('rt_best') || 0));
  requestAnimationFrame(loop);
  devHook();
}

/* 调试钩子：?dev=1 自动开局；&lv=N 直升 N 级；&wave=N 跳到第 N 波；
   &elems=fire,ice 指定元素门选哪两个；&ff=秒数 同步快进；
   &autopick=1 快进时自动选卡；&mute=1 静音 */
function devHook() {
  try {
    if (typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search);
    if (!q.has('dev')) return;
    if (q.get('mute') === '1') SFX.toggleMute();
  setTimeout(() => {
    startGame();
    const p = G.player;
    const wantElems = (q.get('elems') || '').split(',').map(s => s.trim()).filter(s => ELEMENTS[s]);
    const lv = Number(q.get('lv') || 0);
    for (let i = 1; i < lv; i++) {
      p.level = i + 1;
      p.xpNext = Math.round(xpFor(p.level) * (p.xpMul || 1));
      /* 元素门：dev 下按等级自动觉醒（否则回归脚本无法覆盖「双元素」路径） */
      if ((p.level === 4 || p.level === 9) && p.elems.length < 2) {
        let id = wantElems[p.elems.length];
        if (!id || p.elems.indexOf(id) >= 0) id = ELEMENT_ORDER.find(x => p.elems.indexOf(x) < 0);
        pickElement(id);
        continue;
      }
      applyUpgrade(G, p, drawCards(G, p, 1)[0]);
    }
    p.xp = 0;
    const wv = Number(q.get('wave') || 0);
    if (wv > 1) {
      G.enemies.length = 0; G.waveGroups = [];
      G.wave = wv - 1;
      G.wavePlan = buildWave(wv);
      startWave(wv);
    }
    // 同步快进：用于截图 / 回归验证，避免依赖浏览器虚拟时间
    const ff = Number(q.get('ff') || 0);
    const autopick = q.get('autopick') === '1';
    for (let i = 0; i < ff * 60; i++) {
      if (G.state === 'levelup') {
        if (!autopick) break;
        if (G.gateOn) {
          const id = ELEMENT_ORDER.find(x => p.elems.indexOf(x) < 0);
          if (!id) break;
          pickElement(id);
        } else {
          if (!curCards.length) break;
          pickCard(curCards[Math.floor(Math.random() * curCards.length)]);
        }
      }
      if (G.state === 'over') break;
      update(1 / 60);
    }
    if (q.get('die') === '1' && G.state === 'playing') gameOver();
  }, 60);
  } catch (e) { /* 调试钩子失败不影响正常游玩 */ }
}
boot();
