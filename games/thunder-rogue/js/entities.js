/* =========================================================
   entities.js — 敌人原型 / AI / 弹幕 / 粒子
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   敌人原型库
   配色规则（可读性基石）：敌人全部使用暖色 / 中性色，
   冷色（青、蓝、薄荷、靛）严格保留给玩家弹幕，永不混用。
   --------------------------------------------------------- */
const ENEMY_DEFS = {
  drone:    { hp: 4,  r: 14, spd: 70,  xp: 1, score: 10, color: '#ff8a5c', ai: 'straight' },
  zig:      { hp: 5,  r: 14, spd: 85,  xp: 2, score: 14, color: '#ffc857', ai: 'sine', amp: 78, freq: 2.1 },
  mini:     { hp: 2,  r: 9,  spd: 155, xp: 1, score: 8,  color: '#ff6b9d', ai: 'erratic' },
  chaser:   { hp: 9,  r: 16, spd: 55,  xp: 4, score: 22, color: '#ff4d4d', ai: 'chase', acc: 190, maxSpd: 235 },
  shooter:  { hp: 14, r: 17, spd: 95,  xp: 5, score: 30, color: '#e668ff', ai: 'shooter', hold: 235, fireCd: 1.7, burst: 3 },
  tank:     { hp: 46, r: 26, spd: 40,  xp: 10, score: 70, color: '#cfd8e6', ai: 'straight', armor: 0.25 },
  splitter: { hp: 16, r: 20, spd: 70,  xp: 6, score: 34, color: '#ffd93d', ai: 'sine', amp: 46, freq: 1.3, split: 3 },
  orbiter:  { hp: 20, r: 16, spd: 130, xp: 6, score: 38, color: '#ff9ae0', ai: 'orbit', rad: 86 },
  turret:   { hp: 26, r: 20, spd: 74,  xp: 8, score: 50, color: '#ffb03a', ai: 'turret', fireCd: 2.3, arms: 8, hold: 128 },
};

/** 创建敌人实例 */
function makeEnemy(G, type, x, y, opt = {}) {
  const d = ENEMY_DEFS[type];
  const wave = G.wave || 1;
  const hpScale = 1 + 0.18 * Math.pow(wave, 1.12);
  const bsScale = 1 + wave * 0.015;
  const e = {
    type, ai: d.ai,
    x, y, x0: x, y0: y,
    r: d.r,
    hp: d.hp * hpScale * (opt.hpMul || 1),
    xp: d.xp * (opt.xpMul || 1),
    score: d.score,
    color: d.color,
    spd: d.spd * (opt.spdMul || 1),
    armor: d.armor || 0,
    t: 0, angle: 0, spin: 0,
    vx: 0, vy: 0,
    hitFlash: 0,
    fireCd: 0.55 + Math.random() * 0.6,
    bulletSpd: 250 * Math.min(2.2, bsScale),
    phase: opt.phase == null ? rand(TAU) : opt.phase,
    amp: d.amp, freq: d.freq,
    hold: d.hold, burst: d.burst,
    rad: d.rad, arms: d.arms,
    acc: d.acc, maxSpd: d.maxSpd, split: d.split,
    // 轨道类 AI 的字段一律预先初始化，杜绝"orbiting 为真但锚点未定义"的 NaN
    cx: x, cy: y, a0: rand(TAU), orbiting: false, retreat: false,
    dropped: false,
    isBoss: false,
    driftDir: chance(0.5) ? 1 : -1,
  };
  e.maxHp = e.hp;
  return e;
}

/* ---------------------------------------------------------
   敌弹
   --------------------------------------------------------- */
function spawnEBullet(G, x, y, ang, spd, opt = {}) {
  G.eBullets.push({
    x, y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    r: opt.r || 6,
    dmg: opt.dmg || 9,
    color: opt.color || '#ff5c8a',
    life: opt.life || 8,
    t: 0,
    spin: opt.spin || 0,
    homing: opt.homing || 0,
    shape: opt.shape || 'orb',
  });
}

/* ---------------------------------------------------------
   玩家子弹
   --------------------------------------------------------- */
