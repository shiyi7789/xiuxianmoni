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

  /* ---------- v2 扩充：10 个新小怪 ----------
     色值均与既有 9 色色相差 ≥25°，并且每个都有独立剪影做二次区分 */
  rammer:   { hp: 12, r: 17, spd: 48,  xp: 4,  score: 26, color: '#ff7043', ai: 'ram',      hold: 170, warn: 1.0, dash: 520, dmg: 14 },
  xpblob:   { hp: 70, r: 26, spd: 26,  xp: 26, score: 20, color: '#ffe08a', ai: 'drift',    escape: 940, noBurn: 1 },
  marksman: { hp: 18, r: 16, spd: 88,  xp: 6,  score: 40, color: '#ff3d6e', ai: 'snipe',    hold: 150, warn: 1.1, fireCd: 2.8 },
  tick:     { hp: 8,  r: 13, spd: 150, xp: 2,  score: 18, color: '#ffab40', ai: 'kamikaze', trigger: 76, dmg: 8 },
  mender:   { hp: 30, r: 17, spd: 62,  xp: 8,  score: 55, color: '#fff2a8', ai: 'support',  hold: 120, heal: 0.06, hrad: 190 },
  bulwark:  { hp: 40, r: 20, spd: 46,  xp: 8,  score: 60, color: '#d7c4a3', ai: 'aegis',    layers: 10, red: 0.75 },
  sweeper:  { hp: 34, r: 24, spd: 300, xp: 9,  score: 70, color: '#ff7a2f', ai: 'sweep',    dmg: 16, passes: 4 },
  leech:    { hp: 16, r: 15, spd: 118, xp: 3,  score: 34, color: '#ff4fa3', ai: 'leech',    goal: 12 },
  cluster:  { hp: 28, r: 22, spd: 58,  xp: 7,  score: 48, color: '#ff85d0', ai: 'drift',    shards: 3 },
  phaser:   { hp: 24, r: 18, spd: 96,  xp: 7,  score: 46, color: '#a8b4c8', ai: 'phase',    cycle: 3.2 },
};

/** 创建敌人实例 */
function makeEnemy(G, type, x, y, opt = {}) {
  const d = ENEMY_DEFS[type];
  const wave = G.wave || 1;
  // v2 难度偿还：1 + 0.24 × wave^1.17（原 1 + 0.18 × wave^1.12，W20 时 ×1.50）
  const hpScale = 1 + 0.24 * Math.pow(wave, 1.17);
  const bsScale = 1 + wave * 0.015;
  const e = {
    type, ai: d.ai,
    x, y, x0: x, y0: y,
    r: d.r,
    hp: d.hp * hpScale * (opt.hpMul || 1) * (G.waveHpMul || 1) * (G.pactHpMul || 1) * (G.abyssHpMul || 1),
    xp: d.xp * (opt.xpMul || 1),
    score: d.score,
    color: d.color,
    spd: d.spd * (opt.spdMul || 1) * (G.abyssSpdMul || 1),
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
    // v2：元素状态 / 控制 / 新怪专属字段（全部预初始化，避免 undefined 参与运算变 NaN）
    st: null, freezeT: 0, pullSrc: 0, mirror: 0, _freezeRx: null,
    layers: d.layers || 0, layersMax: d.layers || 0, layerT: 0,
    warnT: 0, dashT: 0, dashes: 0, lockedX: 0,
    escape: d.escape || 0, escaped: false,
    phasing: false, cycle: d.cycle || 0,
    atk: 0, passDir: chance(0.5) ? 1 : -1, passes: d.passes || 0,
    eaten: 0, goal: d.goal || 0,
    shards: d.shards || 0,
    noBurn: d.noBurn ? 1 : 0,
    dmg: d.dmg || 0,
  };
  e.maxHp = e.hp;
  e.spd0 = e.spd;
  e.maxSpd0 = e.maxSpd || 0;
  if (type === 'sweeper') { e.y = rand(700, 180); e.x = e.passDir > 0 ? -e.r : 540 + e.r; }
  if (type === 'bulwark') e.layerT = 3;
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
    hist: null,                                   // 尾迹历史点（惰性分配）
    burst: opt.burst || 0,                        // 消失时的小爆半径（散射聚合）
    born: G.t,                                    // 用于舰船系留束（0.16s）
    x0: x, y0: y,
  });
  /* v3 弹幕回响（t_echo）：12%/层 概率额外射出一枚影子弹（0.4× 伤害、无元素）。
     noEcho 防止影子弹再触发回响 —— 否则会指数爆炸。 */
  if (p && p.stats.echo && !opt.noEcho && chance(0.12 * p.stats.echo)) {
    spawnPBullet(G, x, y + 8, ang + rand(0.12, -0.12), {
      spd: (opt.spd || 760) * 1.05, r: (opt.r || 4.5) * 0.85,
      len: (opt.len || 18) * 0.85, dmg: (opt.dmg || 6) * 0.4,
      color: opt.color || '#7ef9ff', src: opt.src || 'main',
      noEcho: 1, trail: opt.trail,
    });
  }
}

/* ---------------------------------------------------------
   伤害结算 —— 所有伤害入口
   --------------------------------------------------------- */
function damageEnemy(G, e, dmg, opt = {}) {
  if (e.dead || !(dmg > 0)) return;
  const p = G.player;

  /* ---- Boss 部件战：环未拆完时，子弹打的是环，不是本体 ---- */
  if (e.parts && !e.partsBroken) {
    if (bossPartHit(G, e, dmg, opt)) return;
  }

  /* ---- 免疫：Boss 部件未拆完 / 零域冰封 ---- */
  if (e.noDamage) {
    if (G.t - (e._imT || -9) > 0.5) {
      e._imT = G.t;
      G.texts.push({ x: e.x, y: e.y - e.r, vy: -58, life: 0.6, max: 0.6, txt: '免疫', color: '#8fa3bf', size: 12 });
    }
    return;
  }

  /* ---- 光印 / 弱点标记：对"本该不暴击"的命中做回溯暴击 ---- */
  let crit = !!opt.crit;
  if (!crit && !opt.noRetro && e.st) {
    const b = elemCritBonus(e, G.t);
    if (b > 0 && Math.random() < b) crit = true;
  }

  /* ---- 盾卫：能量盾按命中次数削减（不是按伤害），盾在时减免 75% ---- */
  let d = dmg;
  if (e.layers > 0) {
    e.layers--;
    e.layerT = 0;
    d *= (1 - (ENEMY_DEFS.bulwark.red || 0.75));
    if (G.t - (e._lgT || -9) > 0.05) {
      e._lgT = G.t;
      for (let i = 0; i < 4; i++) {
        G.particles.push({ x: e.x + rand(e.r, -e.r), y: e.y - rand(e.r, 0),
          vx: rand(150, -150), vy: rand(-40, -190), life: 0.3, max: 0.3,
          size: 3.2, color: '#d7c4a3', kind: 'spark' });
      }
      SFX.playAt('shield', e.x, e.y);
    }
  }

  /* ---- 护甲（毒的破甲在元素系统里给出；e_purity 让元素伤害直接无视护甲） ---- */
  const arm = opt.pure ? 0 : Math.max(0, (e.armor || 0) - elemArmorShred(e));
  d *= (1 - clamp(arm, 0, 0.9));
  d *= elemDmgMul(e);
  if (crit && !opt.crit) d *= (p ? p.stats.critMult : 1.8);   // 回溯暴击补上暴击倍率
  if (e.zeroWindow > 0) d *= 2.5;                             // BOSS-4 碎冰窗口

  e.hp -= d;
  e.hitFlash = 1;

  // 高频命中时按敌人节流特效，避免刷屏与掉帧
  const fxOk = opt.force || G.t - (e._fxT || 0) > 0.07;
  if (fxOk) {
    e._fxT = G.t;
    // 方向性命中火花：5 根扇状火花，方向 = 弹道反方向 ±35°，外加 1 个过曝白点
    const ba = opt.ang;
    const n = opt.big ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = ba != null ? ba + Math.PI + rand(0.61, -0.61) : rand(TAU);
      const s = rand(230, 70);
      G.particles.push({
        x: e.x + Math.cos(a + Math.PI) * e.r * 0.5, y: e.y + Math.sin(a + Math.PI) * e.r * 0.5,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.3, 0.12), max: 0.3,
        size: rand(3.6, 1.4), color: crit ? '#ffd166' : '#ffffff', kind: 'spark',
      });
    }
    G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.05, max: 0.05,
      size: e.r * 2.8, color: '#ffffff', kind: 'smoke' });
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

  /* ---- 元素施加（唯一挂点：全部武器 / 无人机接触 / 电弧 / 黑洞都走这里） ---- */
  if (!opt.noElem) elemOnHit(G, e, dmg, { crit, src: opt.src, noElem: opt.noElem });

  /* ---- 暴击触发类卡 ---- */
  if (crit && p && p.stats.prism) kPrismHook(G, e, d);

  /* ---- 弹幕共鸣：0.3s 内第 3 次命中同一敌人 → 追加最大生命 3% 真实伤害 ---- */
  if (!opt.noElem && p && p.stats.volley) {
    if (G.t - (e._vt || -9) > 0.3) { e._vt = G.t; e._vn = 0; }
    if (++e._vn === 3) {
      damageEnemy(G, e, e.maxHp * (e.isBoss ? 0.004 : 0.03) * p.stats.volley,
        { noElem: true, noRetro: true, src: 'rx', pure: true, showText: false, force: true });
    }
  }

  if (e.hp <= 0) killEnemy(G, e);
}

