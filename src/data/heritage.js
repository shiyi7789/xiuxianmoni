/* 气运传承：每重 +5 气运（气运是统一的"福缘"乘区，见 fortune()） */
export const HERITAGE = [
  { k:'cult',  name:'悟性传承', unit:'修炼速度 +6%',    base:2, max:10,
    desc:'魂魄清明，一应吐纳、聚灵阵与闭关所得皆更快。' },
  { k:'pill',  name:'丹道传承', unit:'突破成功率 +1.5%', base:3, max:8,
    desc:'屡破屡悟，前世撞过的瓶颈，今生已薄了几分。' },
  { k:'stone', name:'财源传承', unit:'初始灵石 +200',   base:2, max:10,
    desc:'转世时私藏下来的灵石，随你一同落入新躯。' },
  { k:'luck',  name:'气运传承', unit:'气运 +5',         base:3, max:8,
    desc:'天生近道。气运同时增益掉落品质、灵石收益与掉落概率。' },
  { k:'body',  name:'体魄传承', unit:'气血上限 +5%',    base:2, max:8,
    desc:'肉身经九世淬炼，根基远胜常人。' }
];
