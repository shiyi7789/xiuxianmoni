/* ---------------- 丹药 ----------------
   字段：
   · price  坊市标价（会随大境界上浮，见 sys/pills.js 的 pillPrice）
   · desc   说明（按钮 title 与坊市卡片用）
   · craft  可选。true = **只能自己炼，坊市丹药铺不上架**（炼制见 sys/craft.js）
   ------------------------------------------------------------
   新增丹药：加一行到 PILLS，并在 sys/pills.js 的 usePill() 里补一个分支。
   药囊的默认值由 blankPills() 从本表派生，无需别处再列一遍。 */
export const PILLS = [
  { name:'回春丹', price:34,  desc:'恢复气血 45%' },
  { name:'聚灵丹', price:46,  desc:'恢复灵力 65%' },
  { name:'破境丹', price:260, desc:'提升下次突破成功率，加成随大境界增长；至多连服三枚叠加。每个境界皆可用' },
  { name:'归元丹', price:0, craft:true, desc:'气血与灵力尽复。坊市不售，须以灵草与妖丹自炼' }
];

/* 空药囊：{ 回春丹:0, 聚灵丹:0, 破境丹:0, 归元丹:0 } —— 由表派生，永远与表同步 */
export function blankPills(){
  const o = {};
  for(const p of PILLS) o[p.name] = 0;
  return o;
}