function spawnPBullet(G, x, y, ang, opt = {}) {
  const p = G.player;
  G.pBullets.push({
    x, y,
    vx: Math.cos(ang) * (opt.spd || 760),
    vy: Math.sin(ang) * (opt.spd || 760),
    r: opt.r || 4.5,
    len: opt.len || 18,
    dmg: opt.dmg || 6,
    color: opt.color || '#7ef9ff',
    pierce: opt.pierce || 0,
    hits: opt.hits || null,
    life: opt.life || 2.2,
    t: 0,
    homing: opt.homing || 0,
    crit: opt.crit || false,
    kind: opt.kind || 'bolt',
    spin: 0,
    boomer: opt.boomer || null,
    src: opt.src || 'main',
    trail: opt.trail !== false,
  });
}

/* ---------------------------------------------------------
   伤害结算 —— 所有伤害入口
   --------------------------------------------------------- */
function damageEnemy(G, e, dmg, opt = {}) {
  if (e.dead) return;
  let d = dmg * (1 - (e.armor || 0));
  const crit = opt.crit;
  e.hp -= d;
  e.hitFlash = 1;

  // 高频命中时按敌人节流特效，避免刷屏与掉帧
  const fxOk = opt.force || G.t - (e._fxT || 0) > 0.07;
  if (fxOk) {
    e._fxT = G.t;
    const n = opt.big ? 7 : 3;
    for (let i = 0; i < n; i++) {
      G.particles.push({
        x: e.x + rand(e.r, -e.r) * 0.7, y: e.y + rand(e.r, -e.r) * 0.7,
        vx: rand(190, -190), vy: rand(190, -190),
        life: rand(0.34, 0.14), max: 0.34,
        size: rand(3.4, 1.4), color: crit ? '#ffd166' : '#ffffff', kind: 'spark',
      });
    }
    if (opt.showText !== false) {
      G.texts.push({
        x: e.x + rand(10, -10), y: e.y - e.r * 0.6,
        vy: -58, life: 0.7, max: 0.7,
        txt: Math.round(d).toString(),
        color: crit ? '#ffd166' : '#dff6ff',
        size: crit ? 17 : 12,
      });
      if (G.texts.length > 60) G.texts.splice(0, G.texts.length - 60);
    }
  }
  // 命中反馈（此前全靠视觉，打击感缺一半）；自身带节流预算，不会刷屏
  SFX.playAt(crit ? 'crit' : 'hit', e.x, e.y);

  if (e.hp <= 0) killEnemy(G, e);
}

function killEnemy(G, e) {
  if (e.dead) return;
  e.dead = true;

  const isBig = e.isBoss || e.type === 'tank';
  SFX.playAt(isBig ? 'bigKill' : 'kill', e.x, e.y);

  // 爆炸粒子
  const n = e.isBoss ? 90 : (isBig ? 26 : 14);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(e.isBoss ? 520 : 260, 40);
    G.particles.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.85, 0.28), max: 0.85,
      size: rand(e.isBoss ? 7 : 4.5, 1.6),
      color: chance(0.35) ? '#ffffff' : e.color, kind: 'spark',
    });
  }
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.42, max: 0.42,
    size: e.isBoss ? 300 : e.r * 5.5, color: e.color, kind: 'ring' });
  if (e.r > 16) {
    G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.9, max: 0.9,
      size: e.r * 3.4, color: '#ffffff', kind: 'smoke' });
  }

  G.shake = Math.min(16, G.shake + (e.isBoss ? 15 : isBig ? 4.5 : 1.6));
  G.kills++;
  G.comboT = 2.1;
  G.combo++;
  // 每 10 连击给一次正反馈，让"连段手感"有听觉锚点
  if (G.combo > 0 && G.combo % 10 === 0) SFX.play('combo');
  G.score += Math.round(e.score * (1 + (G.combo - 1) * 0.04));

  // 经验掉落
  const orbs = e.isBoss ? 22 : (e.type === 'tank' ? 6 : (e.r > 18 ? 3 : 1));
  const per = Math.max(1, Math.round(e.xp / orbs * 10) / 10);
  for (let i = 0; i < orbs; i++) {
    G.orbs.push({
      x: e.x + rand(e.r, -e.r), y: e.y + rand(e.r, -e.r),
      vx: rand(130, -130), vy: rand(60, -130),
      val: per, t: 0, mag: false, life: 14,
      r: e.isBoss ? 8 : (e.xp >= 5 ? 6 : 4.5),
    });
  }

  // 分裂
  if (e.type === 'splitter' && e.split) {
    for (let i = 0; i < e.split; i++) {
      const a = -Math.PI / 2 + (i - (e.split - 1) / 2) * 0.75;
      const m = makeEnemy(G, 'mini', e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18);
      m.vx = Math.cos(a) * 130; m.vy = Math.sin(a) * 130;
      G.enemies.push(m);
    }
  }

  // 掉落物
  if (e.isBoss) {
    G.pickups.push({ kind: 'heal', x: e.x, y: e.y, vy: 40, t: 0, r: 15 });
    G.pickups.push({ kind: 'bomb', x: e.x - 40, y: e.y, vy: 40, t: 0, r: 15 });
    G.pickups.push({ kind: 'shield', x: e.x + 40, y: e.y, vy: 40, t: 0, r: 15 });
  } else if (chance(e.type === 'tank' ? 0.34 : 0.045)) {
    const kinds = ['heal', 'shield', 'bomb'];
    const kind = pick(chance(0.58) ? ['heal'] : kinds);
    G.pickups.push({ kind, x: e.x, y: e.y, vy: 58, t: 0, r: 13 });
  }
}

