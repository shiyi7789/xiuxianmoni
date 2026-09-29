/* =========================================================
   waves.js — 波次导演 / 阵型库
   ---------------------------------------------------------
   设计原则（见 关卡设计文档.md）：
   1) 前 4 波为无文本教学波，每次只引入一个新概念
   2) 每个阵型至少留 2 条可执行路线（侧翼 / 中央、先清塔 / 先清护卫）
   3) 复合阵型前必有一个低密度呼吸波
   4) 每 5 波一个 Boss，作为"阶段检阅"
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   阵型原语
   --------------------------------------------------------- */

/** 横向一字排开（基准压力） */
function fmLine(G, type, n, y, o = {}) {
  const spread = o.spread || 380;
  const x0 = 270 - spread / 2;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 270 : x0 + i * (spread / (n - 1));
    G.enemies.push(makeEnemy(G, type, x, y - (o.stagger || 0) * i, o));
  }
}

/** V 字俯冲（中心集中，走外侧可绕） */
function fmV(G, type, n, y, o = {}) {
  const half = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const f = half === 0 ? 0 : (i - half) / half;
    G.enemies.push(makeEnemy(G, type, 270 + f * 170, y - Math.abs(f) * -46, o));
  }
}

/** 弧形展开（覆盖宽度，逼玩家读弹道） */
function fmArc(G, type, n, y, o = {}) {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
    G.enemies.push(makeEnemy(G, type, 270 + f * 200, y + Math.abs(f) * -52, o));
  }
}

/** 敌墙 + 移动缺口（空间解题） */
function fmWall(G, type, n, y, gap, o = {}) {
  const spread = 420;
  const x0 = 270 - spread / 2;
  for (let i = 0; i < n; i++) {
    if (i === gap) continue;
    const x = x0 + i * (spread / (n - 1));
    G.enemies.push(makeEnemy(G, type, x, y - Math.abs(i - (n - 1) / 2) * 12, o));
  }
}

/** 左右夹击，中央留缝（逼迫走中） */
function fmPincer(G, type, n, y, o = {}) {
  const half = Math.max(2, Math.floor(n / 2));
  for (let i = 0; i < half; i++) {
    G.enemies.push(makeEnemy(G, type, 40 + i * 46, y - i * 26, o));
    G.enemies.push(makeEnemy(G, type, 500 - i * 46, y - i * 26, o));
  }
}

/** 随机散布（混乱感，交给 AOE） */
function fmSwarm(G, type, n, y, o = {}) {
  for (let i = 0; i < n; i++) {
    G.enemies.push(makeEnemy(G, type, rand(460, 80), y - rand(180, 0), o));
  }
}

/** 螺旋放出的环刃 */
function fmSpiral(G, type, n, y, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const e = makeEnemy(G, type, 270 + Math.cos(a) * 150, y + Math.sin(a) * 90, o);
    e.cx = 270; e.cy = y + Math.sin(a) * 90; e.a0 = a; e.orbiting = true;
    G.enemies.push(e);
  }
}

/** 顶部双哨塔（目标优先级教学） */
function fmTurrets(G, type, n, y, o = {}) {
  const xs = n === 3 ? [110, 270, 430] : [120, 420];
  xs.forEach((x, i) => G.enemies.push(makeEnemy(G, type, x, y - i * 10, o)));
}

/** 纵向车道（3~4 条）：迫使玩家在车道之间做排他选择 */
function fmLane(G, type, n, y, o = {}) {
  const lanes = n <= 3 ? 3 : 4;
  const per = n <= 3 ? 2 : 2;
  for (let i = 0; i < lanes; i++) {
    const x = 70 + i * (400 / (lanes - 1));
    for (let j = 0; j < per; j++) {
      G.enemies.push(makeEnemy(G, type, x, y - j * 48 - i * 10, o));
    }
  }
}

/** 圆环阵（整体缓慢旋转）：把"处理顺序"变成主要难题 */
function fmRing(G, type, n, y, o = {}) {
  const R = 128;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const e = makeEnemy(G, type, 270 + Math.sin(a) * R, y + Math.cos(a) * R * 0.5, o);
    e.cx = 270; e.cy = y; e.a0 = a; e.rad = R; e.orbiting = true;
    G.enemies.push(e);
  }
}

