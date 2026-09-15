/* =========================================================
   功 法 · 悟 道 录 —— 数据层
   ---------------------------------------------------------
   规则：本文件只导出常量，不 import 任何东西（防循环依赖的铁律）
   追加一部功法 = 在 GONGFA 里加一行，无需改任何逻辑

   · kind:'xin' 心法 —— 被动加成，可运转 3 部（被动槽 3 格，须取舍）
   · kind:'shu' 术法 —— 主动技能，可备 2 式（主动槽 2 格，带冷却与附加效果）
                 战斗中与基础「灵力斩」并用；未备术法则只有基础技
   · t    品阶 0~4（凡·灵·宝·仙·神），沿用器物的五品配色 .qcN
   · seg  0~4 对应大境界五段，决定出现时机（见 GF_SEG_NAME）
   · p / sk 指向基调表：每重加成 = 基调值 × 品阶系数 × 重数
   ========================================================= */

/* 与大境界五段对应（与奇遇分段一致） */
export const GF_SEG_NAME = ['炼气 · 筑基', '金丹 · 元婴', '化神 · 炼虚 · 合体', '大乘 · 渡劫 · 大罗', '准圣 · 圣人 · 天道'];

/* 各品阶的参悟上限（重）与品阶系数 */
export const GF_MAX = [3, 5, 7, 9, 9];
export const GF_TIER_M = [0.45, 0.60, 0.80, 1.05, 1.42];

/* 心法基调：每重的基准加成（百分比 / 暴击与突破为绝对点数 / 气运为点数） */
export const GF_XIN = {
  speed:   { n: '修速', d: '以气御周天，修行事半功倍',   cult: 1.10, hp: 0.31, atk: 0.12, def: 0.12 },
  body:    { n: '体魄', d: '炼形如炼器，血肉自成法宝',   hp: 1.33, def: 0.63, atk: 0.12, cult: 0.23 },
  blade:   { n: '杀伐', d: '一切法门皆为杀敌而生',       atk: 1.06, crit: 0.165, hp: 0.27, def: 0.15 },
  ward:    { n: '护体', d: '守中抱一，八风不动',         def: 1.17, hp: 0.55, mp: 0.66, cult: 0.16 },
  insight: { n: '悟道', d: '着眼处不在力，而在关窍',     brk: 0.345, cult: 0.55, hp: 0.22 },
  fate:    { n: '缘法', d: '不争而争，福缘自至',         luck: 0.83, cult: 0.39, hp: 0.22 }
};

/* 术法基调（主动技能参数）
   ---------------------------------------------------------
   mult  伤害倍率（× 攻击力）
   hits  段数（多段各自结算暴击）
   cd    冷却回合数
   mpF / mpFlat  灵力消耗 = mpMax × mpF + mpFlat
   fx    附加效果（见 sys/combat.js 的 castSkill）
         crit      额外暴击率（pt）
         pierce    无视敌方防御比
         heal      吸血比（按本次总伤害）
         shield    减伤比 + dur 持续回合
         dodge     完全闪避回合数
         freeze    敌方伤害减半回合数
         burn      灼烧回合数 + burnPct 每回合按其攻击力的比例扣血
         selfDmgPct 自身承受气血上限的比例（反噬）
         mpBack    行动后回复灵力上限的比例
   --------------------------------------------------------- */