/* ---------------------------------------------------------
   敌人 AI 更新
   --------------------------------------------------------- */
function updateEnemy(G, e, dt) {
  const p = G.player;
  e.t += dt;
  e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
  e.angle += (e.spin || 0) * dt;

  switch (e.ai) {
    case 'straight': {
      e.y += e.spd * dt;
      e.x += Math.sin(e.t * 1.1 + e.phase) * 16 * dt;
      break;
    }
    case 'sine': {
      e.y += e.spd * dt;
      e.x = e.x0 + Math.sin(e.t * e.freq + e.phase) * e.amp;
      break;
    }
    case 'erratic': {
      e.y += e.spd * dt;
      if (e.vx) { e.x += e.vx * dt; e.vx *= 0.96; }
      if (chance(dt * 5)) e.vx = rand(170, -170);
      break;
    }
    case 'chase': {
      const a = angTo(e, p);
      e.vx += Math.cos(a) * e.acc * dt;
      e.vy += Math.sin(a) * e.acc * dt;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > e.maxSpd) { e.vx = e.vx / sp * e.maxSpd; e.vy = e.vy / sp * e.maxSpd; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.spin = 0.9;
      break;
    }
    case 'shooter': {
      if (e.y < e.hold) { e.y += e.spd * dt; }
      else {
        // 落位后缓慢横移，保持压迫感
        const dx = p.x - e.x;
        e.x += clamp(dx, -1, 1) * 34 * dt;
        e.x = clamp(e.x, 40, 500);
      }
      if (e.y >= e.hold - 6) {
        e.fireCd -= dt;
        if (e.fireCd <= 0.45 && e.fireCd + dt > 0.45) { /* 充能预警帧 */ }
        if (e.fireCd <= 0) {
          e.fireCd = (1.7 - Math.min(0.7, G.wave * 0.03)) * rand(1.15, 0.85);
          // 三连点射排入延时队列（随暂停/结算一起停摆，避免 setTimeout 泄漏）
          for (let i = 0; i < (e.burst || 3); i++) {
            G.volleys.push({
              t: i * 0.105, e,
              fire() {
                if (e.dead) return;
                spawnEBullet(G, e.x, e.y + 14, angTo(e, G.player) + rand(0.08, -0.08), e.bulletSpd * 1.15,
                  { r: 6.5, dmg: 9, color: '#ff5c8a' });
                SFX.playAt('eshoot', e.x, e.y);
              },
            });
          }
          for (let i = 0; i < 5; i++) {
            G.particles.push({ x: e.x, y: e.y + 14, vx: rand(60, -60), vy: rand(20, 160),
              life: 0.24, max: 0.24, size: 3.5, color: '#ff5c8a', kind: 'spark' });
          }
        }
      }
      break;
    }
    case 'orbit': {
      const ty = e.hold == null ? 260 : e.hold;
      if (e.y < ty && !e.orbiting) {
        e.y += e.spd * dt;
        if (e.y >= ty) { e.orbiting = true; e.cy = e.y; e.cx = clamp(e.x, 110, 430); e.a0 = angTo({ x: e.cx, y: e.cy }, e); }
      } else {
        e.a0 += 1.9 * dt * e.driftDir;
        e.x = e.cx + Math.cos(e.a0) * e.rad;
        e.y = e.cy + Math.sin(e.a0) * e.rad * 0.62;
      }
      e.spin = 2.4 * e.driftDir;
      break;
    }
    case 'turret': {
      // 先下降到 hold 高度落位，再开始径向弹幕（避免卡在屏幕外导致波次无法结束）
      if (e.y < (e.hold == null ? 128 : e.hold)) {
        e.y += e.spd * dt;
        e.spin = 1.2;
        break;
      }
      e.spin = 0.6;
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = (2.3 - Math.min(0.9, G.wave * 0.04)) * rand(1.1, 0.9);
        const arms = e.arms || 8;
        const off = rand(TAU);
        for (let i = 0; i < arms; i++) {
          spawnEBullet(G, e.x, e.y, off + i / arms * TAU, e.bulletSpd * 0.72,
            { r: 6, dmg: 8, color: '#ff8a3d' });
        }
        SFX.playAt('eshoot', e.x, e.y);
      }
      break;
    }
  }
  // 波次超时后残余敌人撤离，保证流程永不死锁
  if (e.retreat) {
    e.orbiting = false;          // 环刃必须解除环绕，否则会无视撤离指令原地打转
    e.ai = 'straight';
    e.y += 330 * dt;
    e.x += (e.x < 270 ? -60 : 60) * dt;
  }
  if (e.spin && e.ai !== 'chase' && e.ai !== 'orbit' && e.ai !== 'turret') e.angle += 0;
}

