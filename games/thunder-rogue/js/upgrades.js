/* =========================================================
   upgrades.js — 武器系统 + 肉鸽升级池
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   武器行为（每帧由 updateWeapons 驱动，全部自动开火）
   --------------------------------------------------------- */
function rollCrit(p) {
  if (Math.random() < p.stats.crit) return p.stats.critMult;
  return 1;
}

const WEAPONS = {
  /* ---------- 主炮：一切 Build 的底座 ---------- */
  main: {
    name: '主炮', icon: '✦', color: '#7ef9ff',
    update(G, p, dt) {
      const lv = p.wlv.main; if (!lv) return;
      p.cd.main -= dt; if (p.cd.main > 0) return;
      p.cd.main = 0.16 / p.stats.rate;
      const n = 1 + Math.floor((lv - 1) / 2) + p.stats.extraShots;
      const dmg = (5 + lv * 1.9) * p.stats.dmg;
      const step = 0.085;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * step;
        const c = rollCrit(p);
        spawnPBullet(G, p.x + (i - (n - 1) / 2) * 7, p.y - 18, -Math.PI / 2 + off, {
          spd: 780 * p.stats.pspd, r: 4.2, len: 20, dmg: dmg * c, crit: c > 1,
          pierce: p.stats.pierce, color: '#7ef9ff', src: 'main',
        });
      }
      SFX.playAt('shoot', p.x, p.y);
      G.particles.push({ x: p.x, y: p.y - 20, vx: 0, vy: -180, life: 0.12, max: 0.12, size: 12, color: '#7ef9ff', kind: 'ring' });
    },
  },

  /* ---------- 贯穿激光：扫线利器 ---------- */
  laser: {
    name: '贯穿激光', icon: '❂', color: '#4ea8ff',
    update(G, p, dt) {
      const lv = p.wlv.laser; if (!lv) return;
      p.cd.laser -= dt; if (p.cd.laser > 0) return;
      p.cd.laser = 0.52 / p.stats.rate;
      const beams = Math.min(5, 1 + Math.floor(lv / 2));
      const dmg = (10 + lv * 4.5) * p.stats.dmg;
      for (let i = 0; i < beams; i++) {
        const off = (i - (beams - 1) / 2) * 15;
        const c = rollCrit(p);
        spawnPBullet(G, p.x + off, p.y - 22, -Math.PI / 2, {
          spd: 1250 * p.stats.pspd, r: 3, len: 52, dmg: dmg * c, crit: c > 1,
          pierce: 4 + p.stats.pierce, color: '#4ea8ff', kind: 'beam', src: 'laser', life: 1.1,
        });
      }
      SFX.playAt('laser', p.x, p.y);
    },
  },

  /* ---------- 散射炮：近距离清场 ---------- */
  spread: {
    name: '散射炮', icon: '❋', color: '#7cffb2',
    update(G, p, dt) {
      const lv = p.wlv.spread; if (!lv) return;
      p.cd.spread -= dt; if (p.cd.spread > 0) return;
      p.cd.spread = 0.62 / p.stats.rate;
      const n = 3 + lv + p.stats.extraShots * 2;
      const dmg = (4.8 + lv * 1.5) * p.stats.dmg;
      const arc = 0.55 + lv * 0.09;
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
        const c = rollCrit(p);
        spawnPBullet(G, p.x, p.y - 14, -Math.PI / 2 + f * arc, {
          spd: 660 * p.stats.pspd * rand(1.08, 0.94), r: 5, len: 12,
          dmg: dmg * c, crit: c > 1, pierce: p.stats.pierce,
          color: '#7cffb2', kind: 'pellet', src: 'spread', life: 0.8,
        });
      }
      SFX.playAt('spread', p.x, p.y);
    },
  },

  /* ---------- 追踪导弹：索敌补刀 ---------- */
  missile: {
    name: '追踪导弹', icon: '➤', color: '#b39dff',
    update(G, p, dt) {
      const lv = p.wlv.missile; if (!lv) return;
      p.cd.missile -= dt; if (p.cd.missile > 0) return;
      p.cd.missile = 1.0 / p.stats.rate;
      const n = 1 + Math.floor((lv + 1) / 2);
      const dmg = (15 + lv * 8) * p.stats.dmg;
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const c = rollCrit(p);
        spawnPBullet(G, p.x + side * (18 + i * 4), p.y, -Math.PI / 2 + side * rand(1.1, 0.5), {
          spd: 340 * p.stats.pspd, r: 6.5, len: 22, dmg: dmg * c, crit: c > 1,
          color: '#b39dff', kind: 'missile', homing: 4.6, life: 4, src: 'missile',
        });
      }
      SFX.playAt('missile', p.x, p.y);
    },
  },

  /* ---------- 环绕无人机：贴身护卫 ---------- */
  drone: {
    name: '环绕无人机', icon: '◈', color: '#d9f7ff',
    update(G, p, dt) {
      const lv = p.wlv.drone; if (!lv) return;
      if (p.drones.length !== lv) {
        p.drones.length = 0;
        for (let i = 0; i < lv; i++) p.drones.push({ a: i / lv * TAU, cd: rand(0.3) });
      }
      p.droneAngle += 1.75 * dt;
      const R = 66;
      for (let i = 0; i < p.drones.length; i++) {
        const d = p.drones[i];
        d.a = p.droneAngle + i / p.drones.length * TAU;
        d.x = p.x + Math.cos(d.a) * R;
        d.y = p.y + Math.sin(d.a) * R * 0.8;
        d.cd -= dt;
        if (d.cd <= 0) {
          d.cd = 0.58 / p.stats.rate;
          const tgt = nearestEnemy(G, d.x, d.y, 460);
          if (tgt) {
            const dmg = (6 + lv * 2.4) * p.stats.dmg;
            const c = rollCrit(p);
            spawnPBullet(G, d.x, d.y, angTo(d, tgt), {
              spd: 700 * p.stats.pspd, r: 3.6, len: 12, dmg: dmg * c, crit: c > 1,
              color: '#d9f7ff', src: 'drone', pierce: p.stats.pierce,
            });
            SFX.playAt('droneShoot', d.x, d.y);
          }
        }
        // 接触伤害
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (dist(d, e) < e.r + 11) {
            e._droneCd = e._droneCd || 0;
            if (G.t > e._droneCd) {
              e._droneCd = G.t + 0.35;
              damageEnemy(G, e, (7 + lv * 3) * p.stats.dmg, { crit: false });
            }
          }
        }
      }
    },
  },

  /* ---------- 电弧链：专治密集阵 ---------- */
  arc: {
    name: '电弧链', icon: '⚡', color: '#9fefff',
    update(G, p, dt) {
      const lv = p.wlv.arc; if (!lv) return;
      p.cd.arc -= dt; if (p.cd.arc > 0) return;
      p.cd.arc = 1.15 / p.stats.rate;
      const chains = 1 + lv;
      const dmg0 = (10 + lv * 4.5) * p.stats.dmg;
      let cur = { x: p.x, y: p.y - 12 };
      let decay = 1;
      const hit = new Set();
      const pts = [{ x: cur.x, y: cur.y }];
      for (let i = 0; i < chains; i++) {
        const tgt = nearestEnemy(G, cur.x, cur.y, 210, hit);
        if (!tgt) break;
        hit.add(tgt);
        const c = rollCrit(p);
        damageEnemy(G, tgt, dmg0 * decay * c, { crit: c > 1 });
        pts.push({ x: tgt.x, y: tgt.y });
        cur = tgt;
        decay *= 0.84;
      }
      if (pts.length > 1) {
        G.zaps.push({ pts, life: 0.16, max: 0.16 });
        SFX.playAt('zap', p.x, p.y);
      }
    },
  },

  /* ---------- 回旋飞刃：去而复返 ---------- */
  boomer: {
    name: '回旋飞刃', icon: '✧', color: '#5ee0c8',
    update(G, p, dt) {
      const lv = p.wlv.boomer; if (!lv) return;
      p.cd.boomer -= dt; if (p.cd.boomer > 0) return;
      p.cd.boomer = 1.35 / p.stats.rate;
      const n = 1 + Math.floor(lv / 2);
      const dmg = (10 + lv * 4) * p.stats.dmg;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.55;
        const c = rollCrit(p);
        spawnPBullet(G, p.x, p.y - 10, -Math.PI / 2 + off + rand(0.12, -0.12), {
          spd: 620 * p.stats.pspd, r: 9, len: 0, dmg: dmg * c, crit: c > 1,
          color: '#5ee0c8', kind: 'blade', pierce: 99, src: 'boomer', life: 3,
          boomer: { out: 0.55, back: false, passes: 0 },
        });
      }
      SFX.playAt('blade', p.x, p.y);
    },
  },

  /* ---------- 引力黑洞：聚怪 + 持续伤害 ---------- */
  black: {
    name: '引力黑洞', icon: '◉', color: '#5f6bff',
    update(G, p, dt) {
      const lv = p.wlv.black; if (!lv) return;
      p.cd.black -= dt; if (p.cd.black > 0) return;
      p.cd.black = Math.max(2.2, 5.2 - lv * 0.6) / p.stats.rate;
      // 落点找最密集处
      let best = null, bestN = -1;
      const alive = G.enemies.filter(e => !e.dead && e.y > 60);
      for (const e of alive) {
        let n = 0;
        for (const o of alive) if (dist(e, o) < 150) n++;
        if (n > bestN) { bestN = n; best = e; }
      }
      const tx = best ? clamp(best.x, 70, 470) : p.x;
      const ty = best ? clamp(best.y, 140, p.y - 140) : p.y - 300;
      G.holes.push({
        x: tx, y: ty, r: 96 + lv * 22, life: 2.8, max: 2.8,
        dps: (6 + lv * 5.5) * p.stats.dmg, spin: 0, born: 0,
      });
      SFX.playAt('void', tx, ty);
      G.shake = Math.min(16, G.shake + 3);
    },
  },
};

