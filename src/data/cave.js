/* =========================================================
   洞 府 —— 数据层
   ---------------------------------------------------------
   规则：本文件只导出常量，不 import 任何东西（防循环依赖的铁律）

   · max       最高等级
   · cost(lv)  升到 lv 级所需（stones 灵石 · days 天数）
   · eff(lv)   该级效果，字段由 sys/cave.js 的 cvBonus() 汇总
               可用字段：herb 灵草/时 · stone 灵石/时 · cult 修速%
               pillRate 成丹率 · gearRate 成器率 · offlineCap 离线上限(时)

   追加一处设施 = 在 CAVE_FACILITIES 加一行，其余代码自动跟上。
   ========================================================= */

export const CAVE_FACILITIES = [
  {
    k:'lingtian', n:'灵 田', max:9,
    cost: lv => ({ stones: 200*lv*lv, days:1 }),
    eff:  lv => ({ herb: +(0.5 + lv*0.35).toFixed(2) }),      /* 灵草 / 时 */
    d:'引地脉水气灌溉，灵草自生。离线时它仍在生长——洞府收益的第一条腿。'
  },
  {
    k:'juling', n:'聚 灵 阵', max:9,
    cost: lv => ({ stones: 300*lv*lv, days:2 }),
    eff:  lv => ({ cult: +(lv*1.0).toFixed(1), stone: lv*4 }), /* 修速 % · 灵石 / 时 */
    d:'以灵石为基、阵纹为骨，聚拢天地灵气。修行更快，且能自行凝出灵石。'
  },
  {
    k:'danfang', n:'丹 房', max:9,
    cost: lv => ({ stones: 400*lv*lv, days:2 }),
    eff:  lv => ({ pillRate: +(lv*0.02).toFixed(3) }),         /* 成丹率 */
    d:'丹房越是齐整，火候便越稳。炼丹成率随之提升。'
  },
  {
    k:'qifang', n:'器 坊', max:9,
    cost: lv => ({ stones: 400*lv*lv, days:2 }),
    eff:  lv => ({ gearRate: +(lv*0.02).toFixed(3) }),         /* 成器率 */
    d:'器坊内炉火长明，锻打事半功倍。'
  },
  {
    k:'jingshi', n:'静 室', max:9,
    cost: lv => ({ stones: 500*lv*lv, days:3 }),
    eff:  lv => ({ offlineCap: lv*2 }),                        /* 离线上限 + 小时 */
    d:'静室能隔绝外扰，延长离线可累积的时长。上限越高，闭关越久。'
  }
];

/* 基础离线上限（小时）；实际上限 = 它 + 静室等级 × 2（满级 8+18 = 26 时） */
export const CAVE_OFFLINE_BASE = 8;

/* 离线结算的下限（毫秒）：短于此不算一次结算，避免刷新页面就弹窗 */
export const CAVE_OFFLINE_MIN_MS = 60 * 1000;

/* 键 → 定义 的索引 */
export const CAVE_BY_KEY = {};
for(const f of CAVE_FACILITIES) CAVE_BY_KEY[f.k] = f;

/* 五处全满的总耗（灵石 / 天数），仅用于界面提示 */
export function caveFullCost(){
  let stones = 0, days = 0;
  for(const f of CAVE_FACILITIES){
    for(let lv = 1; lv <= f.max; lv++){
      const c = f.cost(lv);
      stones += c.stones; days += c.days;
    }
  }
  return { stones, days };
}