/* ---------------------------------------------------------
   Boss
   --------------------------------------------------------- */
function makeBoss(G, index) {
  // Boss 血量：底数 + 迭代系数 + 波次递归，保证 3 阶段战斗有足够长度
  const hp = 440 * (1 + (index - 1) * 0.60) * (1 + 0.10 * Math.pow(G.wave, 1.15));
  const b = {
    isBoss: true, type: 'boss', bossIndex: index,
    name: index === 1 ? '裂隙哨兵' : index === 2 ? '裂隙核心' : '裂隙核心 · 迭代 ' + (index - 1),
    x: 270, y: -120, targetY: 196,
    r: 62,
    hp, maxHp: hp,
    armor: Math.min(0.30, (index - 1) * 0.07),
    xp: 40 * index, score: 1200 * index,
    color: index === 1 ? '#ff5c8a' : '#b06bff',
    t: 0, angle: 0, spin: 0.35,
    vx: 0, vy: 0,
    hitFlash: 0, dead: false,
    state: 'enter', stateT: 0,
    patternIdx: 0, patternT: 0, fireCd: 0, sub: 0,
    phase: 1, chargeColor: '#ff5c8a',
    moveTarget: 270, moveT: 0,
    laser: null, laserHitT: 0,
    bulletSpd: 250 * Math.min(2.2, 1 + G.wave * 0.015),
  };
  return b;
}