function killEnemy(G, e) {
  if (e.dead) return;
  e.dead = true;

  const isBig = e.isBoss || e.type === 'tank' || e.type === 'bulwark';
  SFX.playAt(isBig ? 'bigKill' : 'kill', e.x, e.y);

  // 元素钩子：虚空"击杀带印敌人 → 坍缩"，并清空状态
  if (typeof elemOnKill === 'function') elemOnKill(G, e);
  // 触发类卡：连锁爆破
  if (typeof kChainHook === 'function') kChainHook(G, e);
  // 自爆虫：死亡亦自爆（killEnemy 已置 dead，不会递归）
  if (e.type === 'tick' && !e._boom) kamikazeBoom(G, e);

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
  // 击杀爆点分层：8px 白闪核心 + 12~18 片方向性碎片 + 0.18s 十字芒
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.1, max: 0.1, size: 8, color: '#ffffff', kind: 'smoke' });
  const frag = e.isBoss ? 18 : 12;
  for (let i = 0; i < frag; i++) {
    const a = i / frag * TAU + rand(0.2, -0.2), s = rand(isBig ? 420 : 300, 120);
    G.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.5, 0.25), max: 0.5, size: rand(6, 2.4), color: e.color, kind: 'spark' });
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i / 4 * TAU;
    G.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
      life: 0.18, max: 0.18, size: 3, color: '#ffffff', kind: 'spark' });
  }

  G.shake = Math.min(16, G.shake + (e.isBoss ? 15 : isBig ? 4.5 : 1.6));
  G.kills++;
  G.comboT = 2.1;
  G.combo++;
  // 每 10 连击给一次正反馈，让"连段手感"有听觉锚点
  if (G.combo > 0 && G.combo % 10 === 0) SFX.play('combo');
  G.score += Math.round(e.score * (1 + (G.combo - 1) * 0.04));
  /* v3 元进度：击杀产出星尘（§5.2：enemy.score × 0.10），Boss 额外掉核心碎片 */
  {
    const sm = stepMul(G.wave), dm = G.abyssDustMul || 1;
    G.dustEarn += e.score * 0.10 * sm * dm;
    if (e.isBoss) {
      G.dustEarn += (150 + 50 * G.bossIndex) * sm * dm;
      /* v3.1 数据修正（《肉鸽数据报告》§4.2 方案①）：
         原式 2+bossIndex 使中位玩家（一局只打得过 3 个 Boss）一局仅得 7 片，
         开满五个改装槽要 38.5 局（设计意图 20 局）——碎片侧是量级错误，不是"稍慢"。
         改为 4+2×bossIndex：W5/W10/W15 → 6/8/10 片，W15 一局 24 片 → 五槽 ≈19 局。 */
      G.coreEarn += (4 + 2 * G.bossIndex) + (G.abyssCoreBonus || 0);
    }
  }

  // 经验掉落
  if (e.type === 'xpblob') {
    /* 经验囊：26 个晶体分 3 波弹出（用外向速度差模拟三波） */
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * TAU + rand(0.2, -0.2);
      const sp = i % 3 === 0 ? 210 : i % 3 === 1 ? 130 : 70;
      G.orbs.push({
        x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        val: 1, t: 0, mag: false, life: 16, r: 5.4,
      });
    }
    G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.6, max: 0.6, size: 340, color: '#ffe08a', kind: 'ring' });
  } else {
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
  }
  // 窃能虫：吐回已吸收量的 60%
  if (e.type === 'leech' && e.eaten > 0) {
    const back = Math.max(1, Math.round(e.eaten * 0.6));
    for (let i = 0; i < back; i++) {
      const a = rand(TAU);
      G.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
        val: 1, t: 0, mag: false, life: 14, r: 5 });
    }
  }
  // 晶簇母体：死亡不消失，裂为晶刺（场地物件）
  if (e.type === 'cluster' && e.shards) {
    for (let i = 0; i < e.shards; i++) spawnShard(G, e.x + rand(50, -50), e.y + rand(40, -40));
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
  } else if (chance(e.type === 'tank' || e.type === 'bulwark' ? 0.34 : 0.045)) {
    const kinds = ['heal', 'shield', 'bomb'];
    const kind = pick(chance(0.58) ? ['heal'] : kinds);
    G.pickups.push({ kind, x: e.x, y: e.y, vy: 58, t: 0, r: 13 });
  }
}

/* ---------------------------------------------------------
   场地物件：晶刺 shard（不计入 10 个小怪，与 G.holes 同级的轻量实体）
   --------------------------------------------------------- */
function spawnShard(G, x, y) {
  if (!G.shards) G.shards = [];
  if (G.shards.length >= 18) G.shards.shift();     // 超出上限：最旧的立即自毁
  G.shards.push({
    x: clamp(x, 26, 514), y: clamp(y, 120, 860),
    r: 9, hp: 10 * (1 + 0.24 * Math.pow(G.wave || 1, 1.17)) * 0.5, max: 0,
    life: 14, maxLife: 14, cd: rand(1.6, 0.4), t: 0,
  });
  const s = G.shards[G.shards.length - 1];
  s.max = s.hp;
}

function updateShards(G, dt) {
  if (!G.shards || !G.shards.length) return;
  const p = G.player;
  for (const s of G.shards) {
    s.t += dt;
    s.life -= dt;
    s.cd -= dt;
    if (s.cd <= 0) {
      s.cd = 2.2;
      spawnEBullet(G, s.x, s.y, angTo(s, p), 250, { r: 5, dmg: 7 * clamp(1 + (G.wave - 1) * 0.012, 1, 1.6), color: '#ff85d0' });
      SFX.playAt('eshoot', s.x, s.y);
    }
  }
  G.shards = compact(G.shards, s => !(s.life > 0 && s.hp > 0));
}

