/* =========================================================
   upgrades.js — 武器系统 + 肉鸽升级池（v2：五选一 / 三品质 / 54 张池）
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   动态伤害系数（构筑类卡在这里生效，武器无需各自记住）
   --------------------------------------------------------- */
function weaponKinds(p) { let n = 0; for (const k in p.wlv) if (p.wlv[k] > 0) n++; return n; }

/** 与武器无关的全局伤害乘数（静止炮台 / 武器协同 / 护盾回路） */
function dynMul(p) {
  let m = 1;
  const s = p.stats;
  if (s.bastion) m += s.bastion * (p._bastionK || 0);
  if (s.synergy) m += s.synergy * weaponKinds(p);
  if (s.shieldDmg) m += Math.min(0.40, s.shieldDmg * Math.max(0, p.shield));
  return m;
}
/** 单把武器的最终伤害乘数；kind 用于「专精协议」的主/副武器区分 */
function dmgMul(p, kind) {
  let m = p.stats.dmg * dynMul(p);
  if (p.stats.spec && kind) m *= (kind === p.stats.specMain) ? (1 + 0.55 * p.stats.specKinds) : 0.35;
  return m;
}

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
      const focus = p.stats.tFocus ? 0.5 : 1;     // 聚焦透镜：宽度换密度
      const narrow = p.stats.tNarrow ? 0.6 : 1;   // 散射聚合
      p.cd.main = (p.stats.tNarrow ? 0.22 : 0.16) / p.stats.rate;
      const n = Math.max(1, Math.round((1 + Math.floor((lv - 1) / 2) + p.stats.extraShots) * focus * narrow));
      const dm = dmgMul(p, 'main') * (p.stats.tFocus ? 2.15 : 1) * (p.stats.tNarrow ? 2.0 : 1);
      const dmg = (5 + lv * 1.9) * dm;
      const step = 0.085 * (p.stats.tNarrow ? 0.4 : 1);
      const r = 4.2 * (p.stats.tFocus ? 1.45 : 1);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * step;
        const c = rollCrit(p);
        spawnPBullet(G, p.x + (i - (n - 1) / 2) * 7, p.y - 18, -Math.PI / 2 + off, {
          spd: 780 * p.stats.pspd, r, len: 20, dmg: dmg * c, crit: c > 1,
          pierce: p.stats.pierce, color: '#7ef9ff', src: 'main',
          burst: p.stats.tNarrow ? 34 : 0,
        });
      }
      SFX.playAt('shoot', p.x, p.y);
      G.particles.push({ x: p.x, y: p.y - 20, vx: 0, vy: -180, life: 0.12, max: 0.12, size: 12, color: '#7ef9ff', kind: 'ring' });
    },
  },

  /* ---------- 贯穿激光：扫线利器（可被「持续光束」改形态） ---------- */
  laser: {
    name: '贯穿激光', icon: '❂', color: '#4ea8ff',
    update(G, p, dt) {
      const lv = p.wlv.laser; if (!lv) return;
      if (p.stats.lance) { tLanceUpdate(G, p, lv, dt); return; }
      p.cd.laser -= dt; if (p.cd.laser > 0) return;
      p.cd.laser = 0.52 / p.stats.rate;
      const beams = Math.min(5, 1 + Math.floor(lv / 2));
      const dmg = (10 + lv * 4.5) * dmgMul(p, 'laser');
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
      const nar = p.stats.tNarrow ? 0.6 : 1;
      p.cd.spread = (0.62 / p.stats.rate) * (p.stats.tNarrow ? 1.35 : 1);
      const n = Math.max(1, Math.round((3 + lv + p.stats.extraShots * 2) * nar));
      const dmg = (4.8 + lv * 1.5) * dmgMul(p, 'spread') * (p.stats.tNarrow ? 2.0 : 1);
      const arc = (0.55 + lv * 0.09) * nar;
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
        const c = rollCrit(p);
        spawnPBullet(G, p.x, p.y - 14, -Math.PI / 2 + f * arc, {
          spd: 660 * p.stats.pspd * rand(1.08, 0.94), r: 5, len: 12,
          dmg: dmg * c, crit: c > 1, pierce: p.stats.pierce,
          color: '#7cffb2', kind: 'pellet', src: 'spread', life: 0.8,
          burst: p.stats.tNarrow ? 34 : 0,
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
      const dmg = (15 + lv * 8) * dmgMul(p, 'missile');
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

  /* ---------- 环绕无人机：贴身护卫（可被「无人机列阵」改形态） ---------- */
  drone: {
    name: '环绕无人机', icon: '◈', color: '#d9f7ff',
    update(G, p, dt) {
      const lv = p.wlv.drone; if (!lv) return;
      if (p.drones.length !== lv) {
        p.drones.length = 0;
        for (let i = 0; i < lv; i++) p.drones.push({ a: i / lv * TAU, cd: rand(0.3) });
      }
      const col = !!p.stats.tColumn;
      p.droneAngle += 1.75 * dt;
      const R = 66;
      for (let i = 0; i < p.drones.length; i++) {
        const d = p.drones[i];
        if (col) {
          /* 列阵：在你身后纵向排开，只朝正前方开火（失去接触伤害） */
          d.x = p.x;
          d.y = p.y + 26 + i * 34;
        } else {
          d.a = p.droneAngle + i / p.drones.length * TAU;
          d.x = p.x + Math.cos(d.a) * R;
          d.y = p.y + Math.sin(d.a) * R * 0.8;
        }
        d.cd -= dt;
        if (d.cd <= 0) {
          d.cd = 0.58 / p.stats.rate / (col ? 1.35 : 1);
          const tgt = nearestEnemy(G, d.x, d.y, col ? 560 : 460);
          if (tgt) {
            const dmg = (6 + lv * 2.4) * dmgMul(p, 'drone');
            const c = rollCrit(p);
            const ang = col ? -Math.PI / 2 : angTo(d, tgt);
            spawnPBullet(G, d.x, d.y, ang, {
              spd: 700 * p.stats.pspd, r: 3.6, len: 12, dmg: dmg * c, crit: c > 1,
              color: '#d9f7ff', src: 'drone', pierce: p.stats.pierce,
              homing: col ? 3.4 : 0,
            });
            SFX.playAt('droneShoot', d.x, d.y);
          }
        }
        if (col) continue;
        // 接触伤害（列阵后取消）
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (dist(d, e) < e.r + 11) {
            e._droneCd = e._droneCd || 0;
            if (G.t > e._droneCd) {
              e._droneCd = G.t + 0.35;
              damageEnemy(G, e, (7 + lv * 3) * dmgMul(p, 'drone'), { crit: false, src: 'drone' });
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
      const dmg0 = (10 + lv * 4.5) * dmgMul(p, 'arc');
      let cur = { x: p.x, y: p.y - 12 };
      let decay = 1;
      const hit = new Set();
      const pts = [{ x: cur.x, y: cur.y }];
      for (let i = 0; i < chains; i++) {
        const tgt = nearestEnemy(G, cur.x, cur.y, 210, hit);
        if (!tgt) break;
        hit.add(tgt);
        const c = rollCrit(p);
        damageEnemy(G, tgt, dmg0 * decay * c, { crit: c > 1, src: 'arc' });
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
      const dmg = (10 + lv * 4) * dmgMul(p, 'boomer');
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
        dps: (6 + lv * 5.5) * dmgMul(p, 'black'), spin: 0, born: 0,
      });
      SFX.playAt('void', tx, ty);
      G.shake = Math.min(16, G.shake + 3);
    },
  },
};

/* ---------------------------------------------------------
   持续光束（t_lance）：形态改写，不是一颗弹丸
   --------------------------------------------------------- */
function tLanceUpdate(G, p, lv, dt) {
  const max = p.stats.energyMax || 100;
  const on = p.energy > 0.5;
  p.lanceOn = on;
  if (on) {
    p.energy = Math.max(0, p.energy - 3 * dt);
    p.lanceCd = (p.lanceCd || 0) - dt;
    if (p.lanceCd <= 0) {
      p.lanceCd = 0.1;
      const dmg = (10 + lv * 4.5) * dmgMul(p, 'laser') * 0.55;
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - p.x) > 11 + e.r) continue;
        if (e.y > p.y - 14) continue;
        const c = rollCrit(p);
        damageEnemy(G, e, dmg * c, { crit: c > 1, src: 'laser' });
        /* 地面灼痕：束扫过的敌人位置留一枚 0.4s 的烧蚀圆（元素色优先） */
        const sc = (G.player && elemTrailColor(G.player)) || '#7ef9ff';
        G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 28, color: sc, kind: 'ring' });
      }
      /* 束首溅射火星（约 10/s，与设计「每秒 12 颗」同量级） */
      for (let i = 0; i < 2; i++) {
        const a = rand(TAU);
        G.particles.push({ x: p.x + rand(9, -9), y: -36, vx: Math.cos(a) * rand(180, 40), vy: rand(160, 20),
          life: 0.35, max: 0.35, size: rand(3.4, 1.6), color: chance(0.5) ? '#ffffff' : '#bff4ff', kind: 'spark' });
      }
      SFX.playAt('laser', p.x, p.y);
    }
  } else {
    p.energy = Math.min(max, p.energy + 2.5 * dt);
  }
}

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
   稀有度（四档 → 三档；原「传说」唯一卡 u_overload 本是兜底卡，删除不损失内容）
   --------------------------------------------------------- */