const BOSS_PATTERNS = [
  {
    id: 'fan', name: '扇形散射', dur: 3.0, tele: '#ff5c8a',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        b.fireCd = 0.62 - Math.min(0.24, (b.phase - 1) * 0.1);
        const arms = 5 + (b.phase - 1) * 2 + (b.bossIndex > 1 ? 2 : 0);
        const base = Math.PI / 2;
        for (let i = 0; i < arms; i++) {
          // 中心留安全缝：跳过正中间
          const f = (i / (arms - 1) - 0.5) * 2;
          if (arms % 2 === 1 && Math.abs(f) < 0.12) continue;
          const a = base + f * (0.75 + b.phase * 0.12);
          spawnEBullet(G, b.x, b.y + 26, a, b.bulletSpd * 1.05, { r: 7.5, dmg: 10, color: '#ff5c8a', shape: 'orb' });
        }
        SFX.playAt('eshoot', b.x, b.y);
      }
    },
  },
  {
    id: 'aim', name: '追踪爆裂', dur: 2.8, tele: '#ff9f45',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        b.fireCd = 0.46 - Math.min(0.2, (b.phase - 1) * 0.08);
        const a = angTo(b, G.player);
        for (let i = -1; i <= 1; i++) {
          spawnEBullet(G, b.x + i * 22, b.y + 26, a + i * 0.14, b.bulletSpd * 1.32,
            { r: 6, dmg: 9, color: '#ff9f45' });
        }
        // 侧向散射
        spawnEBullet(G, b.x - 44, b.y + 10, Math.PI * 0.72, b.bulletSpd * 0.9, { r: 6.5, dmg: 8, color: '#ff9f45' });
        spawnEBullet(G, b.x + 44, b.y + 10, Math.PI * 0.28, b.bulletSpd * 0.9, { r: 6.5, dmg: 8, color: '#ff9f45' });
      }
    },
  },
  {
    id: 'spiral', name: '旋转弹幕', dur: 3.4, tele: '#b06bff',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        b.fireCd = 0.075;
        b.sub += 0.42 + b.phase * 0.05;
        const arms = 2 + (b.bossIndex > 1 ? 2 : 0) + (b.phase >= 3 ? 1 : 0);
        for (let i = 0; i < arms; i++) {
          const a = b.sub + i / arms * TAU;
          spawnEBullet(G, b.x, b.y, a, b.bulletSpd * 0.86, { r: 6.5, dmg: 9, color: '#b06bff' });
        }
      }
    },
  },
  {
    id: 'sweep', name: '激光扫射', dur: 3.2, tele: '#ff2d55',
    update(G, b, dt) {
      if (!b.laser) { b.laser = { ang: rand(TAU), dir: chance(0.5) ? 1 : -1, warn: 1.1, active: 1.0, hit: 0 }; }
      const L = b.laser;
      if (L.warn > 0) {
        L.warn -= dt;
        L.ang += L.dir * 0.5 * dt;
        return;
      }
      const dt2 = dt;
      L.active -= dt2;
      L.ang += L.dir * 1.25 * dt2;
      L.hit -= dt2;
      // 命中判定：射线到玩家距离
      const p = G.player;
      const dx = Math.cos(L.ang), dy = Math.sin(L.ang);
      const px = p.x - b.x, py = p.y - b.y;
      const proj = px * dx + py * dy;
      if (proj > 0) {
        const perp = Math.abs(px * dy - py * dx);
        if (perp < 26 + p.r && L.hit <= 0 && p.invuln <= 0) {
          L.hit = 0.45;
          hurtPlayer(16);
        }
      }
      if (L.active <= 0) b.laser = null;
    },
  },
  {
    id: 'summon', name: '召唤护卫', dur: 2.2, tele: '#7cffb2',
    update(G, b, dt) {
      if (b.sub > 0) return;
      b.sub = 1;
      SFX.play('bossPhase');
      const n = 3 + (b.bossIndex - 1);
      for (let i = 0; i < n; i++) {
        const t = b.bossIndex > 1 ? (i % 2 === 0 ? 'chaser' : 'drone') : 'drone';
        const e = makeEnemy(G, t, b.x + (i - (n - 1) / 2) * 62, b.y + 40);
        G.enemies.push(e);
      }
      G.texts.push({ x: b.x, y: b.y - 90, vy: -30, life: 1.1, max: 1.1,
        txt: '召唤护卫', color: '#7cffb2', size: 15 });
    },
  },
];