/* ---------------------------------------------------------
   难度参数
   --------------------------------------------------------- */
function waveTier(n) { return Math.floor((n - 1) / 5); }

/** 玩家可见的波次规模提示（血量系数 v2：1 + 0.24 × n^1.17） */
function waveScale(n) {
  return {
    hp: 1 + 0.24 * Math.pow(n, 1.17),
    count: clamp(1 + (n - 6) * 0.10, 1, 2.1),
    spd: clamp(1 + (n - 8) * 0.022, 1, 1.5),
  };
}

/* ---------------------------------------------------------
   新原型登场表（保持"每次只教一个"的间隔）
   INTRO_WAVE  = 该波的主角新怪
   INTRO_WAVE2 = 同波的第二只（避开 Boss 波，故 6/11/13 会挤在一起 → 延后 6s、低密度）
   BOSS_ESCORT = 与 Boss 同波登场的新怪（15 波横扫者，否则会永远见不到）
   --------------------------------------------------------- */
const INTRO_WAVE = {
  1: 'drone', 2: 'zig', 3: 'shooter', 4: 'mini',
  6: 'chaser', 7: 'splitter', 8: 'tank', 9: 'xpblob',
  11: 'turret', 13: 'orbiter', 17: 'phaser',
};
const INTRO_WAVE2 = { 6: 'rammer', 11: 'marksman', 13: 'tick' };
const BOSS_ESCORT = { 15: 'sweeper' };

const INTRO_HINT = {
  drone: '侦察机 · 直线下落',
  zig: '游走机 · 正弦横摆',
  shooter: '炮手 · 定向点射',
  mini: '碎片 · 贴身冲锋',
  chaser: '追猎者 · 持续追踪',
  splitter: '母巢 · 死亡分裂',
  tank: '重甲舰 · 高血量',
  turret: '哨塔 · 径向弹幕',
  orbiter: '环刃 · 环绕突袭',
  rammer: '冲撞者 · 预警后直线下冲，必须横移',
  xpblob: '经验囊 · 不还手但会带着经验逃走',
  marksman: '狙击手 · 读预警线，一次性横移',
  tick: '自爆虫 · 别让它贴脸',
  mender: '修复舰 · 优先拔掉它',
  bulwark: '盾卫 · 按命中次数削盾，高单伤打不动',
  sweeper: '横扫者 · 威胁这次来自侧面',
  leech: '窃能虫 · 它在抢你的经验',
  cluster: '晶簇母体 · 杀死不等于解决',
  phaser: '相位幽灵 · 等它的实体窗口',
};

/* ---------------------------------------------------------
   修饰件（不占引入波：从解锁波起作为既有阵型的附带项出现）
   --------------------------------------------------------- */
const MODIFIERS = [
  { wave: 10, type: 'bulwark' },
  { wave: 12, type: 'mender' },
  { wave: 14, type: 'leech' },
  { wave: 16, type: 'cluster' },
];

/** 给一个既有阵型按概率挂上已解锁的修饰件 */
function attachMods(G, n, at, x, y) {
  const open = MODIFIERS.filter(m => n >= m.wave);
  if (!open.length) return 0;
  if (!chance(0.62)) return 0;
  const m = pick(open);
  const cnt = m.type === 'cluster' ? 1 : (chance(0.4) ? 2 : 1);
  for (let i = 0; i < cnt; i++) {
    G.enemies.push(makeEnemy(G, m.type, clamp(x + (i - (cnt - 1) / 2) * 58, 40, 500), y - i * 24));
  }
  G._modSeen = (G._modSeen || {});
  if (!G._modSeen[m.type]) { G._modSeen[m.type] = 1; G.introHint(INTRO_HINT[m.type]); }
  return cnt;
}

/* ---------------------------------------------------------
   波次构建
   --------------------------------------------------------- */