function drawShards(ctx) {
  if (!G.shards) return;
  for (const s of G.shards) {
    const fade = s.life < 2 ? 0.35 + Math.abs(Math.sin(s.life * 8)) * 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    drawGlow(ctx, s.x, s.y, 52, '#ff85d0', 0.5);
    ctx.translate(s.x, s.y);
    ctx.beginPath();
    ctx.moveTo(0, -s.r * 1.5); ctx.lineTo(s.r * 0.8, 0); ctx.lineTo(0, s.r * 1.2); ctx.lineTo(-s.r * 0.8, 0);
    ctx.closePath();
    ctx.fillStyle = rgba('#ff85d0', 0.85); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }
}

/* ---------------------------------------------------------
   地面危害区（Boss 机制专用，统一生命周期，永不泄漏）
   kind: lava（熔渣带）· warn（预警圈，到期转伤害）· blast（冰锥落地）
         bolt（落雷）· field（静电场，缓慢扩张）· pillar（碎冰柱，可摧毁）
   --------------------------------------------------------- */
function addHazard(G, h) {
  if (!G.hazards) G.hazards = [];
  if (G.hazards.length > 90) G.hazards.shift();
  h.t = 0;
  G.hazards.push(h);
  return h;
}

function updateHazards(G, dt) {
  if (!G.hazards || !G.hazards.length) return;
  const p = G.player;
  for (const h of G.hazards) {
    h.life -= dt;
    h.t += dt;
    if (h.kind === 'pillar') continue;

    if (h.kind === 'warn') {
      if (h.life <= 0) {
        if (h.to === 'blast') {
          addHazard(G, { kind: 'blast', x: h.x, y: h.y, r: h.r, life: 0.3, max: 0.3, dmg: h.dmg, slow: h.slow });
          for (let i = 0; i < 12; i++) {
            const a = rand(TAU);
            G.particles.push({ x: h.x, y: h.y, vx: Math.cos(a) * rand(230, 60), vy: Math.sin(a) * rand(230, 60),
              life: 0.45, max: 0.45, size: 4.2, color: '#7fc8ff', kind: 'spark' });
          }
          SFX.playAt('bigKill', h.x, h.y);
        } else {
          addHazard(G, { kind: 'bolt', x: h.x, y: h.y, r: h.r * 1.2, life: 0.28, max: 0.28, dmg: h.dmg });
          SFX.playAt('eZap', h.x, h.y);
        }
      }
      continue;
    }

    if (h.kind === 'lava') {
      if (Math.abs(p.x - h.x) < h.w / 2 + p.r * 0.7 && p.y > h.y - 10) damagePlayerRaw(G, h.dps * dt);
    } else if (h.kind === 'field') {
      h.r = Math.min(h.rMax, h.r + 72 * dt);
      if (dist(h, p) < h.r) damagePlayerRaw(G, h.dps * dt);
    } else if (h.kind === 'blast') {
      if (h.t < dt * 1.3 && dist(h, p) < h.r + p.r) { hurtPlayer(h.dmg); if (h.slow) p.fieldSlow = h.slow; }
    } else if (h.kind === 'bolt') {
      if (h.t < dt * 1.3 && dist(h, p) < h.r + p.r) hurtPlayer(h.dmg);
    }
  }
  G.hazards = compact(G.hazards, h => !(h.life > 0));
}

function drawHazards(ctx) {
  if (!G.hazards || !G.hazards.length) return;
  for (const h of G.hazards) {
    const a = clamp(h.life / h.max, 0, 1);
    if (h.kind === 'lava') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#ff6b2b', 0.16 + a * 0.12);
      ctx.fillRect(h.x - h.w / 2, h.y, h.w, h.h);
      ctx.strokeStyle = rgba('#ffb27a', 0.5 * a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(h.x - h.w / 2, h.y); ctx.lineTo(h.x + h.w / 2, h.y); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const yy = h.y + ((h.t * 210 + i * 190) % h.h);
        ctx.fillStyle = rgba('#ffd166', 0.35 * a);
        ctx.fillRect(h.x - h.w / 2 + 6, yy, h.w - 12, 3);
      }
      ctx.restore();
    } else if (h.kind === 'warn') {
      const k = 1 - a;
      ctx.save();
      ctx.strokeStyle = h.to === 'blast' ? rgba('#7fc8ff', 0.85) : rgba('#4de0c0', 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = h.to === 'blast' ? rgba('#7fc8ff', 0.14 + k * 0.2) : rgba('#4de0c0', 0.12 + k * 0.2);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (h.kind === 'blast') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, h.x, h.y, h.r * 4 * (1 - a + 0.4), '#7fc8ff', a * 0.9);
      ctx.strokeStyle = rgba('#ffffff', a);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (1.4 - a * 0.4), 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (h.kind === 'bolt') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#4de0c0', a);
      ctx.lineWidth = 3 + a * 4;
      ctx.beginPath();
      let px = h.x, py = h.y - 300;
      ctx.moveTo(px, py);
      for (let i = 0; i < 6; i++) { px += rand(16, -16); py += 50; ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', a);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      drawGlow(ctx, h.x, h.y, h.r * 4, '#4de0c0', a);
      ctx.restore();
    } else if (h.kind === 'field') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#4de0c0', 0.45 * a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba('#4de0c0', 0.09 * a);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (h.kind === 'pillar') {
      ctx.save();
      const blink = h.hp < h.maxHp ? 0.6 + Math.abs(Math.sin(h.t * 14)) * 0.4 : 1;
      drawGlow(ctx, h.x, h.y, 76, '#7fc8ff', 0.55 * blink);
      ctx.translate(h.x, h.y);
      ctx.beginPath();
      ctx.moveTo(0, -h.r * 1.6); ctx.lineTo(h.r * 0.7, -h.r * 0.2);
      ctx.lineTo(h.r * 0.42, h.r * 1.1); ctx.lineTo(-h.r * 0.42, h.r * 1.1);
      ctx.lineTo(-h.r * 0.7, -h.r * 0.2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(180,230,255,.72)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      ctx.save();
      const w = h.r * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(h.x - w / 2, h.y - h.r * 2.3, w, 3.4);
      ctx.fillStyle = '#bff4ff';
      ctx.fillRect(h.x - w / 2, h.y - h.r * 2.3, w * clamp(h.hp / Math.max(1, h.maxHp), 0, 1), 3.4);
      ctx.restore();
    }
  }
}

/* ---------------------------------------------------------
   敌人 AI 更新
   --------------------------------------------------------- */
/** 自爆虫爆炸：12 方向短程弹 + 爆炸环（命中/死亡两个入口共用） */
function kamikazeBoom(G, e) {
  if (e._boom) return;
  e._boom = 1;
  for (let i = 0; i < 12; i++) {
    spawnEBullet(G, e.x, e.y, i / 12 * TAU, 210, { r: 5, dmg: 8, color: '#ffab40' });
  }
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.6, max: 0.6, size: e.r * 6.5, color: '#ffab40', kind: 'ring' });
  SFX.playAt('eshoot', e.x, e.y);
  const p = G.player;
  if (p && Math.abs(p.x - e.x) < 62 && Math.abs(p.y - e.y) < 62) hurtPlayer(8);
  if (!e.dead) killEnemy(G, e);
}