function updateBoss(G, b, dt) {
  const p = G.player;
  b.t += dt;
  b.hitFlash = Math.max(0, b.hitFlash - dt * 5);

  const hpRatio = b.hp / b.maxHp;
  const newPhase = hpRatio > 0.68 ? 1 : hpRatio > 0.34 ? 2 : 3;
  if (newPhase !== b.phase) {
    b.phase = newPhase;
    b.charging = 0;
    SFX.play('bossPhase');
    G.shake = Math.min(16, G.shake + 8);
    G.banner('阶段 ' + newPhase, false);
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU);
      G.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * rand(400, 120), vy: Math.sin(a) * rand(400, 120),
        life: 0.7, max: 0.7, size: 5, color: '#ffd166', kind: 'spark' });
    }
  }

  if (b.state === 'enter') {
    b.y += 90 * dt;
    if (b.y >= b.targetY) { b.y = b.targetY; b.state = 'move'; b.stateT = 0.6; b.moveTarget = 270; }
    return;
  }

  // 横向巡游
  if (b.state === 'move') {
    b.stateT -= dt;
    b.x = lerp(b.x, b.moveTarget, 1 - Math.pow(0.001, dt));
    b.y = lerp(b.y, b.targetY + Math.sin(b.t * 1.4) * 14, 1 - Math.pow(0.006, dt));
    if (b.stateT <= 0) {
      // 选择下一个弹幕模式
      const pool = b.bossIndex > 1 ? BOSS_PATTERNS : BOSS_PATTERNS.filter(q => q.id !== 'sweep');
      if (chance(0.15)) {
        b.pattern = BOSS_PATTERNS.find(q => q.id === 'summon');
      } else {
        const cand = pool.filter(q => q.id !== 'summon' && q.id !== b.lastPattern);
        b.pattern = pick(cand.length ? cand : pool.filter(q => q.id !== 'summon'));
      }
      b.lastPattern = b.pattern.id;
      b.state = 'charge'; b.stateT = b.pattern.tele ? 0.8 : 0.6;
      b.chargeColor = b.pattern.tele;
      SFX.play('bossWarn');
    }
    return;
  }

  if (b.state === 'charge') {
    b.stateT -= dt;
    b.x = lerp(b.x, b.moveTarget, 1 - Math.pow(0.05, dt));
    // 蓄力粒子吸入
    if (chance(dt * 30)) {
      const a = rand(TAU), d = rand(140, 60);
      G.particles.push({
        x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d,
        vx: -Math.cos(a) * 170, vy: -Math.sin(a) * 170,
        life: 0.4, max: 0.4, size: 4, color: b.chargeColor, kind: 'spark',
      });
    }
    if (b.stateT <= 0) { b.state = 'attack'; b.patternT = b.pattern.dur; b.fireCd = 0.1; b.sub = 0; b.laser = null; }
    return;
  }

  if (b.state === 'attack') {
    b.patternT -= dt;
    b.x += Math.sin(b.t * 0.8) * 26 * dt;
    b.x = clamp(b.x, 90, 450);
    b.pattern.update(G, b, dt);
    if (b.patternT <= 0) {
      b.laser = null;
      b.state = 'move';
      b.stateT = 0.75 + rand(0.35);
      b.moveTarget = rand(430, 110);
    }
  }
}

/* ---------------------------------------------------------
   Boss 绘制
   --------------------------------------------------------- */