function buildWave(n) {
  const boss = n % 5 === 0;
  const S = waveScale(n);
  const groups = [];
  const add = (t, fn) => groups.push({ t, fn });
  const N = (base) => Math.max(1, Math.round(base * S.count));

  if (boss) {
    // Boss 波也带护卫/新怪：否则 W15 的横扫者永远见不到（5 的倍数波没有普通阵型）
    if (BOSS_ESCORT[n]) {
      const ty = BOSS_ESCORT[n];
      add(6.0, () => { G.introHint(INTRO_HINT[ty]); fmLane(G, ty, 3, 150); });
    }
    if (n >= 10) add(9.5, () => attachMods(G, n, 9.5, 300, 180));
    return { boss: true, groups, name: 'BOSS' };
  }

  /* ---------- 教学波：1–4（固定编排，保证读得懂） ---------- */
  if (n === 1) {
    add(0.0, () => fmLine(G, 'drone', 5, -50, { spread: 300 }));
    add(3.2, () => fmArc(G, 'drone', 5, -60, { spread: 340 }));
    add(6.4, () => fmLine(G, 'drone', 7, -40, { spread: 400 }));
    return { boss, groups, name: '第一波' };
  }
  if (n === 2) {
    add(0.0, () => fmLine(G, 'drone', 4, -50, { spread: 320 }));
    add(1.6, () => fmArc(G, 'zig', 4, -70, { spread: 300 }));
    add(5.0, () => fmV(G, 'zig', 5, -50));
    add(8.6, () => fmArc(G, 'zig', 6, -60, { spread: 380 }));
    return { boss, groups, name: '第二波' };
  }
  if (n === 3) {
    add(0.0, () => fmLine(G, 'drone', 5, -50, { spread: 330 }));
    add(1.4, () => fmTurrets(G, 'shooter', 2, -60));
    add(6.0, () => fmArc(G, 'zig', 5, -60, { spread: 340 }));
    add(7.2, () => fmTurrets(G, 'shooter', 3, -80, { hpMul: 0.85 }));
    add(12.0, () => fmSwarm(G, 'drone', 7, -60));
    return { boss, groups, name: '第三波' };
  }
  if (n === 4) {
    add(0.0, () => fmLine(G, 'drone', 6, -50, { spread: 360 }));
    add(2.6, () => fmWall(G, 'drone', 8, -60, 2));
    add(6.4, () => fmWall(G, 'mini', 9, -40, 6));
    add(9.6, () => fmArc(G, 'zig', 6, -70, { spread: 390 }));
    return { boss, groups, name: '第四波' };
  }

  /* ---------- 原型登场波（含第二只与修饰件） ---------- */
  if (INTRO_WAVE[n]) {
    const type = INTRO_WAVE[n];
    add(0.0, () => fmLine(G, 'drone', N(5), -50, { spread: 340 }));
    add(1.8, () => {
      G.introHint(INTRO_HINT[type]);
      if (type === 'tank') fmLine(G, 'tank', n >= 12 ? 2 : 1, -70, { spread: 150 });
      else if (type === 'turret') fmTurrets(G, 'turret', 2, -70);
      else if (type === 'orbiter') fmSpiral(G, 'orbiter', 4, 210);
      else if (type === 'xpblob') fmLine(G, 'xpblob', 1, -70, { spread: 120 });
      else fmArc(G, type, N(6), -70, { spread: 360 });
    });
    if (INTRO_WAVE2[n]) {
      /* 与主角新怪错开 6 秒、只放少量：把"读预警"这件事讲清楚 */
      const t2 = INTRO_WAVE2[n];
      add(7.8, () => {
        G.introHint(INTRO_HINT[t2]);
        if (t2 === 'rammer') fmLane(G, 'rammer', 3, -90);
        else if (t2 === 'marksman') fmLine(G, 'marksman', 2, -70, { spread: 200 });
        else fmArc(G, 'tick', N(4), -60, { spread: 260 });
      });
    }
    add(7.5, () => fmArc(G, 'zig', N(6), -60, { spread: 370 }));
    add(11.5, () => fmSwarm(G, 'drone', N(8), -60));
    add(12.5, () => attachMods(G, n, 12.5, rand(430, 110), 100));
    if (n >= 8) add(15.0, () => fmV(G, 'chaser', N(4), -60));
    return { boss, groups, name: '第 ' + n + ' 波' };
  }

  /* ---------- 10 波之后：程序化复合阵型 ---------- */
  const tier = waveTier(n);          // 0,1,2,3...
  const picks = [];

  // 按分级解锁阵型池
  picks.push('line');
  if (n >= 7) picks.push('v');
  if (n >= 6) picks.push('swarm');
  if (n >= 9) picks.push('pincer');
  if (n >= 12) picks.push('wall');
  if (n >= 14) picks.push('spiral');
  if (n >= 13) picks.push('lane');       // fmLane：服务 rammer / sweeper
  if (n >= 17) picks.push('ring');       // fmRing：服务 phaser / 环阵压力

  // 主力怪池（修饰件不进这个池：它们只作为附带项出现）
  const enemyPool = ['drone', 'zig', 'mini', 'chaser'];
  if (n >= 11) enemyPool.push('xpblob');
  if (n >= 9) enemyPool.push('shooter');
  if (n >= 12) enemyPool.push('splitter');
  if (n >= 14) enemyPool.push('tank');
  if (n >= 16) enemyPool.push('orbiter');
  if (n >= 13) enemyPool.push('rammer');
  if (n >= 15) enemyPool.push('marksman');
  if (n >= 17) enemyPool.push('tick');
  if (n >= 19) enemyPool.push('sweeper');
  if (n >= 21) enemyPool.push('phaser');

  const chosen = [];
  const groupCount = clamp(3 + Math.floor(n / 7), 3, 5);
  for (let i = 0; i < groupCount; i++) {
    const fm = pick(picks);
    const ty = pick(enemyPool);
    if (chosen.some(c => c.fm === fm && c.ty === ty)) { i--; continue; }
    chosen.push({ fm, ty });
  }

  const o = { spdMul: S.spd };
  chosen.forEach((c, i) => {
    const step = 2.8 - Math.min(1.0, tier * 0.14);
    const t = i === 0 ? 0.4 : i * step + rand(0.4);
    add(t, () => {
      const cnt = Math.round((5 + randInt(0, 2)) * S.count * 0.82);
      switch (c.fm) {
        case 'line':   fmLine(G, c.ty, cnt, -50, { spread: 360, ...o }); break;
        case 'v':      fmV(G, c.ty, cnt, -50, o); break;
        case 'swarm':  fmSwarm(G, c.ty, cnt + 2, -60, o); break;
        case 'pincer': fmPincer(G, c.ty, cnt, -50, o); break;
        case 'wall':   fmWall(G, c.ty, cnt + 3, -55, randInt(1, cnt), o); break;
        case 'spiral': fmSpiral(G, c.ty === 'orbiter' ? 'orbiter' : c.ty, 5, 220, o); break;
        case 'lane':   fmLane(G, (c.ty === 'rammer' || c.ty === 'sweeper') ? c.ty : 'rammer', 3 + (cnt > 7 ? 1 : 0), -70, o); break;
        case 'ring':   fmRing(G, c.ty, Math.min(7, cnt), 220, o); break;
      }
      /* 修饰件：伴随既有阵型出现（自带概率与上限，不会变成主力） */
      if (chance(0.5)) attachMods(G, n, t, clamp(rand(430, 110)), 90);
    });
  });

  // 定向压力：哨塔成对出现，逼出优先级判断
  if (n >= 11 && chance(0.55)) {
    add(groupCount * 2.0 + 2.5, () => fmTurrets(G, 'turret', chance(0.4) ? 3 : 2, -70, { hpMul: 0.9 }));
  }
  // 中段补一波追猎者，制造空间挤压
  if (n >= 12 && chance(0.6)) {
    add(groupCount * 2.0 + 4.0, () => fmV(G, 'chaser', N(5), -60, o));
  }
  // 收尾：修饰件 + 车道冲撞，制造"最后一波必须立刻处理"的优先级
  if (n >= 15) {
    add(groupCount * 2.0 + 5.5, () => {
      if (chance(0.6)) fmLane(G, chance(0.5) ? 'rammer' : 'sweeper', 3, -80, o);
      if (chance(0.5)) attachMods(G, n, 0, rand(430, 110), 80);
    });
  }

  return { boss, groups, name: '第 ' + n + ' 波' };
}