const RARITY = {
  common: { key: 'common', name: '普通', cls: 'r-common', w: 100 },
  rare:   { key: 'rare',   name: '稀有', cls: 'r-rare',   w: 42 },
  epic:   { key: 'epic',   name: '史诗', cls: 'r-epic',   w: 15 },
};

/* ---------------------------------------------------------
   升级池（54 张 = 原有 29 + 新增 25）
   unlock = 该卡进入抽取池的波次（分层解锁 T0 W1 / T1 W5 / T2 W11）
   --------------------------------------------------------- */
const UPGRADES = [
  /* ============ 武器系（T0） ============ */
  { id: 'w_main', name: '主炮强化', icon: '✦', rarity: 'common', max: 8, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '强化主炮，弹丸数与伤害同步提升' : `主炮弹丸 +1，单发伤害 +1.9（当前 Lv${l}）`,
    apply: (p) => { p.wlv.main = Math.min(8, (p.wlv.main || 1) + 1); } },

  { id: 'w_laser', name: '贯穿激光', icon: '❂', rarity: 'rare', max: 6, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '解锁高速穿透激光，可一次贯穿 4 个敌人' : `激光 +1 束、伤害 +4.5，穿透 +1`,
    apply: (p) => { p.wlv.laser = (p.wlv.laser || 0) + 1; } },

  { id: 'w_spread', name: '散射炮', icon: '❋', rarity: 'rare', max: 6, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '解锁扇形散射，近距离爆发极高' : `散射 +1 弹丸、伤害 +1.5，扇面更宽`,
    apply: (p) => { p.wlv.spread = (p.wlv.spread || 0) + 1; } },

  { id: 'w_missile', name: '追踪导弹', icon: '➤', rarity: 'rare', max: 6, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '解锁自动索敌导弹，你专心走位它负责输出' : `导弹齐射 +1 发、伤害 +8`,
    apply: (p) => { p.wlv.missile = (p.wlv.missile || 0) + 1; } },

  { id: 'w_drone', name: '环绕无人机', icon: '◈', rarity: 'epic', max: 5, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '召唤环绕无人机：自动开火 + 撞击伤害' : `无人机 +1 架（上限 5），单发伤害 +2.4`,
    apply: (p) => { p.wlv.drone = (p.wlv.drone || 0) + 1; } },

  { id: 'w_arc', name: '电弧链', icon: '⚡', rarity: 'epic', max: 5, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '解锁链式闪电，在敌群中弹射跳转' : `弹射目标 +1，基础伤害 +4.5`,
    apply: (p) => { p.wlv.arc = (p.wlv.arc || 0) + 1; } },

  { id: 'w_boomer', name: '回旋飞刃', icon: '✧', rarity: 'rare', max: 4, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '解锁回旋刃：飞出后折返，来回两次伤害' : `刃数 +1（每 2 级），伤害 +4`,
    apply: (p) => { p.wlv.boomer = (p.wlv.boomer || 0) + 1; } },

  { id: 'w_black', name: '引力黑洞', icon: '◉', rarity: 'epic', max: 3, tag: '武器', unlock: 1,
    desc: (l) => l === 0 ? '自动在敌群中心生成黑洞：牵引敌人并持续伤害' : `黑洞半径 +22、每秒伤害 +5.5、冷却 −0.6s`,
    apply: (p) => { p.wlv.black = (p.wlv.black || 0) + 1; } },

  /* ============ 被动系 ============ */
  { id: 'p_dmg', name: '强化弹头', icon: '💥', rarity: 'common', max: 10, tag: '被动', unlock: 1,
    desc: () => '全部武器伤害 +14%',
    apply: (p) => { p.stats.dmg *= 1.14; } },

  { id: 'p_rate', name: '超载引擎', icon: '⏱', rarity: 'common', max: 8, tag: '被动', unlock: 1,
    desc: () => '全部武器射速 +12%',
    apply: (p) => { p.stats.rate *= 1.12; } },

  { id: 'p_spd', name: '推进器', icon: '🚀', rarity: 'common', max: 6, tag: '被动', unlock: 1,
    desc: () => '移动速度 +10%',
    apply: (p) => { p.stats.mvSpd *= 1.10; } },

  { id: 'p_hp', name: '装甲强化', icon: '❤️', rarity: 'common', max: 8, tag: '被动', unlock: 1,
    desc: () => '最大生命 +25 并立即回复 25',
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },

  { id: 'p_pspd', name: '加速弹道', icon: '⇈', rarity: 'common', max: 5, tag: '被动', unlock: 1,
    desc: () => '弹速 +15%（射程与命中率同步提升）',
    apply: (p) => { p.stats.pspd *= 1.15; } },

  { id: 'p_crit', name: '精准瞄准', icon: '🎯', rarity: 'common', max: 8, tag: '被动', unlock: 1,
    desc: () => '暴击率 +6%',
    apply: (p) => { p.stats.crit += 0.06; } },

  { id: 'p_magnet', name: '磁力场', icon: '🧲', rarity: 'common', max: 4, tag: '被动', unlock: 1,
    desc: () => '经验拾取范围 +45',
    apply: (p) => { p.stats.magnet += 45; } },

  { id: 'p_pierce', name: '穿甲弹', icon: '⊹', rarity: 'rare', max: 4, tag: '被动', unlock: 5,
    desc: () => '所有弹丸额外穿透 +1 个敌人',
    apply: (p) => { p.stats.pierce += 1; } },

  { id: 'p_critd', name: '致命打击', icon: '🔪', rarity: 'epic', max: 6, tag: '被动', unlock: 5,
    desc: () => '暴击伤害 +30%',
    apply: (p) => { p.stats.critMult += 0.30; } },

  { id: 'p_luck', name: '幸运星', icon: '🍀', rarity: 'rare', max: 4, tag: '被动', unlock: 5,
    desc: () => '升级卡稀有度权重提升（更容易刷到史诗）',
    apply: (p) => { p.stats.luck += 1; } },

  { id: 'p_xp', name: '数据链', icon: '📈', rarity: 'rare', max: 4, tag: '被动', unlock: 5,
    desc: () => '经验获取 +20%',
    apply: (p) => { p.stats.xpGain *= 1.20; } },

  { id: 'p_regen', name: '纳米修复', icon: '✚', rarity: 'rare', max: 5, tag: '被动', unlock: 5,
    desc: () => '每秒回复 0.7 点生命',
    apply: (p) => { p.stats.regen += 0.7; } },

  { id: 'p_shield', name: '能量护盾', icon: '🛡', rarity: 'rare', max: 5, tag: '被动', unlock: 5,
    desc: (l) => l === 0 ? '获得 30 点护盾，脱战 4 秒后自动充能' : '护盾上限 +25 并立即充满',
    apply: (p) => { p.shieldMax += 30; p.shield = p.shieldMax; } },

  { id: 'p_contact', name: '反制装甲', icon: '⊞', rarity: 'common', max: 4, tag: '被动', unlock: 5,
    desc: () => '撞击伤害 −18%',
    apply: (p) => { p.stats.contactRes *= 0.82; } },

  { id: 'p_bullet', name: '多重射击', icon: '⋔', rarity: 'epic', max: 3, tag: '被动', unlock: 5,
    desc: () => '主炮额外 +1 弹丸，散射炮额外 +2 弹丸',
    apply: (p) => { p.stats.extraShots += 1; } },

  /* ============ 主动系 ============ */
  { id: 'a_dash', name: '相位冲刺', icon: '⇢', rarity: 'rare', max: 3, tag: '主动', unlock: 5,
    desc: (l) => l === 0 ? '解锁 Space 冲刺：0.38s 无敌位移，冷却 6s' : '冲刺冷却 −1.4s，无敌时间 +0.06s',
    apply: (p) => { p.dashLv = (p.dashLv || 0) + 1; p.dashCdMax = Math.max(2.2, 6 - p.dashLv * 1.4); } },

  { id: 'a_bomb', name: '湮灭核弹', icon: '☢', rarity: 'epic', max: 5, tag: '主动', unlock: 5,
    desc: (l) => l === 0 ? '解锁 Q 核弹：清空全场敌弹并造成巨额伤害，携带 2 次' : '核弹携带 +2 次，伤害 +40%',
    apply: (p) => { p.bombCount += 2; p.bombDmg = (p.bombDmg || 1) * 1.4; } },

  { id: 'a_slow', name: '时间畸变', icon: '⧗', rarity: 'epic', max: 3, tag: '主动', unlock: 5,
    desc: (l) => l === 0 ? '解锁 E 时缓：3s 内敌方时间流速降至 35%' : '持续时间 +0.8s，冷却 −3s',
    apply: (p) => { p.slowLv = (p.slowLv || 0) + 1; p.slowDur = 3 + p.slowLv * 0.8; p.slowCdMax = Math.max(8, 18 - p.slowLv * 3); } },

  /* ============ 功能 / 兜底 ============ */
  { id: 'u_reroll', name: '重构器', icon: '⟳', rarity: 'common', max: 5, tag: '功能', unlock: 1,
    desc: () => '升级时重随卡片的次数 +2',
    apply: (p) => { p.rerolls += 2; } },

  { id: 'u_heal', name: '应急修复', icon: '＋', rarity: 'common', max: 99, tag: '功能', unlock: 1,
    desc: () => '立即回复 40% 最大生命',
    apply: (p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); SFX.play('heal'); } },

  { id: 'u_overload', name: '过载校准', icon: '∞', rarity: 'common', max: 99, tag: '功能', unlock: 1,
    desc: () => '全属性小幅提升：伤害 +6%、射速 +6%、移速 +4%、生命 +10',
    apply: (p) => {
      p.stats.dmg *= 1.06; p.stats.rate *= 1.06; p.stats.mvSpd *= 1.04;
      p.maxHp += 10; p.hp += 10;
    } },

  /* =========================================================
     转化类（5）—— 改变武器的行为规则，而不是数值
     ========================================================= */
  { id: 't_focus', name: '聚焦透镜', icon: '◎', rarity: 'rare', max: 2, tag: '转化', unlock: 5,
    desc: (l) => (l === 0 ? '主炮：弹丸数减半（向上取整），单发伤害 ×2.15、弹体半径 +45%'
      : '再叠一层：弹丸数再减半、伤害再 ×2.15'),
    apply: (p) => { p.stats.tFocus += 1; } },

  { id: 't_lance', name: '持续光束', icon: '▮', rarity: 'epic', max: 1, tag: '转化', unlock: 11,
    desc: () => '激光改形态：不再发射弹丸，改为舰船向上连续光束（长 620）。每秒耗 3 点能量（上限 100，2.5/s 回复）',
    apply: (p) => { p.stats.lance = 1; p.energy = p.stats.energyMax; } },

  { id: 't_narrow', name: '散射聚合', icon: '⋁', rarity: 'common', max: 3, tag: '转化', unlock: 1,
    desc: () => '散射炮扇面 −60%、弹丸数 ×0.6，单发伤害 ×2.0；主炮同步收束，弹丸消失处产生半径 34 小爆',
    apply: (p) => { p.stats.tNarrow += 1; } },

  { id: 't_column', name: '无人机列阵', icon: '⋮', rarity: 'rare', max: 1, tag: '转化', unlock: 5,
    desc: () => '无人机改为在你身后纵向列阵，只在正前方开火（射速 ×1.35）；失去接触伤害',
    apply: (p) => { p.stats.tColumn = 1; } },

  { id: 't_split', name: '导弹分导', icon: '⋔', rarity: 'rare', max: 2, tag: '转化', unlock: 1,
    desc: (l) => (l === 0 ? '导弹命中后分裂为 3 枚小追踪弹（伤害 = 该发 ×0.45，射程 200）'
      : '分裂弹数 +2、分裂伤害 +0.15'),
    apply: (p) => { p.stats.tSplit += 1; } },

  /* =========================================================
     触发类（5）—— 把"事件"变成资源
     ========================================================= */
  { id: 'k_chain', name: '连锁爆破', icon: '✸', rarity: 'rare', max: 3, tag: '触发', unlock: 1,
    desc: () => '击杀敌人时，对 62 半径内造成 = 该敌人最大生命 12% 的伤害（对 Boss 1.2%）',
    apply: (p) => { p.stats.chain += 1; } },

  { id: 'k_prism', name: '暴击折射', icon: '⟁', rarity: 'rare', max: 3, tag: '触发', unlock: 5,
    desc: () => '暴击命中时向最近的两个敌人各射 1 道短光束（伤害 = 该次暴击 ×0.35）',
    apply: (p) => { p.stats.prism += 1; } },

  { id: 'k_shatter', name: '碎冰回响', icon: '❈', rarity: 'rare', max: 2, tag: '触发', unlock: 11,
    desc: () => '敌人冻结结束时，对 90 半径造成 = 该敌人最大生命 6% 的伤害，并为你回 3 点护盾',
    apply: (p) => { p.stats.shatter += 1; } },

  { id: 'k_riposte', name: '受伤反噬', icon: '⟳', rarity: 'rare', max: 2, tag: '触发', unlock: 5,
    desc: () => '受伤时立刻引爆冲击波（伤害 = 你最大生命 18%，清除半径 240 内敌弹），冷却 7s',
    apply: (p) => { p.stats.riposte += 1; } },

  { id: 'k_resonate', name: '拾取共鸣', icon: '◇', rarity: 'common', max: 2, tag: '触发', unlock: 5,
    desc: () => '每拾取 12 个经验晶体，触发 1.2s 全场敌方时缓 45%',
    apply: (p) => { p.stats.resonate += 1; } },

  /* =========================================================
     代价类（4）—— 没有负收益的选择不是选择
     ========================================================= */
  { id: 'r_overload', name: '过载核心', icon: '⨂', rarity: 'epic', max: 2, tag: '代价', unlock: 5,
    desc: (l) => (l === 0 ? '全伤 +55%，最大生命 −35%（不低于 45），按新上限等比扣血'
      : '再叠一层：全伤再 +55%，最大生命再 −35%'),
    apply: (p) => {
      p.stats.dmg *= 1.55;
      const nm = Math.max(45, p.maxHp * 0.65);
      p.hp = Math.max(1, p.hp * (nm / p.maxHp));
      p.maxHp = nm;
    } },

  { id: 'r_glass', name: '玻璃加农', icon: '◈', rarity: 'epic', max: 1, tag: '代价', unlock: 5,
    desc: () => '射速 +45%、弹速 +20%；护盾上限归零，且本局无法再获得护盾',
    apply: (p) => {
      p.stats.rate *= 1.45; p.stats.pspd *= 1.20;
      p.shieldMax = 0; p.shield = 0; p.noShield = 1;
    } },

  { id: 'r_bastion', name: '静止炮台', icon: '⊓', rarity: 'rare', max: 3, tag: '代价', unlock: 11,
    desc: (l) => (l === 0 ? '静止 ≥1.5s 后获得 +26% 全伤；移动后 0.6s 内线性衰减（冲刺会中断加成）'
      : `叠加：静止加成 +26%（当前 ${l} 层）`),
    apply: (p) => { p.stats.bastion += 0.26; } },

  { id: 'r_tithe', name: '生命献祭', icon: '✝', rarity: 'rare', max: 99, tag: '代价', unlock: 5,
    desc: () => '最大生命 −12（不低于 30），全伤 +5%（可无限叠加）',
    apply: (p) => {
      const nm = Math.max(30, p.maxHp - 12);
      p.hp = Math.min(p.hp, nm);
      p.maxHp = nm;
      p.stats.dmg *= 1.05;
    } },

  /* =========================================================
     构筑类（5）—— 改变"数值如何生效"
     ========================================================= */
  { id: 'b_synergy', name: '武器协同', icon: '⧉', rarity: 'common', max: 3, tag: '构筑', unlock: 1,
    desc: () => '每持有一把武器 → 全伤 +6%、射速 +3%（鼓励宽度）',
    apply: (p) => { p.stats.synergy += 0.06; p.stats.rate *= 1.03; } },

  { id: 'b_spec', name: '专精协议', icon: '⧗', rarity: 'epic', max: 1, tag: '构筑', unlock: 11,
    desc: () => '只保留等级最高的那把为「主武器」，其伤害 ×(1 + 武器种类数 ×0.55)；其余武器伤害 ×0.35',
    apply: (p) => {
      let main = 'main', best = -1;
      for (const k in p.wlv) if ((p.wlv[k] || 0) > best) { best = p.wlv[k]; main = k; }
      p.stats.spec = 1; p.stats.specMain = main; p.stats.specKinds = weaponKinds(p);
      p.specName = main;
      p.removed = p.removed || {}; p.removed.b_synergy = 1;
      p.stats.synergy = 0;
    } },

  { id: 'b_volley', name: '弹幕共鸣', icon: '≡', rarity: 'rare', max: 2, tag: '构筑', unlock: 5,
    desc: () => '同一帧内 ≥3 枚弹丸命中同一敌人 → 追加 = 该敌人最大生命 3% 的真实伤害（Boss 0.4%），每 0.3s 一次',
    apply: (p) => { p.stats.volley += 1; } },

  { id: 'b_pierce', name: '穿透连锁', icon: '⇉', rarity: 'common', max: 3, tag: '构筑', unlock: 1,
    desc: () => '每颗弹丸每穿透 1 个敌人，剩余伤害 +14%（叠乘）',
    apply: (p) => { p.stats.pierceGrow += 1; } },

  { id: 'b_shield', name: '护盾回路', icon: '⬡', rarity: 'common', max: 3, tag: '构筑', unlock: 1,
    desc: () => '每 1 点剩余护盾提供 +0.45% 全伤（上限 +40%）',
    apply: (p) => { p.stats.shieldDmg += 0.0045; } },

  /* =========================================================
     节奏类（3）—— 借贷：用未来的难度换现在的强度
     ========================================================= */
  { id: 'y_slot', name: '扩容选单', icon: '⊞', rarity: 'rare', max: 1, tag: '节奏', unlock: 1,
    desc: () => '五选一永久升级为「六选一」，「重随」次数 +3',
    apply: (p) => { p.sixPick = 1; p.rerolls += 3; } },

  { id: 'y_phase', name: '相位跳级', icon: '⟫', rarity: 'rare', max: 99, tag: '节奏', unlock: 11,
    desc: () => '立刻获得 1 个等级（立即触发下一次升级）；本局后续经验需求 +7%（可叠加）',
    apply: (p, G) => {
      p.xpMul = (p.xpMul || 1) * 1.07;
      p.level++;
      p.xpNext = Math.round(xpFor(p.level) * p.xpMul);
      G.lvQueue.push(p.level);
    } },

  { id: 'y_prepay', name: '波次预支', icon: '⇤', rarity: 'rare', max: 99, tag: '节奏', unlock: 11,
    desc: () => '本次波次清除后额外获得 1 次升级；代价：下一波敌人血量 +12%（可叠加）',
    apply: (p, G) => { G.bonusPicks = (G.bonusPicks || 0) + 1; G.nextHpMul = (G.nextHpMul || 1) * 1.12; } },

  /* =========================================================
     元素类（3）—— 只有选了对应元素才进池
     ========================================================= */
  { id: 'e_resonance', name: '元素共鸣', icon: '∿', rarity: 'common', max: 3, tag: '元素', unlock: 5, needElem: 1,
    desc: () => '元素施加速度 +80%（每次命中额外附 0.8 层）',
    apply: (p) => { p.stats.elemExtra += 0.8; } },

  { id: 'e_purity', name: '元素贯彻', icon: '⊛', rarity: 'rare', max: 2, tag: '元素', unlock: 11, needElem: 1,
    desc: () => '元素状态持续 +55%，且元素伤害无视护甲',
    apply: (p) => { p.stats.elemDur += 0.55; p.stats.elemPure = 1; } },

  { id: 'e_duplex', name: '双重反应', icon: '⧓', rarity: 'epic', max: 1, tag: '元素', unlock: 11, needElem2: 1,
    desc: () => '反应触发时 40% 概率立刻再触发一次（第二次 ×0.7，不计入连锁深度）',
    apply: (p) => { p.stats.duplex = 1; } },
];