function updateEnemy(G, e, dt) {
  const p = G.player;
  e.t += dt;
  e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
  e.angle += (e.spin || 0) * dt;

  /* 相位幽灵：实体/相位循环（相位期免疫全部伤害） */
  if (e.ai === 'phase') {
    const cy = e.cycle || 3.2;
    e.phasing = (e.t % cy) < cy * 0.5;
    e.noDamage = e.phasing;
  }
  /* 盾卫：脱离受击 3s 后以 1.5 层/s 再生 */
  if (e.layersMax) {
    e.layerT = (e.layerT || 0) + dt;
    if (e.layerT > 3 && e.layers < e.layersMax) e.layers = Math.min(e.layersMax, e.layers + 1.5 * dt);
  }
  /* 冰：移速 / 开火频率（Boss 上限 −35%） */
  if (e.spd0 != null) e.spd = e.spd0 * elemSlowMul(e);
  if (e.maxSpd0) e.maxSpd = e.maxSpd0 * elemSlowMul(e);
  /* 冻结：完全停止（不移动不开火），时长由元素 tick 负责递减 */
  if (e.freezeT > 0) return;
  /* 自爆虫：贴身引信倒计时 */
  if (e.fuseT > 0) {
    e.fuseT -= dt;
    if (e.fuseT <= 0) { kamikazeBoom(G, e); return; }
  }

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
          e.fireCd = (1.7 - Math.min(0.7, G.wave * 0.03)) * rand(1.15, 0.85) / elemFireMul(e);
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
        e.fireCd = (2.3 - Math.min(0.9, G.wave * 0.04)) * rand(1.1, 0.9) / elemFireMul(e);
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

    /* ================= v2 新增 AI ================= */
    case 'ram': {
      /* 冲撞者：落位 → 1.0s 预警（锁定玩家当时 x）→ 直线下冲，最多 2 次 */
      const hold = e.hold == null ? 170 : e.hold;
      if (e.dashing) {
        e.y += 520 * dt;
        e.x = lerp(e.x, e.lockedX, 1 - Math.pow(0.02, dt));
        if (Math.abs(e.x - p.x) < e.r + p.r && Math.abs(e.y - p.y) < e.r + p.r * 0.9) hurtPlayer(14);
        if (e.y > 990) {
          e.dashes = (e.dashes || 0) + 1;
          e.y = -46; e.x = chance(0.5) ? 60 : 480;
          e.dashing = false; e.warnT = 0;
        }
        break;
      }
      if (e.warnT > 0) {
        e.warnT -= dt;
        e.y += 8 * dt;
        if (e.warnT <= 0) { e.dashing = true; SFX.playAt('warn', e.x, e.y); }
        break;
      }
      if (e.y < hold) { e.y += e.spd * dt; break; }
      if ((e.dashes || 0) >= 2) { e.y += e.spd * dt; e.x += (e.x < 270 ? -70 : 70) * dt; break; }
      e.warnT = 1.0;
      e.lockedX = clamp(p.x, 40, 500);   // 预警开始即锁定轨道，箭头才可读
      break;
    }
    case 'drift': {
      /* 经验囊 / 晶簇：缓慢直落；经验囊到 y>940 直接逃逸（XP 全部带走） */
      e.y += e.spd * dt;
      e.x += Math.sin(e.t * 0.6 + e.phase) * 18 * dt;
      if (e.escape && e.y > e.escape) {
        e.dead = true; e.escaped = true;
        G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 130, color: '#ffe08a', kind: 'ring' });
      }
      break;
    }
    case 'snipe': {
      /* 狙击手：落位游移 → 1.1s 红外预警线 → 1 枚高速狙击弹 */
      const hold = e.hold == null ? 150 : e.hold;
      if (e.y < hold) { e.y += e.spd * dt; break; }
      e.y = hold;
      e.x += Math.sin(e.t * 0.9 + e.phase) * 40 * dt;
      e.x = clamp(e.x, 40, 500);
      if (e.aimT > 0) {
        e.aimT -= dt;
        e.aimX = p.x; e.aimY = p.y;
        if (e.aimT <= 0) {
          spawnEBullet(G, e.x, e.y + 16, angTo(e, { x: e.aimX, y: e.aimY }), e.bulletSpd * 2.4,
            { r: 5, dmg: 18, color: '#ff3d6e', shape: 'lance' });
          SFX.playAt('eshoot', e.x, e.y);
        }
        break;
      }
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = (2.8 - Math.min(0.9, G.wave * 0.03)) * rand(1.15, 0.85) / elemFireMul(e);
        e.aimT = 1.1; e.aimX = p.x; e.aimY = p.y;
      }
      break;
    }
    case 'kamikaze': {
      /* 自爆虫：直冲玩家；进入 76 距离点引信，死亡亦自爆 */
      const a = angTo(e, p);
      e.x += Math.cos(a) * e.spd * dt;
      e.y += Math.sin(a) * e.spd * dt;
      const tr = e.trigger == null ? 76 : e.trigger;
      if (e.fuseT == null && dist(e, p) < tr) e.fuseT = 0.28;
      break;
    }
    case 'support': {
      /* 修复舰：驻留上方，每 0.8s 为半径 190 内血量最低的敌人回 6%（不能治自己） */
      const hold = e.hold == null ? 120 : e.hold;
      if (e.y < hold) { e.y += e.spd * dt; break; }
      e.y = hold;
      e.x += Math.sin(e.t * 0.7 + e.phase) * 46 * dt;
      e.x = clamp(e.x, 40, 500);
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = 0.8 / elemFireMul(e);
        let best = null, bs = 9e9;
        for (const t of G.enemies) {
          if (t.dead || t === e) continue;
          if (dist(t, e) > (e.hrad || 190)) continue;
          const r = t.hp / t.maxHp;
          if (r < 0.995 && r < bs) { bs = r; best = t; }
        }
        if (best) {
          best.hp = Math.min(best.maxHp, best.hp + best.maxHp * (e.heal || 0.06));
          e.healX = best.x; e.healY = best.y; e.healOn = 0.25;
          G.particles.push({ x: best.x, y: best.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: best.r * 4, color: '#fff2a8', kind: 'ring' });
          SFX.playAt('eLight', best.x, best.y);
        }
      }
      if (e.healOn > 0) e.healOn -= dt;
      break;
    }
    case 'aegis': {
      /* 盾卫：缓速直落（能量盾按命中次数削减，见 damageEnemy） */
      e.y += e.spd * dt;
      e.x += Math.sin(e.t * 0.9 + e.phase) * 14 * dt;
      break;
    }
    case 'sweep': {
      /* 横扫者：只在固定高度横向穿越，最多 4 次（纵向躲避的全新维度） */
      e.x += e.spd * e.passDir * dt;
      if (e.x > 560 + e.r || e.x < -20 - e.r) {
        e.passes = (e.passes == null ? 4 : e.passes) - 1;
        if (e.passes <= 0) { e.y = 1120; e.x = 270; break; }
        e.passDir *= -1;
        e.y = rand(700, 180);
        e.x = e.passDir > 0 ? -e.r : 540 + e.r;
      }
      if (Math.abs(e.x - p.x) < e.r + p.r && Math.abs(e.y - p.y) < e.r + p.r * 0.8) hurtPlayer(16);
      break;
    }
    case 'leech': {
      /* 窃能虫：追踪最近的 XP 晶体（不是玩家）；吸满即加速逃逸 */
      if (e.eaten >= (e.goal || 12)) {
        e.y -= 240 * dt;
        e.x += (e.x < 270 ? -90 : 90) * dt;
        break;
      }
      let best = null, bd = 1e9;
      for (const o of G.orbs) {
        if (o.dead) continue;
        const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d2 < bd) { bd = d2; best = o; }
      }
      if (best) {
        const a = angTo(e, best);
        e.x += Math.cos(a) * e.spd * dt;
        e.y += Math.sin(a) * e.spd * dt;
        if (dist(e, best) < e.r + 10) {
          best.dead = true; e.eaten++;
          G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 34, color: '#ff4fa3', kind: 'ring' });
        }
      } else {
        e.y += e.spd * 0.4 * dt;
      }
      break;
    }
    case 'phase': {
      /* 相位幽灵：实体期开火，相位期免疫全部伤害且更快 */
      e.y += e.spd * (e.phasing ? 1.3 : 1) * dt;
      e.x += Math.sin(e.t * 1.2 + e.phase) * 30 * dt;
      if (!e.phasing) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = 2.0 / elemFireMul(e);
          const a = angTo(e, p);
          for (let i = -1; i <= 1; i++) {
            spawnEBullet(G, e.x, e.y + 10, a + i * 0.22, e.bulletSpd, { r: 6, dmg: 9, color: '#c8d4e8' });
          }
          SFX.playAt('eshoot', e.x, e.y);
        }
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
/* ---------------------------------------------------------
   Boss —— 每个 Boss 必须教一件事，且这件事不能靠数值获得
   --------------------------------------------------------- */