/** 查找最近敌人 */
function nearestEnemy(G, x, y, maxR, exclude) {
  let best = null, bd = maxR * maxR;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (exclude && exclude.has(e)) continue;
    const dx = e.x - x, dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

function updateWeapons(G, p, dt) {
  for (const k in WEAPONS) WEAPONS[k].update(G, p, dt);
}

/* ---------------------------------------------------------
   稀有度
   --------------------------------------------------------- */
const RARITY = {
  common: { key: 'common', name: '普通', cls: 'r-common', w: 100 },
  rare:   { key: 'rare',   name: '稀有', cls: 'r-rare',   w: 45 },
  epic:   { key: 'epic',   name: '史诗', cls: 'r-epic',   w: 18 },
  legend: { key: 'legend', name: '传说', cls: 'r-legend', w: 4 },
};

/* ---------------------------------------------------------
   升级池
   --------------------------------------------------------- */
const UPGRADES = [
  /* ============ 武器系 ============ */
  { id: 'w_main', name: '主炮强化', icon: '✦', rarity: 'common', max: 8, tag: '武器',
    desc: (l) => l === 0 ? '强化主炮，弹丸数与伤害同步提升' : `主炮弹丸 +1，单发伤害 +1.9（当前 Lv${l}）`,
    apply: (p) => { p.wlv.main = Math.min(8, (p.wlv.main || 1) + 1); } },

  { id: 'w_laser', name: '贯穿激光', icon: '❂', rarity: 'rare', max: 6, tag: '武器',
    desc: (l) => l === 0 ? '解锁高速穿透激光，可一次贯穿 4 个敌人' : `激光 +1 束、伤害 +4.5，穿透 +1`,
    apply: (p) => { p.wlv.laser = (p.wlv.laser || 0) + 1; } },

  { id: 'w_spread', name: '散射炮', icon: '❋', rarity: 'rare', max: 6, tag: '武器',
    desc: (l) => l === 0 ? '解锁扇形散射，近距离爆发极高' : `散射 +1 弹丸、伤害 +1.5，扇面更宽`,
    apply: (p) => { p.wlv.spread = (p.wlv.spread || 0) + 1; } },

  { id: 'w_missile', name: '追踪导弹', icon: '➤', rarity: 'rare', max: 6, tag: '武器',
    desc: (l) => l === 0 ? '解锁自动索敌导弹，你专心走位它负责输出' : `导弹齐射 +1 发、伤害 +8`,
    apply: (p) => { p.wlv.missile = (p.wlv.missile || 0) + 1; } },

  { id: 'w_drone', name: '环绕无人机', icon: '◈', rarity: 'epic', max: 5, tag: '武器',
    desc: (l) => l === 0 ? '召唤环绕无人机：自动开火 + 撞击伤害' : `无人机 +1 架（上限 5），单发伤害 +2.4`,
    apply: (p) => { p.wlv.drone = (p.wlv.drone || 0) + 1; } },

  { id: 'w_arc', name: '电弧链', icon: '⚡', rarity: 'epic', max: 5, tag: '武器',
    desc: (l) => l === 0 ? '解锁链式闪电，在敌群中弹射跳转' : `弹射目标 +1，基础伤害 +4.5`,
    apply: (p) => { p.wlv.arc = (p.wlv.arc || 0) + 1; } },

  { id: 'w_boomer', name: '回旋飞刃', icon: '✧', rarity: 'rare', max: 4, tag: '武器',
    desc: (l) => l === 0 ? '解锁回旋刃：飞出后折返，来回两次伤害' : `刃数 +1（每 2 级），伤害 +4`,
    apply: (p) => { p.wlv.boomer = (p.wlv.boomer || 0) + 1; } },

  { id: 'w_black', name: '引力黑洞', icon: '◉', rarity: 'epic', max: 3, tag: '武器',
    desc: (l) => l === 0 ? '自动在敌群中心生成黑洞：牵引敌人并持续伤害' : `黑洞半径 +22、每秒伤害 +5.5、冷却 −0.6s`,
    apply: (p) => { p.wlv.black = (p.wlv.black || 0) + 1; } },

  /* ============ 被动系 ============ */
  { id: 'p_dmg', name: '强化弹头', icon: '💥', rarity: 'common', max: 10, tag: '被动',
    desc: () => '全部武器伤害 +14%',
    apply: (p) => { p.stats.dmg *= 1.14; } },

  { id: 'p_rate', name: '超载引擎', icon: '⏱', rarity: 'common', max: 8, tag: '被动',
    desc: () => '全部武器射速 +12%',
    apply: (p) => { p.stats.rate *= 1.12; } },

  { id: 'p_spd', name: '推进器', icon: '🚀', rarity: 'common', max: 6, tag: '被动',
    desc: () => '移动速度 +10%',
    apply: (p) => { p.stats.mvSpd *= 1.10; } },

  { id: 'p_hp', name: '装甲强化', icon: '❤️', rarity: 'common', max: 8, tag: '被动',
    desc: () => '最大生命 +25 并立即回复 25',
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },

  { id: 'p_pspd', name: '加速弹道', icon: '⇈', rarity: 'common', max: 5, tag: '被动',
    desc: () => '弹速 +15%（射程与命中率同步提升）',
    apply: (p) => { p.stats.pspd *= 1.15; } },

  { id: 'p_pierce', name: '穿甲弹', icon: '⊹', rarity: 'rare', max: 4, tag: '被动',
    desc: () => '所有弹丸额外穿透 +1 个敌人',
    apply: (p) => { p.stats.pierce += 1; } },

  { id: 'p_crit', name: '精准瞄准', icon: '🎯', rarity: 'common', max: 8, tag: '被动',
    desc: () => '暴击率 +6%',
    apply: (p) => { p.stats.crit += 0.06; } },

  { id: 'p_critd', name: '致命打击', icon: '🔪', rarity: 'epic', max: 6, tag: '被动',
    desc: () => '暴击伤害 +30%',
    apply: (p) => { p.stats.critMult += 0.30; } },

  { id: 'p_magnet', name: '磁力场', icon: '🧲', rarity: 'common', max: 4, tag: '被动',
    desc: () => '经验拾取范围 +45',
    apply: (p) => { p.stats.magnet += 45; } },

  { id: 'p_luck', name: '幸运星', icon: '🍀', rarity: 'rare', max: 4, tag: '被动',
    desc: () => '升级卡稀有度权重提升（更容易刷到史诗）',
    apply: (p) => { p.stats.luck += 1; } },

  { id: 'p_xp', name: '数据链', icon: '📈', rarity: 'rare', max: 4, tag: '被动',
    desc: () => '经验获取 +20%',
    apply: (p) => { p.stats.xpGain *= 1.20; } },

  { id: 'p_regen', name: '纳米修复', icon: '✚', rarity: 'rare', max: 5, tag: '被动',
    desc: () => '每秒回复 0.7 点生命',
    apply: (p) => { p.stats.regen += 0.7; } },

  { id: 'p_shield', name: '能量护盾', icon: '🛡', rarity: 'rare', max: 5, tag: '被动',
    desc: (l) => l === 0 ? '获得 30 点护盾，脱战 4 秒后自动充能' : '护盾上限 +25 并立即充满',
    apply: (p) => { p.shieldMax += 30; p.shield = p.shieldMax; } },

  { id: 'p_contact', name: '反制装甲', icon: '⊞', rarity: 'common', max: 4, tag: '被动',
    desc: () => '撞击伤害 −18%',
    apply: (p) => { p.stats.contactRes *= 0.82; } },

  { id: 'p_bullet', name: '多重射击', icon: '⋔', rarity: 'epic', max: 3, tag: '被动',
    desc: () => '主炮额外 +1 弹丸，散射炮额外 +2 弹丸',
    apply: (p) => { p.stats.extraShots += 1; } },

  /* ============ 主动系 ============ */
  { id: 'a_dash', name: '相位冲刺', icon: '⇢', rarity: 'rare', max: 3, tag: '主动',
    desc: (l) => l === 0 ? '解锁 Space 冲刺：0.38s 无敌位移，冷却 6s' : '冲刺冷却 −1.4s，无敌时间 +0.06s',
    apply: (p) => { p.dashLv = (p.dashLv || 0) + 1; p.dashCdMax = Math.max(2.2, 6 - p.dashLv * 1.4); } },

  { id: 'a_bomb', name: '湮灭核弹', icon: '☢', rarity: 'epic', max: 5, tag: '主动',
    desc: (l) => l === 0 ? '解锁 Q 核弹：清空全场敌弹并造成巨额伤害，携带 2 次' : '核弹携带 +2 次，伤害 +40%',
    apply: (p) => { p.bombCount += 2; p.bombDmg = (p.bombDmg || 1) * 1.4; } },

  { id: 'a_slow', name: '时间畸变', icon: '⧗', rarity: 'epic', max: 3, tag: '主动',
    desc: (l) => l === 0 ? '解锁 E 时缓：3s 内敌方时间流速降至 35%' : '持续时间 +0.8s，冷却 −3s',
    apply: (p) => { p.slowLv = (p.slowLv || 0) + 1; p.slowDur = 3 + p.slowLv * 0.8; p.slowCdMax = Math.max(8, 18 - p.slowLv * 3); } },

  /* ============ 功能 / 兜底 ============ */
  { id: 'u_reroll', name: '重构器', icon: '⟳', rarity: 'common', max: 5, tag: '功能',
    desc: () => '升级时重随卡片的次数 +2',
    apply: (p) => { p.rerolls += 2; } },

  { id: 'u_heal', name: '应急修复', icon: '＋', rarity: 'common', max: 99, tag: '功能',
    desc: () => '立即回复 40% 最大生命',
    apply: (p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); SFX.play('heal'); } },

  { id: 'u_overload', name: '过载校准', icon: '∞', rarity: 'legend', max: 99, tag: '功能',
    desc: () => '全属性小幅提升：伤害 +6%、射速 +6%、移速 +4%、生命 +10',
    apply: (p) => {
      p.stats.dmg *= 1.06; p.stats.rate *= 1.06; p.stats.mvSpd *= 1.04;
      p.maxHp += 10; p.hp += 10;
    } },
];

