/* =========================================================
   成就 · 第三条约永久成长轴（存于 META，轮回不灭）
   乐趣：目标牵引 —— 给玩家的每一种玩法行为一个跨轮回的记名
   ========================================================= */
export const ACH_TIER = [
  { n:'凡', c:'#8a8378', f:1,  b:{ hp:1 } },
  { n:'灵', c:'#2f7d63', f:2,  b:{ atk:1, def:1 } },
  { n:'宝', c:'#5b4a9e', f:4,  b:{ hp:2, cult:2 } },
  { n:'仙', c:'#b0701c', f:8,  b:{ atk:3, brk:1 } },
  { n:'神', c:'#9e2b25', f:14, b:{ atk:2, def:2, hp:2, cult:3, brk:2 } }
];
export function fmtBonus(b){
  const t = [];
  if(b.atk)  t.push('攻 +'+b.atk+'%');
  if(b.def)  t.push('防 +'+b.def+'%');
  if(b.hp)   t.push('气血 +'+b.hp+'%');
  if(b.cult) t.push('修速 +'+b.cult+'%');
  if(b.brk)  t.push('突破 +'+b.brk+'%');
  if(b.f)    t.push('气运 +'+b.f);
  return t.join(' · ');
}
export function achTierText(t){
  const b = Object.assign({}, ACH_TIER[t].b);
  b.f = ACH_TIER[t].f;
  return fmtBonus(b);
}

export const ACHIEVEMENTS = [
  /* ---------------- 凡品 14 ---------------- */
  { k:'first_break', t:0, n:'初入修行', d:'首次突破境界',            c:a => a.lv >= 1 },
  { k:'med_10',      t:0, n:'小有所成', d:'打坐吐纳 10 次',           c:a => a.med >= 10 },
  { k:'med_100',     t:0, n:'苦坐百日', d:'打坐吐纳 100 次',          c:a => a.med >= 100 },
  { k:'kill_1',      t:0, n:'初试锋芒', d:'斩妖 1 头',               c:a => a.kills >= 1 },
  { k:'kill_30',     t:0, n:'百兽辟易', d:'斩妖 30 头',              c:a => a.kills >= 30 },
  { k:'day_50',      t:0, n:'五十寒暑', d:'修行满 50 日',            c:a => a.day >= 50 },
  { k:'item_10',     t:0, n:'囊中有物', d:'累计获得器物 10 件',       c:a => a.items >= 10 },
  { k:'stones_1k',   t:0, n:'薄有积蓄', d:'累计得灵石 1000 枚',       c:a => a.stones >= 1000 },
  { k:'gear_full',   t:0, n:'法器齐备', d:'武器防具与三件法宝尽在身',  c:a => a.gearFull },
  { k:'mount_1',     t:0, n:'御兽而行', d:'获得第一匹坐骑',           c:a => a.mountMax >= 1 },
  { k:'pill_use',    t:0, n:'尝得丹药', d:'服下任意一枚丹药',         c:a => a.pillUse >= 1 },
  { k:'sec_enter',   t:0, n:'初入秘境', d:'首次踏入秘境',            c:a => a.secEnter >= 1 },
  { k:'insight_1',   t:0, n:'灵光乍现', d:'修行中触发一次顿悟',       c:a => a.ins >= 1 },
  { k:'die_1',       t:0, n:'初尝败绩', d:'第一次殒身',              c:a => a.deaths >= 1 },

  /* ---------------- 灵品 12 ---------------- */
  { k:'grp2',        t:1, n:'金丹之姿', d:'修至金丹境',              c:a => a.grp >= 2 },
  { k:'grp4',        t:1, n:'元婴化神', d:'修至化神境',              c:a => a.grp >= 4 },
  { k:'kill_200',    t:1, n:'斩妖二百', d:'斩妖 200 头',             c:a => a.kills >= 200 },
  { k:'boss_1',      t:1, n:'屠 王',    d:'首次斩杀守关妖王',         c:a => a.boss >= 1 },
  { k:'boss_10',     t:1, n:'王者克星', d:'斩杀妖王 10 头',           c:a => a.boss >= 10 },
  { k:'secret_1',    t:1, n:'贯通秘境', d:'首次贯通一处秘境',         c:a => a.secret >= 1 },
  { k:'secret_5',    t:1, n:'秘境常客', d:'贯通秘境 5 次',            c:a => a.secret >= 5 },
  { k:'stones_50k',  t:1, n:'家资渐丰', d:'累计得灵石 5 万枚',        c:a => a.stones >= 50000 },
  { k:'mount_5',     t:1, n:'良 驹',    d:'坐骑喂养至 5 阶',          c:a => a.mountMax >= 5 },
  { k:'sec_3',       t:1, n:'闭关三度', d:'闭关 7 日 3 次',           c:a => a.sec >= 3 },
  { k:'insight_3',   t:1, n:'三度顿悟', d:'顿悟 3 次',               c:a => a.ins >= 3 },
  { k:'day_200',     t:1, n:'二百春秋', d:'修行满 200 日',           c:a => a.day >= 200 },

  /* ---------------- 宝品 8 ---------------- */
  { k:'grp7',        t:2, n:'大乘之志', d:'修至大乘境',              c:a => a.grp >= 7 },
  { k:'kill_1000',   t:2, n:'斩妖千头', d:'斩妖 1000 头',            c:a => a.kills >= 1000 },
  { k:'secret_all',  t:2, n:'秘境尽探', d:'四处秘境全部贯通',         c:a => a.secretAll },
  { k:'boss_50',     t:2, n:'屠王五十', d:'斩杀妖王 50 头',           c:a => a.boss >= 50 },
  { k:'stones_1m',   t:2, n:'富甲一方', d:'累计得灵石 100 万枚',      c:a => a.stones >= 1e6 },
  { k:'mount_9',     t:2, n:'神 骏',    d:'坐骑喂养至 9 阶化境',      c:a => a.mountMax >= 9 },
  { k:'chain_5',     t:2, n:'一气五境', d:'单次连续突破 5 重境界',     c:a => a.chain >= 5 },
  { k:'item_500',    t:2, n:'器物满库', d:'累计获得器物 500 件',      c:a => a.items >= 500 },

  /* ---------------- 仙品 5 ---------------- */
  { k:'grp10',       t:3, n:'准 圣',    d:'修至准圣境',              c:a => a.grp >= 10 },
  { k:'xian_1',      t:3, n:'仙品入手', d:'首次获得仙品器物',         c:a => a.xian >= 1 },
  { k:'asc_1',       t:3, n:'白日飞升', d:'首次飞升',                c:a => a.asc >= 1 },
  { k:'stones_10m',  t:3, n:'富可敌宗', d:'累计得灵石 1000 万枚',     c:a => a.stones >= 1e7 },
  { k:'day_1000',    t:3, n:'千日苦修', d:'修行满 1000 日',          c:a => a.day >= 1000 },

  /* ---------------- 神品 3 ---------------- */
  { k:'shen_1',      t:4, n:'神品临世', d:'首次获得神品器物',         c:a => a.shen >= 1 },
  { k:'rebirth_5',   t:4, n:'五世轮回', d:'轮回 5 世',               c:a => a.rebirths >= 5 },
  { k:'kill_5000',   t:4, n:'万妖辟易', d:'斩妖 5000 头',            c:a => a.kills >= 5000 }
];
export const ACH_BY_KEY = {};
for(const a of ACHIEVEMENTS) ACH_BY_KEY[a.k] = a;