const BOSS_DEFS = [
  null,
  { name: '裂隙哨兵', r: 62, armor: 0.00, color: '#ff5c8a', mech: null, teach: '读条：预警 → 应对' },
  { name: '裂隙核心', r: 62, armor: 0.07, color: '#b06bff', mech: null, teach: '目标切换：该放下输出的时候放下' },
  { name: '炽镰 · 熔核', r: 66, armor: 0.14, color: '#ff6b2b', mech: 'lava', teach: '持续走位（站桩当场失效）' },
  { name: '零域 · 霜牙', r: 64, armor: 0.21, color: '#7fc8ff', mech: 'zero', teach: '放下躲弹去完成一个目标' },
  { name: '万钧 · 雷枢', r: 68, armor: 0.28, color: '#4de0c0', mech: 'parts', teach: '多目标管理 + 时间预算' },
];

/** 6+ 迭代缝合体：从 3/4/5 的签名机制里抽 2 个（"零域 + 雷枢部件"为禁止组合） */
function bossDef(index) {
  if (index <= 0) index = 1;
  if (index < BOSS_DEFS.length) return BOSS_DEFS[index];
  const pool = ['lava', 'zero', 'parts'];
  const a = pick(pool);
  let b = pick(pool.filter(m => m !== a));
  if ((a === 'zero' && b === 'parts') || (a === 'parts' && b === 'zero')) b = 'lava';
  return {
    name: '裂隙核心 · 迭代 ' + (index - 1), r: 62,
    armor: Math.min(0.30, (index - 1) * 0.07),
    color: a === 'lava' ? '#ff6b2b' : a === 'zero' ? '#7fc8ff' : '#4de0c0',
    mech: 'mix', mechs: [a, b], teach: '综合',
  };
}

function makeBoss(G, index) {
  const def = bossDef(index);
  // Boss 血量：与玩家强度同步上涨（原 0.60 / 0.10 → 0.62 / 0.13）；同样吃「波次预支」的偿还倍率
  const hp = 440 * (1 + (index - 1) * 0.62) * (1 + 0.13 * Math.pow(G.wave, 1.15)) * (G.waveHpMul || 1);
  const b = {
    isBoss: true, type: 'boss', bossIndex: index,
    name: def.name, teach: def.teach,
    x: 270, y: -120, targetY: 196,
    r: def.r,
    hp, maxHp: hp,
    armor: def.armor,
    xp: 40 * index, score: 1200 * index,
    color: def.color,
    t: 0, angle: 0, spin: 0.35,
    vx: 0, vy: 0,
    hitFlash: 0, dead: false,
    state: 'enter', stateT: 0,
    patternIdx: 0, patternT: 0, fireCd: 0, sub: 0,
    phase: 1, chargeColor: '#ff5c8a',
    moveTarget: 270, moveT: 0,
    laser: null, laserHitT: 0,
    bulletSpd: 250 * Math.min(2.2, 1 + G.wave * 0.015),
    /* v2 机制字段 */
    mech: def.mech, mechs: def.mechs || null,
    parts: null, partAct: 2, winT: 12, overloads: 0, partsBroken: 0,
    zeroCd: 12, zeroT: 0, zeroWindow: 0, zeroPillars: 0,
    noDamage: false, fixed: 0, dashT: 0, dashDir: 1,
    sub2: 0, hazeT: 0,
  };
  if (b.mech === 'parts' || (b.mechs && b.mechs.includes('parts'))) {
    b.parts = ['bolt', 'chain', 'field'].map((k, i) => ({
      kind: k, idx: i, alive: true, ang: i / 3 * TAU,
      hp: hp * 0.22, maxHp: hp * 0.22, cd: rand(0.9, 0.2), x: b.x, y: b.y,
    }));
  }
  return b;
}

/** 本体伤害路由：部件未拆完时子弹打的是部件 */
function bossPartHit(G, b, dmg, opt) {
  let best = null, bd = 1e9;
  for (const pt of b.parts) {
    if (!pt.alive) continue;
    const d = (pt.x - b.x) ** 2 + (pt.y - b.y) ** 2;
    if (d < bd) { bd = d; best = pt; }
  }
  if (!best) return false;
  best.hp -= dmg;
  G.texts.push({ x: best.x, y: best.y - 10, vy: -60, life: 0.6, max: 0.6,
    txt: Math.round(dmg).toString(), color: '#bff4ff', size: 12 });
  G.particles.push({ x: best.x, y: best.y, vx: 0, vy: 0, life: 0.2, max: 0.2, size: 60, color: '#4de0c0', kind: 'ring' });
  if (best.hp <= 0) {
    best.alive = false;
    b.armor = Math.max(0, b.armor - 0.1);
    b.partAct = clamp(b.partAct + 1, 2, 3);
    G.banner('雷枢环损毁', false);
    G.shake = 16; G.flash = 0.6;
    SFX.play('bigKill');
    SFX.playAt('bossParts', best.x, best.y);
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU);
      G.particles.push({ x: best.x, y: best.y, vx: Math.cos(a) * rand(420, 80), vy: Math.sin(a) * rand(420, 80),
        life: 0.8, max: 0.8, size: 5, color: '#4de0c0', kind: 'spark' });
    }
  }
  return true;
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

  /* ================= BOSS-3「炽镰 · 熔核」：熔渣分区（教持续走位） ================= */
  {
    id: 'slag', name: '熔渣喷流', dur: 3.2, tele: '#ff6b2b', mech: 'lava',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd > 0) return;
      b.fireCd = b.phase >= 3 ? 0.9 : 1.5;
      const px = G.player.x;
      for (let i = -1; i <= 1; i++) {
        addHazard(G, {
          kind: 'lava', x: clamp(px + i * 80 + rand(40, -40), 40, 500),
          y: b.y + 26, w: 46, h: 980 - b.y, life: 4, max: 4, dps: 9,
        });
      }
      SFX.playAt('bossZone', b.x, b.y);
      G.shake = Math.min(16, G.shake + 2);
    },
  },
  {
    id: 'scythe', name: '镰刃突进', dur: 2.8, tele: '#ff2d55', mech: 'lava',
    update(G, b, dt) {
      if (!b.sub) {
        b.sub = 1; b.fixed = 1; b.scWarn = 0.9; b.scBack = 0;
        b.dashDir = chance(0.5) ? 1 : -1;
        SFX.play('bossWarn');
      }
      if (b.scWarn > 0) {                      // 预警：全身亮白 + 三道预示轨迹线
        b.scWarn -= dt;
        if (b.scWarn <= 0) { b.dashDir *= -1; }  // 预警结束 → 立刻起冲（镜像方向）
        return;
      }
      b.x += b.dashDir * 900 * dt;
      b.y = b.targetY + Math.sin(b.t * 2) * 46;
      const p = G.player;
      if (Math.abs(b.x - p.x) < b.r * 0.8 + p.r && Math.abs(b.y - p.y) < b.r * 0.7 + p.r) hurtPlayer(20);
      if (b.x < 40 || b.x > 500) {
        b.x = clamp(b.x, 40, 500);
        if (!b.scBack) { b.scBack = 1; b.dashDir *= -1; }   // 撞完立刻反向再冲
        else { b.fixed = 0; b.x = 270; b.y = b.targetY; }
      }
      for (let i = 0; i < 3; i++) {
        G.particles.push({ x: b.x + rand(b.r, -b.r), y: b.y + rand(b.r, -b.r),
          vx: rand(260, -260), vy: rand(120, -120), life: 0.3, max: 0.3, size: 5, color: '#ff6b2b', kind: 'spark' });
      }
    },
  },

  /* ================= BOSS-4「零域 · 霜牙」：节奏窗口 ================= */
  {
    id: 'icecone', name: '冰锥阵', dur: 3.0, tele: '#7fc8ff', mech: 'zero',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd > 0) return;
      b.fireCd = 0.6;
      addHazard(G, { kind: 'warn', to: 'blast', x: rand(480, 60), y: rand(700, 430), r: 34, life: 0.8, max: 0.8, dmg: 14, slow: 2 });
      SFX.playAt('eFreeze', b.x, b.y);
    },
  },
  {
    id: 'frosting', name: '霜环', dur: 3.4, tele: '#7fc8ff', mech: 'zero',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd > 0) return;
      b.fireCd = 1.4;
      b.sub2 = (b.sub2 || 0) + 1;
      const n = 20, rot = b.sub2 * 0.42;      // 缺口位置随圈数旋转
      for (let i = 0; i < n; i++) {
        if (i % 5 === 0) continue;
        spawnEBullet(G, b.x, b.y, i / n * TAU + rot, b.bulletSpd * 0.82, { r: 6, dmg: 9, color: '#7fc8ff' });
      }
      SFX.playAt('eshoot', b.x, b.y);
    },
  },

  /* ================= BOSS-5「万钧 · 雷枢」：部件战 + 时间预算 ================= */
  {
    id: 'bolt', name: '落雷', dur: 3.0, tele: '#4de0c0', mech: 'parts',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd > 0) return;
      b.fireCd = 0.7;
      for (let i = 0; i < 4; i++) {
        addHazard(G, { kind: 'warn', to: 'bolt', x: rand(500, 40), y: rand(840, 110), r: 30, life: 0.7, max: 0.7, dmg: 11 });
      }
    },
  },
  {
    id: 'chain', name: '电链', dur: 3.0, tele: '#4de0c0', mech: 'parts',
    update(G, b, dt) {
      b.fireCd -= dt;
      if (b.fireCd > 0) return;
      b.fireCd = 0.9;
      const p = G.player;
      G.zaps.push({ pts: [{ x: b.x, y: b.y }, { x: p.x, y: p.y }], life: 0.22, max: 0.22 });
      SFX.playAt('eZap', b.x, b.y);
      hurtPlayer(11);
      const a1 = nearestEnemy(G, b.x, b.y, 400);
      const a2 = a1 ? nearestEnemy(G, b.x, b.y, 400, new Set([a1])) : null;
      if (a1 && a2) G.zaps.push({ pts: [{ x: a1.x, y: a1.y }, { x: a2.x, y: a2.y }], life: 0.2, max: 0.2 });
    },
  },
  {
    id: 'field', name: '静电场', dur: 3.0, tele: '#4de0c0', mech: 'parts',
    update(G, b, dt) {
      if (!b.sub) {
        b.sub = 1;
        addHazard(G, { kind: 'field', x: b.x, y: b.y, r: 46, rMax: 220, life: 2.8, max: 2.8, dps: 7 });
        SFX.playAt('bossZone', b.x, b.y);
      }
    },
  },
];

