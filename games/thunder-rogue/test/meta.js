/* =========================================================
   meta.js 自检 —— 元进度：存档 v2 / 迁移 / 校验和 / 三线 / 改装槽 / 深渊
   ---------------------------------------------------------
   无头运行：只加载 utils + elements + meta，并自造 G。
   用法：node test/meta.js           正常输出（JSON）
        node test/meta.js --assert  失败则 exit 1
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/utils.js', 'js/elements.js', 'js/meta.js'];

/* 可控的 localStorage 桩：可注入损坏值 / 只留备份，用于测损坏回退 */
function makeStorage() {
  const d = {};
  return {
    _d: d,
    getItem(k) { return d[k] === undefined ? null : d[k]; },
    setItem(k, v) { d[k] = String(v); },
    removeItem(k) { delete d[k]; },
  };
}

const sandbox = {
  console, localStorage: makeStorage(),
  Math, Date, JSON, Number, String, Array, Object, Set, Map, Error, isNaN,
  parseInt, parseFloat, Boolean, Symbol, Proxy, Reflect, Promise,
  setTimeout, clearTimeout,
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
for (const f of FILES) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }); }
  catch (e) { console.error('装载失败 ' + f + ': ' + e.message); process.exit(1); }
}

const results = [];
function ok(name, cond, extra) { results.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) }); }