export const GF_SHU = {
  gun:  { n:'御器', d:'以气驭器，收放如意',   mult:1.85, mpF:0.13, mpFlat:6,  cd:2,
          fx:{ mpBack:0.05 } },
  zhan: { n:'斩击', d:'聚力一击，势不可当',   mult:2.35, mpF:0.17, mpFlat:9,  cd:3,
          fx:{ crit:8 } },
  lian: { n:'连击', d:'一击未落，二击已至',   mult:1.35, mpF:0.20, mpFlat:8,  cd:3, hits:2 },
  xue:  { n:'血噬', d:'伤敌之血，补己之元',   mult:1.70, mpF:0.14, mpFlat:7,  cd:4,
          fx:{ heal:0.35 } },
  dun:  { n:'守御', d:'以攻为守，护体为先',   mult:1.20, mpF:0.16, mpFlat:5,  cd:5,
          fx:{ shield:0.55, dur:2 } },
  ling: { n:'破灵', d:'无视皮膜，直伤神魂',   mult:2.00, mpF:0.16, mpFlat:8,  cd:3,
          fx:{ pierce:0.5 } },
  huo:  { n:'焚天', d:'烈火附骨，焚尽不休',   mult:1.90, mpF:0.20, mpFlat:10, cd:5,
          fx:{ burn:3, burnPct:0.06 } },
  bing: { n:'玄冰', d:'寒气封脉，其势顿挫',   mult:1.80, mpF:0.18, mpFlat:9,  cd:4,
          fx:{ freeze:2 } },
  xu:   { n:'虚空', d:'身形散入虚空，不可捉摸', mult:0.80, mpF:0.12, mpFlat:6, cd:6,
          fx:{ dodge:1 } },
  ji:   { n:'因果', d:'以精血为引，一击断因果', mult:3.20, mpF:0.24, mpFlat:12, cd:7,
          fx:{ selfDmgPct:0.12 } }
};

/* 学派：基调 → 门派归属（只用于展示与配色，不影响数值）
   配色走 CSS 类 .gfs-jian / .gfs-ti / .gfs-fa / .gfs-dun / .gfs-xin，禁止写死颜色 */
export const GF_SCHOOL = {
  jian: { n:'剑道' },
  ti:   { n:'体修' },
  fa:   { n:'法修' },
  dun:  { n:'遁术' },
  xin:  { n:'心法' }
};
export const GF_PROFILE_SCHOOL = {
  /* 心法基调 */
  speed:'dun', body:'ti', blade:'jian', ward:'ti', insight:'xin', fate:'xin',
  /* 术法基调 */
  gun:'jian', zhan:'jian', lian:'jian', ling:'jian', ji:'jian',
  huo:'fa', bing:'fa', xue:'fa',
  dun:'ti', xu:'dun'
};

/* ---------------------------------------------------------
   三十部功法：每段 3 部心法 + 3 部术法
   --------------------------------------------------------- */