/** 该 Boss 可用的弹幕池（部件战：拆掉第一环后才解锁「静电场」） */
function patternsFor(b) {
  const mechs = b.mechs || (b.mech ? [b.mech] : null);
  if (!mechs) return BOSS_PATTERNS.filter(p => !p.mech);
  let list = BOSS_PATTERNS.filter(p => mechs.indexOf(p.mech) >= 0);
  if (mechs.indexOf('parts') >= 0 && b.partAct < 3) list = list.filter(p => p.id !== 'field');
  return list.length ? list : BOSS_PATTERNS.filter(p => !p.mech);
}

/** BOSS-5 部件循环：部件存活时本体不可伤害；12s 窗口未拆完则过载 */
function updateBossParts(G, b, dt) {
  const alive = b.parts.filter(pt => pt.alive);
  b.noDamage = alive.length > 0;
  if (alive.length === 0) {
    if (!b.partsBroken) {
      b.partsBroken = 1;
      G.banner('雷枢解体 · 本体下场', false);
      G.flash = 0.8; G.shake = 16;
      SFX.play('bossPhase');
    }
    return;
  }
  for (const pt of b.parts) {
    pt.ang += dt * 0.7;
    pt.x = b.x + Math.cos(pt.ang) * b.r * 1.55;
    pt.y = b.y + Math.sin(pt.ang) * b.r * 1.1;
    if (!pt.alive || pt.idx >= b.partAct) continue;
    pt.cd -= dt;
    if (pt.cd > 0) continue;
    if (pt.kind === 'bolt') {
      pt.cd = 1.3;
      addHazard(G, { kind: 'warn', to: 'bolt', x: rand(500, 40), y: rand(840, 110), r: 26, life: 0.7, max: 0.7, dmg: 8 });
    } else if (pt.kind === 'chain') {
      pt.cd = 1.6;
      const p = G.player;
      G.zaps.push({ pts: [{ x: pt.x, y: pt.y }, { x: p.x, y: p.y }], life: 0.2, max: 0.2 });
      hurtPlayer(8);
    } else {
      pt.cd = 1.8;
      spawnEBullet(G, pt.x, pt.y, angTo(pt, G.player), b.bulletSpd, { r: 6, dmg: 9, color: '#4de0c0' });
    }
  }
  b.winT -= dt;
  if (b.winT <= 0) {
    b.overloads++;
    G.banner('雷枢过载', true);
    G.flash = 0.9; G.shake = 16;
    SFX.play('bossWarn');
    for (let wv = 0; wv < 3; wv++) {
      G.volleys.push({ t: wv * 0.55, e: b, fire() {
        for (let i = 0; i < 10; i++) {
          addHazard(G, { kind: 'warn', to: 'bolt', x: rand(500, 40), y: rand(860, 100), r: 30, life: 0.6, max: 0.6, dmg: 12 });
        }
      } });
    }
    /* 顶多过载 3 次：再往后不再修复，避免低 DPS 局无限拖死（防死锁） */
    if (b.overloads < 3) for (const pt of b.parts) { pt.alive = true; pt.hp = pt.maxHp; }
    b.winT = 12;
  }
}

/** BOSS-4 零域冰封：打碎 4 根碎冰柱换 2s ×2.5 伤害窗口 */
function updateBossZero(G, b, dt) {
  if (!b.zeroInit) {
    b.zeroInit = 1;
    for (let i = 0; i < 4; i++) {
      /* hp/maxHp 必须成对给出：drawHazards 用 maxHp 算血条，缺了会画出 NaN 宽度的条 */
      const php = 40 * (1 + 0.24 * Math.pow(G.wave || 1, 1.17)) * 0.6 * (G.waveHpMul || 1);
      addHazard(G, { kind: 'pillar', x: 86 + i * 122 + rand(22, -22), y: rand(620, 300), r: 22,
        hp: php, maxHp: php, life: 30, max: 30 });
    }
    b.noDamage = true;
    G.zeroSlow = 1;
    G.banner('零域 · 冰封', true);
    SFX.play('bossZone');
  }
  b.zeroT -= dt;
  const left = (G.hazards || []).filter(h => h.kind === 'pillar').length;
  if (!left) {
    /* 全部打碎：提前解除冰封 + 2.0s 碎冰窗口（受到伤害 ×2.5） */
    b.zeroInit = 0; b.noDamage = false;
    b.zeroWindow = 2.0;
    G.zeroSlow = 0;
    G.banner('碎冰窗口 ×2.5', false);
    G.flash = 0.9; G.shake = 16;
    SFX.play('bossPhase');
    for (let i = 0; i < 60; i++) {
      const a = rand(TAU);
      G.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * rand(520, 100), vy: Math.sin(a) * rand(520, 100),
        life: 0.9, max: 0.9, size: 6, color: chance(0.5) ? '#ffffff' : '#7fc8ff', kind: 'spark' });
    }
    b.state = 'move'; b.stateT = 0.6; b.moveTarget = 270; b.sub = 0;
    return;
  }
  if (b.zeroT <= 0) {
    /* 没打完：释放全屏环形弹幕（净损失一轮输出 + 高风险） */
    b.zeroInit = 0; b.noDamage = false;
    G.zeroSlow = 0;
    G.shake = 16; G.flash = 0.7;
    SFX.play('bossWarn');
    for (let ring = 0; ring < 3; ring++) {
      G.volleys.push({ t: ring * 0.5, e: b, fire() {
        const n = 22, rot = ring * 0.28;
        for (let i = 0; i < n; i++) {
          if (i % 5 === 0) continue;
          spawnEBullet(G, b.x, b.y, i / n * TAU + rot, b.bulletSpd * 0.92, { r: 6.5, dmg: 10, color: '#7fc8ff' });
        }
      } });
    }
    b.state = 'move'; b.stateT = 0.7; b.moveTarget = 270; b.sub = 0;
  }
}