function drawBoss(ctx, b) {
  const charging = b.state === 'charge';
  const pulse = charging ? 1 + Math.sin(b.t * 42) * 0.08 : 1;
  const core = charging ? b.chargeColor : b.color;

  ctx.save();
  ctx.translate(b.x, b.y);

  // 外光晕
  drawGlow(ctx, 0, 0, b.r * 4.6 * pulse, core, charging ? 0.9 : 0.55);

  // 旋转外环
  ctx.save();
  ctx.rotate(b.t * 0.5);
  ctx.strokeStyle = rgba(core, 0.65);
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 12]);
  ctx.beginPath(); ctx.arc(0, 0, b.r * 1.42, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.rotate(-b.t * 0.85);
  ctx.strokeStyle = rgba('#ffffff', 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, b.r * 1.18, 0, TAU); ctx.stroke();
  ctx.restore();

  // 主体六边形
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU - Math.PI / 2;
    const R = b.r * (i % 2 === 0 ? 1.0 : 0.92);
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R, Math.sin(a) * R * 0.9);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -b.r, 0, b.r);
  g.addColorStop(0, rgba('#ffffff', 0.22));
  g.addColorStop(0.5, rgba(core, 0.55));
  g.addColorStop(1, rgba('#0a0e1c', 0.95));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.55);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // 核心
  const cr = b.r * (charging ? 0.52 * pulse : 0.4);
  ctx.beginPath(); ctx.arc(0, 0, cr, 0, TAU);
  ctx.fillStyle = charging ? core : rgba(core, 0.9);
  ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, cr * 0.55, 0, TAU);
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = charging ? 0.95 : 0.6; ctx.fill(); ctx.globalAlpha = 1;

  // 炮口
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath(); ctx.arc(i * b.r * 0.62, b.r * 0.55, 11, 0, TAU);
    ctx.fillStyle = rgba('#0a0e1c', 0.9); ctx.fill();
    ctx.strokeStyle = rgba(core, 0.9); ctx.lineWidth = 2; ctx.stroke();
  }

  if (b.hitFlash > 0) {
    ctx.globalAlpha = b.hitFlash * 0.5;
    ctx.beginPath(); ctx.arc(0, 0, b.r * 1.25, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 激光
  if (b.laser) {
    const L = b.laser;
    const len = 1400;
    const ex = b.x + Math.cos(L.ang) * len, ey = b.y + Math.sin(L.ang) * len;
    if (L.warn > 0) {
      ctx.save();
      ctx.strokeStyle = rgba('#ff2d55', 0.32 + Math.sin(b.t * 30) * 0.18);
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    } else {
      const w = 26 * (L.active > 0.85 ? (1 - L.active) / 0.15 : (L.active < 0.15 ? L.active / 0.15 : 1));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff2d55', 0.55); ctx.lineWidth = Math.max(2, w * 2.4);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, w * 0.85);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }
  }
}

/* ---------------------------------------------------------
   敌人绘制
   --------------------------------------------------------- */
function drawEnemy(ctx, e, player) {
  ctx.save();
  ctx.translate(e.x, e.y);

  const flash = e.hitFlash > 0;
  const col = flash ? '#ffffff' : e.color;
  drawGlow(ctx, 0, 0, e.r * 4.2, e.color, flash ? 0.9 : 0.42);

  ctx.save();
  if (e.ai === 'chase' && player) ctx.rotate(angTo(e, player));
  else if (e.spin) ctx.rotate(e.angle);

  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba('#ffffff', 0.5);
  ctx.fillStyle = rgba(col, 0.88);

  switch (e.type) {
    case 'drone': {
      ctx.beginPath();
      ctx.moveTo(0, e.r); ctx.lineTo(e.r * 0.92, -e.r * 0.72); ctx.lineTo(0, -e.r * 0.3); ctx.lineTo(-e.r * 0.92, -e.r * 0.72);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'zig': {
      ctx.beginPath();
      ctx.moveTo(0, e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, -e.r); ctx.lineTo(-e.r, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.32, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'mini': {
      ctx.beginPath();
      ctx.moveTo(0, e.r); ctx.lineTo(e.r, -e.r); ctx.lineTo(-e.r, -e.r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'chaser': {
      ctx.beginPath();
      ctx.moveTo(e.r * 1.15, 0); ctx.lineTo(-e.r * 0.7, e.r * 0.9);
      ctx.lineTo(-e.r * 0.25, 0); ctx.lineTo(-e.r * 0.7, -e.r * 0.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'shooter': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU - Math.PI / 2;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba('#0a0e1c', 0.85);
      ctx.fillRect(-4, e.r * 0.3, 8, e.r * 0.95);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, TAU); ctx.fill();
      break;
    }
    case 'tank': {
      roundRect(ctx, -e.r, -e.r * 0.82, e.r * 2, e.r * 1.64, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba('#0a0e1c', 0.5);
      roundRect(ctx, -e.r * 0.66, -e.r * 0.5, e.r * 1.32, e.r * 0.5, 3); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.85);
      ctx.beginPath(); ctx.arc(0, e.r * 0.22, e.r * 0.24, 0, TAU); ctx.fill();
      break;
    }
    case 'splitter': {
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba('#0a0e1c', 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = e.t * 1.8 + i / 3 * TAU;
        ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.55, Math.sin(a) * e.r * 0.55, 3, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
      break;
    }
    case 'orbiter': {
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -e.r); ctx.lineTo(e.r * 0.62, e.r * 0.5); ctx.lineTo(-e.r * 0.62, e.r * 0.5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'turret': {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const R = i % 2 === 0 ? e.r : e.r * 1.28;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R, Math.sin(a) * R);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba('#0a0e1c', 0.8);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = e.fireCd < 0.5 ? '#fff' : rgba('#ffd166', 0.9);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.24, 0, TAU); ctx.fill();
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();

  // 蓄力预警：shooter / turret 开火前炮口闪光
  if ((e.type === 'shooter' || e.type === 'turret') && e.fireCd < 0.5) {
    drawGlow(ctx, 0, e.type === 'shooter' ? e.r * 0.8 : 0, e.r * 3.2, '#ffffff', 0.6);
  }

  // 血条（高血量单位）
  if (e.maxHp > 24 && !e.isBoss) {
    const w = e.r * 2.1, h = 3.5;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(-w / 2, -e.r - 11, w, h);
    ctx.fillStyle = e.color;
    ctx.fillRect(-w / 2, -e.r - 11, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }
  ctx.restore();
}
