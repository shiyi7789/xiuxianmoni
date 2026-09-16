/* =========================================================
   图 鉴 —— 数据层
   ---------------------------------------------------------
   规则：本文件只导出常量，不 import 任何东西（防循环依赖的铁律）

   ★ 条目本身**不写在这张表里**，而是在 sys/codex.js 里从既有数据表
     （MONSTERS / BASE_NAMES / GONGFA / MOUNT_NAMES / MATERIALS /
      PILLS / SECRETS / ENCOUNTERS）**派生** —— 加一个新妖兽，图鉴自动
     多一项，不需要两处维护（DRY）。本文件只放「分类元信息」与「节奏常量」。
   ========================================================= */

/* 分类元信息（面板分组 + 配色，走既有令牌，不写死颜色） */
export const CODEX_CATS = [
  { k:'mon',   n:'妖 兽', color:'var(--zhu)' },
  { k:'item',  n:'器 物', color:'var(--jin)' },
  { k:'gf',    n:'功 法', color:'var(--zi)' },
  { k:'mount', n:'坐 骑', color:'var(--qing)' },
  { k:'mat',   n:'材 料', color:'var(--ink2)' },
  { k:'pill',  n:'丹 药', color:'var(--jin)' },
  { k:'sec',   n:'秘 境', color:'var(--zhu-d)' },
  { k:'enc',   n:'奇 遇', color:'var(--warn)' }
];

/* 品阶名：凡·灵·宝·仙·神
   ★ 刻意不叫 TIER_NAME —— 顶层 const 在构建后同处一个作用域，
     与 data/monsters.js 的 TIER_NAME 重名会直接 SyntaxError */
export const CODEX_TIER_NAME = ['凡', '灵', '宝', '仙', '神'];

/* 每 N 项 → 一次里程碑提示（L3 中央浮层） */
export const CODEX_MILESTONE_STEP = 25;

/* 每 N 项 → +N_LUCK 气运（并入 fortune()，不新开乘区） */
export const CODEX_LUCK_STEP = 10;
export const CODEX_LUCK_PER_STEP = 1;

/* 分类键 → 元信息 */
export const CODEX_CAT_BY_KEY = {};
for(const c of CODEX_CATS) CODEX_CAT_BY_KEY[c.k] = c;
