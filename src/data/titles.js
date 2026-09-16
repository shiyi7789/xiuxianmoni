/* =========================================================
   称 号 —— 数据层
   ---------------------------------------------------------
   规则：本文件只导出常量，不 import 任何东西（防循环依赖的铁律）

   · t    品阶 0~4（凡·灵·宝·仙·神）
   · cond 解锁条件函数，入参是 achAgg() 的输出（额外字段见 sys/titles.js 的补充）
   · ef   佩戴效果，供 sys/titles.js 的 titleBonus() 汇总
         atk/def/hp/cult/brk/speed/all 为**百分比**；stone 为**绝对值**；
         drop/pill/boss 为**专项百分比**（由各调用点手动合并）
   · d    描述

   设计约束：同时只佩戴 1 个（防叠加膨胀），效果走独立乘区 titleBonus()，
   不并入既有 stats() 公式 —— 便于调试，也不污染既有平衡。
   ========================================================= */

export const TITLES = [
  /* ---- 凡品 ---- */
  { k:'t_chuxue',  n:'初 学',       t:0,
    d:'你踏入了修行，从此与凡人不同。',
    cond: a => a.lv >= 1,
    ef: { cult:1 } },
  { k:'t_zhanzhe', n:'斩 妖 者',    t:0,
    d:'百头妖兽死于你手。',
    cond: a => a.kills >= 100,
    ef: { atk:2 } },

  /* ---- 灵品 ---- */
  { k:'t_mitan',   n:'秘 探',       t:1,
    d:'三处秘境被你翻遍。',
    cond: a => a.secret >= 3,
    ef: { drop:5 } },
  { k:'t_danchi',  n:'丹 痴',       t:1,
    d:'五十次开炉，丹火已随心转。',
    cond: a => (a.pillMake || 0) >= 50,
    ef: { pill:3 } },

  /* ---- 宝品 ---- */
  { k:'t_yaowang', n:'妖 王 克 星',  t:2,
    d:'二十头妖王在你手上折戟。',
    cond: a => (a.boss || 0) >= 20,
    ef: { boss:10 } },
  { k:'t_yushou',  n:'御 兽',       t:2,
    d:'坐骑被你喂养至七阶。',
    cond: a => (a.mountMax || 0) >= 7,
    ef: { speed:5 } },

  /* ---- 仙品 ---- */
  { k:'t_zongshi', n:'一 代 宗 师',  t:3,
    d:'修至大乘，你已可开宗立派。',
    cond: a => a.grp >= 7,
    ef: { brk:3 } },
  { k:'t_lunhui',  n:'万 世 轮 回',  t:3,
    d:'三次轮回，你记得自己走过的每一步。',
    cond: a => (a.rebirths || 0) >= 3,
    ef: { stone:500 } },

  /* ---- 神品 ---- */
  { k:'t_daoxin',  n:'道 心',       t:4,
    d:'四十二道关卡，你全数走过。',
    cond: a => (a.achCount || 0) >= 42,
    ef: { all:3 } },
  { k:'t_tiandao', n:'天 道',       t:4,
    d:'你已叩问过天道，并将它抛在身后。',
    cond: a => (a.asc || 0) >= 1,
    ef: { cult:10, atk:5 } }
];

/* 键 → 定义 */
export const TITLE_BY_KEY = {};
for(const t of TITLES) TITLE_BY_KEY[t.k] = t;

/* 品阶名（与成就/材料共用同一套口径） */
export const TITLE_TIER_NAME = ['凡', '灵', '宝', '仙', '神'];
