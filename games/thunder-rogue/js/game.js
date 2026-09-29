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
  player: null,
  waveGroups: [], waveTimer: 0, wavePhase: 'idle', phaseT: 0,
  boss: null, bossIndex: 0,
  pendingLevels: 0,
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
    level: 1, xp: 0, xpNext: xpFor(1),
    rerolls: 1, taken: {}, buildLog: [], wlv: { main: 1 },
    cd: { main: 0, laser: 0, spread: 0, missile: 0, drone: 0, arc: 0, boomer: 0, black: 0 },
    drones: [], droneAngle: 0,
    stats: {
      dmg: 1, rate: 1, mvSpd: 1, pspd: 1, pierce: 0, crit: 0.06, critMult: 1.8,
      magnet: 78, luck: 0, xpGain: 1, regen: 0, contactRes: 1, extraShots: 0,
    },
    shield: 0, shieldMax: 0, shieldTimer: 0, shieldPulse: 0,
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
  }
}

function gainXp(amount) {
  const p = G.player;
  p.xp += amount * p.stats.xpGain;
  let guard = 0;
  while (p.xp >= p.xpNext && guard++ < 40) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpFor(p.level);
    G.pendingLevels++;
  }
  if (G.pendingLevels > 0 && G.state === 'playing') openLevelUp();
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
  if (G.state === 'levelup') {
    if (k === '1' || k === '2' || k === '3') {
      const card = document.querySelectorAll('#cards .card')[Number(k) - 1];
      if (card) card.click();
    }
    if (k === 'r') document.getElementById('btnReroll').click();
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
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dashVX * dt;
    p.y += p.dashVY * dt;
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
    const base = 395 * p.stats.mvSpd;
    if (dx || dy) {
      const m = Math.hypot(dx, dy) || 1;
      p.x += dx / m * base * dt;
      p.y += dy / m * base * dt;
    } else if (ptr.active) {
      // 指针跟随（触屏偏移 44px 避免手指遮挡舰体）
      const tx = ptr.x, ty = ptr.y - 44;
      const ddx = tx - p.x, ddy = ty - p.y;
      const d = Math.hypot(ddx, ddy);
      if (d > 1) {
        const step = Math.min(d, base * 2.4 * dt);
        p.x += ddx / d * step;
        p.y += ddy / d * step;
      }
    }
  }

  p.x = clamp(p.x, 18, W - 18);
  p.y = clamp(p.y, 38, H - 26);

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
  const slowFactor = p.slowT > 0 ? 0.35 : 1;
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
    b.x += b.vx * wdt;
    b.y += b.vy * wdt;
    b.life -= wdt;
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
        if (G.t > e._holeCd) { e._holeCd = G.t + 0.25; damageEnemy(G, e, h.dps * 0.25, { showText: false }); }
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
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (b.hits && b.hits.has(e)) continue;
      const rr = e.r + b.r;
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < rr * rr) {
        damageEnemy(G, e, b.dmg, { crit: b.crit, big: b.r > 6 });
        if (!b.hits) b.hits = new Set();
        b.hits.add(e);
        if (b.pierce > 0) { b.pierce--; }
        else { b.life = 0; break; }
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

  // 引擎尾焰
  const fl = 18 + Math.sin(G.t * 42) * 6 + (ptr.active || keys['w'] ? 6 : 0);
  const fg = ctx.createLinearGradient(p.x, p.y + 8, p.x, p.y + 8 + fl);
  fg.addColorStop(0, 'rgba(255,255,255,.95)');
  fg.addColorStop(0.4, 'rgba(126,249,255,.7)');
  fg.addColorStop(1, 'rgba(78,168,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(p.x - 6, p.y + 8); ctx.lineTo(p.x + 6, p.y + 8); ctx.lineTo(p.x, p.y + 8 + fl);
  ctx.closePath(); ctx.fill();

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

function drawBullets() {
  // 玩家子弹
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.pBullets) {
    const a = Math.atan2(b.vy, b.vx);
    drawGlow(ctx, b.x, b.y, b.r * 6.5, b.color, 0.75);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    if (b.kind === 'blade') {
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

function drawWorld() {
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
   升级三选一 UI
   --------------------------------------------------------- */
const elLevelUp = document.getElementById('levelup');
const elCards = document.getElementById('cards');
let curCards = [];

function openLevelUp() {
  G.state = 'levelup';
  const p = G.player;
  document.getElementById('lvupLevel').textContent = String(p.level);
  refreshCards();
  elLevelUp.classList.remove('hidden');
  SFX.play('levelup');
}

function refreshCards() {
  const p = G.player;
  curCards = drawCards(G, p, 3);
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
  G.pendingLevels = Math.max(0, G.pendingLevels - 1);
  SFX.play('uiClick');
  G.toast(u.name + ' · 已强化');
  if (G.pendingLevels > 0) {
    document.getElementById('lvupLevel').textContent = String(p.level);
    refreshCards();
  } else {
    elLevelUp.classList.add('hidden');
    G.state = 'playing';
  }
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
  G.waveGroups = []; G.waveTimer = 0; G.shake = 0; G.flash = 0; G.hitStop = 0;
  G.player = newPlayer();
  G.wavePlan = buildWave(1);
  startWave(1);
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('over').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  elLevelUp.classList.add('hidden');
  G._bossbar.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  _prev.loadout = null; _prev.ab = null; _prev.combo = null;
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
  G.pendingLevels = Math.max(0, G.pendingLevels - 1);
  SFX.play('heal');
  G.toast('跳过 · 生命回复 25%');
  if (G.pendingLevels > 0) refreshCards();
  else { elLevelUp.classList.add('hidden'); G.state = 'playing'; }
});

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
   &ff=秒数 同步快进；&autopick=1 快进时自动选卡；&mute=1 静音 */
function devHook() {
  try {
    if (typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search);
    if (!q.has('dev')) return;
    if (q.get('mute') === '1') SFX.toggleMute();
  setTimeout(() => {
    startGame();
    const p = G.player;
    const lv = Number(q.get('lv') || 0);
    for (let i = 1; i < lv; i++) {
      p.level = i + 1;
      p.xpNext = xpFor(p.level);
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
        pickCard(curCards[Math.floor(Math.random() * curCards.length)]);
      }
      if (G.state === 'over') break;
      update(1 / 60);
    }
    if (q.get('die') === '1' && G.state === 'playing') gameOver();
  }, 60);
  } catch (e) { /* 调试钩子失败不影响正常游玩 */ }
}
boot();
