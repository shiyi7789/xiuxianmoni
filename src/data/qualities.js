/* ---------------- 品质 ---------------- */
/* 品质：倍率上调以补偿"高品质概率下调"；数值改动见 makeItem */
export const QUALITIES = [
  {name:'凡品', color:'#8a8378', mult:1.0,  crit:1.0},
  {name:'灵品', color:'#2f7d63', mult:1.85, crit:2.0},
  {name:'宝品', color:'#5b4a9e', mult:3.2,  crit:3.6},
  {name:'仙品', color:'#b0701c', mult:5.4,  crit:6.4},
  {name:'神品', color:'#9e2b25', mult:9.4,  crit:11.0}
];
export const Q_FLOW = 3;   /* 品质序号 ≥ 该值启用流光特效 */