export const GONGFA = [
  /* ── 第一段 · 炼气筑基 ── */
  { k:'gf_yinqi',      n:'引气诀',       t:0, kind:'xin', seg:0, p:'speed',
    d:'最粗浅的入门心法。虽无甚出奇，却胜在稳妥易成。' },
  { k:'gf_tiegu',      n:'铁骨功',       t:0, kind:'xin', seg:0, p:'body',
    d:'以拳碎石、以背撞松，炼的是一身死筋骨。' },
  { k:'gf_qingmu',     n:'青木养生录',   t:1, kind:'xin', seg:0, p:'ward',
    d:'取草木生发之意，气血绵长，最耐久战。' },
  { k:'gf_sk_yuqi',    n:'御器术',       t:0, kind:'shu', seg:0, sk:'gun',
    d:'把手中法器遥遥祭出，省力而稳当。' },
  { k:'gf_sk_zhanfeng',n:'斩风诀',       t:0, kind:'shu', seg:0, sk:'zhan',
    d:'一刀劈出，风为之裂。力大而耗灵力亦多。' },
  { k:'gf_sk_muling',  n:'木灵引',       t:1, kind:'shu', seg:0, sk:'ling',
    d:'引木行灵气入体，专破皮糙肉厚之妖。' },

  /* ── 第二段 · 金丹元婴 ── */
  { k:'gf_danxia',     n:'丹霞心经',     t:1, kind:'xin', seg:1, p:'insight',
    d:'观朝霞起落而悟聚散之理，于突破最是有益。' },
  { k:'gf_liuyun',     n:'流云身法',     t:1, kind:'xin', seg:1, p:'speed',
    d:'身似流云不滞于物，行气亦如是。' },
  { k:'gf_panshi',     n:'磐石宝典',     t:2, kind:'xin', seg:1, p:'ward',
    d:'心若磐石，则外力难侵。' },
  { k:'gf_sk_chiyan',  n:'赤炎斩',       t:1, kind:'shu', seg:1, sk:'huo',
    d:'刀上燃起真火，斩落时连妖气一并烧尽——中者三回合内持续灼烧。' },
  { k:'gf_sk_liangyi', n:'两仪剑',       t:1, kind:'shu', seg:1, sk:'lian',
    d:'一剑分阴阳，两段剑光前后相随。' },
  { k:'gf_sk_xuangui', n:'玄龟印',       t:2, kind:'shu', seg:1, sk:'bing',
    d:'玄龟属水而性寒，印诀一出，敌手寒气入体、血脉顿滞。' },

  /* ── 第三段 · 化神炼虚合体 ── */
  { k:'gf_fentian',    n:'焚天诀',       t:2, kind:'xin', seg:2, p:'blade',
    d:'以怒火炼骨，越战越凶。' },
  { k:'gf_taiyin',     n:'太阴炼形篇',   t:2, kind:'xin', seg:2, p:'body',
    d:'借月华淬体，血肉渐坚如寒铁。' },
  { k:'gf_zuowang',    n:'坐忘经',       t:3, kind:'xin', seg:2, p:'insight',
    d:'坐而忘我，我忘而道存。' },
  { k:'gf_sk_taiyin',  n:'太阴血噬',     t:2, kind:'shu', seg:2, sk:'xue',
    d:'伤敌之血化为己用，久战不衰。' },
  { k:'gf_sk_wanjian', n:'万剑归宗',     t:3, kind:'shu', seg:2, sk:'lian',
    d:'万剑齐出，前后相衔，无隙可乘。' },
  { k:'gf_sk_powang',  n:'破妄天目',     t:3, kind:'shu', seg:2, sk:'ling',
    d:'开天目观其虚实处，一击直贯七寸。' },

  /* ── 第四段 · 大乘渡劫大罗 ── */
  { k:'gf_zixiao',     n:'紫霄雷书',     t:3, kind:'xin', seg:3, p:'blade',
    d:'引紫霄神雷入体，一身气机皆成雷性。' },
  { k:'gf_bumie',      n:'不灭金身',     t:3, kind:'xin', seg:3, p:'body',
    d:'金身一成，寻常法宝难伤分毫。' },
  { k:'gf_tianji',     n:'天机演算术',   t:4, kind:'xin', seg:3, p:'fate',
    d:'掐指推演天机，福祸自避，缘法自来。' },
  { k:'gf_sk_zixiao',  n:'紫霄神雷',     t:3, kind:'shu', seg:3, sk:'zhan',
    d:'一道雷落下，山河为之失色。' },
  { k:'gf_sk_jiuyou',  n:'九幽噬魂',     t:4, kind:'shu', seg:3, sk:'xue',
    d:'自九幽引来一线阴气，食人精血以自补。' },
  { k:'gf_sk_xumi',    n:'须弥守御',     t:4, kind:'shu', seg:3, sk:'dun',
    d:'一芥子可纳须弥，何况区区一击。' },

  /* ── 第五段 · 准圣圣人天道 ── */
  { k:'gf_taiyi',      n:'太乙玄清道',   t:4, kind:'xin', seg:4, p:'speed',
    d:'太乙之道，贵在无形。修行如顺水行舟。' },
  { k:'gf_hunyuan',    n:'混元无极经',   t:4, kind:'xin', seg:4, p:'insight',
    d:'无极生太极，关窍开阖皆合天道。' },
  { k:'gf_zaohua',     n:'造化紫府篇',   t:4, kind:'xin', seg:4, p:'ward',
    d:'紫府一开，天地灵气皆为你所用。' },
  { k:'gf_sk_hundun',  n:'混沌一炁',     t:4, kind:'shu', seg:4, sk:'ji',
    d:'一炁未分之时的一击，无所谓防御；代价是自身也要承受反噬。' },
  { k:'gf_sk_wuxiang', n:'无相劫指',     t:4, kind:'shu', seg:4, sk:'xu',
    d:'指影重重，无相可依——身形散入虚空，敌手扑之不得。' },
  { k:'gf_sk_tiandao', n:'天道敕令',     t:4, kind:'shu', seg:4, sk:'zhan',
    d:'一言既出，即为天规。' }
];

/* 键 → 定义 的索引 */
export const GF_BY_KEY = {};
for(const g of GONGFA) GF_BY_KEY[g.k] = g;

/* 槽位数量：被动（心法）3 格 · 主动（术法）2 格
   —— 习得多寡不等同于强弱，如何取舍才是关键 */
export const GF_SLOT = { passive: 3, active: 2 };
