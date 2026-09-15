/* =========================================================
   丹 方 · 器 方 —— 数据层
   ---------------------------------------------------------
   · need    材料需求 { 材料键: 数量 }
   · mpF     每次消耗灵力 = mpMax × mpF + 5
   · days    每次消耗天数
   · base    基础成功率（再加丹道传承与境界差，见 sys/craft.js）
   · lv      推荐境界段（realmAt(S.level).group）；低于它按档扣，高于它有加成
   · out     丹药名（须同时登记在 data/pills.js 的 PILLS 表里）
   · slot    器物槽位 weapon/armor/treasure
   · lvBias  炼器时生成器物的等级偏移
   · qiMin   炼器时的最低品质（0 凡 / 1 灵 / 2 宝 / 3 仙 / 4 神）
   ========================================================= */

/* ---------- 丹 方 ---------- */
export const PILL_RECIPES = [
  {
    k:'r_huichun', out:'回春丹', lv:0,
    need:{ lingcao:3 },
    mpF:0.10, days:1, base:0.92,
    d:'最基础的疗伤丹。灵草捣汁，文火慢熬。'
  },
  {
    k:'r_juling', out:'聚灵丹', lv:0,
    need:{ lingcao:2, yaodan:1 },
    mpF:0.15, days:1, base:0.85,
    d:'以妖丹为引，引动灵草中的木行之气，凝而成丹。'
  },
  {
    k:'r_guijing', out:'归元丹', lv:2,
    need:{ lingcao:5, yaodan:2 },
    mpF:0.20, days:2, base:0.72,
    d:'一次服下，气血与灵力尽复。久战不继时的救命之物——坊市并无此丹出售。'
  },
  {
    k:'r_pojing', out:'破境丹', lv:4,
    need:{ yaodan:3, lingcao:5, xingchen:1 },
    mpF:0.35, days:3, base:0.55,
    d:'此丹重在破境。星辰砂定神、妖丹聚气——成丹率极低，但成则一境可期。'
  }
];

/* ---------- 器 方 ---------- */
export const GEAR_RECIPES = [
  {
    k:'g_weapon', slot:'weapon', lv:0,
    need:{ xuantie:3, yaodan:2 },
    mpF:0.25, days:2, base:0.75, lvBias:1, qiMin:2,
    d:'以玄铁为骨、妖丹为魂，锻出杀伐之器。品阶由火候与运气决定。'
  },
  {
    k:'g_armor', slot:'armor', lv:0,
    need:{ xuantie:3, shoupi:5 },
    mpF:0.25, days:2, base:0.75, lvBias:1, qiMin:2,
    d:'兽皮为里、玄铁为面，一层层叠上去，甲成而重。'
  },
  {
    k:'g_treasure', slot:'treasure', lv:2,
    need:{ xingchen:2, yaodan:3 },
    mpF:0.30, days:3, base:0.65, lvBias:2, qiMin:2,
    d:'星辰砂是唯一能承载法力的材质。此法难度最高，成则必为宝器以上。'
  }
];