const UPGRADE_BY_ID = {};
UPGRADES.forEach(u => UPGRADE_BY_ID[u.id] = u);

/** 该升级当前等级 */
function upLv(p, u) {
  if (u.tag === '武器') return p.wlv[u.id.slice(2)] || 0;
  return (p.taken[u.id] || 0);
}

/** 是否可以选取 */
function canTake(p, u) {
  return upLv(p, u) < u.max;
}

/** 真正的"兜底卡"：只有在可选池枯竭时才会出现 */
const FILLER_IDS = { u_heal: 1, u_overload: 1 };

/** 抽 3 张卡 */
function drawCards(G, p, n = 3) {
  const all = UPGRADES.filter(u => canTake(p, u));
  const real = all.filter(u => !FILLER_IDS[u.id]);
  // 正常池子够用就绝不注入兜底卡，保证三选一始终是有意义的 Build 决策
  const pool = real.length >= n ? real : all;

  const weightFn = (c) => {
    const w = RARITY[c.rarity].w;
    const high = c.rarity === 'epic' || c.rarity === 'legend';
    return w * (high ? 1 + p.stats.luck * 0.28 : 1 + p.stats.luck * 0.05);
  };

  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const cands = pool.filter(u => !used.has(u.id));
    if (!cands.length) break;
    const u = weightedPick(cands, weightFn);
    used.add(u.id);
    out.push(u);
  }
  // 池子真的枯竭了（全满级）才补兜底
  let k = 0;
  while (out.length < n) {
    out.push(UPGRADE_BY_ID[k++ % 2 === 0 ? 'u_heal' : 'u_overload']);
  }
  return out;
}

/** 应用升级 */
function applyUpgrade(G, p, u) {
  u.apply(p, G);
  // 武器系的等级记录在 p.wlv（apply 内已自增），其余记在 p.taken
  if (u.tag !== '武器') p.taken[u.id] = (p.taken[u.id] || 0) + 1;
  p.buildLog.push(u.id);
}