const UPGRADE_BY_ID = {};
UPGRADES.forEach(u => UPGRADE_BY_ID[u.id] = u);

/** 该升级当前等级 */
function upLv(p, u) {
  if (u.tag === '武器') return p.wlv[u.id.slice(2)] || 0;
  return (p.taken[u.id] || 0);
}

/** 是否可以选取（含互斥移除与元素前置） */
function canTake(p, u) {
  if (upLv(p, u) >= u.max) return false;
  if (p.removed && p.removed[u.id]) return false;
  if (u.needElem && !(p.elems && p.elems.length)) return false;
  if (u.needElem2 && !(p.elems && p.elems.length >= 2)) return false;
  if (u.id === 'p_shield' && p.noShield) return false;
  return true;
}

/** 真正的"兜底卡"：只有在可选池枯竭时才会出现 */
const FILLER_IDS = { u_heal: 1, u_overload: 1 };

/** 当前波次可抽取的卡池（分层解锁 + 互斥 + 元素前置） */
function cardPool(G, p) {
  const w = G.wave || 1;
  const out = [];
  for (const u of UPGRADES) {
    if ((u.unlock || 1) > w) continue;
    if (!canTake(p, u)) continue;
    out.push(u);
  }
  return out;
}

/** 单卡权重：品质 × 幸运 × 路线加权 */
function cardWeight(G, p, c) {
  const lv = upLv(p, c);
  const high = c.rarity === 'epic';
  let x = RARITY[c.rarity].w * (1 + p.stats.luck * (high ? 0.30 : 0.18));
  if (c.tag === '武器') { if (!p.stats.spec && lv > 0) x *= 2.2; }
  else if (lv > 0) x *= 2.2;
  if (c.tag === '元素') x *= 2.6;
  if (lv === c.max - 1) x *= 1.6;
  return x;
}