const DRIVER = `
(function () {
  const R = [];
  const T = (n, c, e) => R.push({ name: n, pass: !!c, extra: e === undefined ? '' : String(e) });
  const S = localStorage;

  /* ---------- 1. 花费曲线（§5.3 公式） ---------- */
  T('#1 单级花费 380×1.42^(n−1)', metaCost(1) === 380 && metaCost(2) === 540 && metaCost(3) === 766,
    metaCost(1) + '/' + metaCost(2) + '/' + metaCost(3));
  {
    let s = 0; for (let i = 1; i <= 10; i++) s += metaCost(i);
    T('#2 单线满级 ≈ 29270 星尘', Math.abs(s - 29270) < 60, 'sum=' + s);
    T('#3 三线满级 ≈ 87800 星尘', Math.abs(metaFullCost() - s * 3) < 120, 'total=' + metaFullCost());
  }

  /* ---------- 2. 存档往返 + 校验和 ---------- */
  {
    const m = blankMeta();
    m.dust = 1234; m.core = 7; m.lines.fire = 3; m.abyss = 2;
    m.mods.push('m_reroll'); m.best.wave = 12; m.best.score = 9999;
    saveMeta(m);
    const back = loadMeta();
    T('#4 存档往返一致', back.dust === 1234 && back.core === 7 && back.lines.fire === 3 &&
      back.abyss === 2 && back.mods.indexOf('m_reroll') >= 0 && back.best.wave === 12,
      JSON.stringify({ d: back.dust, c: back.core, f: back.lines.fire, a: back.abyss }));
  }
  {
    /* 篡改主档 → 校验和失配 → 应回退备份（备份里是上一步写入的正确值） */
    const raw = JSON.parse(S.getItem('rt_save_v2'));
    raw.dust = 999999;                       // 改数字但不改 _sum
    S.setItem('rt_save_v2', JSON.stringify(raw));
    const back = loadMeta();
    T('#5 主档损坏 → 回退备份', back.dust === 1234, 'dust=' + back.dust);
  }
  {
    /* 主档与备份都坏 → 应回到空档（且不抛异常） */
    S.setItem('rt_save_v2', '{坏掉的 json');
    S.setItem('rt_save_v2_bak', '{"ver":2,"dust":5}');
    const back = loadMeta();
    T('#6 双档皆坏 → 安全降级为空档', back.dust === 0 && back.core === 0, 'dust=' + back.dust);
  }

  /* ---------- 3. v1 → v2 迁移 ---------- */
  {
    S.removeItem('rt_save_v2'); S.removeItem('rt_save_v2_bak');
    S.setItem('rt_best', '48000');            // v1：只有一个最高分
    const back = loadMeta();
    T('#7 v1 迁移：最高分 /10 换算星尘', back.dust === 4800 && back.best.score === 48000,
      'dust=' + back.dust + ' best=' + back.best.score);
    T('#8 迁移后落盘为 v2', !!S.getItem('rt_save_v2') && JSON.parse(S.getItem('rt_save_v2')).ver === 2);
  }

  /* ---------- 4. 三线 → 玩家 ---------- */
  {
    const M = blankMeta();
    M.lines.hull = 10; M.lines.fire = 10; M.lines.engine = 10;
    const p = {
      maxHp: 100, hp: 100, elems: [], wlv: {},
      stats: { dmg: 1, rate: 1, mvSpd: 1, contactRes: 1 },
      dashCdMax: 6, sixPick: 0, metaExtraReroll: 0,
    };
    applyMetaToPlayer(p, M);
    T('#9 机体线满级：+60 生命、15% 减伤',
      p.maxHp === 160 && Math.abs(p.stats.contactRes - 0.85) < 1e-9,
      'maxHp=' + p.maxHp + ' res=' + p.stats.contactRes.toFixed(3));
    T('#10 火力线满级：+20% 伤害、+15% 射速',
      Math.abs(p.stats.dmg - 1.2) < 1e-9 && Math.abs(p.stats.rate - 1.15) < 1e-9,
      'dmg=' + p.stats.dmg.toFixed(3) + ' rate=' + p.stats.rate.toFixed(3));
    T('#11 引擎线满级：+15% 移速、−1.2s 冷却',
      Math.abs(p.stats.mvSpd - 1.15) < 1e-9 && Math.abs(p.dashCdMax - 4.8) < 1e-9,
      'mvSpd=' + p.stats.mvSpd.toFixed(3) + ' cd=' + p.dashCdMax.toFixed(2));
    T('#12 满级 meta ≈ 等效 +76% 有效生命 / +38% 输出（§5.4 量级）',
      p.maxHp / 100 / 0.85 < 2.0 && (p.stats.dmg * p.stats.rate) < 1.45,
      'ehp×' + (p.maxHp / 100 / 0.85).toFixed(2) + ' dps×' + (p.stats.dmg * p.stats.rate).toFixed(2));
  }

  /* ---------- 5. 改装槽 ---------- */
  {
    const M = blankMeta();
    T('#13 默认元素上限 = 2', elemCap({}) === 2);
    M.mods = ['m_third', 'm_reroll', 'm_slot', 'm_card', 'm_elem'];
    M.pickCard = 'arc'; M.pickElem = 'fire';
    const p = { maxHp: 100, hp: 100, wlv: {}, elems: [], sixPick: 0, metaExtraReroll: 0,
      stats: { dmg: 1, rate: 1, mvSpd: 1, contactRes: 1 }, dashCdMax: 6 };
    applyMetaToPlayer(p, M);
    T('#14 三相共鸣：元素上限 → 3', elemCap(p) === 3, 'cap=' + elemCap(p));
    T('#15 扩展插槽：六选一', p.sixPick === 1);
    T('#16 重构核心：额外重随 +1', p.metaExtraReroll === 1);
    T('#17 搭载挂点：起手武器 arc Lv1', p.wlv.arc === 1);
    T('#18 元素注入：gateSkip=fire', p.gateSkip === 'fire');
  }

  /* ---------- 6. 深渊深度 ---------- */
  {
    const M = blankMeta();
    T('#19 三线 <15 时深渊未解锁', !abyssUnlocked(M), 'lv=' + metaTotalLv(M));
    M.lines.hull = 5; M.lines.fire = 5; M.lines.engine = 5;
    T('#20 三线 =15 解锁深渊', abyssUnlocked(M), 'lv=' + metaTotalLv(M));
    T('#21 深度 10：敌人 +120% 血 / +30% 速',
      Math.abs(abyssHpMul(10) - 2.2) < 1e-9 && Math.abs(abyssSpdMul(10) - 1.3) < 1e-9,
      abyssHpMul(10).toFixed(2) + 'x / ' + abyssSpdMul(10).toFixed(2) + 'x');
    T('#22 深度 10：星尘 +250%、每 Boss +6 片',
      Math.abs(abyssDustMul(10) - 3.5) < 1e-9 && Math.abs(abyssCoreBonus(10) - 6) < 1e-9,
      abyssDustMul(10).toFixed(2) + 'x / +' + abyssCoreBonus(10));
  }

  /* ---------- 7. 阶跃乘子 + 结算 ---------- */
  {
    T('#23 阶跃波（10 的倍数）全来源 ×1.5', stepMul(10) === 1.5 && stepMul(20) === 1.5 && stepMul(9) === 1,
      stepMul(10) + '/' + stepMul(9));
    const M = blankMeta();
    G.dustEarn = 6000; G.coreEarn = 23; G.wave = 20; G.score = 50000;
    commitRun(M);
    T('#24 结算把本局产出落进存档并清零',
      M.dust === 6000 && M.core === 23 && G.dustEarn === 0 && G.coreEarn === 0,
      'dust=' + M.dust + ' core=' + M.core);
    T('#25 结算同时刷新最高分/最高波次', M.best.score === 50000 && M.best.wave === 20);
    const before = M.dust;
    G.dustEarn = 100; G.coreEarn = 0; G.wave = 3; G.score = 10;
    commitRun(M);
    T('#26 二次结算累加而非覆盖', M.dust === before + 100 && M.best.score === 50000, 'dust=' + M.dust);
  }

  /* ---------- 8. 边界与健壮性 ---------- */
  {
    const M = blankMeta();
    M.dust = -50; M.core = -1; M.abyss = 99;
    M.lines.hull = 99; M.mods = ['不存在的槽'];
    const n = normalizeMeta(M);
    T('#27 越界值被夹回合法区间',
      n.dust === 0 && n.core === 0 && n.abyss === ABYSS_MAX && n.lines.hull === META_MAX_LV && n.mods.length === 0,
      JSON.stringify({ d: n.dust, c: n.core, a: n.abyss, h: n.lines.hull, m: n.mods.length }));
    const M2 = blankMeta();
    T('#28 满级后 nextCost 返回 null', (function () { M2.lines.hull = META_MAX_LV; return nextCost(M2, 'hull') === null; })());
    const M3 = blankMeta();
    T('#29 0 级时 nextCost = 380', nextCost(M3, 'hull') === 380, 'cost=' + nextCost(M3, 'hull'));
  }
  /* ---------- 9. v3.1 新增：本机波次记录（recent）与老存档兼容 ---------- */
  {
    /* 老存档兼容（最关键）：v3.1 之前写入的 v2 存档没有 recent 字段，
       新增字段**绝不能**让校验和变化，否则所有老玩家的进度会在升级瞬间清零。 */
    const m = blankMeta();
    m.dust = 7777; m.core = 33; m.lines.hull = 4; m.best.wave = 11;
    saveMeta(m);
    const raw = JSON.parse(S.getItem('rt_save_v2'));
    delete raw.recent;                                  // 模拟"没有 recent 的老存档"
    S.setItem('rt_save_v2', JSON.stringify(raw));
    S.removeItem('rt_save_v2_bak');
    const back = loadMeta();
    T('#30 老 v2 存档（无 recent）仍完整读取，进度不丢',
      back.dust === 7777 && back.core === 33 && back.lines.hull === 4 && back.best.wave === 11 &&
      Array.isArray(back.recent) && back.recent.length === 0,
      'dust=' + back.dust + ' core=' + back.core + ' hull=' + back.lines.hull + ' recent=' + JSON.stringify(back.recent));
  }
  {
    /* recent 去重与上限：同一局同一波只记一次，最多留 20 条 */
    const m = blankMeta();
    saveMeta(m);
    const M = loadMeta();
    G.recentHost = M;
    G.wave = 3; G._runLogged = 0;
    // 直接驱动记录逻辑：用 commitRun（它内含去重）
    G.dustEarn = 0; G.coreEarn = 0; G.score = 0;
    for (let i = 0; i < 5; i++) commitRun(M);            // 同一波重复落盘 5 次
    const after5 = M.recent.length;
    G.wave = 4; for (let i = 0; i < 3; i++) commitRun(M);
    const after4 = M.recent.length;
    T('#31 recent 同一波只记一次（3→+1→4→+1）', after5 === 1 && after4 === 2,
      'afterW3=' + after5 + ' afterW4=' + after4);
    for (let w = 5; w <= 40; w++) { G.wave = w; commitRun(M); }
    T('#32 recent 上限 20 条', M.recent.length === 20, 'len=' + M.recent.length);
    T('#33 中位数计算正确', metaMedianWave({ recent: [12, 14, 15, 16, 20] }) === 15 &&
      metaMedianWave({ recent: [12, 14, 16, 20] }) === 15 && metaMedianWave({ recent: [] }) === 0,
      'odd=' + metaMedianWave({ recent: [12, 14, 15, 16, 20] }) +
      ' even=' + metaMedianWave({ recent: [12, 14, 16, 20] }));
    T('#34 recent 异常值被清洗', (function () {
      const bad = blankMeta(); bad.recent = [0, -3, 'x', null, 7, 9];
      saveMeta(bad);
      const r = loadMeta().recent;
      return r.length === 2 && r[0] === 7 && r[1] === 9;
    })());
  }

  return R;
})()
`;

/* 驱动需要 G（commitRun 会读它），先注入 */
Object.assign(sandbox, { G: { dustEarn: 0, coreEarn: 0, wave: 0, score: 0 } });

let rows;
try {
  rows = vm.runInContext(DRIVER, sandbox, { filename: 'meta-test' });
} catch (e) {
  console.error('DRIVER 失败: ' + e.message + '\n' + String(e.stack).split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}

for (const r of rows) ok(r.name, r.pass, r.extra);
const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed: failed.length, results }, null, 1));
if (failed.length) process.exitCode = 1;