function updateBoss(G, b, dt) {
  const p = G.player;
  b.t += dt;
  b.hitFlash = Math.max(0, b.hitFlash - dt * 5);
  if (b.zeroWindow > 0) b.zeroWindow -= dt;
  if (b.scWarn > 0 && b.pattern && b.pattern.id !== 'scythe') b.scWarn = 0;

  const mechs = b.mechs || (b.mech ? [b.mech] : null);
  /* 机制：部件战（本体在环拆完前不可伤害；12s 窗口未拆完则过载） */
  if (b.parts && !b.partsBroken) updateBossParts(G, b, dt);
  /* 机制：零域冰封（P3 签名，接管 state） */
  if (b.state === 'zero') { updateBossZero(G, b, dt); return; }
  if (mechs && mechs.indexOf('zero') >= 0 && b.phase >= 3 && b.state === 'move') {
    b.zeroCd = (b.zeroCd || 12) - dt;
    if (b.zeroCd <= 0) {
      b.state = 'zero'; b.zeroT = 3.2; b.zeroCd = 18; b.zeroInit = 0; b.sub = 0;
      return;
    }
  }

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
      let pool = patternsFor(b);
      if (b.bossIndex === 1) pool = pool.filter(q => q.id !== 'sweep');
      if (!b.mech && chance(0.15)) {
        b.pattern = BOSS_PATTERNS.find(q => q.id === 'summon');
      } else {
        const cand = pool.filter(q => q.id !== 'summon' && q.id !== b.lastPattern);
        b.pattern = pick(cand.length ? cand : pool.filter(q => q.id !== 'summon'));
      }
      if (!b.pattern) b.pattern = BOSS_PATTERNS[0];
      b.lastPattern = b.pattern.id;
      b.state = 'charge'; b.stateT = b.pattern.tele ? 0.8 : 0.6;
      b.chargeColor = b.pattern.tele;
      SFX.play('bossWarn');
    }
    return;
  }

  if (b.state === 'charge') {
    b.stateT -= dt;
    if (!b.fixed) b.x = lerp(b.x, b.moveTarget, 1 - Math.pow(0.05, dt));
    // 蓄力粒子吸入
    if (chance(dt * 30)) {
      const a = rand(TAU), d = rand(140, 60);
      G.particles.push({
        x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d,
        vx: -Math.cos(a) * 170, vy: -Math.sin(a) * 170,
        life: 0.4, max: 0.4, size: 4, color: b.chargeColor, kind: 'spark',
      });
    }
    if (b.stateT <= 0) { b.state = 'attack'; b.patternT = b.pattern.dur; b.fireCd = 0.1; b.sub = 0; b.sub2 = 0; b.laser = null; }
    return;
  }

  if (b.state === 'attack') {
    b.patternT -= dt;
    if (!b.fixed) {
      b.x += Math.sin(b.t * 0.8) * 26 * dt;
      b.x = clamp(b.x, 90, 450);
    }
    b.pattern.update(G, b, dt);
    if (b.patternT <= 0) {
      b.laser = null;
      b.fixed = 0; b.scWarn = 0;
      b.x = clamp(b.x, 90, 450); b.y = b.targetY;
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

  /* 镰刃突进的预警轨迹线（3 道，可读的第一手信息） */
  if (b.scWarn > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.25 + Math.abs(Math.sin(b.t * 26)) * 0.4;
    ctx.strokeStyle = rgba('#ff2d55', a);
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + i * 26);
      ctx.lineTo(b.x + (b.dashDir || 1) * 620, b.y + i * 26);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 部件：雷枢环（本体不可伤害时子弹打的是它们） */
  if (b.parts) {
    for (const pt of b.parts) {
      if (!pt.alive) continue;
      const on = pt.idx < b.partAct;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, pt.x, pt.y, 96, '#4de0c0', on ? 0.7 : 0.25);
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.ang * 2.2);
      ctx.strokeStyle = on ? rgba('#4de0c0', 0.95) : rgba('#4de0c0', 0.3);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 17, 0.5, TAU - 0.5); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', on ? 0.8 : 0.3);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke();
      ctx.restore();
      const w = 42;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(pt.x - w / 2, pt.y - 30, w, 3.4);
      ctx.fillStyle = on ? '#4de0c0' : 'rgba(77,224,192,.35)';
      ctx.fillRect(pt.x - w / 2, pt.y - 30, w * clamp(pt.hp / Math.max(1, pt.maxHp), 0, 1), 3.4);
      ctx.restore();
    }
  }

  /* 零域冰封：本体外壳 + 碎冰窗口高亮 */
  if (b.state === 'zero') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#bff4ff', 0.55 + Math.sin(b.t * 10) * 0.25);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.1, 0, TAU); ctx.stroke();
    ctx.restore();
  } else if (b.zeroWindow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffd166', 0.85);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.9, 0, TAU); ctx.stroke();
    ctx.restore();
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
  if (e.phasing) ctx.globalAlpha = 0.25;     // 相位期：免疫伤害的半透明形态

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
    /* ================= v2 新增剪影（颜色之外的第二重可读性） ================= */
    case 'rammer': {
      // 楔形前突弹头 + 两道前掠翼
      ctx.beginPath();
      ctx.moveTo(0, e.r * 1.35); ctx.lineTo(e.r * 0.55, e.r * 0.1);
      ctx.lineTo(e.r * 1.25, -e.r * 0.9); ctx.lineTo(e.r * 0.3, -e.r * 0.55);
      ctx.lineTo(0, -e.r * 0.95);
      ctx.lineTo(-e.r * 0.3, -e.r * 0.55); ctx.lineTo(-e.r * 1.25, -e.r * 0.9);
      ctx.lineTo(-e.r * 0.55, e.r * 0.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, e.r * 0.45, e.r * 0.22, 0, TAU); ctx.fill();
      break;
    }
    case 'xpblob': {
      // 半透明囊状 + 内部悬浮晶体
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.94, e.r * 1.06, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        const a = e.t * 1.1 + i / 5 * TAU;
        const ox = Math.cos(a) * e.r * 0.5, oy = Math.sin(a * 1.3) * e.r * 0.6;
        ctx.beginPath();
        ctx.moveTo(ox, oy - 4); ctx.lineTo(ox + 3, oy); ctx.lineTo(ox, oy + 4); ctx.lineTo(ox - 3, oy);
        ctx.closePath(); ctx.fillStyle = '#fffbe6'; ctx.fill();
      }
      break;
    }
    case 'marksman': {
      // 细长枪管 + 单目镜
      ctx.beginPath();
      ctx.moveTo(0, e.r * 1.7); ctx.lineTo(e.r * 0.3, e.r * 0.4);
      ctx.lineTo(e.r * 0.85, -e.r * 0.2); ctx.lineTo(e.r * 0.4, -e.r * 0.95);
      ctx.lineTo(-e.r * 0.4, -e.r * 0.95); ctx.lineTo(-e.r * 0.85, -e.r * 0.2);
      ctx.lineTo(-e.r * 0.3, e.r * 0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.3, 0, TAU);
      ctx.fillStyle = '#0a0e1c'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.13, 0, TAU);
      ctx.fillStyle = e.aimT > 0 ? '#ff3d6e' : '#ffd166'; ctx.fill();
      break;
    }
    case 'tick': {
      // 圆鼓虫体 + 背部脉动囊（引信点亮）
      const pulse = 1 + Math.sin(e.t * 22) * (e.fuseT > 0 ? 0.22 : 0.06);
      ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.9 * pulse, e.r * 1.0 * pulse, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, e.r * 0.25, e.r * 0.34, 0, TAU);
      ctx.fillStyle = e.fuseT > 0 ? '#ffffff' : rgba('#8a4a10', 0.9); ctx.fill();
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(i * e.r * 0.9, e.r * 0.2); ctx.lineTo(i * e.r * 1.5, e.r * 0.85);
        ctx.stroke();
      }
      break;
    }
    case 'mender': {
      // 环形修复舱 + 外伸治疗臂
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba('#fff2a8', 0.75);
      for (let i = 0; i < 4; i++) {
        const a = e.t * 0.9 + i / 4 * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.62, Math.sin(a) * e.r * 0.62);
        ctx.lineTo(Math.cos(a) * e.r * 1.3, Math.sin(a) * e.r * 1.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.r * 1.3, Math.sin(a) * e.r * 1.3, 2.6, 0, TAU);
        ctx.fillStyle = '#fff2a8'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.28, 0, TAU);
      ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'bulwark': {
      // 梯形装甲板 + 顶部半圆盾面（盾层数用弧段表示）
      ctx.beginPath();
      ctx.moveTo(-e.r * 1.05, e.r * 0.3); ctx.lineTo(e.r * 1.05, e.r * 0.3);
      ctx.lineTo(e.r * 0.7, e.r * 0.95); ctx.lineTo(-e.r * 0.7, e.r * 0.95);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-e.r, e.r * 0.15);
      ctx.quadraticCurveTo(0, -e.r * 1.25, e.r, e.r * 0.15);
      ctx.closePath();
      ctx.fillStyle = rgba('#0a0e1c', 0.55); ctx.fill();
      if (e.layers > 0) {
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = rgba('#d7c4a3', 0.35 + 0.5 * (e.layers / Math.max(1, e.layersMax)));
        ctx.beginPath();
        ctx.arc(0, e.r * 0.15, e.r * 1.18, Math.PI * 1.08, Math.PI * 1.92 * (0.2 + 0.8 * e.layers / Math.max(1, e.layersMax)));
        ctx.stroke();
      }
      break;
    }
    case 'sweeper': {
      // 宽扁镰形 + 尾部湍流
      const dir = e.passDir >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(dir * e.r * 1.35, 0);
      ctx.lineTo(dir * e.r * 0.2, -e.r * 0.75);
      ctx.lineTo(-dir * e.r * 1.1, -e.r * 0.35);
      ctx.lineTo(-dir * e.r * 1.25, e.r * 0.4);
      ctx.lineTo(dir * e.r * 0.2, e.r * 0.75);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = e.t * 9 + i * 1.1;
        ctx.beginPath();
        ctx.moveTo(-dir * e.r * 1.3, (i - 1) * 5);
        ctx.lineTo(-dir * (e.r * 1.3 + 9 + Math.sin(a) * 4), (i - 1) * 7 + Math.sin(a) * 3);
        ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.stroke();
      }
      break;
    }
    case 'leech': {
      // 多足钩虫 + 腹部收纳囊（吸得越多越鼓）
      const g = 1 + Math.min(0.5, e.eaten * 0.04);
      ctx.beginPath(); ctx.ellipse(0, -e.r * 0.2, e.r * 0.62 * g, e.r * 0.9 * g, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.55);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.6, -e.r * 0.5 + i * 6);
        ctx.lineTo(-e.r * 1.25, -e.r * 0.85 + i * 7);
        ctx.moveTo(e.r * 0.6, -e.r * 0.5 + i * 6);
        ctx.lineTo(e.r * 1.25, -e.r * 0.85 + i * 7);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, -e.r * 0.75, e.r * 0.28, 0, TAU);
      ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'cluster': {
      // 多面结晶体 + 内部裂纹
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU - Math.PI / 2;
        const R = e.r * (i % 2 === 0 ? 1.08 : 0.82);
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R, Math.sin(a) * R);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba('#0a0e1c', 0.75); ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.4;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * e.r * 0.86, Math.sin(a) * e.r * 0.86); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.24, 0, TAU);
      ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'phaser': {
      // 断续虚影轮廓 + 边缘扫描线
      for (let k = 0; k < 2; k++) {
        ctx.globalAlpha = (k === 0 ? 0.35 : 1) * (e.phasing ? 0.6 : 1);
        ctx.beginPath();
        const off = k * 7 - 3.5;
        ctx.moveTo(off, -e.r * 1.05); ctx.lineTo(e.r * 0.78, e.r * 0.2);
        ctx.lineTo(0, e.r * 0.62); ctx.lineTo(-e.r * 0.78, e.r * 0.2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba('#a8b4c8', 0.7); ctx.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) {
        const yy = i * 5 + ((e.t * 22) % 5);
        ctx.beginPath(); ctx.moveTo(-e.r * 0.7, yy); ctx.lineTo(e.r * 0.7, yy); ctx.stroke();
      }
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
  // 狙击手：红外预警线（读条 → 一次性横移）
  if (e.type === 'marksman' && e.aimT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ff3d6e', 0.35 + Math.sin(e.t * 40) * 0.2);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.aimX - e.x, e.aimY - e.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  // 冲撞者：地面红色指示箭头（预警期显示即将冲过的轨道）
  if (e.type === 'rammer' && e.warnT > 0 && !e.dashing) {
    const dx = (e.lockedX || e.x) - e.x;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.28 + Math.abs(Math.sin(e.t * 16)) * 0.34;
    ctx.fillStyle = rgba('#ff3b30', a * 0.35);
    ctx.fillRect(dx - 20, 0, 40, 900 - e.y);
    ctx.strokeStyle = rgba('#ff3b30', a);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dx, 0); ctx.lineTo(dx, 900 - e.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dx - 13, 900 - e.y - 22); ctx.lineTo(dx + 13, 900 - e.y - 22); ctx.lineTo(dx, 900 - e.y);
    ctx.closePath(); ctx.fillStyle = rgba('#ff3b30', a); ctx.fill();
    ctx.restore();
  }

  // 修复舰：治疗连线（视觉指认"它在奶谁"）
  if (e.type === 'mender' && e.healOn > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = clamp(e.healOn / 0.25, 0, 1);
    ctx.strokeStyle = rgba('#fff2a8', a * 0.8);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.healX - e.x, e.healY - e.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 血条（高血量单位）
  if (e.maxHp > 24 && !e.isBoss) {
    const w = e.r * 2.1, h = 3.5;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(-w / 2, -e.r - 11, w, h);
    ctx.fillStyle = e.color;
    ctx.fillRect(-w / 2, -e.r - 11, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }
  // 元素状态：形态特效（挂在敌人身上）+ 头顶图标（最终判读依据）
  ctx.restore();
  drawElemFX(ctx, e);
  drawElemStatus(ctx, e);
}