/** 抽卡：默认五选一（y_slot 后六选一）；五张全普通时保底重掷一张 */
function drawCards(G, p, n) {
  const size = p.sixPick ? 6 : 5;
  const pool = cardPool(G, p);
  const real = pool.filter(u => !FILLER_IDS[u.id]);
  const src = real.length >= size ? real : pool;
  const out = [], used = new Set();
  for (let i = 0; i < size; i++) {
    const cands = src.filter(u => !used.has(u.id));
    if (!cands.length) break;
    const u = weightedPick(cands, c => cardWeight(G, p, c));
    used.add(u.id);
    out.push(u);
  }
  if (out.length && out.every(u => u.rarity === 'common')) {
    const better = real.filter(u => u.rarity !== 'common' && !used.has(u.id));
    if (better.length) out[randInt(0, out.length - 1)] = weightedPick(better, c => cardWeight(G, p, c));
  }
  let k = 0;
  while (out.length < size) out.push(UPGRADE_BY_ID[k++ % 2 === 0 ? 'u_heal' : 'u_overload']);
  return out;
}

/** 应用升级 */
function applyUpgrade(G, p, u) {
  u.apply(p, G);
  // 武器系的等级记录在 p.wlv（apply 内已自增），其余记在 p.taken
  if (u.tag !== '武器') p.taken[u.id] = (p.taken[u.id] || 0) + 1;
  p.buildLog.push(u.id);
  /* 玻璃加农 → 护盾类卡立即失效并从池中移除 */
  if (u.id === 'r_glass') {
    p.removed = p.removed || {};
    p.removed.p_shield = 1; p.removed.b_shield = 1;
  }
  /* 专精协议 → 武器卡的路线加权不再鼓励扩宽（cardWeight 内已读 p.stats.spec） */
}

/* ---------------------------------------------------------
   触发类卡的事件钩子（由 elements.js / game.js 调用）
   --------------------------------------------------------- */

/** 击杀触发：连锁爆破 */
function kChainHook(G, e) {
  const p = G.player;
  if (!p || !p.stats.chain) return;
  const pct = e.isBoss ? 0.012 : 0.12;
  const r = 62;
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.26, max: 0.26, size: r * 2.4, color: '#ffd166', kind: 'ring' });
  for (const t of G.enemies.slice()) {
    if (t.dead || t === e || dist(t, e) > r) continue;
    damageEnemy(G, t, e.maxHp * pct * p.stats.chain, { noElem: true, src: 'rx', pure: true, showText: false });
  }
  SFX.playAt('rxMid', e.x, e.y);
}

/** 碎冰回响：冻结结束时 */
function kShatterHook(G, e) {
  const p = G.player;
  if (!p || !p.stats.shatter) return;
  const r = 90;
  G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: r * 2.4, color: '#7FC8FF', kind: 'ring' });
  for (const t of G.enemies.slice()) {
    if (t.dead || t === e || dist(t, e) > r) continue;
    damageEnemy(G, t, e.maxHp * 0.06 * p.stats.shatter, { noElem: true, src: 'rx', pure: true, showText: false });
  }
  if (!p.noShield && p.shieldMax > 0) p.shield = Math.min(p.shieldMax, p.shield + 3 * p.stats.shatter);
}

/** 暴击折射（k_prism）：向最近的两个敌人各射一道短光束 */
function kPrismHook(G, e, critDmg) {
  const p = G.player;
  if (!p || !p.stats.prism) return;
  if (!G.refracts) G.refracts = [];
  const hit = new Set([e]);
  for (let i = 0; i < 2; i++) {
    const t = nearestEnemy(G, e.x, e.y, 260, hit);
    if (!t) break;
    hit.add(t);
    G.refracts.push({ x0: e.x, y0: e.y, x1: t.x, y1: t.y, life: 0.18, max: 0.18 });
    damageEnemy(G, t, critDmg * 0.35 * p.stats.prism, { noElem: true, src: 'rx', showText: false });
  }
}
