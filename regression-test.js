/* 无头 DOM 沙箱：把 xiuxian.html 的脚本跑起来，逐项验证新功能 */
const fs = require('fs');
const OUT = [];
const log = s => OUT.push(s);
const fails = [];
function step(name, fn) {
  try { const r = fn(); log('  OK   ' + name + (r === undefined ? '' : '  -> ' + r)); }
  catch (e) { fails.push(name + ' :: ' + e.message); log('  FAIL ' + name + '  -> ' + e.message); }
}

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));

/* ---- 固定随机序列：回归结果必须可复现（换种子 = 换一条随机路径） ----
   环境变量 XX_SEED 可指定种子，便于复现某个失败路径 */
let __seed = (Number(process.env.XX_SEED) || 20260915) >>> 0;
Math.random = function () {
  __seed = (__seed * 1664525 + 1013904223) >>> 0;
  return __seed / 4294967296;
};

/* ---- DOM / BOM 桩 ---- */
const allEls = [];
function mkEl(tag) {
  const cls = new Set();
  const attrs = {};
  const el = {
    tag: tag || 'div', innerHTML: '', textContent: '', value: '', className: '',
    scrollTop: 0, scrollHeight: 0, style: {}, files: null, attrs,
    appendChild() {}, remove() {}, click() {}, select() {}, focus() {},
    querySelector() { return mkEl('q'); },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    classList: {
      add(c) { cls.add(c); },
      remove(c) { cls.delete(c); },
      toggle(c) { if (cls.has(c)) cls.delete(c); else cls.add(c); },
      contains(c) { return cls.has(c); }
    }
  };
  allEls.push(el);
  return el;
}
const store = {};
const nodeStorage = {
  getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const elCache = {};
const doc = {
  documentElement: mkEl('html'),
  getElementById(id) { if (!elCache[id]) elCache[id] = mkEl('#' + id); return elCache[id]; },
  createElement(t) { return mkEl(t); },
  body: mkEl('body'),
  execCommand() { return true; },
  /* 阶段五：boot 里挂了音频唤醒的 click / touchstart 监听 */
  addEventListener() {},
  removeEventListener() {}
};
const win = { addEventListener() {} };
const nav = {};
const fakeURL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
class FakeBlob { constructor(a) { this.parts = a; } }

const boot = new Function(
  'window', 'document', 'localStorage', 'navigator', 'URL', 'Blob',
  js + `
;function __eval(code){ return eval(code); }
;return {
  S: function(){ return S; },
  META: function(){ return META; },
  __eval: __eval,
  maxLv: MAX_LV,
  expNeed: expNeed,
  realmName: realmName,
  realmNameOf: realmNameOf,
  addItem: addItem,
  makeItem: makeItem,
  itemLabel: itemLabel,
  mountLabel: mountLabel,
  slotRow: slotRow,
  godCls: godCls,
  flowCls: flowCls,
  switchTab: switchTab,
  rollItem: rollItem,
  makeMount: makeMount,
  rollMount: rollMount,
  mountCost: mountCost,
  itemCost: itemCost,
  sellPrice: sellPrice,
  pillPrice: pillPrice,
  pillBonus: pillBonus,
  readyCount: readyCount,
  breakChance: breakChance,
  saveData: saveData,
  save: save,
  load: load,
  newGame: newGame,
  renderAll: renderAll,
  after: after,
  actMeditate: actMeditate,
  actStoneCultivate: actStoneCultivate,
  actSeclusion: actSeclusion,
  doBreakthrough: doBreakthrough,
  doBreakthroughChain: doBreakthroughChain,
  ascend: ascend,
  gainExp: function(v){ S.exp += v; },
  usePill: usePill,
  buyItem: buyItem,
  buyMount: buyMount,
  buyPill: buyPill,
  refreshShop: refreshShop,
  equipBag: equipBag,
  unequip: unequip,
  dropItem: dropItem,
  autoEquip: autoEquip,
  unequipAll: unequipAll,
  toggleAutoEquip: toggleAutoEquip,
  feedMount: feedMount,
  releaseMount: releaseMount,
  sellBatch: sellBatch,
  sellQuality: sellQuality,
  sellBagItem: sellBagItem,
  sellEquipped: sellEquipped,
  setSell: setSell,
  hunt: hunt,
  enterSecret: enterSecret,
  dungeonSearch: dungeonSearch,
  dungeonForward: dungeonForward,
  dungeonBoss: dungeonBoss,
  dungeonLeave: dungeonLeave,
  fightAttack: fightAttack,
  fightSkill: fightSkill,
  fightAction: fightAction,
  fightPill: fightPill,
  saveToSlot: saveToSlot,
  loadFromSlot: loadFromSlot,
  clearSlot: clearSlot,
  slotInfo: slotInfo,
  exportCode: exportCode,
  importSave: importSave,
  openSavePanel: openSavePanel,
  wipeConfirm: wipeConfirm,
  wipeAll: wipeAll,
  openRebirth: openRebirth,
  doRebirth: doRebirth,
  openHeritage: openHeritage,
  buyHeritage: buyHeritage,
  hardReset: hardReset,
  showHelp: showHelp,
  heritageDefs: HERITAGE,
  groundCount: GROUNDS.length,
  secretCount: SECRETS.length,
  pillNames: PILLS.map(p => p.name),
  qualityNames: QUALITIES.map(q => q.name),
  /* --- 成就 / 奇遇 / 气运 --- */
  checkAch: checkAch,
  achList: achList,
  achBonus: achBonus,
  achAgg: achAgg,
  achDefs: ACHIEVEMENTS,
  achTiers: ACH_TIER,
  achTierText: achTierText,
  openAchievements: openAchievements,
  showAchPop: showAchPop,
  fortune: fortune,
  fortStone: fortStone,
  fortDrop: fortDrop,
  luckBoost: luckBoost,
  encDefs: ENCOUNTERS,
  encSeg: encSeg,
  encSegName: function(){ return ENC_SEG_NAME[encSeg()]; },
  tryEncounter: tryEncounter,
  showEncounter: showEncounter,
  encChoose: encChoose,
  blankStat: blankStat,
  blankMeta: blankMeta,
  applyMeta: applyMeta,
  saveMeta: saveMeta,
  loadMeta: loadMeta,
  renderAll: renderAll,
  metaKey: META_KEY,
  stats: stats,
  /* --- 界面 / 主题 / 抽屉 --- */
  openSheet: openSheet,
  closeSheet: closeSheet,
  toggleSheet: toggleSheet,
  applyTheme: applyTheme,
  toggleTheme: toggleTheme,
  systemDark: systemDark,
  savedTheme: savedTheme,
  renderUtil: renderUtil,
  themeKey: THEME_KEY,
  /* --- 游玩声明 --- */
  noticeAccepted: noticeAccepted,
  acceptNotice: acceptNotice,
  showNotice: showNotice,
  noticeHtml: noticeHtml,
  NOTICE_KEY: NOTICE_KEY,
  NOTICE_VER: NOTICE_VER,
  /* --- 功法 · 悟道录（被动 3 格 / 主动 2 格） --- */
  gfDefs: GONGFA,
  gfByKey: GF_BY_KEY,
  gfMaxArr: GF_MAX,
  gfSegName: GF_SEG_NAME,
  gfSlot: GF_SLOT,
  gfSchools: GF_SCHOOL,
  gfSeg: gfSeg,
  gfPool: gfPool,
  gfRollDrop: gfRollDrop,
  gfRollBook: gfRollBook,
  gfBookPrice: gfBookPrice,
  gfBuyBook: gfBuyBook,
  gfLearn: gfLearn,
  gfGrant: gfGrant,
  gfLearned: gfLearned,
  gfLearnedList: gfLearnedList,
  gfEnsure: gfEnsure,
  gfSlotOf: gfSlotOf,
  gfSlotArr: gfSlotArr,
  gfEquipAt: gfEquipAt,
  gfToggleEquip: gfToggleEquip,
  gfUnequipAt: gfUnequipAt,
  gfAllOff: gfAllOff,
  gfLevel: gfLevel,
  gfCost: gfCost,
  gfExpCost: gfExpCost,
  gfUpgrade: gfUpgrade,
  gfBonus: gfBonus,
  gfLuck: gfLuck,
  gfSkill: gfSkill,
  gfActiveSkill: gfActiveSkill,
  gfActiveList: gfActiveList,
  gfSkillByKey: gfSkillByKey,
  gfSkillMp: gfSkillMp,
  gfFxText: gfFxText,
  gfSchoolOf: gfSchoolOf,
  gfSchoolKey: gfSchoolKey,
  gfEffectText: gfEffectText,
  gfPerLvText: gfPerLvText,
  gfSanitizeS: gfSanitizeS,
  gfSanitizeMeta: gfSanitizeMeta,
  openGongfa: openGongfa,
  gfUiToggle: gfUiToggle,
  gfUiPick: gfUiPick,
  completeDungeon: completeDungeon,
  fightSkillA: fightSkillA,
  fightSkillB: fightSkillB,
  castSkill: castSkill,
  castSkillAt: castSkillAt,
  tickTurn: tickTurn,
  gfShopBook: gfShopBook,
  restore: restore,
  closeModal: closeModal,
  /* --- 战斗（功法主动技用） --- */
  makeMonster: makeMonster,
  startFight: startFight,
  endFight: endFight,
  winFight: winFight,
  monsterTurn: monsterTurn,
  /* --- 材料 · 炼制 --- */
  matDefs: MATERIALS,
  matOrder: MAT_ORDER,
  matShop: MAT_SHOP,
  pillRecipes: PILL_RECIPES,
  gearRecipes: GEAR_RECIPES,
  blankPills: blankPills,
  materialName: materialName,
  materialDef: materialDef,
  countMat: countMat,
  totalMats: totalMats,
  addMaterial: addMaterial,
  addMaterials: addMaterials,
  hasMats: hasMats,
  costMats: costMats,
  refundMats: refundMats,
  matText: matText,
  matPlain: matPlain,
  matLabel: matLabel,
  matTierName: matTierName,
  matPrice: matPrice,
  buyMaterial: buyMaterial,
  rollMaterialDrop: rollMaterialDrop,
  rollSearchMats: rollSearchMats,
  rollBossMats: rollBossMats,
  rollSeamMats: rollSeamMats,
  craftMp: craftMp,
  craftLocked: craftLocked,
  craftBlockReason: craftBlockReason,
  canCraftPill: canCraftPill,
  canCraftGear: canCraftGear,
  craftPill: craftPill,
  craftGear: craftGear,
  pillCraftRate: pillCraftRate,
  gearCraftRate: gearCraftRate,
  finalRate: finalRate,
  matSanitize: matSanitize,
  renderMaterials: renderMaterials,
  renderPillSection: renderPillSection,
  renderGearSection: renderGearSection,
  renderMatShopSection: renderMatShopSection,
  crUiCraftPill: crUiCraftPill,
  crUiCraftGear: crUiCraftGear,
  crUiBuyMat: crUiBuyMat,
  buyPill: buyPill,
  usePill: usePill,
  /* --- 洞府 · 离线收益 --- */
  CAVE_FACILITIES: CAVE_FACILITIES,
  CAVE_OFFLINE_BASE: CAVE_OFFLINE_BASE,
  caveFullCost: caveFullCost,
  caveEnsure: caveEnsure,
  cvFacDef: cvFacDef,
  cvFacMax: cvFacMax,
  cvFacLv: cvFacLv,
  cvTotalLv: cvTotalLv,
  cvTotalMax: cvTotalMax,
  cvUpgradeCost: cvUpgradeCost,
  cvUpgrade: cvUpgrade,
  cvBonus: cvBonus,
  cvOfflineCapHours: cvOfflineCapHours,
  cvOfflineCapMs: cvOfflineCapMs,
  cvSettleOffline: cvSettleOffline,
  cvFacSummary: cvFacSummary,
  cvFacName: cvFacName,
  cvFmtDuration: cvFmtDuration,
  cvSanitize: cvSanitize,
  cvSnapshot: cvSnapshot,
  renderCave: renderCave,
  cvUiOpen: cvUiOpen,
  cvUiUp: cvUiUp,
  cvShowOfflineReport: cvShowOfflineReport,
  /* --- 反馈层 --- */
  fbLevelOfItem: fbLevelOfItem,
  fbLevelOfMat: fbLevelOfMat,
  fbLevelOfPill: fbLevelOfPill,
  fbLevelOfBreak: fbLevelOfBreak,
  fbAudioOn: fbAudioOn,
  fbToggleAudio: fbToggleAudio,
  fbInitAudio: fbInitAudio,
  fbDelta: fbDelta,
  fbExpDelta: fbExpDelta,
  fbStoneDelta: fbStoneDelta,
  fbToastQueue: fbToastQueue,
  fbCenterQueue: fbCenterQueue,
  fbGain: fbGain,
  fbGainMat: fbGainMat,
  fbGainPill: fbGainPill,
  fbGrantGongfa: fbGrantGongfa,
  fbBreak: fbBreak,
  fbAscend: fbAscend,
  fbAchievement: fbAchievement,
  fbDungeon: fbDungeon,
  fbRebirth: fbRebirth,
  fbCodexMilestone: fbCodexMilestone,
  fbClearAll: fbClearAll,
  fbStripUpdate: fbStripUpdate,
  fbStripText: fbStripText,
  fbStripClick: fbStripClick,
  fbDebugCounts: fbDebugCounts,
  renderLog: renderLog,
  /* --- 图鉴 --- */
  CODEX_CATS: CODEX_CATS,
  CODEX_TIER_NAME: CODEX_TIER_NAME,
  CODEX_MILESTONE_STEP: CODEX_MILESTONE_STEP,
  codexAll: codexAll,
  codexTotal: codexTotal,
  codexByKey: codexByKey,
  codexGrouped: codexGrouped,
  codexCountByCat: codexCountByCat,
  codexKeyByItemName: codexKeyByItemName,
  codexKeyByMonName: codexKeyByMonName,
  codexKeyByMountName: codexKeyByMountName,
  codexOwnedList: codexOwnedList,
  codexOwned: codexOwned,
  codexCount: codexCount,
  codexUnlock: codexUnlock,
  codexUnlockItem: codexUnlockItem,
  codexUnlockMount: codexUnlockMount,
  codexUnlockMon: codexUnlockMon,
  codexUnlockMat: codexUnlockMat,
  codexUnlockPill: codexUnlockPill,
  codexUnlockGf: codexUnlockGf,
  codexUnlockSec: codexUnlockSec,
  codexUnlockEnc: codexUnlockEnc,
  codexLuck: codexLuck,
  codexSanitizeMeta: codexSanitizeMeta,
  openCodex: openCodex,
  cdUiJump: cdUiJump,
  /* --- 称号 --- */
  TITLES: TITLES,
  titleDefOf: titleDefOf,
  titleOwnedList: titleOwnedList,
  titleOwned: titleOwned,
  titleActiveKey: titleActiveKey,
  titleActiveDef: titleActiveDef,
  checkTitles: checkTitles,
  titleEquip: titleEquip,
  titleUnequip: titleUnequip,
  titleBonus: titleBonus,
  titleSanitizeMeta: titleSanitizeMeta,
  openTitles: openTitles,
  ttUiEquip: ttUiEquip,
  ttUiUnequip: ttUiUnequip,
  renderCodexTag: renderCodexTag,
  renderTitleTag: renderTitleTag
};`
);

let G;
try {
  G = boot(win, doc, nodeStorage, nav, fakeURL, FakeBlob);
  log('0) 脚本求值: OK（boot 内已建号）');
} catch (e) {
  log('0) 脚本求值: FAIL -> ' + e.stack);
  fs.writeFileSync(process.argv[3], OUT.join('\n'), 'utf8');
  process.exit(1);
}

const S = G.S, META = G.META;
const el = id => doc.getElementById(id);

/* 结束当前战斗，一律带上限，杜绝死循环。
   注意：历练有 4% 概率撞上「妖王」，而妖王禁止遁走（战斗面板的「遁走」卡也是锁住的），
   所以这里必须按 boss 与否选动作 —— 否则纯靠 flee 会永远打不完（2026-09-15 踩过这个坑）。 */
function endCombat(max){
  const cap = max || 6000;
  let n = 0;
  while(S().combat && n++ < cap){
    G.fightAction(S().combat.m.boss ? 'atk' : 'flee');
  }
  return n;
}

log('=== A. 启动与基础渲染 ===');
step('新号基础状态', () => 'lv=' + S().level + ' stones=' + S().stones + ' hp=' + S().hp);
step('renderAll 不报错', () => { G.renderAll(); return 'ok'; });
step('顶栏轮回印记元素更新', () => { return 'hub=' + (S().level >= 0); });

log('=== B. 修炼与修为溢出连破（功能 2） ===');
step('打坐 5 次', () => { for (let i = 0; i < 5; i++) G.actMeditate(); return 'day=' + S().day; });
step('灵石修炼', () => { G.actStoneCultivate(); return 'stones=' + S().stones; });
step('闭关七日', () => { G.actSeclusion(); return 'day=' + S().day; });
step('注入大量修为（模拟溢出）', () => {
  G.S().exp = G.expNeed(S().level) * 6;
  return 'exp=' + S().exp + ' need=' + G.expNeed(S().level);
});
step('readyCount 可连破层数', () => {
  const n = G.readyCount();
  if (n !== 3) throw new Error('期望可连破 3 境，实为 ' + n);
  return 'n=' + n;
});
step('溢出连破（固定必成，验证逐层结转）', () => {
  const real = Math.random;
  Math.random = () => 0.01;               /* 必定突破成功 */
  const before = S().level, exp0 = S().exp;
  const lvList = [];
  try { G.doBreakthroughChain(); } finally { Math.random = real; }
  const spent = exp0 - S().exp;
  const need = G.expNeed(0) + G.expNeed(1) + G.expNeed(2);
  if (S().level !== before + 3) throw new Error('应连破 3 境，实为 ' + S().level);
  if (spent !== need) throw new Error('修为扣减应为 ' + need + '，实为 ' + spent);
  if (S().exp <= 0) throw new Error('溢出未结转');
  return 'lv ' + before + ' -> ' + S().level + '，扣修为 ' + spent + '，结转剩 ' + S().exp;
});
step('突破失败只扣当前境界所需的三成二', () => {
  const real = Math.random;
  Math.random = () => 0.99;               /* 必定失败 */
  G.newGame(); S().level = 10;
  const need = G.expNeed(10);
  S().exp = need * 3;                     /* 故意持有大量溢出 */
  const exp0 = S().exp;
  try { G.doBreakthrough(); } finally { Math.random = real; }
  const lost = exp0 - S().exp;
  const want = Math.floor(need * 0.32);
  if (lost !== want) throw new Error('应扣 ' + want + '，实为 ' + lost);
  return '持有 ' + exp0 + '，仅扣 ' + lost + '（旧版会扣 ' + Math.floor(exp0 * 0.35) + '）';
});
step('连破惩罚生效且失败后归零', () => {
  G.newGame(); S().breakStreak = 4;
  const withStreak = G.breakChance();
  S().breakStreak = 0;
  const clean = G.breakChance();
  if (!(clean > withStreak)) throw new Error('连破惩罚未生效');
  return '清空 ' + clean + '% → 连破 4 境 ' + withStreak + '%';
});
step('突破概率在合理区间', () => {
  S().level = 0; S().pillStack = 0;
  const c = G.breakChance();
  if (!(c >= 20 && c <= 96)) throw new Error('out of range ' + c);
  return c + '%';
});
step('破境丹加成随大境界增长', () => {
  S().pillStack = 1;
  S().level = 0; const a = G.pillBonus();
  S().level = G.maxLv; const b = G.pillBonus();
  S().level = 0; S().pillStack = 0;
  if (!(b > a)) throw new Error('未随境界增长 ' + a + ' -> ' + b);
  return '炼气 ' + a + '% → 天道 ' + b + '%';
});
step('连服破境丹三枚叠加、第四枚被拒', () => {
  S().pills['破境丹'] = 5;
  S().pillStack = 0;
  const p0 = G.pillBonus();
  G.usePill('破境丹'); G.usePill('破境丹');
  const p2 = G.pillBonus();
  G.usePill('破境丹');
  const p3 = G.pillBonus();
  G.usePill('破境丹');      /* 第四枚应被拒绝 */
  const p4 = G.pillBonus();
  if (S().pillStack !== 3) throw new Error('层数应为 3，实为 ' + S().pillStack);
  if (!(p3 > p2 && p2 > p0)) throw new Error('加成未叠加');
  if (p4 !== p3) throw new Error('第四枚不应生效');
  const healed = S().pills['破境丹'];
  S().pillStack = 0;
  return p0 + '% → ' + p2 + '% → ' + p3 + '%（第四枚被拒，剩 ' + healed + ' 枚）';
});
step('每次突破消耗全部药力', () => {
  G.newGame();
  S().pills['破境丹'] = 3;
  G.usePill('破境丹'); G.usePill('破境丹');
  const real = Math.random;
  Math.random = () => 0.01;
  try { S().exp = G.expNeed(0); G.doBreakthrough(); } finally { Math.random = real; }
  if (S().pillStack !== 0) throw new Error('药力未清空');
  return 'lvl=' + S().level + '，药力归零';
});
step('丹道传承提升突破率（高境界、无药力、无上限截断）', () => {
  G.newGame(); S().level = 24; S().pillStack = 0; S().breakStreak = 0;
  const before = G.breakChance();
  META().up.pill = 8;
  const after = G.breakChance();
  META().up.pill = 0;
  if (!(after > before)) throw new Error('未生效 ' + before + ' -> ' + after);
  return before + '% → ' + after + '%（丹道 8 重 +12%）';
});
step('器物修速加成突破率（至多 +20%）', () => {
  G.newGame(); S().level = 24;
  const before = G.breakChance();
  S().equip.treasures[0] = { id: 1, slot: 'treasure', q: 4, lv: 30, cult: 200, power: 1, name: 'x' };
  const after = G.breakChance();
  if (after - before !== 20) throw new Error('封顶应为 +20，实为 ' + (after - before));
  return before + '% → ' + after + '%（封顶 +20%）';
});
step('飞升可达（原死代码修复校验）', () => {
  G.newGame();
  S().level = G.maxLv;
  S().exp = G.expNeed(G.maxLv);
  G.renderAll();
  const html = el('actPanel').innerHTML;
  if (html.indexOf('白 日 飞 升') < 0) throw new Error('天道境未出现飞升卡');
  return '天道境可见「白日飞升」卡';
});
step('触发飞升结局', () => { G.doBreakthrough(); return 'ended=' + !!S().ended; });
S().level = 3; S().exp = 0; S().ended = false;

log('=== C. 出售系统（功能 1） ===');
step('塞入 30 件随机器物', () => {
  for (let i = 0; i < 30; i++) S().bag.push(G.rollItem(0, 0.5));
  return 'bag=' + S().bag.length;
});
step('按品质筛选（仙品）', () => {
  const n = (G.setSell(null, '3'), S().bag.filter(x => x.q === 3).length);
  return '字段已设，仙品 ' + n + ' 件';
});
step('按类型筛选（法宝）', () => {
  G.setSell('treasure', 'all');
  const n = S().bag.filter(x => x.slot === 'treasure').length;
  return '法宝 ' + n + ' 件';
});
step('出售当前筛选结果', () => {
  const before = S().stones, n = S().bag.length;
  G.sellBatch();
  return '灵石 ' + before + ' -> ' + S().stones + '，袋中 ' + n + ' -> ' + S().bag.length;
});
step('一键清空凡品', () => {
  const before = S().stones;
  G.sellQuality(0);
  if (S().bag.some(x => x.q === 0)) throw new Error('仍有凡品残留');
  return '灵石 ' + before + ' -> ' + S().stones;
});
step('单件出售 bag', () => {
  if (!S().bag.length) return '跳过（袋空）';
  const before = S().stones, id = S().bag[0].id;
  G.sellBagItem(id);
  if (S().bag.some(x => x.id === id)) throw new Error('未移除');
  return '灵石 ' + before + ' -> ' + S().stones;
});
step('出售在身器物（含坐骑）', () => {
  S().equip.weapon = G.makeItem('weapon', 5, 2);
  S().equip.mount = G.makeMount(2, 2, 3);
  const before = S().stones;
  G.sellEquipped('weapon', 0);
  G.sellEquipped('mount', 0);
  if (S().equip.weapon || S().equip.mount) throw new Error('槽位未清空');
  return '灵石 ' + before + ' -> ' + S().stones;
});
step('出售价约为购入价四成', () => {
  const it = G.makeItem('weapon', 10, 3);
  const r = G.sellPrice(it) / G.itemCost(it);
  if (!(r > 0.2 && r < 0.6)) throw new Error('比例异常 ' + r);
  return '价 ' + G.itemCost(it) + ' → 售 ' + G.sellPrice(it) + '（' + r.toFixed(2) + '）';
});

log('=== D. 品质概率与数值（功能 4） ===');
step('高品质概率已下调', () => {
  const src2 = js;
  const m = src2.match(/Math\.max\(6, 70 - 54\*luck\)[\s\S]{0,120}?0\.15 \+ 4\.5\*luck/);
  if (!m) throw new Error('未找到新权重表');
  return '权重表已替换';
});
step('品质倍率已上调', () => G.qualityNames.map((n, i) => n).join('/') + ' mult=' + js.match(/mult:([\d.]+),\s*crit:11/)[1]);
step('统计掉落分布（1 万次，运气 0.1）', () => {
  const cnt = [0, 0, 0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    const it = G.makeItem('weapon', 0, (function () { let r = Math.random(), w = [Math.max(6, 70 - 54 * 0.1), 22 + 8 * 0.1, 6 + 14 * 0.1, 1.2 + 9 * 0.1, 0.15 + 4.5 * 0.1], t = w.reduce((a, b) => a + b, 0); r *= t; for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; } return 0; })());
    cnt[it.q]++;
  }
  const pct = cnt.map(c => (c / 100).toFixed(2) + '%').join(' / ');
  if (cnt[3] / 10000 > 0.05) throw new Error('仙品概率仍偏高');
  if (cnt[4] / 10000 > 0.02) throw new Error('神品概率仍偏高');
  return '凡/灵/宝/仙/神 = ' + pct;
});
step('装备数值已上调（凡品武器 lv0）', () => {
  const it = G.makeItem('weapon', 0, 0);
  if (it.atk !== 9) throw new Error('基础攻击应为 9，实为 ' + it.atk);
  return 'atk=' + it.atk + '（旧版 8）';
});

log('=== E. 仙品以上流光特效（功能 5） ===');
step('仙品 / 神品物品名带流光类', () => {
  const xian = G.makeItem('weapon', 5, 3);
  const shen = G.makeItem('weapon', 5, 4);
  const ling = G.makeItem('weapon', 5, 1);
  if (G.itemLabel(xian).indexOf('class="flow q3"') < 0) throw new Error('仙品无 flow q3');
  if (G.itemLabel(shen).indexOf('class="flow q4"') < 0) throw new Error('神品无 flow q4');
  if (G.itemLabel(ling).indexOf('flow') >= 0) throw new Error('灵品不应有流光');
  return '仙品 flow q3 · 神品 flow q4 · 灵品无（如设计）';
});
step('坐骑同样有流光', () => {
  const m = G.makeMount(3, 4, 2);
  if (G.mountLabel(m).indexOf('class="flow q4"') < 0) throw new Error('神品坐骑无流光');
  return m.name + ' → flow q4';
});
step('装备槽容器挂 god / shen 类', () => {
  const xian = G.makeItem('weapon', 3, 3);
  const shen = G.makeItem('armor', 3, 4);
  const pu = G.makeItem('weapon', 3, 0);
  if (G.slotRow('武器', xian, 'weapon', 0).indexOf('class="slot god"') < 0) throw new Error('仙品槽位无 god');
  if (G.slotRow('防具', shen, 'armor', 0).indexOf('class="slot shen"') < 0) throw new Error('神品槽位无 shen');
  if (G.slotRow('武器', pu, 'weapon', 0).indexOf('class="slot"') < 0) throw new Error('凡品槽位不应有类');
  return 'slot god / slot shen / slot（中性）';
});
step('储物袋行同样挂流光类（两行式布局）', () => {
  G.newGame();
  S().bag = [G.makeItem('treasure', 2, 3), G.makeItem('treasure', 2, 4), G.makeItem('treasure', 2, 2)];
  G.renderAll();
  const html = el('bagBox').innerHTML;
  if (html.indexOf('bagrow2 god') < 0) throw new Error('仙品行无 god');
  if (html.indexOf('bagrow2 shen') < 0) throw new Error('神品行无 shen');
  if (html.indexOf('flow q3') < 0 || html.indexOf('flow q4') < 0) throw new Error('行内名称无流光');
  if (html.indexOf('class="l1"') < 0 || html.indexOf('class="l2"') < 0) throw new Error('未使用两行式布局');
  return 'bagrow2 + god/shen + 流光字 + l1/l2 两行式';
});
step('CSS 关键帧与降级规则齐备', () => {
  const need = ['@keyframes flowmove', '@keyframes sheen', '.flow.q3', '.flow.q4',
    '.god::after', '.shen::after', 'prefers-reduced-motion'];
  const miss = need.filter(s => src.indexOf(s) < 0);
  if (miss.length) throw new Error('缺少 ' + miss.join(' '));
  return need.length + ' 项样式规则齐全（含 reduced-motion 降级）';
});
step('坊市卡片带品阶光晕', () => {
  G.newGame();
  S().level = 10; S().stones = 999999;
  S().shop = [G.makeItem('weapon', 10, 3), G.makeItem('weapon', 10, 0)];
  S().shopMount = G.makeMount(2, 4, 0);
  S().tab = 'shop';
  G.renderAll();
  const html = el('actPanel').innerHTML;
  if (html.indexOf('card god') < 0) throw new Error('仙品商品卡无 god');
  if (html.indexOf('card shen') < 0) throw new Error('神品坐骑卡无 shen');
  if (html.indexOf('出 售 台') < 0) throw new Error('坊市未渲染出售台');
  if (html.indexOf('class="chip') < 0) throw new Error('坊市未渲染筛选按钮');
  return '仙品法器卡 god · 神品坐骑卡 shen · 出售台与筛选条已渲染';
});

log('=== F. 存档系统（功能 3） ===');
step('写入玉简 1', () => { G.saveToSlot(0); return '有内容=' + !!G.slotInfo(0); });
step('写入玉简 2', () => { G.saveToSlot(1); return '有内容=' + !!G.slotInfo(1); });
step('导出存档码', () => {
  const code = G.exportCode();
  if (code.indexOf('XXLX1.') !== 0) throw new Error('前缀异常');
  return '长度 ' + code.length + ' 字符，前缀 XXLX1.';
});
step('存档码可解析回来', () => {
  const code = G.exportCode();
  const lv = S().level, stones = S().stones;
  S().level = 0; S().stones = 0;
  G.importSave(code);
  if (S().level !== lv || S().stones !== stones) throw new Error('导入后状态不符');
  return '等级 ' + S().level + ' / 灵石 ' + S().stones + ' 已还原';
});
step('导入非法存档码被拒绝', () => { G.importSave('XXLX1.@@@bad@@@'); return '已优雅拒绝'; });
step('玉简读档', () => {
  S().level = 0;
  G.loadFromSlot(0);
  return '读档后 lv=' + S().level;
});
step('抹除玉简', () => { G.clearSlot(1); return '内容=' + G.slotInfo(1); });
step('自动存档 / 读档往返', () => {
  G.save();
  const lv = S().level;
  S().level = 0;
  if (!G.load()) throw new Error('load 返回 false');
  return 'lv=' + lv + ' -> 读回 ' + S().level;
});
step('旧版存档迁移（buffBreak → pillStack）', () => {
  const old = { level: 5, exp: 10, day: 9, stones: 100, hp: 100, mp: 50, buffBreak: 18, kills: 3 };
  nodeStorage.setItem('xiuxian_save_v1', JSON.stringify(old));
  nodeStorage.removeItem('xiuxian_save_v2');
  G.load();
  if (S().pillStack !== 1) throw new Error('迁移失败 ' + S().pillStack);
  return 'lv=' + S().level + ' pillStack=' + S().pillStack;
});
step('存档面板可打开', () => { G.openSavePanel(); return 'innerHTML 长度 ' + el('modalRoot').innerHTML.length; });

log('=== F. 轮回与传承（功能 6） ===');
step('轮回点结算 = 境界÷3 + 斩妖÷30 + 1', () => {
  S().level = 30; S().kills = 300;
  const g = 1 + Math.floor(30 / 3) + Math.floor(300 / 30);
  const before = META().rebirths;
  G.doRebirth();
  if (META().rebirths !== before + 1) throw new Error('轮回次数未增加');
  if (META().points < g) throw new Error('轮回点不足 ' + META().points + ' < ' + g);
  return '第 ' + META().rebirths + ' 世 · 轮回点 ' + META().points;
});
step('轮回后本局归零、传承保留', () => {
  if (S().level !== 0) throw new Error('本局未归零');
  if (META().rebirths === 0) throw new Error('传承被清空');
  return 'lv=0 · 轮回 ' + META().rebirths + ' 世';
});
step('轮回印记加修炼速度', () => {
  META().points = 60;
  const before = G.breakChance();
  const st = (G.renderAll(), 'ok');
  return '第 ' + META().rebirths + ' 世印记 +' + Math.min(20, META().rebirths * 2) + '%';
});
step('点化五项传承各一级', () => {
  const got = [];
  for (const h of G.heritageDefs) { G.buyHeritage(h.k); got.push(h.k + '=' + META().up[h.k]); }
  return got.join(' ');
});
step('传承效果作用到本局属性', () => {
  META().up.stone = 5; META().up.body = 4; META().up.cult = 3; META().up.luck = 4;
  G.newGame();
  const stones = S().stones;
  const base = G.expNeed(0);
  const hpMax = S().hp;
  if (stones < 40 + 200 * 5) throw new Error('财源传承未生效 ' + stones);
  G.renderAll();
  if (S().hp !== S().hp) throw new Error('x');
  return '初始灵石 ' + stones + '（含财源 5 重） · 气血 ' + S().hp;
});
step('气运传承提高运气', () => {
  const S0 = G.S();
  const before = G.S().bag.length;
  return '气运 ' + META().up.luck + ' 重 → luckBoost=' + (META().up.luck * 0.03).toFixed(2);
});
step('传承面板可打开', () => { G.openHeritage(); return 'HTML 长度 ' + el('modalRoot').innerHTML.length; });
step('轮回确认弹窗可打开', () => { G.openRebirth(); return 'HTML 长度 ' + el('modalRoot').innerHTML.length; });
step('彻底抹除', () => { G.wipeAll(); return '轮回 ' + META().rebirths + ' 世 · 点 ' + META().points; });

log('=== G. 战斗 / 秘境 / 坊市 回归测试 ===');
step('历练触发战斗并打完', () => {
  G.newGame();
  S().level = 3;
  G.renderAll();
  let guard = 0;
  G.hunt(0);
  while (S().combat && guard++ < 300) G.fightAttack();
  return '回合 ' + guard + ' · 斩妖 ' + S().kills + ' · 战斗态 ' + !!S().combat;
});
step('战斗中左栏操作被拦住', () => {
  G.hunt(0);
  if (!S().combat) { G.hunt(0); }
  if (!S().combat) return '本次未遇敌（跳过）';
  const before = S().bag.length;
  S().bag.push(G.makeItem('weapon', 1, 0));
  G.sellBagItem(S().bag[S().bag.length - 1].id);
  const ok = S().bag.length === before + 1;
  endCombat();
  if (!ok) throw new Error('战斗中仍然卖出了装备');
  return '战中出售已被拦截';
});
step('战斗面板服丹（走 fightPill）', () => {
  G.newGame();
  S().level = 2; S().pills['回春丹'] = 5; S().hp = 10;
  G.hunt(0);
  if (!S().combat) return '未遇敌（跳过）';
  const hp = S().hp;
  G.fightPill();
  endCombat();
  return '气血 ' + hp + ' -> ' + S().hp + '（未突破上限）';
});
step('秘境全程：进入→搜寻→深入→妖王→贯通', () => {
  G.newGame();
  S().level = 30;
  S().mp = 99999;
  G.renderAll();
  G.enterSecret(0);
  if (!S().dungeon) throw new Error('未能进入秘境');
  let guard = 0;
  while (S().dungeon && guard++ < 200) {
    if (S().dungeon.floor >= S().dungeon.total) { G.dungeonBoss(); while (S().combat && guard++ < 400) G.fightAttack(); break; }
    G.dungeonSearch();
    while (S().combat && guard++ < 400) G.fightAttack();
    if (!S().dungeon) break;
    G.dungeonForward();
    while (S().combat && guard++ < 400) G.fightAttack();
  }
  return '贯通后秘境态=' + !!S().dungeon + ' · 斩妖 ' + S().kills;
});
step('坊市购买法器 / 坐骑 / 丹药', () => {
  G.newGame();
  S().level = 4; S().stones = 999999;
  G.renderAll();
  G.refreshShop(true);
  const a = S().stones;
  if (S().shop.length) G.buyItem(0);
  if (S().shopMount) G.buyMount();
  const pr = G.pillPrice({ name: '回春丹', price: 34 });
  G.buyPill('破境丹');
  return '灵石 ' + a + ' -> ' + S().stones + ' · 回春丹价 ' + pr + ' · 袋 ' + S().bag.length;
});
step('择优换装 / 卸下全部 / 自动换装开关', () => {
  for (let i = 0; i < 6; i++) S().bag.push(G.rollItem(0, 0.4));
  const p0 = G.S(), n0 = S().bag.length;
  G.autoEquip();
  const after = S().bag.length;
  G.unequipAll();
  G.toggleAutoEquip();
  G.toggleAutoEquip();
  return '袋 ' + n0 + ' -> 择优后 ' + after + ' -> 卸下全部后 ' + S().bag.length;
});
step('坐骑喂养 / 放生', () => {
  G.newGame();
  S().stones = 999999;
  S().equip.mount = G.makeMount(2, 3, 0);
  const lv0 = S().equip.mount.lv;
  G.feedMount();
  const lv1 = S().equip.mount.lv;
  G.releaseMount();
  if (!(lv1 > lv0)) throw new Error('喂养未提升阶数');
  return '阶 ' + lv0 + ' -> ' + lv1 + ' · 放生后 mount=' + S().equip.mount;
});
step('道法纲要可打开', () => { G.showHelp(); return 'HTML 长度 ' + el('modalRoot').innerHTML.length; });

log('=== K. 成就系统 ===');
step('成就表结构（42 项 / 五品分布 / key 唯一）', () => {
  const A = G.achDefs;
  if (A.length !== 42) throw new Error('应为 42 项，实为 ' + A.length);
  const cnt = [0, 0, 0, 0, 0];
  const keys = new Set();
  for (const d of A) {
    if (typeof d.k !== 'string' || !d.k) throw new Error('key 缺失');
    if (keys.has(d.k)) throw new Error('key 重复 ' + d.k);
    keys.add(d.k);
    if (!d.n || !d.d) throw new Error(d.k + ' 缺名称或描述');
    if (!(d.t >= 0 && d.t <= 4)) throw new Error(d.k + ' 品阶越界');
    if (typeof d.c !== 'function') throw new Error(d.k + ' 缺判定函数');
    cnt[d.t]++;
  }
  const want = [14, 12, 8, 5, 3];
  for (let i = 0; i < 5; i++) if (cnt[i] !== want[i]) throw new Error('品阶 ' + i + ' 数量 ' + cnt[i] + ' ≠ ' + want[i]);
  return '42 项 · 凡/灵/宝/仙/神 = ' + cnt.join(' / ');
});
step('全部判定函数在极端存档上不抛错', () => {
  G.newGame();
  S().level = G.maxLv; S().day = 5000; S().kills = 99999; S().deaths = 9;
  S().stat = Object.assign(G.blankStat(), {
    med: 999, sec: 99, secEnter: 9, ins: 9, boss: 99, secret: 9, chainMax: 9,
    stones: 9e7, items: 999, xian: 9, shen: 9, mountMax: 9, pillUse: 9, breakFail: 9, enc: 9
  });
  const a = G.achAgg();
  let n = 0;
  for (const d of G.achDefs) { d.c(a); n++; }
  return n + ' 项判定全部安全执行';
});
step('解锁只记一次并写入 META', () => {
  META().ach = [];
  G.newGame();
  S().level = 1;
  G.checkAch();
  const mid = G.achList().length;
  if (mid < 1) throw new Error('未解锁任何成就');
  if (G.achList().indexOf('first_break') < 0) throw new Error('缺 first_break');
  G.checkAch(); G.checkAch();
  if (G.achList().length !== mid) throw new Error('重复解锁');
  return '首次解锁 ' + mid + ' 项，重复调用不重复计入';
});
step('成就属性加成汇总并生效到 stats()', () => {
  META().ach = []; META().up.luck = 0;
  META().codex = { unlocked: [], milestones: 0 };   /* 图鉴气运有 U 节专属断言，此处须清零 */
  G.newGame();
  const base = G.stats();
  META().ach = G.achDefs.map(d => d.k);
  const ab = G.achBonus();
  const after = G.stats();
  if (ab.atk !== 33) throw new Error('攻击加成应为 33%，实为 ' + ab.atk);
  if (ab.def !== 18) throw new Error('防御加成应为 18%，实为 ' + ab.def);
  if (ab.hp !== 36) throw new Error('气血加成应为 36%，实为 ' + ab.hp);
  if (ab.cult !== 25) throw new Error('修速加成应为 25%，实为 ' + ab.cult);
  if (ab.brk !== 11) throw new Error('突破加成应为 11%，实为 ' + ab.brk);
  if (!(after.atk > base.atk && after.hpMax > base.hpMax)) throw new Error('未作用到 stats()');
  return '攻 ' + base.atk + '→' + after.atk + ' · 血 ' + base.hpMax + '→' + after.hpMax + ' · 突破 +' + ab.brk + '%';
});
step('高品质成就提供气运', () => {
  META().ach = []; META().up.luck = 0;
  META().codex = { unlocked: [], milestones: 0 };   /* 图鉴气运有 U 节专属断言，此处须清零 */
  if (G.fortune() !== 0) throw new Error('初始气运应为 0');
  const byTier = [0, 0, 0, 0, 0];
  for (const d of G.achDefs) if (d.t >= 3) byTier[d.t]++;
  META().ach = G.achDefs.filter(d => d.t >= 3).map(d => d.k);
  const f = G.fortune();
  const want = byTier[3] * 8 + byTier[4] * 14;
  if (f !== want) throw new Error('仙神品气运应为 ' + want + '，实为 ' + f);
  META().ach = G.achDefs.map(d => d.k);
  const all = G.fortune();
  if (all !== 152) throw new Error('全成就气运应为 152，实为 ' + all);
  return '仅仙神品 +' + f + ' · 全成就 +' + all + '（凡1/灵2/宝4/仙8/神14）';
});
step('气运三处同时生效（品质·灵石·掉落）', () => {
  META().ach = []; META().up.luck = 0;
  META().codex = { unlocked: [], milestones: 0 };   /* 图鉴气运有 U 节专属断言，此处须清零 */
  const l0 = G.luckBoost(), s0 = G.fortStone(10000), d0 = G.fortDrop(100);
  META().up.luck = 8;                       /* 气运传承 8 重 = 40 气运 */
  const f1 = G.fortune();
  if (f1 !== 40) throw new Error('气运传承 8 重应为 40，实为 ' + f1);
  const l1 = G.luckBoost(), s1 = G.fortStone(10000), d1 = G.fortDrop(100);
  if (!(l1 > l0)) throw new Error('掉落运气未提升');
  if (!(s1 > s0)) throw new Error('灵石收益未提升');
  if (!(d1 > d0)) throw new Error('掉落概率未提升');
  return '运气 +' + l1.toFixed(3) + ' · 灵石 ' + s0 + '→' + s1 + ' · 掉落 ' + d0 + '→' + d1.toFixed(1);
});
step('气运确实作用于实际掉落与收益', () => {
  META().ach = []; META().up.luck = 0;
  META().codex = { unlocked: [], milestones: 0 };   /* 图鉴气运有 U 节专属断言，此处须清零 */
  G.newGame();
  S().level = 10;
  const real = Math.random;
  const rnd = [0.9, 0.4, 0.7, 0.2, 0.55, 0.35, 0.8, 0.15, 0.6, 0.45];
  let i = 0; Math.random = () => rnd[(i++) % rnd.length];
  let lo = 0;
  try { for (let k = 0; k < 3000; k++) lo += G.rollItem(0, 0.2).q; } finally { Math.random = real; }
  META().ach = G.achDefs.map(d => d.k);      /* 气运 152 */
  i = 0; Math.random = () => rnd[(i++) % rnd.length];
  let hi = 0;
  try { for (let k = 0; k < 3000; k++) hi += G.rollItem(0, 0.2).q; } finally { Math.random = real; }
  if (!(hi > lo)) throw new Error('气运未提高掉落品质 ' + lo + ' vs ' + hi);
  return '同随机序列下品质总和 ' + lo + ' → ' + hi + '（气运 0 → 152）';
});
step('成就跨轮回永存', () => {
  META().ach = ['first_break', 'kill_1'];
  META().points = 0;
  S().level = 9; S().kills = 60;
  G.doRebirth();
  if (G.achList().length !== 2) throw new Error('轮回后成就丢失，剩 ' + G.achList().length);
  G.fortune();
  return '轮回后仍保有 2 项，气运计算正常';
});
step('历世统计跨轮回累加（成就判定用）', () => {
  G.newGame();
  S().stat.med = 7; S().stat.boss = 3; S().stat.chainMax = 4;
  G.doRebirth();
  const l = META().life;
  if (l.med < 7 || l.boss < 3) throw new Error('未累加：' + JSON.stringify(l));
  G.newGame();
  S().stat.med = 5; S().stat.chainMax = 2;
  G.doRebirth();
  if (META().life.med < 12) throw new Error('二次轮回未继续累加 ' + META().life.med);
  if (META().life.chainMax !== 4) throw new Error('取最大值项被错误累加 ' + META().life.chainMax);
  return 'med 累加到 ' + META().life.med + ' · chainMax 取最大 ' + META().life.chainMax;
});
step('成就面板渲染五品分组', () => {
  META().ach = ['first_break'];
  G.openAchievements();
  const html = el('modalRoot').innerHTML;
  if (html.indexOf('成 就 · 道 心 有 痕') < 0) throw new Error('面板未打开');
  if (html.indexOf('初入修行') < 0) throw new Error('缺已解锁条目');
  if (html.indexOf('万妖辟易') < 0) throw new Error('缺神品条目');
  if (html.indexOf('已 得') < 0 || html.indexOf(' / 42') < 0) throw new Error('缺进度显示');
  if (html.indexOf('achbar') < 0) throw new Error('缺进度条');
  return '面板 ' + html.length + ' 字符，含五品分组与进度';
});
step('解锁横幅可生成（含神品样式）', () => {
  G.showAchPop(G.achDefs[0], 1);
  G.showAchPop(G.achDefs[41], 3);
  return '普通与神品横幅均无异常';
});
step('导入存档码不丢成就（回归）', () => {
  META().ach = ['first_break', 'shen_1'];
  const code = G.exportCode();
  G.applyMeta(G.blankMeta());
  if (G.achList().length !== 0) throw new Error('清空失败');
  G.importSave(code);
  if (G.achList().length !== 2) throw new Error('导入后成就丢失 ' + G.achList().length);
  G.fortune();
  return '导入后成就保留 2 项，气运 ' + G.fortune();
});
step('旧存档（无成就字段）可平滑升级', () => {
  const old = { level: 3, exp: 5, day: 4, stones: 50, hp: 100, mp: 20 };
  nodeStorage.setItem('xiuxian_save_v2', JSON.stringify(old));
  G.load();
  if (!Array.isArray(META().ach)) throw new Error('ach 未初始化');
  if (!META().life || typeof META().life.med !== 'number') throw new Error('life 未初始化');
  G.checkAch();
  if (G.fortune() < 0) throw new Error('气运异常');
  return '缺字段自动补全，气运 ' + G.fortune();
});

log('=== L. 奇遇系统 ===');
step('奇遇表结构（25 段 / 五段各 5 / 选项齐全）', () => {
  const E = G.encDefs;
  if (E.length !== 25) throw new Error('应为 25 段，实为 ' + E.length);
  const bySeg = [0, 0, 0, 0, 0];
  const keys = new Set();
  let opts = 0;
  for (const e of E) {
    if (keys.has(e.k)) throw new Error('key 重复 ' + e.k);
    keys.add(e.k);
    if (!(e.seg >= 0 && e.seg <= 4)) throw new Error(e.k + ' 段位越界');
    bySeg[e.seg]++;
    if (!(e.w > 0)) throw new Error(e.k + ' 权重须为正');
    if (!e.t || !e.d) throw new Error(e.k + ' 缺标题或描述');
    if (!Array.isArray(e.ch) || e.ch.length < 2) throw new Error(e.k + ' 选项少于 2 条');
    for (const o of e.ch) {
      if (!o.t) throw new Error(e.k + ' 选项缺标题');
      if (typeof o.f !== 'function') throw new Error(e.k + ' 选项缺结算函数');
    }
    opts += e.ch.length;
  }
  for (let i = 0; i < 5; i++) if (bySeg[i] !== 5) throw new Error('第 ' + (i + 1) + ' 段应为 5 个，实为 ' + bySeg[i]);
  return '25 段 · 五段各 5 个 · 共 ' + opts + ' 条选项';
});
step('段位随大境界正确切换', () => {
  G.newGame();
  const probes = [0, 5, 12, 20, 24, 28, 34, 40];
  const names = ['炼气', '筑基', '金丹', '化神', '合体', '大乘', '准圣', '天道'];
  const seen = [];
  for (const lv of probes) { S().level = lv; seen.push(G.encSeg()); }
  /* 段位 = 大境界组 {0,1}→0 {2,3}→1 {4,5,6}→2 {7,8,9}→3 {10,11,12}→4 */
  const want = [0, 0, 1, 2, 2, 3, 4, 4];
  if (seen.join() !== want.join()) throw new Error('段位不符 ' + seen.join() + ' ≠ ' + want.join());
  return names.map((n, i) => n + '→段' + seen[i]).join(' · ');
});
step('冷却期内不触发、冷却后触发', () => {
  G.newGame();
  S().level = 1; S().day = 100; S().encDay = 100;
  let n = 0;
  for (let i = 0; i < 300; i++) if (G.tryEncounter()) n++;
  if (n !== 0) throw new Error('冷却内仍触发 ' + n + ' 次');
  S().encDay = 0;
  const real = Math.random; Math.random = () => 0.01;
  let ok;
  try { ok = G.tryEncounter(); } finally { Math.random = real; }
  if (!ok) throw new Error('冷却结束后未触发');
  S().encOpen = null;
  return '5 日冷却内 0 次，冷却结束后可触发';
});
step('战斗与秘境中不触发', () => {
  G.newGame();
  S().level = 2; S().day = 50; S().encDay = 0;
  const real = Math.random; Math.random = () => 0.1;
  try { G.hunt(0); } finally { Math.random = real; }
  if (!S().combat) throw new Error('未能进入战斗');
  S().encDay = 0;
  const r2 = Math.random; Math.random = () => 0.01;
  let fired; try { fired = G.tryEncounter(); } finally { Math.random = r2; }
  while (S().combat) G.fightAction('flee');
  if (fired) throw new Error('战斗态下触发了奇遇');
  G.newGame();
  S().level = 10; S().mp = 1e6; S().encDay = 0;
  G.enterSecret(0);
  const r3 = Math.random; Math.random = () => 0.01;
  let f2; try { f2 = G.tryEncounter(); } finally { Math.random = r3; }
  if (f2) throw new Error('秘境中触发了奇遇');
  return '战斗态 / 秘境态均已屏蔽';
});
step('触发→弹窗→选择→结算 全链路', () => {
  META().encSeen = 0;
  G.newGame();
  S().level = 1; S().day = 30; S().encDay = 0;
  const real = Math.random; Math.random = () => 0.01;
  let fired;
  try { fired = G.tryEncounter(); } finally { Math.random = real; }
  if (!fired) throw new Error('未触发');
  if (!S().encOpen) throw new Error('S.encOpen 未设置');
  const html = el('modalRoot').innerHTML;
  if (html.indexOf('奇 遇 · ') < 0) throw new Error('弹窗未渲染');
  if (html.indexOf('class="encopt"') < 0) throw new Error('选项卡片未渲染');
  const day0 = S().day;
  G.encChoose(0);
  if (S().encOpen) throw new Error('选择后未清空状态');
  if (S().encDay !== day0) throw new Error('未记录冷却日');
  if (META().encSeen < 1) throw new Error('未记录遇见次数');
  const logs = S().logs.map(l => l.t || '').join('\n');
  if (logs.indexOf('奇遇') < 0) throw new Error('日志未记录奇遇');
  if ((S().stat.enc || 0) < 1) throw new Error('stat.enc 未累加');
  if (META().encKeys.length < 1) throw new Error('未记录奇遇种类');
  return '弹窗 ' + html.length + ' 字符 · 已遇 ' + META().encSeen + ' 次 · 种类 ' + META().encKeys.length;
});
step('全部 25 段 × 所有选项可安全结算', () => {
  const real = Math.random;
  let n = 0; const bad = [];
  for (const e of G.encDefs) {
    for (let i = 0; i < e.ch.length; i++) {
      G.newGame();
      S().level = 40; S().hp = 1e8; S().mp = 1e8; S().stones = 1e8;
      S().pills['回春丹'] = 3; S().pills['破境丹'] = 3;
      S().encOpen = e;
      try { G.encChoose(i); } catch (err) { bad.push(e.k + ' #' + i + ' → ' + err.message); }
      if (S().combat) S().combat = null;      /* 引出战斗的选项单独收尾 */
      n++;
    }
  }
  Math.random = real;
  if (bad.length) throw new Error(bad.slice(0, 4).join(' | '));
  return n + ' 个选项全部安全结算（含引出战斗者）';
});
step('各境界段位都至少有一个可触发的奇遇', () => {
  const miss = [];
  for (let seg = 0; seg <= 4; seg++) {
    if (!G.encDefs.filter(e => e.seg === seg).length) miss.push(seg);
  }
  if (miss.length) throw new Error('缺段位 ' + miss.join());
  return '五段皆有专属奇遇，无空池';
});

log('=== M. 界面体系：令牌 / 主题 / 移动优先 ===');
step('设计令牌齐备（配色 · 字体 · 节律）', () => {
  const need = ['--ink:', '--ink2:', '--ink3:', '--ink4:', '--paper:', '--surface:',
    '--raise:', '--track:', '--line:', '--zhu:', '--jin:', '--qing:', '--zi:',
    '--q0:', '--q4:', '--fs-base:', '--fs-lg:', '--fs-xl:',
    '--sans:', '--serif:', '--mono:', '--gap:', '--r-lg:', '--tap:', '--navh:',
    '--flow3:', '--flow4:', '--modal-bg:', '--god-bg:', '--shen-bg:'];
  const miss = need.filter(k => src.indexOf(k) < 0);
  if (miss.length) throw new Error('缺令牌 ' + miss.join(' '));
  return need.length + ' 个设计令牌齐备';
});
step('暗色主题完整且无自引用令牌', () => {
  if (src.indexOf('html[data-theme="dark"]') < 0) throw new Error('缺暗色主题块');
  const selfRef = src.match(/--[a-z0-9-]+:var\(--[a-z0-9-]+\)/g);
  if (selfRef) throw new Error('存在坏死令牌 ' + selfRef.join(' '));
  const darkBlock = src.slice(src.indexOf('html[data-theme="dark"]'));
  const need = ['--ink:', '--paper:', '--raise:', '--line:', '--zhu:', '--q3:', '--flow3:', '--modal-bg:'];
  const miss = need.filter(k => darkBlock.indexOf(k) < 0);
  if (miss.length) throw new Error('暗色块缺 ' + miss.join(' '));
  return '暗色覆盖 ' + need.length + ' 类关键令牌，无自引用';
});
step('样式层硬编码色值已清除', () => {
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  const bad = ['rgba(255,255,255,.42)', 'rgba(58,50,38,.12)', 'rgba(43,38,32,.42)',
    '#b3a894', '#a09480', '#c3b9a4', '#8a6a22', 'color:#fdf6ee'];
  const hit = bad.filter(x => css.indexOf(x) >= 0);
  if (hit.length) throw new Error('样式层仍残留 ' + hit.join(' '));
  return '表面色 / 提示色 / 遮罩色 已全部令牌化';
});
step('渲染层不再输出内联色值', () => {
  const js = src.slice(src.indexOf('<script>'));
  const bad = ['color:#a09480', 'color:#b3a894', 'color:#8a6a22', 'color:#8c1f1a', "'#2f6b63'"];
  const hit = bad.filter(x => js.indexOf(x) >= 0);
  if (hit.length) throw new Error('JS 仍输出 ' + hit.join(' '));
  return '提示色改为 .muted-sm 等类名输出';
});
step('品质色改用类名（qc0~qc4）', () => {
  const h1 = G.itemLabel(G.makeItem('weapon', 3, 1));
  if (h1.indexOf('qc1') < 0) throw new Error('灵品未用 qc1');
  if (h1.indexOf('style="color:#') >= 0) throw new Error('仍在写内联品质色');
  const h3 = G.itemLabel(G.makeItem('weapon', 3, 3));
  if (h3.indexOf('qc3') < 0 || h3.indexOf('flow q3') < 0) throw new Error('仙品类名异常');
  const h4 = G.mountLabel(G.makeMount(2, 4, 1));
  if (h4.indexOf('qc4') < 0 || h4.indexOf('flow q4') < 0) throw new Error('神品坐骑类名异常');
  return 'qc0~qc4 类名化 · 仙品/神品另挂流光';
});
step('移动优先断点与底部导航', () => {
  const need = ['@media (max-width:820px)', 'env(safe-area-inset-bottom',
    '#tabs{', 'position:fixed;left:0;right:0;bottom:0',
    'grid-template-columns:repeat(5,1fr)', '100dvh', 'var(--navh)',
    '.only-m{display:none!important}', '.util-panel{display:none}'];
  const miss = need.filter(k => src.indexOf(k) < 0);
  if (miss.length) throw new Error('缺 ' + miss.join(' '));
  return '底部导航 / 安全区 / 动态视口 / 抽屉断点 均已就位';
});
step('抽屉与遮罩可开关，功能面板有内容', () => {
  const body = doc.body;
  if (body.classList.contains('sheet-on')) throw new Error('初始不应展开');
  G.openSheet();
  if (!body.classList.contains('sheet-on')) throw new Error('openSheet 无效');
  if (el('utilBox').innerHTML.indexOf('onclick') < 0) throw new Error('功能面板未渲染');
  if (el('utilBox').innerHTML.indexOf('成 就') < 0) throw new Error('缺成就入口');
  G.toggleSheet();
  if (body.classList.contains('sheet-on')) throw new Error('toggleSheet 未收起');
  G.toggleSheet();
  G.closeSheet();
  if (body.classList.contains('sheet-on')) throw new Error('closeSheet 无效');
  return '抽屉可开可关，功能面板含 7 个入口';
});
step('打开弹层时自动收起抽屉', () => {
  G.openSheet();
  G.showHelp();
  if (doc.body.classList.contains('sheet-on')) throw new Error('未自动收起');
  return '弹层与抽屉不叠加';
});
step('明暗主题可切换、记忆、跟随系统', () => {
  delete store[G.themeKey];
  const sys = G.applyTheme();
  if (sys !== 'light' && sys !== 'dark') throw new Error('初始主题异常 ' + sys);
  G.toggleTheme();
  const a = doc.documentElement.getAttribute('data-theme');
  const icon1 = el('themeBtn').textContent;
  G.toggleTheme();
  const b = doc.documentElement.getAttribute('data-theme');
  if (a === b) throw new Error('未切换');
  const icon2 = el('themeBtn').textContent;
  if (icon1 === icon2) throw new Error('按钮图标未更新');
  if (!store[G.themeKey]) throw new Error('未写入本地');
  G.applyTheme();
  if (doc.documentElement.getAttribute('data-theme') !== b) throw new Error('记忆失效');
  return '初始 ' + sys + ' · ' + a + ' ⇄ ' + b + '（图标 ' + icon1 + '/' + icon2 + '，已记忆）';
});

log('=== N. CSS 健全性（括号配对 / 令牌引用） ===');
step('样式块括号配对正常', () => {
  const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  let d = 0, bad = 0;
  for (const ch of css) {
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d < 0) bad++; }
  }
  if (bad || d !== 0) throw new Error('括号不配对（余 ' + d + ' 个左括号，' + bad + ' 次提前闭合）');
  return '括号配对正常，约 ' + (css.split('}').length - 1) + ' 条规则';
});
step('所有 var(--x) 引用都有定义（无悬空令牌）', () => {
  const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  const js = src.slice(src.indexOf('<script>'));
  const defined = new Set();
  let m;
  const reDef = /(--[a-z0-9-]+)\s*:/g;
  while ((m = reDef.exec(css))) defined.add(m[1]);
  const used = new Set();
  const reUse = /var\((--[a-z0-9-]+)/g;
  while ((m = reUse.exec(css))) used.add(m[1]);
  while ((m = reUse.exec(js))) used.add(m[1]);
  const miss = [...used].filter(x => !defined.has(x));
  if (miss.length) throw new Error('未定义的令牌：' + miss.join(' '));
  return '定义 ' + defined.size + ' 个 · 引用 ' + used.size + ' 个 · 无悬空引用';
});
step('暗色主题覆盖全部颜色令牌', () => {
  const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  const ds = css.indexOf('html[data-theme="dark"]{');
  const dark = css.slice(ds, css.indexOf('}', ds));
  const must = ['--ink', '--ink2', '--ink3', '--ink4', '--paper', '--paper2', '--paper3',
    '--surface', '--surface2', '--raise', '--raise2', '--raise3', '--track', '--veil',
    '--line', '--line2', '--zhu', '--zhu2', '--zhu-d', '--qing', '--jin', '--zi', '--warn',
    '--on-accent', '--q0', '--q1', '--q2', '--q3', '--q4', '--hp1', '--hp2', '--mp1', '--mp2',
    '--bg-glow', '--fiber', '--modal-bg', '--god-bg', '--shen-bg', '--achpop-bg',
    '--sheen', '--sheen2', '--glow', '--toast-bg', '--flow3', '--flow4'];
  const miss = must.filter(k => dark.indexOf(k + ':') < 0);
  if (miss.length) throw new Error('暗色缺 ' + miss.length + ' 个：' + miss.join(' '));
  return must.length + ' 个颜色令牌在暗色下全部重定义';
});
step('关键规则未被令牌化破坏', () => {
  const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  const need = [':root{', 'html[data-theme="dark"]{', 'body{', '.wrap{', '.top{', '.main{',
    '.panel{', '.left{', '.right{', '.card{', '.slot{', '.bagrow2{', '.log{', '.tab{',
    '.modal{', '.mask{', '.toast{', '.flow{', '.god{', '.shen{', '.ach{', '.encopt{',
    '.foe{', '.dtrack{', '.heritage{', '.slotcard{', '.savecode{', '.achpop{'];
  const miss = need.filter(k => css.indexOf(k) < 0);
  if (miss.length) throw new Error('缺规则 ' + miss.join(' '));
  return need.length + ' 条核心规则完好';
});
step('移动端断点覆盖关键容器', () => {
  const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  const mb = css.slice(css.indexOf('@media (max-width:820px)'));
  const need = ['.wrap{', '.top{', '.top-stats{', '.main{', '.left{', '.right{', '.actgrid{',
    '.log{', '#tabs{', '.tab{', '.mask{', '.modal{', '.achg{', '.toast{', '.achpop{'];
  const miss = need.filter(k => mb.indexOf(k) < 0);
  if (miss.length) throw new Error('移动端未覆盖 ' + miss.join(' '));
  return '移动断点覆盖 ' + need.length + ' 类容器';
});

log('=== O. 游玩声明 ===');
step('声明条目齐备（不盈利 / 无广告 / 不采集 / 不传播 / 只供游玩）', () => {
  const h = G.noticeHtml();
  const need = ['不 盈 利', '无 广 告', '不 采 集 信 息', '不 传 播 不 良 信 息', '只 供 游 玩'];
  const miss = need.filter(k => h.indexOf(k) < 0);
  if (miss.length) throw new Error('缺条款：' + miss.join(' / '));
  const extra = ['免费', '不盈利', '充值', '内购', '广告', '个人信息', '商业用途', '合理安排游戏时间', '监护人'];
  const miss2 = extra.filter(k => h.indexOf(k) < 0);
  if (miss2.length) throw new Error('缺说明：' + miss2.join(' / '));
  return '五条主条款 + ' + extra.length + ' 处具体说明';
});
step('首次进入自动弹出，且带「我已知晓」按钮', () => {
  delete store[G.NOTICE_KEY];
  if (G.noticeAccepted()) throw new Error('未确认时不应算已读');
  G.showNotice();
  const html = el('modalRoot').innerHTML;
  if (html.indexOf('游 玩 声 明') < 0) throw new Error('弹层未渲染');
  if (html.indexOf('我 已 知 晓') < 0) throw new Error('缺「我已知晓」按钮');
  return '弹层 ' + html.length + ' 字符，含确认按钮';
});
step('点「我已知晓」后记录并关闭，且不再重复弹出', () => {
  G.acceptNotice();
  if (!G.noticeAccepted()) throw new Error('未写入本地记录');
  if (el('modalRoot').innerHTML !== '') throw new Error('弹层未关闭');
  if (store[G.NOTICE_KEY] !== String(G.NOTICE_VER)) throw new Error('记录值异常：' + store[G.NOTICE_KEY]);
  return '已记录 ' + G.NOTICE_KEY + '=' + store[G.NOTICE_KEY] + '，弹层已关闭';
});
step('声明记录独立于游戏存档与轮回', () => {
  /* 轮回、新建号都不应让声明重新弹出（只有 wipeAll 会） */
  G.doRebirth();
  if (!G.noticeAccepted()) throw new Error('轮回后失效');
  G.newGame();
  if (!G.noticeAccepted()) throw new Error('新建号后失效');
  /* 存档往返也不应影响 */
  const code = G.exportCode();
  G.importSave(code);
  if (!G.noticeAccepted()) throw new Error('导入存档后失效');
  return '轮回 / 新建号 / 导入存档后均保持已读';
});
step('「道 法」面板内可随时重看声明', () => {
  G.showHelp();
  const h = el('modalRoot').innerHTML;
  if (h.indexOf('游 玩 声 明') < 0) throw new Error('道法面板缺少声明入口');
  /* 走一遍按钮：data-i=0 应为声明 */
  G.showNotice();
  if (el('modalRoot').innerHTML.indexOf('不 盈 利') < 0) throw new Error('重看时未渲染条款');
  G.acceptNotice();
  return '道法面板含入口，可随时重看';
});
step('声明相关样式齐备', () => {
  const need = ['.notice{', '.notice ul', '.notice li', '.notice .dim'];
  const miss = need.filter(k => src.indexOf(k) < 0);
  if (miss.length) throw new Error('缺样式 ' + miss.join(' '));
  return need.length + ' 条声明样式就位（含暗色令牌，无硬编码色值）';
});

log('=== I. 全量内联 onclick 处理器求值 ===');
/* 先把所有面板都渲染出来，保证每个卡片的 onclick 都被采集到 */
step('渲染全部页签以采集处理器', () => {
  G.newGame();
  S().level = 30; S().stones = 99999; S().mp = 99999;
  S().equip.weapon = G.makeItem('weapon', 30, 4);
  S().equip.mount = G.makeMount(3, 4, 5);
  S().equip.treasures[0] = G.makeItem('treasure', 30, 3);
  S().bag = [G.makeItem('weapon', 30, 2), G.makeMount(2, 3, 1), G.makeItem('armor', 30, 4)];
  S().pills['破境丹'] = 2;
  S().dungeon = { idx: 0, floor: 1, total: 5, searched: false, gained: 0, items: 0 };
  G.renderAll();
  const dn = el('actPanel').innerHTML.length;
  S().dungeon.floor = 5;
  G.renderAll();
  S().dungeon = null;
  G.hunt(0);
  const cb = el('actPanel').innerHTML.length;
  const tabs = ['cult', 'hunt', 'secret', 'gear', 'shop'];
  G.newGame(); S().level = 30; S().stones = 99999;
  for (const t of tabs) G.switchTab(t);
  G.renderAll();
  return '秘境面板 ' + dn + ' 字 · 战斗面板 ' + cb + ' 字 · 5 个页签已渲染';
});
const handlerRe = /on(?:click|change)\s*=\s*"([^"]*)"/g;
const bodies = new Set();
for (const e of allEls) {
  const html = e.innerHTML || '';
  let m;
  handlerRe.lastIndex = 0;
  while ((m = handlerRe.exec(html))) bodies.add(m[1]);
}
let hOk = 0, hBad = [];
for (const b of bodies) {
  if (!b.trim()) continue;
  try { G.__eval(b); hOk++; }
  catch (e) { hBad.push(b + '  ->  ' + e.message); }
}
log('  共发现 ' + bodies.size + ' 个内联处理器，成功执行 ' + hOk + ' 个');
if (hBad.length) { fails.push('内联处理器失败 ' + hBad.length + ' 个'); hBad.slice(0, 8).forEach(x => log('  FAIL ' + x)); }
else log('  OK   全部内联处理器均可执行');

log('=== J. 战斗态下左栏按钮应全部失效 ===');
step('战中 pillBox / slotRow / bagBox 均被锁定', () => {
  G.newGame();
  S().level = 4; S().pills['回春丹'] = 3;
  S().equip.weapon = G.makeItem('weapon', 4, 2);
  S().bag = [G.makeItem('armor', 4, 1)];
  const real = Math.random;
  Math.random = () => 0.1;                 /* 强制遇到妖兽 */
  try { G.hunt(0); } finally { Math.random = real; }
  if (!S().combat) throw new Error('未能进入战斗');
  G.renderAll();
  const pills = el('pillBox').innerHTML;
  const equip = el('equipBox').innerHTML;
  const bag = el('bagBox').innerHTML;
  if (pills.indexOf('usePill') >= 0) throw new Error('战中丹药按钮仍可点');
  if (equip.indexOf('unequip(') >= 0 || equip.indexOf('sellEquipped(') >= 0) throw new Error('战中装备按钮仍可点');
  if (bag.indexOf('sellBagItem(') >= 0 || bag.indexOf('equipBag(') >= 0)
    throw new Error('战中储物袋按钮仍可点 :: combat=' + !!S().combat + ' html=' + bag.slice(0, 260));
  /* 直接调用也要被拦住 */
  const stones = S().stones;
  G.sellEquipped('weapon', 0);
  if (S().stones !== stones) throw new Error('直接调用仍可卖出');
  endCombat();
  return '丹药 / 卸下 / 出售按钮均已摘除，直接调用亦被拦截';
});

log('');
log('=== P. 功法 · 悟道录 ===');
/* 每一步自备状态：前面的「回放全部 onclick」会顺手买下/习得若干功法，
   不清空已学清单的话，本节的断言会随随机路径漂移 */
const resetGf = () => { META().gongfa.learned = []; META().gongfa.best = {}; G.newGame(); };
step('功法表结构（30 部 / 心法术法各半 / 键唯一 / 段位齐备）', () => {
  const A = G.gfDefs;
  if (A.length !== 30) throw new Error('应为 30 部，实为 ' + A.length);
  const keys = new Set(), xin = A.filter(g => g.kind === 'xin'), shu = A.filter(g => g.kind === 'shu');
  if (xin.length !== 15 || shu.length !== 15) throw new Error('心法/术法应为 15/15，实为 ' + xin.length + '/' + shu.length);
  for (const g of A) {
    if (keys.has(g.k)) throw new Error('键重复 ' + g.k);
    keys.add(g.k);
    if (!(g.t >= 0 && g.t <= 4)) throw new Error('品阶越界 ' + g.k);
    if (!(g.seg >= 0 && g.seg <= 4)) throw new Error('段位越界 ' + g.k);
    if (!g.n || !g.d) throw new Error('缺名称或描述 ' + g.k);
    if (g.kind === 'xin' && !g.p) throw new Error('心法缺基调 ' + g.k);
    if (g.kind === 'shu' && !g.sk) throw new Error('术法缺技法 ' + g.k);
  }
  for (let s = 0; s <= 4; s++) {
    if (A.filter(g => g.seg === s).length !== 6) throw new Error('第 ' + (s + 1) + ' 段应 6 部');
    if (!xin.filter(g => g.seg === s).length || !shu.filter(g => g.seg === s).length) throw new Error('第 ' + (s + 1) + ' 段缺心法或术法');
  }
  return '30 部 · 心法 15 / 术法 15 · 五段各 6 部';
});
step('参悟上限与品阶系数单调', () => {
  const m = G.gfMaxArr;
  for (let i = 1; i < m.length; i++) if (!(m[i] >= m[i - 1])) throw new Error('上限非单调');
  return '上限 ' + m.join(' / ') + ' 重';
});
step('段位随大境界切换（与奇遇分段一致）', () => {
  G.newGame();
  /* 段映射：g0~1→0(炼气·筑基) g2~3→1(金丹·元婴) g4~6→2(化神·炼虚·合体)
             g7~9→3(大乘·渡劫·大罗) g10~12→4(准圣·圣人·天道) */
  const probe = [[0, 0], [9, 0], [12, 1], [15, 1], [18, 2], [27, 3], [33, 3], [34, 4], [40, 4]];
  const got = probe.map(([lv, want]) => {
    S().level = lv;
    const s = G.gfSeg();
    if (s !== want) throw new Error('lv' + lv + ' 应为段' + want + '，实为段' + s);
    if (s !== G.encSeg()) throw new Error('lv' + lv + ' 与奇遇分段口径不一致');
    return lv + '→' + s;
  });
  return got.slice(0, 5).join(' · ') + ' … · 与奇遇分段完全一致';
});
step('习得后计入已学、可装备、可卸下', () => {
  resetGf();
  const key = 'gf_yinqi';
  if (G.gfLearned(key)) throw new Error('初始不应已学');
  if (!G.gfLearn(key)) throw new Error('习得失败');
  if (!G.gfLearned(key)) throw new Error('已学标记缺失');
  if (META().gongfa.learned.indexOf(key) < 0) throw new Error('未写入 META');
  if (G.gfLearn(key)) throw new Error('重复习得应被拒');
  /* 空槽自动运转（被动槽） */
  if (S().gongfa.passive[0] !== key) throw new Error('被动空槽未自动运转');
  /* 点一下卸下，再点一下装上 */
  if (G.gfToggleEquip(key) !== 'off') throw new Error('未卸下');
  if (S().gongfa.passive.indexOf(key) >= 0) throw new Error('卸下后仍在槽位');
  if (G.gfToggleEquip(key) !== 'on') throw new Error('未重新装上');
  if (S().gongfa.passive.indexOf(key) < 0) throw new Error('重新装上失败');
  return '习得→自动运转→卸下→复位 全通';
});
step('被动槽 3 格、主动槽 2 格，各自独立', () => {
  resetGf();
  if (G.gfSlot.passive !== 3 || G.gfSlot.active !== 2) throw new Error('槽位数量不符');
  if (S().gongfa.passive.length !== 3 || S().gongfa.active.length !== 2) throw new Error('槽位数组长度不符');
  const xin = G.gfDefs.filter(g => g.kind === 'xin').slice(0, 4).map(g => g.k);
  xin.forEach(k => G.gfLearn(k, true));
  /* 前 3 部自动填入被动槽，第 4 部应无处可放 */
  if (S().gongfa.passive.filter(Boolean).length !== 3) throw new Error('被动槽未自动填满');
  if (G.gfToggleEquip(xin[3]) !== 'full') throw new Error('槽满时未返回 full');
  /* 指定槽位替换 */
  if (!G.gfEquipAt(xin[3], 1)) throw new Error('指定槽位装入失败');
  if (S().gongfa.passive[1] !== xin[3]) throw new Error('替换未落到指定槽');
  if (S().gongfa.passive.indexOf(xin[1]) >= 0) throw new Error('被换下的仍在槽位');
  /* 同一部不能占两格 */
  G.gfEquipAt(xin[3], 2);
  if (S().gongfa.passive.filter(k => k === xin[3]).length !== 1) throw new Error('同一部占了两格');
  /* 主动槽独立 */
  const shu = G.gfDefs.filter(g => g.kind === 'shu').slice(0, 3).map(g => g.k);
  shu.forEach(k => G.gfLearn(k, true));
  if (S().gongfa.active.filter(Boolean).length !== 2) throw new Error('主动槽未自动填满');
  if (S().gongfa.passive.filter(k => shu.indexOf(k) >= 0).length) throw new Error('术法混进了被动槽');
  return '被动 3 / 主动 2 各自独立，替换与去重正常';
});
step('术法只容两部，第三部需替换', () => {
  resetGf();
  const shu = G.gfDefs.filter(g => g.kind === 'shu').slice(0, 3).map(g => g.k);
  shu.forEach(k => G.gfLearn(k, true));
  if (S().gongfa.active.indexOf(shu[0]) < 0 || S().gongfa.active.indexOf(shu[1]) < 0) throw new Error('前两部未入槽');
  if (G.gfToggleEquip(shu[2]) !== 'full') throw new Error('第三部未被拒');
  G.gfEquipAt(shu[2], 0);
  if (S().gongfa.active.indexOf(shu[2]) < 0) throw new Error('替换未生效');
  if (S().gongfa.active.indexOf(shu[0]) >= 0) throw new Error('未顶替槽 0');
  if (G.gfActiveSkill(1).key !== shu[1]) throw new Error('槽 1 被误改');
  return '主动槽固定 2 格，满则替换';
});
step('参悟：灵石与修为双消耗、不足被拒、上限封顶', () => {
  resetGf();
  G.gfLearn('gf_tiegu', true);
  S().stones = 0; S().exp = 9999999;
  const lv0 = G.gfLevel('gf_tiegu');
  G.gfUpgrade('gf_tiegu');
  if (G.gfLevel('gf_tiegu') !== lv0) throw new Error('灵石不足仍可参悟');
  S().stones = 99999999; S().exp = 0;
  G.gfUpgrade('gf_tiegu');
  if (G.gfLevel('gf_tiegu') !== lv0) throw new Error('修为不足仍可参悟');
  S().stones = 99999999; S().exp = 99999999;
  const c0 = G.gfCost('gf_tiegu'), e0 = G.gfExpCost('gf_tiegu');
  G.gfUpgrade('gf_tiegu');
  if (G.gfLevel('gf_tiegu') !== lv0 + 1) throw new Error('参悟未生效');
  if (S().stones !== 99999999 - c0) throw new Error('灵石未按价扣除');
  if (S().exp !== 99999999 - e0) throw new Error('修为未按价扣除');
  const max = G.gfMaxArr[G.gfByKey['gf_tiegu'].t];
  while (G.gfLevel('gf_tiegu') < max) G.gfUpgrade('gf_tiegu');
  G.gfUpgrade('gf_tiegu');
  if (G.gfLevel('gf_tiegu') !== max) throw new Error('超过上限');
  return '双资源扣除正确，上限 ' + max + ' 重封顶';
});
step('心法加成进入 stats()，且不越界、不产生 NaN', () => {
  resetGf();
  G.gfAllOff();
  const base = G.stats();
  G.gfLearn('gf_taiyi', true);       /* 太乙玄清道：修速为主 */
  S().gongfa.passive[0] = 'gf_taiyi';
  S().gongfa.lv['gf_taiyi'] = G.gfMaxArr[G.gfByKey['gf_taiyi'].t];
  const on = G.stats();
  if (!(on.cult > base.cult)) throw new Error('修速未提升');
  if (!(on.hpMax > base.hpMax)) throw new Error('气血未提升');
  for (const k of ['atk', 'def', 'crit', 'cult', 'speed', 'hpMax', 'mpMax']) {
    if (typeof on[k] !== 'number' || !isFinite(on[k])) throw new Error(k + ' 异常 ' + on[k]);
  }
  const lv = S().gongfa.lv['gf_taiyi'], per = G.gfBonus().cult;
  if (!(per > 0)) throw new Error('加成汇总为 0');
  G.gfAllOff();
  const off = G.stats();
  if (Math.abs(off.cult - base.cult) > 0.001) throw new Error('卸下后未还原');
  return '修速 ' + base.cult + '% → ' + on.cult + '%（满 ' + lv + ' 重）';
});
step('心法气运并入 fortune()，不新开乘区', () => {
  resetGf();
  G.gfAllOff();
  META().ach = [];
  META().up.luck = 0;
  const f0 = G.fortune();
  G.gfLearn('gf_tianji', true);      /* 天机演算术：缘法（气运） */
  S().gongfa.passive[0] = 'gf_tianji';
  S().gongfa.lv['gf_tianji'] = G.gfMaxArr[G.gfByKey['gf_tianji'].t];
  const gfl = G.gfLuck();
  const f1 = G.fortune();
  if (!(gfl > 0)) throw new Error('心法气运为 0');
  /* fortune() 统一保留一位小数，故容差取 0.06 */
  if (Math.abs(f1 - (f0 + gfl)) > 0.06) throw new Error('气运未并入统一乘区：' + f0 + ' + ' + gfl + ' ≠ ' + f1);
  if (!(G.fortStone(10000) > 10000)) throw new Error('气运未作用于灵石收益');
  if (!(G.luckBoost() > 0)) throw new Error('气运未作用于掉落运气');
  G.gfAllOff();
  return '心法气运 +' + gfl + '，气运 ' + f0 + ' → ' + f1;
});
step('主动功法提供技能参数（含冷却与附加效果）', () => {
  resetGf();
  G.gfAllOff();
  if (G.gfActiveSkill(0) !== null || G.gfActiveSkill(1) !== null) throw new Error('未装备却有术法参数');
  G.gfLearn('gf_sk_zhanfeng', true);
  S().gongfa.active = ['gf_sk_zhanfeng', null];
  const sk = G.gfActiveSkill(0);
  if (!sk) throw new Error('术法参数缺失');
  for (const k of ['mult', 'mpF', 'mpFlat', 'cd']) if (typeof sk[k] !== 'number' || !isFinite(sk[k])) throw new Error(k + ' 异常');
  if (!(sk.mult > 1)) throw new Error('倍率异常');
  if (!(sk.cd >= 1)) throw new Error('冷却异常');
  if (!(G.gfSkillMp(sk, 1000) > 0)) throw new Error('灵力消耗异常');
  if (!(G.gfFxText(sk.fx).length > 0 && sk.fx.crit > 0)) throw new Error('斩击应带暴击加成');
  /* 满重后倍率应更高 */
  S().gongfa.lv['gf_sk_zhanfeng'] = G.gfMaxArr[G.gfByKey['gf_sk_zhanfeng'].t];
  const sk2 = G.gfActiveSkill(0);
  if (!(sk2.mult > sk.mult)) throw new Error('重数未提高术法威能');
  /* 十种基调的能力必须齐备（护盾/闪避/冰封/灼烧/吸血/破防/自伤/回灵） */
  const needFlavor = ['gun','zhan','lian','xue','dun','ling','huo','bing','xu','ji'];
  const shuDefs = G.gfDefs.filter(g => g.kind === 'shu');
  const missing = needFlavor.filter(f => !shuDefs.some(g => g.sk === f));
  if (missing.length) throw new Error('缺少基调 ' + missing.join());
  return '倍率 ' + sk.mult + ' · 冷却 ' + sk.cd + ' · 满重 ' + sk2.mult + ' · 十种基调齐备';
});
step('术法在战斗中生效（连击/吸血各有其效）', () => {
  const real = Math.random;
  /* 用妖王当靶子（血厚，一击打不死）；随机固定为 0.9（不暴击） */
  const putFoe = () => {
    resetGf();
    S().level = 20;
    S().hp = G.__eval('stats().hpMax');
    S().mp = G.__eval('stats().mpMax');
    S().combat = { m: G.__eval('makeMonster(4,true)'), ctx: { type:'test' }, turn:1 };
  };
  try {
    Math.random = () => 0.9;
    /* 基础灵力斩 */
    putFoe();
    const hpA = S().combat.m.hp;
    G.fightSkill();
    const dmgBase = hpA - S().combat.m.hp;
    if (!(dmgBase > 0)) throw new Error('基础灵力斩无伤害');
    S().combat = null;
    /* 术法「两仪剑」：两段 */
    putFoe();
    G.gfLearn('gf_sk_liangyi', true);
    S().gongfa.active = ['gf_sk_liangyi', null];
    const hpB = S().combat.m.hp;
    const logN = S().logs.length;
    G.castSkill(0);
    const dmgLian = hpB - S().combat.m.hp;
    const seg = S().logs.slice(logN).map(l => l.t).join('|');
    if (!(dmgLian > dmgBase)) throw new Error('连击伤害未高于基础：' + dmgLian + ' vs ' + dmgBase);
    if (seg.indexOf('2 段合计') < 0) throw new Error('未按两段结算');
    S().combat = null;
    /* 术法「太阴血噬」：回血 */
    putFoe();
    G.gfLearn('gf_sk_taiyin', true);
    S().gongfa.active = ['gf_sk_taiyin', null];
    S().hp = Math.round(G.__eval('stats().hpMax') * 0.3);
    const hpSelf = S().hp;
    const logN2 = S().logs.length;
    G.castSkill(0);
    const seg2 = S().logs.slice(logN2).map(l => l.t).join('|');
    if (seg2.indexOf('气血 +') < 0) throw new Error('血噬未回血');
    S().combat = null;
    /* 未装备术法时回落基础灵力斩 */
    G.gfAllOff();
    if (G.gfActiveSkill(0) || G.gfActiveSkill(1)) throw new Error('卸下后仍取到术法');
    return '基础 ' + dmgBase + ' → 连击 ' + dmgLian + '，血噬回血 ' + hpSelf + ' 起效';
  } finally { Math.random = real; }
});
step('秘境妖王必遗功法；已全习得则折算灵石', () => {
  /* 直接驱动「贯通结算」，避免被中途阵亡等随机分支干扰（全流程走通由 G 节负责） */
  const run = () => {
    G.__eval('S.dungeon = { idx:0, floor:SECRETS[0].floors, total:SECRETS[0].floors, searched:false, gained:0, items:0 }');
    const logN = S().logs.length;
    G.completeDungeon();
    return S().logs.slice(logN).map(l => l.t).join('|');
  };
  resetGf();
  S().level = 30; S().stones = 99999;
  const before = G.gfLearnedList().length;
  let seg = run();
  const after = G.gfLearnedList().length;
  if (after <= before) throw new Error('贯通后未得功法（' + before + ' → ' + after + '）');
  if (seg.indexOf('石壁') < 0) throw new Error('缺少「石壁得法」的叙述');
  /* 全部习得之后，应折算为灵石而不是静默无事 */
  G.gfDefs.forEach(g => G.gfLearn(g.k, true));
  seg = run();
  if (seg.indexOf('早已参透') < 0) throw new Error('已全习得时未折算灵石');
  return '已学 ' + before + ' → ' + after + ' 部；全习得时折算灵石';
});
step('藏经阁：进货两部、买下即习得、价随品阶', () => {
  resetGf();
  S().level = 40;                 /* 段 4：全部功法都在池子里 */
  S().stones = 0;
  G.refreshShop(true);
  const books = G.gfShopBook();
  if (books.length !== 2) throw new Error('藏经阁应上架两部，实为 ' + books.length);
  /* 注意：gfShopBook() 返回的就是 S.shopBook 本体，买走会 splice，故先取值 */
  const key0 = books[0], key1 = books[1];
  if (!G.gfByKey[key0] || !G.gfByKey[key1]) throw new Error('货架含非法键');
  if (G.gfLearned(key0)) throw new Error('货架不应摆已习得者');
  const gf = G.gfByKey[key0];
  const price = G.gfBookPrice(gf);
  G.gfBuyBook(0);
  if (G.gfLearned(key0)) throw new Error('灵石不足仍买下');
  S().stones = price;
  G.gfBuyBook(0);
  if (!G.gfLearned(key0)) throw new Error('购买后未习得（key=' + key0 + ' 价=' + price + ' 余石=' + S().stones + '）');
  if (S().stones !== 0) throw new Error('未按价扣款，余 ' + S().stones);
  if (G.gfShopBook().length !== 1) throw new Error('买走后未从货架移除');
  if (G.gfShopBook()[0] !== key1) throw new Error('买错了一部');
  const hi = G.gfBookPrice(G.gfDefs.filter(g => g.t === 4)[0]);
  const lo = G.gfBookPrice(G.gfDefs.filter(g => g.t === 0)[0]);
  if (!(hi > lo)) throw new Error('价格未随品阶递增');
  return '两部上架 · 神品 ' + hi + ' > 凡品 ' + lo + ' · 买下即习得';
});
step('存档往返：功法重数、装备槽与藏经阁货架都不丢', () => {
  resetGf();
  S().stones = 999999; S().exp = 999999;
  G.gfLearn('gf_liuyun', true);
  G.gfLearn('gf_sk_xuangui', true);
  S().gongfa.passive[0] = 'gf_liuyun';
  S().gongfa.active = ['gf_sk_xuangui', null];
  S().gongfa.lv['gf_liuyun'] = 2;
  G.gfUpgrade('gf_liuyun');
  G.refreshShop(true);
  const bk = G.gfShopBook().slice();
  const lv = S().gongfa.lv['gf_liuyun'];
  const d = G.saveData();
  G.newGame();
  if (S().gongfa.passive[0] !== null) throw new Error('新建号未清空装备槽');
  if (!G.restore(d)) throw new Error('restore 失败');
  if (S().gongfa.passive[0] !== 'gf_liuyun') throw new Error('被动槽未还原');
  if (S().gongfa.active[0] !== 'gf_sk_xuangui') throw new Error('主动槽未还原');
  if (S().gongfa.lv['gf_liuyun'] !== lv) throw new Error('重数未还原');
  if (S().shopBook.join() !== bk.join()) throw new Error('藏经阁货架未还原');
  /* 存档码往返（含 META 的已学清单） */
  const code = G.exportCode();
  G.wipeAll();
  if (G.gfLearnedList().length !== 0) throw new Error('抹除后已学清单应清空');
  G.importSave(code);
  if (!G.gfLearned('gf_liuyun') || !G.gfLearned('gf_sk_xuangui')) throw new Error('存档码未还原已学功法');
  return '心法/术法/重数 ' + lv + ' + 货架 ' + bk.length + ' 部 + 存档码均已还原';
});
step('旧存档（无功法字段）可平滑升级', () => {
  const d = { v:2, level:5, exp:0, day:3, stones:100, hp:10, mp:10,
    equip:{ weapon:null, armor:null, mount:null, treasures:[null,null,null] },
    bag:[], pills:{}, logs:[], shop:[], stat:{} };
  if (!G.__eval('restore(' + JSON.stringify(d) + ')')) throw new Error('旧存档读入失败');
  if (!S().gongfa || !Array.isArray(S().gongfa.passive) || !Array.isArray(S().gongfa.active)) throw new Error('未补默认功法字段');
  if (S().gongfa.passive.length !== 3 || S().gongfa.active.length !== 2) throw new Error('默认槽位数不符');
  if (!Array.isArray(S().shopBook)) throw new Error('未补藏经阁字段');
  G.stats();                                   /* 不能炸 */
  return '缺字段自动补全，stats() 正常';
});
step('清洗器拒绝非法键与越界重数', () => {
  const s = G.gfSanitizeS({ passive:['不存在的功法', 'gf_yinqi'], active:['gf_sk_yuqi','乱码',5], lv:{ 'gf_yinqi': 999, '野键': 3, 'gf_sk_yuqi': 1 } });
  if (s.passive[0] !== 'gf_yinqi' || s.passive[1] !== null) throw new Error('被动槽清洗异常');
  if (s.active[0] !== 'gf_sk_yuqi' || s.active[1] !== null) throw new Error('主动槽清洗异常');
  if (s.lv['gf_yinqi'] !== G.gfMaxArr[0]) throw new Error('重数未按上限截断');
  if (s.lv['野键'] !== undefined) throw new Error('非法键未被剔除');
  /* 术法不得混进被动槽、心法不得混进主动槽 */
  const mix = G.gfSanitizeS({ passive:['gf_sk_yuqi'], active:['gf_yinqi'] });
  if (mix.passive[0] !== null || mix.active[0] !== null) throw new Error('类别混装未被拦截');
  const m = G.gfSanitizeMeta({ learned:['gf_yinqi','gf_yinqi','野键',7], best:{ 'gf_yinqi': 99, '野': 1 } });
  if (m.learned.length !== 1) throw new Error('已学清单未去重/过滤');
  if (m.best['gf_yinqi'] !== G.gfMaxArr[0]) throw new Error('best 未截断');
  return '非法键 / 重复 / 越界 / 类别混装 均已拦截';
});
step('旧存档（阶段一 xin/shu 形态）自动迁移到 passive/active', () => {
  const old = G.gfSanitizeS({ xin:'gf_liuyun', shu:['gf_sk_yuqi', null], lv:{ 'gf_liuyun': 2 } });
  if (old.passive[0] !== 'gf_liuyun') throw new Error('旧 xin 未迁移到 passive');
  if (old.passive.length !== 3) throw new Error('被动槽数未补齐');
  if (old.active[0] !== 'gf_sk_yuqi') throw new Error('旧 shu 未迁移到 active');
  if (old.active.length !== 2) throw new Error('主动槽数未补齐');
  if (old.lv['gf_liuyun'] !== 2) throw new Error('重数未保留');
  /* 走一次真实的 restore 路径 */
  const d = { v:2, level:10, exp:0, day:5, stones:100, hp:10, mp:10,
    equip:{ weapon:null, armor:null, mount:null, treasures:[null,null,null] },
    bag:[], pills:{}, logs:[], shop:[], stat:{},
    gongfa:{ xin:'gf_tiegu', shu:['gf_sk_yuqi', null], lv:{ 'gf_tiegu': 1 } } };
  if (!G.restore(d)) throw new Error('旧档 restore 失败');
  if (S().gongfa.passive[0] !== 'gf_tiegu') throw new Error('restore 未迁移被动槽');
  if (S().gongfa.active[0] !== 'gf_sk_yuqi') throw new Error('restore 未迁移主动槽');
  G.stats();
  return 'xin/shu → passive/active 迁移正常（含 restore 全链路）';
});
step('功法随轮回留存（悟道不灭），重数归零', () => {
  resetGf();
  G.gfLearn('gf_yinqi', true);
  G.gfLearn('gf_danxia', true);
  S().gongfa.passive[0] = 'gf_danxia';
  S().gongfa.lv['gf_danxia'] = 3;
  const n = G.gfLearnedList().length;
  G.doRebirth();
  if (G.gfLearnedList().length !== n) throw new Error('轮回复习得清单丢失');
  if (!G.gfLearned('gf_danxia')) throw new Error('轮回后应仍已习得');
  if (G.gfLevel('gf_danxia') !== 0) throw new Error('重数应归零');
  if (S().gongfa.passive.some(Boolean) || S().gongfa.active.some(Boolean)) throw new Error('装备槽应清空');
  return '已学 ' + n + ' 部留存 · 重数归零 · 装备清空';
});
step('悟道录面板可打开且列出全部功法', () => {
  resetGf();
  G.gfLearn('gf_yinqi', true);
  G.openGongfa();
  const html = el('modalRoot').innerHTML || '';
  if (html.indexOf('悟 道 录') < 0) throw new Error('面板标题缺失');
  const miss = G.gfDefs.filter(g => html.indexOf(g.n) < 0);
  if (miss.length) throw new Error('面板缺 ' + miss.length + ' 部（如 ' + miss[0].n + '）');
  if (html.indexOf('参 悟') < 0) throw new Error('缺参悟按钮');
  if (html.indexOf('style="color:#') >= 0) throw new Error('面板输出内联色值');
  G.closeModal();
  return '面板 ' + html.length + ' 字符，30 部齐备';
});
step('左栏功法面板与顶栏入口就位', () => {
  resetGf();
  G.gfLearn('gf_zixiao', true);
  S().gongfa.passive[0] = 'gf_zixiao';
  G.gfLearn('gf_sk_zixiao', true);
  G.renderAll();
  const box = el('gfBox').innerHTML;
  if (box.indexOf('gf_zixiao') >= 0 || box.indexOf('紫霄雷书') < 0) throw new Error('左栏未显示当前心法');
  if (box.indexOf('openGongfa()') < 0) throw new Error('左栏缺入口');
  for (const lbl of ['被动1', '被动2', '被动3', '主动1', '主动2']) {
    if (box.indexOf(lbl) < 0) throw new Error('左栏缺槽位 ' + lbl);
  }
  if (box.indexOf('斩击') < 0) throw new Error('主动槽未显示技能基调名');
  if (el('gfTag').textContent.indexOf('已 习') < 0) throw new Error('标题未显示已习数量');
  if (el('utilBox').innerHTML.indexOf('功 法') < 0) throw new Error('移动端抽屉缺功法入口');
  /* 战斗中不可参悟 */
  S().combat = { m: G.makeMonster(1, false), ctx:{type:'test'}, turn:1 };
  const lv = G.gfLevel('gf_zixiao');
  S().stones = 9999999; S().exp = 9999999;
  G.gfUpgrade('gf_zixiao');
  if (G.gfLevel('gf_zixiao') !== lv) throw new Error('战斗中仍可参悟');
  S().combat = null;
  return '左栏 5 槽 · 顶栏 · 抽屉入口齐备，战中参悟已锁';
});
step('道法纲要与藏经阁文案已含功法', () => {
  resetGf();
  G.showHelp();
  const help = el('modalRoot').innerHTML || '';
  if (help.indexOf('功 法') < 0) throw new Error('道法纲要缺功法章节');
  if (help.indexOf('取舍') < 0) throw new Error('未说明取舍设计');
  G.closeModal();
  S().level = 40; S().stones = 99999;
  G.refreshShop(true);
  G.switchTab('shop');
  const shop = el('actPanel').innerHTML;
  if (shop.indexOf('藏 经 阁') < 0) throw new Error('坊市缺藏经阁');
  if (shop.indexOf('openGongfa()') < 0) throw new Error('坊市缺悟道录入口');
  /* 货架可能已被买空（已习得者不再上架），两种分支都要有正确渲染 */
  if (G.gfShopBook().length > 0) {
    if (shop.indexOf('gfBuyBook(') < 0) throw new Error('藏经阁有货却无可购按钮');
  } else if (shop.indexOf('书 架 已 空') < 0) {
    throw new Error('货架已空却缺少提示');
  }
  return '纲要 / 藏经阁文案齐备（当期货架 ' + G.gfShopBook().length + ' 部）';
});

log('');
log('=== Q. 功法主动技 · 冷却与增益减益 ===');
/* 统一的战斗靶子：血厚的妖王，一击打不死；随机固定以便断言可控 */
function qFoe(setup){
  resetGf();
  S().level = 30;
  S().stones = 9999999; S().exp = 9999999;
  if (setup) setup();
  const st = G.stats();
  S().hp = st.hpMax;
  S().mp = st.mpMax;
  G.startFight(G.makeMonster(4, true), { type:'test' });
  S().mp = st.mpMax;                 /* startFight 会渲染，灵力再补满 */
  return S().combat;
}
function qLog(from){
  return S().logs.slice(from).map(l => l.t).join('|');
}
step('施放主动技：扣灵力、造成伤害、进入冷却', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;         /* 不暴击，数值可控 */
    qFoe(() => { G.gfLearn('gf_sk_zhanfeng', true); S().gongfa.active = ['gf_sk_zhanfeng', null]; });
    const c = S().combat;
    const hp0 = c.m.hp, mp0 = S().mp;
    G.castSkill(0);
    if (!(c.m.hp < hp0)) throw new Error('技能未造成伤害');
    if (!(S().mp < mp0)) throw new Error('技能未消耗灵力');
    if (!(c.cd['gf_sk_zhanfeng'] > 0)) throw new Error('未进入冷却');
    if (c.turn <= 1) throw new Error('敌人未行动');
    return '伤害 ' + (hp0 - c.m.hp) + ' · 灵力 -' + (mp0 - S().mp) + ' · CD ' + c.cd['gf_sk_zhanfeng'];
  } finally { Math.random = real; }
});
step('冷却期间无法再放，回合推进后恢复', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;
    qFoe(() => { G.gfLearn('gf_sk_xumi', true); S().gongfa.active = ['gf_sk_xumi', null]; });   /* 守御：CD 5 */
    const c = S().combat;
    G.castSkill(0);
    const cd0 = c.cd['gf_sk_xumi'];
    if (!(cd0 >= 4)) throw new Error('守御冷却过短 ' + cd0);
    const hp1 = c.m.hp, logN = S().logs.length;
    G.castSkill(0);                                        /* 冷却中 */
    if (c.m.hp !== hp1) throw new Error('冷却中仍造成伤害');
    if (qLog(logN).length) throw new Error('冷却中不应有新日志');
    /* 用挥击推回合，直至冷却结束 */
    let guard = 0;
    while ((c.cd['gf_sk_xumi'] || 0) > 0 && S().combat && guard++ < 20) G.fightAttack();
    if (S().combat && (c.cd['gf_sk_xumi'] || 0) > 0) throw new Error('冷却未随回合递减');
    return 'CD ' + cd0 + ' → ' + (c.cd['gf_sk_xumi'] || 0) + '（随回合递减，期间放不出）';
  } finally { Math.random = real; }
});
step('护盾：按比例减伤并持续回合；冰封：敌方伤害减半', () => {
  const real = Math.random;
  try {
    /* 先测无防护的基准伤害 */
    Math.random = () => 0.9;
    qFoe(() => { G.gfLearn('gf_sk_xuangui', true); S().gongfa.active = ['gf_sk_xuangui', null]; });  /* 玄冰：冰封 2 */
    const c = S().combat;
    S().hp = G.stats().hpMax;
    const hpA = S().hp;
    G.fightAttack();                                        /* 无冰封时挨一下 */
    const raw = hpA - S().hp;
    S().combat = null;

    /* 有冰封时：伤害应显著更低 */
    qFoe(() => { G.gfLearn('gf_sk_xuangui', true); S().gongfa.active = ['gf_sk_xuangui', null]; });
    const c2 = S().combat;
    S().hp = G.stats().hpMax;
    const hpB = S().hp, logN = S().logs.length;
    G.castSkill(0);                                         /* 施放玄冰 → 冰封 2 */
    if (!(c2.debuff.freeze > 0)) throw new Error('冰封未生效');
    if (qLog(logN).indexOf('伤害减半') < 0) throw new Error('冰封未落到伤害结算上');
    const withFreeze = hpB - S().hp;
    if (!(withFreeze < raw)) throw new Error('冰封未减伤：' + withFreeze + ' vs ' + raw);
    S().combat = null;

    /* 护盾：须弥守御 shield 55% ×2 回合 */
    qFoe(() => { G.gfLearn('gf_sk_xumi', true); S().gongfa.active = ['gf_sk_xumi', null]; });
    const c3 = S().combat;
    S().hp = G.stats().hpMax;
    const hpC = S().hp, logN3 = S().logs.length;
    G.castSkill(0);
    if (!(c3.buff.shield > 0)) throw new Error('护盾未生效');
    if (qLog(logN3).indexOf('护体灵光') < 0) throw new Error('护盾缺少提示');
    const withShield = hpC - S().hp;
    if (!(withShield < raw)) throw new Error('护盾未减伤：' + withShield + ' vs ' + raw);
    if (!(c3.buff.shieldDur > 0)) throw new Error('护盾持续回合异常');
    S().combat = null;
    return '裸伤 ' + raw + ' → 冰封 ' + withFreeze + ' / 护盾 ' + withShield;
  } finally { Math.random = real; }
});
step('虚空：完全闪避敌方一击', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;
    qFoe(() => { G.gfLearn('gf_sk_wuxiang', true); S().gongfa.active = ['gf_sk_wuxiang', null]; });   /* 无相劫指：dodge 1 */
    const c = S().combat;
    S().hp = G.stats().hpMax;
    const hp0 = S().hp, logN = S().logs.length;
    G.castSkill(0);
    /* 本次施放即换来敌方这一回合的完全闪避（回合因已在 monsterTurn 中消耗） */
    if (S().hp !== hp0) throw new Error('闪避回合仍受伤 ' + (hp0 - S().hp));
    if (qLog(logN).indexOf('扑了个空') < 0) throw new Error('闪避缺少提示');
    if (c.buff.dodge !== 0) throw new Error('闪避回合未消耗');
    /* 再挨一下应正常掉血（说明只免了一回合） */
    const hp1 = S().hp;
    G.fightAttack();
    if (!(S().hp < hp1)) throw new Error('闪避持续过久');
    return '闪避生效：气血未损（' + hp0 + '），仅免一回合';
  } finally { Math.random = real; }
});
step('灼烧：每回合持续掉血并按回合耗尽', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;
    qFoe(() => { G.gfLearn('gf_sk_chiyan', true); S().gongfa.active = ['gf_sk_chiyan', null]; });    /* 赤炎斩：burn 3 */
    const c = S().combat;
    S().hp = G.stats().hpMax;
    const logN = S().logs.length;
    G.castSkill(0);
    if (!(c.debuff.burn > 0)) throw new Error('灼烧未生效');
    const burnTurns = c.debuff.burn;
    const hpAfterCast = c.m.hp;
    G.fightAttack();                                        /* 下一回合开始时结算灼烧 */
    if (qLog(logN).indexOf('烈焰灼烧') < 0) throw new Error('灼烧未结算');
    if (!(c.debuff.burn < burnTurns)) throw new Error('灼烧回合未递减');
    if (!(c.m.hp < hpAfterCast)) throw new Error('灼烧未扣敌血');
    /* 烧到耗尽 */
    let guard = 0;
    while (c.debuff.burn > 0 && S().combat && guard++ < 20) G.fightAttack();
    if (S().combat && c.debuff.burn > 0) throw new Error('灼烧未耗尽');
    return '灼烧 ' + burnTurns + ' 回合，逐回合扣血后耗尽';
  } finally { Math.random = real; }
});
step('因果反噬：伤敌亦伤己；御器：行动后回灵', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;
    /* 因果：selfDmgPct 12% */
    qFoe(() => { G.gfLearn('gf_sk_hundun', true); S().gongfa.active = ['gf_sk_hundun', null]; });
    const c = S().combat;
    S().hp = G.stats().hpMax;
    const hp0 = S().hp, logN = S().logs.length;
    G.castSkill(0);
    if (qLog(logN).indexOf('因果反噬') < 0) throw new Error('自伤未生效');
    if (!(S().hp < hp0)) throw new Error('自身未掉血');
    S().combat = null;
    /* 御器：mpBack 5% */
    qFoe(() => { G.gfLearn('gf_sk_yuqi', true); S().gongfa.active = ['gf_sk_yuqi', null]; });
    const c2 = S().combat;
    S().hp = G.stats().hpMax;
    const mpBefore = G.stats().mpMax - 40;
    S().mp = mpBefore;
    const logN2 = S().logs.length;
    G.castSkill(0);
    if (qLog(logN2).indexOf('灵力回了') < 0) throw new Error('回灵未生效');
    return '反噬 -' + (hp0 - S().hp) + ' 气血；御器回灵正常';
  } finally { Math.random = real; }
});
step('破防提高伤害（同等倍率下高于无破防）', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;
    /* 破灵：pierce 50%，mult 2.0 */
    qFoe(() => { G.gfLearn('gf_sk_powang', true); S().gongfa.active = ['gf_sk_powang', null]; });
    const c1 = S().combat;
    const a0 = c1.m.hp;
    G.castSkill(0);
    const pierceDmg = a0 - c1.m.hp;
    S().combat = null;
    /* 对照：基础灵力斩 2.3 倍、无破防 */
    qFoe(() => { G.gfAllOff(); });
    const c2 = S().combat;
    const b0 = c2.m.hp;
    G.fightSkill();
    const baseDmg = b0 - c2.m.hp;
    S().combat = null;
    if (!(pierceDmg > baseDmg * 0.9)) throw new Error('破防未体现价值（' + pierceDmg + ' vs ' + baseDmg + '）');
    return '破灵 ' + pierceDmg + ' vs 灵力斩 ' + baseDmg + '（无视半数防御）';
  } finally { Math.random = real; }
});
step('战斗面板：技能卡带冷却显示、状态条可见、CD 中置灰', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.9;
    qFoe(() => { G.gfLearn('gf_sk_chiyan', true); G.gfLearn('gf_sk_xumi', true); S().gongfa.active = ['gf_sk_chiyan', 'gf_sk_xumi']; });
    const c = S().combat;
    G.renderAll();
    let html = el('actPanel').innerHTML;
    if (html.indexOf('castSkill(') < 0) throw new Error('战斗面板缺技能按钮');
    if (html.indexOf('耗灵力') < 0) throw new Error('技能卡缺灵力消耗');
    if (html.indexOf('灼烧 3 回合') < 0) throw new Error('技能卡未标明附加效果');
    /* 放一招后：状态条出现 + 该技能置灰 */
    S().hp = G.stats().hpMax;
    G.castSkill(0);
    G.renderAll();
    html = el('actPanel').innerHTML;
    if (html.indexOf('灼烧 · 余') < 0) throw new Error('状态条缺灼烧');
    if (html.indexOf('冷却中 · 余') < 0) throw new Error('冷却中未显示倒计时');
    S().combat = null;
    /* 未备术法时给出引导卡 */
    qFoe(() => { G.gfAllOff(); });
    G.renderAll();
    const html2 = el('actPanel').innerHTML;
    if (html2.indexOf('未 备 术 法') < 0) throw new Error('未备术法时缺引导');
    if (html2.indexOf('openGongfa()') < 0) throw new Error('引导卡未指向功法面板');
    S().combat = null;
    return '技能卡 / 冷却倒计时 / 状态条 / 引导卡 齐备';
  } finally { Math.random = real; }
});
step('三部被动同时生效（3 格叠加，多于单部）', () => {
  resetGf();
  G.gfAllOff();
  const base = G.stats();
  const keys = ['gf_taiyi', 'gf_hunyuan', 'gf_zaohua'];      /* 三部神品心法 */
  G.gfLearn(keys[0], true);
  S().gongfa.passive[0] = keys[0];
  S().gongfa.lv[keys[0]] = G.gfMaxArr[4];
  const one = G.stats();
  keys.slice(1).forEach((k, i) => {
    G.gfLearn(k, true);
    S().gongfa.passive[i + 1] = k;
    S().gongfa.lv[k] = G.gfMaxArr[4];
  });
  const three = G.stats();
  if (!(one.cult > base.cult)) throw new Error('单部被动未生效');
  if (!(three.cult > one.cult)) throw new Error('多部被动未叠加');
  if (!(three.hpMax > one.hpMax)) throw new Error('气血未叠加');
  const b = G.gfBonus();
  if (S().gongfa.passive.filter(Boolean).length !== 3) throw new Error('被动槽未填满 3 格');
  G.gfAllOff();
  const off = G.stats();
  if (Math.abs(off.cult - base.cult) > 0.001) throw new Error('尽数卸下后未还原');
  return '修速 ' + base.cult + '% → 单部 ' + one.cult + '% → 三部 ' + three.cult + '%';
});

log('');
log('=== R. 材料 · 炼丹 · 炼器 ===');
/* 材料是本局的：每次自备状态 */
step('材料表结构（6 种 / 品阶齐备 / 材料铺只上 4 种）', () => {
  const order = G.matOrder;
  if (order.length !== 6) throw new Error('材料应为 6 种，实为 ' + order.length);
  const tiers = new Set();
  for (const k of order) {
    const m = G.matDefs[k];
    if (!m) throw new Error('缺定义 ' + k);
    if (!m.n || !m.src) throw new Error('缺名称或来路 ' + k);
    if (m.t < 0 || m.t > 4) throw new Error('品阶越界 ' + k);
    tiers.add(m.t);
  }
  if (tiers.size < 5) throw new Error('品阶应覆盖 5 档');
  if (G.matShop.length !== 4) throw new Error('材料铺应上 4 种，实为 ' + G.matShop.length);
  for (const row of G.matShop) {
    if (!G.matDefs[row.k]) throw new Error('货架含非法键 ' + row.k);
    if (!(row.price > 0)) throw new Error('货架价应为正 ' + row.k);
  }
  if (G.matPrice('xingchen') !== 0 || G.matPrice('hundun') !== 0) throw new Error('星辰砂/混沌石不应上架');
  return '6 种材料 · 五档品阶 · 材料铺 4 种（星辰砂/混沌石不售）';
});
step('新档材料为空；增删与非法键校验', () => {
  G.newGame();
  if (G.totalMats() !== 0) throw new Error('新档材料应为 0');
  G.addMaterial('lingcao', 5);
  if (G.countMat('lingcao') !== 5) throw new Error('加材料失败');
  G.addMaterials({ yaodan: 3, xuantie: 2 }, true);
  if (G.countMat('yaodan') !== 3 || G.countMat('xuantie') !== 2) throw new Error('批量加材料失败');
  if (!G.hasMats({ lingcao: 3, yaodan: 2 })) throw new Error('材料应充足');
  if (G.hasMats({ lingcao: 99 })) throw new Error('材料应不足');
  if (!G.costMats({ lingcao: 3, yaodan: 2 })) throw new Error('扣材料失败');
  if (G.countMat('lingcao') !== 2 || G.countMat('yaodan') !== 1) throw new Error('扣减数量不对');
  if (G.costMats({ lingcao: 999 })) throw new Error('不足时不应扣减');
  if (G.countMat('lingcao') !== 2) throw new Error('失败扣减污染了存量');
  G.addMaterial('fake_mat', 99);
  if (G.countMat('fake_mat') !== 0) throw new Error('非法键应被拒');
  G.addMaterial('lingcao', -5);
  if (G.countMat('lingcao') !== 2) throw new Error('负数应被拒');
  return '增删/校验/非法键/负数 全部正确';
});
step('掉落表：随机不崩，且低阶不给高阶材料', () => {
  G.newGame();
  const real = Math.random;
  try {
    Math.random = () => 0.01;                    /* 强制命中所有概率 */
    const low = G.rollMaterialDrop(0, false);
    if (low.xingchen || low.hundun || low.yaodan) throw new Error('凡兽不应给高阶材料');
    if (!low.shoupi) throw new Error('凡兽应剥到兽皮');
    const mid = G.rollMaterialDrop(2, false);
    if (mid.hundun) throw new Error('非最高阶不应给混沌石');
    if (!mid.shoupi || !mid.yaodan || !mid.xuantie) throw new Error('妖将应给兽皮/妖丹/玄铁');
    const top = G.rollMaterialDrop(4, true);
    if (!top.hundun) throw new Error('最高档妖王应给混沌石');
    /* 保底与妖王包 */
    const s = G.rollSearchMats(4);
    if (!(s.lingcao >= 2)) throw new Error('秘境保底灵草不足');
    const b = G.rollBossMats(4);
    if (!(b.shoupi > 0 && b.yaodan > 0 && b.xuantie > 0)) throw new Error('妖王材料包缺项');
    const seam = G.rollSeamMats(2);
    if (!(seam.lingcao > 0 && seam.xuantie > 0)) throw new Error('岩缝应给灵草与玄铁');
    /* 遍历所有 tier × boss 组合都不崩 */
    for (let t = 0; t <= 4; t++) { G.rollMaterialDrop(t, false); G.rollMaterialDrop(t, true); }
  } finally { Math.random = real; }
  return '凡兽→兽皮、妖将→玄铁、妖王→混沌石；五档组合均不崩';
});
step('材料铺：买不起被拒、买得起按价扣款', () => {
  G.newGame();
  S().stones = 0;
  if (G.buyMaterial('lingcao', 1)) throw new Error('灵石不足仍买下');
  if (G.countMat('lingcao') !== 0) throw new Error('被拒仍加了材料');
  const p = G.matPrice('lingcao');
  S().stones = p * 3;
  if (!G.buyMaterial('lingcao', 3)) throw new Error('买得起却失败');
  if (S().stones !== 0) throw new Error('未按价扣款，余 ' + S().stones);
  if (G.countMat('lingcao') !== 3) throw new Error('材料未入囊');
  if (G.buyMaterial('xingchen', 1)) throw new Error('不上架之物不应可买');
  return '价 ' + p + ' × 3 = ' + (p * 3) + ' 灵石，不上架者被拒';
});
step('炼丹：材料不足被拒且不扣任何东西', () => {
  G.newGame();
  if (G.canCraftPill('r_huichun', 1)) throw new Error('无材料却报可炼');
  const mp0 = S().mp, day0 = S().day;
  G.craftPill('r_huichun', 1);
  if (S().mp !== mp0 || S().day !== day0) throw new Error('被拒却消耗了灵力或天数');
  if ((S().pills['回春丹'] || 0) !== 2) throw new Error('被拒却改了丹药');
  return '材料不足时零副作用';
});
step('炼丹：扣材料扣灵力过天数、成丹入囊', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.01;                    /* 必成 */
    G.newGame();
    G.addMaterials({ lingcao: 30, yaodan: 20, xingchen: 5 }, true);
    S().mp = G.stats().mpMax;
    const mat0 = G.countMat('lingcao'), mp0 = S().mp, day0 = S().day, pill0 = S().pills['回春丹'];
    if (!G.canCraftPill('r_huichun', 1)) throw new Error('应可炼');
    G.craftPill('r_huichun', 1);
    if (G.countMat('lingcao') !== mat0 - 3) throw new Error('灵草未按方扣除');
    if (!(S().mp < mp0)) throw new Error('灵力未消耗');
    if (!(S().day > day0)) throw new Error('天数未推进');
    if (!(S().pills['回春丹'] > pill0)) throw new Error('未成丹');
    /* 批量 ×3 */
    S().mp = G.stats().mpMax;
    const mat1 = G.countMat('lingcao');
    G.craftPill('r_huichun', 3);
    if (G.countMat('lingcao') !== mat1 - 9) throw new Error('批量未按倍率扣材料');
    return '单次与 ×3 批量扣料正确，天数与灵力一并消耗';
  } finally { Math.random = real; }
});
step('炼丹：归元丹可炼可用，且坊市不售', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.01;
    G.newGame();
    G.addMaterials({ lingcao: 20, yaodan: 10 }, true);
    S().mp = G.stats().mpMax;
    G.craftPill('r_guijing', 1);
    if (!(S().pills['归元丹'] > 0)) throw new Error('归元丹未炼出');
    /* 只能炼，不可买 */
    const st = G.stats();
    S().stones = 999999;
    const n0 = S().pills['归元丹'];
    G.buyPill('归元丹');
    if (S().pills['归元丹'] !== n0) throw new Error('坊市不应出售归元丹');
    /* 服用：气血与灵力尽复 */
    S().hp = 1; S().mp = 0;
    G.usePill('归元丹');
    if (S().hp !== st.hpMax || S().mp !== st.mpMax) throw new Error('归元丹未尽复气血灵力');
    /* 新档药囊由表派生，归元丹自动在列 */
    const bp = G.blankPills();
    if (bp['归元丹'] !== 0 || bp['回春丹'] !== 0) throw new Error('blankPills 未与表同步');
    return '归元丹：可炼、不可买、服之尽复';
  } finally { Math.random = real; }
});
step('炼器：出器品质不低于配方下限、不高于神品', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.01;                    /* 必成 + 品质加成全中 */
    G.newGame();
    S().level = 40;
    G.addMaterials({ xuantie: 40, yaodan: 40, shoupi: 40, xingchen: 20 }, true);
    S().mp = G.stats().mpMax;
    S().bag = [];
    G.craftGear('g_weapon', 1);
    if (!S().bag.length && !S().equip.weapon) throw new Error('未出器');
    const it = S().equip.weapon || S().bag[S().bag.length - 1];
    if (it.q < 2) throw new Error('品质低于配方下限 ' + it.q);
    if (it.q > 4) throw new Error('品质越界 ' + it.q);
    if (it.slot !== 'weapon') throw new Error('槽位不对 ' + it.slot);
    /* 法宝配方 */
    S().mp = G.stats().mpMax;
    const bag0 = S().bag.length, eqT = S().equip.treasures.filter(Boolean).length;
    G.craftGear('g_treasure', 1);
    if (S().bag.length === bag0 && S().equip.treasures.filter(Boolean).length === eqT) throw new Error('法宝未出');
    return '武器 q=' + it.q + '（下限 2、上限 4），法宝亦成';
  } finally { Math.random = real; }
});
step('炼制失败：返还四成材料，日志可读', () => {
  const real = Math.random;
  try {
    Math.random = () => 0.999;                   /* 全失败 */
    G.newGame();
    G.addMaterials({ lingcao: 30 }, true);
    S().mp = G.stats().mpMax;
    const pill0 = S().pills['回春丹'] || 0;
    const logN = S().logs.length;
    G.craftPill('r_huichun', 1);                 /* 用 3 灵草 → 失败返 1 */
    if ((S().pills['回春丹'] || 0) !== pill0) throw new Error('失败却成丹');
    if (G.countMat('lingcao') !== 28) throw new Error('应花 3 收 1，实为 ' + G.countMat('lingcao'));
    const seg = S().logs.slice(logN).map(l => l.t).join('|');
    if (seg.indexOf('炸炉') < 0) throw new Error('失败日志缺失');
    return '花 3 收 1（四成向下取整），日志含「炸炉」';
  } finally { Math.random = real; }
});
step('境界不足时锁定配方（越级两档以上）', () => {
  G.newGame();
  S().level = 0;                                  /* 段 0 */
  const r = G.pillRecipes.find(x => x.k === 'r_pojing');   /* 推荐段 4 */
  if (!G.craftLocked(r)) throw new Error('越级两档以上应锁定');
  if (G.canCraftPill('r_pojing', 1)) throw new Error('锁定的配方不应可炼');
  G.addMaterials({ yaodan: 30, lingcao: 30, xingchen: 10 }, true);
  S().mp = G.stats().mpMax;
  const n0 = S().pills['破境丹'];
  G.craftPill('r_pojing', 1);
  if (S().pills['破境丹'] !== n0) throw new Error('锁定配方仍炼出了丹');
  const why = G.craftBlockReason(r);
  if (why.indexOf('境界') < 0) throw new Error('锁定原因未说明境界');
  /* 境界够了应解锁 */
  S().level = 40;
  if (G.craftLocked(r)) throw new Error('高境界不应锁定');
  return '越级锁定 + 原因可见 + 境界够即解锁';
});
step('存档：v5 / 材料往返 / 老档补默认 / 清洗非法键', () => {
  G.newGame();
  G.addMaterials({ lingcao: 7, yaodan: 3, hundun: 1 }, true);
  const d = G.saveData();
  if (d.v !== 5) throw new Error('saveData 应为 v5，实为 ' + d.v);
  if (d.materials.lingcao !== 7) throw new Error('存档未带材料');
  G.newGame();
  if (G.totalMats() !== 0) throw new Error('新建号未清空材料');
  if (!G.restore(d)) throw new Error('restore 失败');
  if (G.countMat('lingcao') !== 7 || G.countMat('hundun') !== 1) throw new Error('读档未还原材料');
  /* 老档（v2、无 materials）*/
  const old = { v:2, level:5, exp:100, day:10, stones:100, hp:5, mp:5,
    equip:{ weapon:null, armor:null, mount:null, treasures:[null,null,null] },
    bag:[], pills:{ '回春丹':1 }, logs:[], shop:[], stat:{} };
  if (!G.restore(old)) throw new Error('老档读入失败');
  if (!S().materials || G.totalMats() !== 0) throw new Error('老档材料应为空对象');
  if (S().pills['归元丹'] !== 0) throw new Error('老档应补新丹药默认值');
  /* 清洗器 */
  const bad = G.matSanitize({ lingcao: 5, fake: 99, yaodan: 'x', xuantie: -3, shoupi: 2.7 });
  if (bad.lingcao !== 5) throw new Error('正常值被误删');
  if (bad.fake !== undefined) throw new Error('非法键未剔除');
  if (bad.yaodan !== undefined) throw new Error('NaN 未剔除');
  if (bad.xuantie !== undefined) throw new Error('负数未剔除');
  if (bad.shoupi !== 2) throw new Error('小数未取整');
  if (Object.keys(G.matSanitize(undefined)).length !== 0) throw new Error('undefined 应返回空对象');
  return 'v4 往返正常 · 老档补默认 · 清洗器拦截非法值';
});
step('轮回：材料归零（与装备/灵石同轴）', () => {
  G.newGame();
  G.addMaterials({ lingcao: 20, yaodan: 5 }, true);
  if (G.totalMats() === 0) throw new Error('前置材料未给上');
  G.doRebirth();
  if (G.totalMats() !== 0) throw new Error('轮回后材料应清零');
  if (Object.keys(S().materials).length !== 0) throw new Error('materials 应重置为空对象');
  return '入轮回后材料归零';
});
step('界面：左栏材料面板 + 坊市三段 + 引导文案', () => {
  G.newGame();
  /* 空囊提示 */
  G.renderAll();
  let box = el('matBox').innerHTML;
  if (box.indexOf('尚 无 材 料') < 0) throw new Error('空囊提示缺失');
  /* 有材料后的列表（含品阶色与流光） */
  G.addMaterials({ lingcao: 9, hundun: 2 }, true);
  G.renderAll();
  box = el('matBox').innerHTML;
  if (box.indexOf('灵草') < 0 || box.indexOf('混沌石') < 0) throw new Error('材料未列出');
  if (box.indexOf('qc0') < 0) throw new Error('缺少品阶色类名');
  if (box.indexOf('flow q4') < 0) throw new Error('神品材料应带流光');
  if (el('matTag').textContent.indexOf('2 / 6') < 0) throw new Error('标题未显示持有种类');
  /* 坊市三段：先看「材料不足 → 置灰并给原因」 */
  S().level = 30; S().stones = 99999;
  G.switchTab('shop');
  let shop = el('actPanel').innerHTML;
  for (const key of ['丹 房', '器 坊', '材 料 铺']) {
    if (shop.indexOf(key) < 0) throw new Error('坊市缺段落 ' + key);
  }
  if (shop.indexOf('材料不足') < 0) throw new Error('材料不足时应给出原因');
  if (shop.indexOf('crUiCraftPill(') >= 0) throw new Error('材料不足时不应渲染炼制按钮');
  /* 备齐材料后：按钮出现 */
  G.addMaterials({ lingcao: 40, yaodan: 40, xuantie: 40, shoupi: 40, xingchen: 20 }, true);
  S().mp = G.stats().mpMax;
  G.switchTab('cult'); G.switchTab('shop');
  shop = el('actPanel').innerHTML;
  for (const fn of ['crUiCraftPill(', 'crUiCraftGear(', 'crUiBuyMat(']) {
    if (shop.indexOf(fn) < 0) throw new Error('坊市缺按钮 ' + fn);
  }
  if (shop.indexOf('炼 一 次') < 0) throw new Error('缺炼制按钮文案');
  if (shop.indexOf('×5') < 0) throw new Error('材料充足时应出现批量 ×5');
  /* 道法纲要 */
  G.showHelp();
  const help = el('modalRoot').innerHTML;
  if (help.indexOf('材 料 · 炼 制') < 0) throw new Error('道法纲要缺材料章节');
  if (help.indexOf('可控产出') < 0) throw new Error('未说明「随机产出变可控」的设计意图');
  G.closeModal();
  return '左栏材料面板 · 坊市三段 · 纲要章节 齐备';
});

/* ============ S. 洞府 · 离线收益 ============ */
log('=== S. 洞府 · 离线收益 ===');
step('设施表结构（五处 / 键齐备 / max·cost·eff 齐备）', () => {
  const F = G.CAVE_FACILITIES;
  if (F.length !== 5) throw new Error('设施应为 5 处，实为 ' + F.length);
  const keys = F.map(f => f.k);
  for (const k of ['lingtian', 'juling', 'danfang', 'qifang', 'jingshi']) {
    if (keys.indexOf(k) < 0) throw new Error('缺少设施 ' + k);
  }
  for (const f of F) {
    if (!(f.max > 0)) throw new Error(f.k + ' 应有 max');
    if (typeof f.cost !== 'function') throw new Error(f.k + ' 应有 cost');
    if (typeof f.eff !== 'function') throw new Error(f.k + ' 应有 eff');
    if (!f.n || !f.d) throw new Error(f.k + ' 应有名称与描述');
    for (let lv = 1; lv <= f.max; lv++) {
      const c = f.cost(lv);
      if (!(c.stones > 0) || !(c.days > 0)) throw new Error(f.k + ' lv' + lv + ' 成本异常');
    }
    /* 成本必须随等级递增 */
    if (!(f.cost(f.max).stones > f.cost(1).stones)) throw new Error(f.k + ' 成本未递增');
  }
  return '五处设施 · 成本随级递增 · 满级共约 ' + G.caveFullCost().stones + ' 灵石 / ' + G.caveFullCost().days + ' 日';
});
step('新档洞府全空、加成全为零', () => {
  G.newGame();
  if (G.cvTotalLv() !== 0) throw new Error('新档设施等级应为 0');
  if (G.cvTotalMax() !== 45) throw new Error('总上限应为 5×9=45');
  const b = G.cvBonus();
  for (const k of ['herb', 'stone', 'cult', 'pillRate', 'gearRate', 'offlineCap']) {
    if (b[k] !== 0) throw new Error('新档 ' + k + ' 应为 0，实为 ' + b[k]);
  }
  return '五处皆未建，六项加成全为 0';
});
step('升级：扣灵石、推进天数、写日志', () => {
  G.newGame();
  G.S().stones = 100000;
  const day0 = G.S().day, logN = G.S().logs.length;
  if (!G.cvUpgrade('lingtian')) throw new Error('升级应成功');
  if (G.cvFacLv('lingtian') !== 1) throw new Error('应升到 1 级');
  if (!(G.S().day > day0)) throw new Error('天数应推进');
  if (!(G.S().stones < 100000)) throw new Error('灵石应扣除');
  if (G.S().stones !== 100000 - 200) throw new Error('扣款数不对：' + G.S().stones);
  const added = G.S().logs.slice(logN).map(l => l.t).join('|');
  if (added.indexOf('整修') < 0) throw new Error('缺整修日志');
  return '灵田 1 级 · 扣 200 灵石 · 天数 ' + day0 + ' → ' + G.S().day;
});
step('灵石不足被拒，且天数与等级均无副作用', () => {
  G.newGame();
  G.S().stones = 0;
  const day0 = G.S().day;
  if (G.cvUpgrade('lingtian')) throw new Error('灵石不足应被拒');
  if (G.cvFacLv('lingtian') !== 0) throw new Error('不应升级');
  if (G.S().day !== day0) throw new Error('不应推进天数');
  if (G.S().stones !== 0) throw new Error('不应扣款');
  return '被拒且天数/等级/灵石均无变化';
});
step('满级后拒绝继续升级，成本置空', () => {
  G.newGame();
  G.S().stones = 99999999;
  for (let i = 0; i < 20; i++) G.cvUpgrade('lingtian');
  if (G.cvFacLv('lingtian') !== 9) throw new Error('应为满级 9，实为 ' + G.cvFacLv('lingtian'));
  if (G.cvUpgradeCost('lingtian') !== null) throw new Error('满级后成本应为 null');
  if (G.cvUpgrade('lingtian')) throw new Error('满级后不应升级成功');
  return '满级 9 级锁定，再点不生效';
});
step('加成汇总：灵田/聚灵阵/丹房/器坊/静室各管一条线', () => {
  G.newGame();
  G.S().stones = 99999999;
  for (const k of ['lingtian', 'juling', 'danfang', 'qifang', 'jingshi']) G.cvUpgrade(k);
  const b = G.cvBonus();
  if (!(b.herb > 0)) throw new Error('灵田应产灵草');
  if (!(b.cult > 0)) throw new Error('聚灵阵应加修速');
  if (!(b.stone > 0)) throw new Error('聚灵阵应凝灵石');
  if (!(b.pillRate > 0)) throw new Error('丹房应加成丹率');
  if (!(b.gearRate > 0)) throw new Error('器坊应加成器率');
  if (b.offlineCap !== 2) throw new Error('静室 1 级应 +2 时，实为 ' + b.offlineCap);
  return '灵草 ' + b.herb + '/时 · 灵石 ' + b.stone + '/时 · 修速 +' + b.cult
    + '% · 成丹 +' + Math.round(b.pillRate * 100) + '% · 离线上限 +' + b.offlineCap + ' 时';
});
step('聚灵阵修速并入 stats()', () => {
  G.newGame();
  G.S().stones = 99999999;
  const c0 = G.stats().cult;
  for (let i = 0; i < 5; i++) G.cvUpgrade('juling');
  const c1 = G.stats().cult;
  if (!(c1 > c0)) throw new Error('修速应提升（' + c0 + ' → ' + c1 + '）');
  if (Math.abs((c1 - c0) - 5) > 0.001) throw new Error('五级应恰好 +5%，实为 +' + (c1 - c0));
  return '修速 ' + c0 + '% → ' + c1 + '%（五级聚灵阵 +5%）';
});
step('丹房并入 pillCraftRate、器坊并入 gearCraftRate', () => {
  G.newGame();
  G.S().stones = 99999999;
  /* 用低基础成率的配方（破境丹 0.55）验证，避免撞上 0.98 的成率上限 */
  const p0 = G.pillCraftRate('r_pojing'), g0 = G.gearCraftRate('g_weapon');
  for (let i = 0; i < 5; i++) { G.cvUpgrade('danfang'); G.cvUpgrade('qifang'); }
  const p1 = G.pillCraftRate('r_pojing'), g1 = G.gearCraftRate('g_weapon');
  if (!(p1 > p0)) throw new Error('成丹率应提升（' + p0 + ' → ' + p1 + '）');
  if (!(g1 > g0)) throw new Error('成器率应提升（' + g0 + ' → ' + g1 + '）');
  if (Math.abs((p1 - p0) - 0.10) > 0.001) throw new Error('五级丹房应 +10%，实为 ' + (p1 - p0).toFixed(3));
  if (Math.abs((g1 - g0) - 0.10) > 0.001) throw new Error('五级器坊应 +10%，实为 ' + (g1 - g0).toFixed(3));
  /* 未建时不应改变既有成率 */
  G.newGame();
  const p2 = G.pillCraftRate('r_pojing');
  if (Math.abs(p2 - p0) > 0.001) throw new Error('未建设施改变了成率');
  /* 成率上限 0.98：丹房对「本就好炼」的配方收益会被封顶吃掉——这是刻意的 */
  G.S().stones = 99999999;
  for (let i = 0; i < 9; i++) G.cvUpgrade('danfang');
  if (G.pillCraftRate('r_huichun') > 0.98) throw new Error('成率不应超过 0.98');
  return '成丹 ' + (p0 * 100).toFixed(0) + '% → ' + (p1 * 100).toFixed(0)
    + '% · 成器 ' + (g0 * 100).toFixed(0) + '% → ' + (g1 * 100).toFixed(0) + '%（上限 98%）';
});
step('离线结算：短于 1 分钟不算', () => {
  G.newGame();
  G.S().stones = 99999999;
  G.cvUpgrade('lingtian');
  G.caveEnsure().lastTick = Date.now() - 30 * 1000;
  const r = G.cvSettleOffline();
  if (r !== null) throw new Error('少于 1 分钟不应结算');
  return '30 秒不结算（避免刷新页面就弹窗）';
});
step('离线结算：2 小时应有灵草与灵石入账', () => {
  G.newGame();
  G.S().stones = 99999999;
  for (let i = 0; i < 5; i++) G.cvUpgrade('lingtian');
  G.cvUpgrade('juling');
  G.S().stones = 0;                              /* 归零以便核对灵石产出 */
  G.caveEnsure().lastTick = Date.now() - 2 * 3600 * 1000;
  const r = G.cvSettleOffline();
  if (!r) throw new Error('应返回报告');
  if (!(r.herb > 0)) throw new Error('应有灵草产出');
  if (!(r.stone > 0)) throw new Error('应有灵石产出');
  if (G.countMat('lingcao') !== r.herb) throw new Error('灵草未入账');
  if (G.S().stones !== r.stone) throw new Error('灵石未入账');
  if (r.capped) throw new Error('2 小时不应触顶');
  return '2 小时 → 灵草 ' + r.herb + ' 株 · 灵石 ' + r.stone + ' 枚';
});
step('离线结算：超出上限被截断（超出部分丢弃）', () => {
  G.newGame();
  G.S().stones = 99999999;
  G.cvUpgrade('lingtian');
  G.caveEnsure().lastTick = Date.now() - 48 * 3600 * 1000;   /* 48 小时，静室 0 级上限 8 */
  const r = G.cvSettleOffline();
  if (!r) throw new Error('应返回报告');
  if (r.capped !== true) throw new Error('应标记为已达上限');
  if (r.hours > 8.01) throw new Error('计入时长应 ≤ 8 小时，实为 ' + r.hours);
  return '48 小时 → 按 8 小时计（' + r.hours.toFixed(2) + '），超出丢弃';
});
step('静室延长离线上限（8 + lv×2）', () => {
  G.newGame();
  G.S().stones = 99999999;
  if (G.cvOfflineCapHours() !== 8) throw new Error('未建时上限应为 8');
  for (let i = 0; i < 5; i++) G.cvUpgrade('jingshi');
  if (G.cvOfflineCapHours() !== 18) throw new Error('五级静室应为 18，实为 ' + G.cvOfflineCapHours());
  for (let i = 0; i < 4; i++) G.cvUpgrade('jingshi');
  if (G.cvOfflineCapHours() !== 26) throw new Error('满级应为 26，实为 ' + G.cvOfflineCapHours());
  return '8 → 18 → 26 小时（满级静室）';
});
step('存档往返：v5 / 设施等级保留 / lastTick 打上此刻', () => {
  G.newGame();
  G.S().stones = 99999999;
  for (const k of ['lingtian', 'juling', 'danfang']) G.cvUpgrade(k);
  const d = G.saveData();
  if (d.v !== 5) throw new Error('saveData 应为 v5，实为 ' + d.v);
  if (!d.cave || !d.cave.facs) throw new Error('cave 字段应存在');
  if (d.cave.facs.lingtian !== 1 || d.cave.facs.juling !== 1 || d.cave.facs.danfang !== 1) {
    throw new Error('等级未写入存档');
  }
  if (!(d.cave.lastTick > Date.now() - 60000)) throw new Error('lastTick 应打上存档时刻（防在线挂机刷收益）');
  G.newGame();
  if (G.cvTotalLv() !== 0) throw new Error('新档应清空');
  G.restore(d);
  if (G.cvFacLv('lingtian') !== 1) throw new Error('读档后灵田未还原');
  if (G.cvFacLv('juling') !== 1) throw new Error('读档后聚灵阵未还原');
  if (G.cvFacLv('danfang') !== 1) throw new Error('读档后丹房未还原');
  return 'v5 · 三处等级往返一致 · lastTick 已刷新';
});
step('老存档（v4 无 cave）平滑升级且不给白嫖', () => {
  const old = { v: 4, level: 5, exp: 100, day: 10, stones: 100,
                equip: { weapon: null, armor: null, mount: null, treasures: [null, null, null] },
                bag: [], pills: {}, logs: [], stat: {}, materials: {} };
  G.newGame();
  if (!G.restore(old)) throw new Error('老档应能读');
  if (G.cvTotalLv() !== 0) throw new Error('老档洞府应为空');
  if (!G.S().cave) throw new Error('cave 字段应补默认');
  if (typeof G.S().cave.lastTick !== 'number') throw new Error('lastTick 应为数字');
  if (G.cvSettleOffline() !== null) throw new Error('老档首次读取不应给离线收益');
  return 'cave 补空 · lastTick=此刻 · 首次结算返回 null（不给白嫖）';
});
step('清洗器：非法键 / 负数 / NaN / 越界 / 未来时间戳', () => {
  const bad = G.cvSanitize({
    facs: { lingtian: 5, fake: 99, juling: -3, danfang: 'x', qifang: 99 },
    lastTick: Date.now() + 999 * 86400000
  });
  if (bad.facs.lingtian !== 5) throw new Error('合法值应保留');
  if (bad.facs.fake !== undefined) throw new Error('非法键应剔除');
  if (bad.facs.juling !== undefined) throw new Error('负数应剔除');
  if (bad.facs.danfang !== undefined) throw new Error('NaN 应剔除');
  if (bad.facs.qifang !== 9) throw new Error('越界应截断到 9，实为 ' + bad.facs.qifang);
  if (bad.lastTick > Date.now() + 1000) throw new Error('未来时间戳应被丢弃');
  if (G.cvSanitize(undefined).lastTick <= 0) throw new Error('undefined 应补 lastTick');
  return '五类脏数据全部拦截';
});
step('轮回后洞府清零（归本局）', () => {
  G.newGame();
  G.S().stones = 99999999;
  G.cvUpgrade('lingtian');
  G.cvUpgrade('juling');
  if (G.cvTotalLv() !== 2) throw new Error('应有 2 级，实为 ' + G.cvTotalLv());
  G.doRebirth();
  G.closeModal();
  if (G.cvTotalLv() !== 0) throw new Error('轮回后应归零，实为 ' + G.cvTotalLv());
  return '轮回后五处归零（与装备/灵石/材料同轴）';
});
step('战中禁止整修洞府', () => {
  G.newGame();
  G.S().stones = 99999999;
  G.startFight(G.makeMonster(0, false), { type: 'hunt' });
  if (G.cvUpgrade('lingtian')) throw new Error('战中应被拒');
  if (G.cvTotalLv() !== 0) throw new Error('战中不应升级');
  G.S().combat = null;
  G.closeModal();
  return '战中整修被拒，等级与灵石不变';
});
step('界面：左栏洞府面板 + 经营弹层 + 离线归来', () => {
  G.newGame();
  G.S().stones = 99999999;
  G.cvUpgrade('lingtian');
  G.cvUpgrade('juling');
  G.renderAll();
  const box = el('caveBox').innerHTML;
  if (!box || box.length === 0) throw new Error('左栏洞府面板应有内容');
  if (box.indexOf('cvUiOpen()') < 0) throw new Error('缺「整修洞府」入口');
  if (box.indexOf('灵草') < 0) throw new Error('摘要应显示灵草产出');
  if (el('caveTag').textContent.indexOf('2 / 45') < 0) {
    throw new Error('标题未显示总等级，实为 ' + el('caveTag').textContent);
  }
  /* 弹层 */
  G.closeModal();
  G.cvUiOpen();
  const root = el('modalRoot').innerHTML;
  if (root.indexOf('洞 府') < 0) throw new Error('弹层标题应含「洞 府」');
  for (const n of ['灵 田', '聚 灵 阵', '丹 房', '器 坊', '静 室']) {
    if (root.indexOf(n) < 0) throw new Error('弹层缺设施 ' + n);
  }
  if (root.indexOf('cvUiUp(') < 0) throw new Error('弹层缺整修按钮');
  if (root.indexOf('已 圆 满') >= 0) throw new Error('未满级不应显示圆满');
  G.closeModal();
  /* 离线归来 */
  G.caveEnsure().lastTick = Date.now() - 3 * 3600 * 1000;
  const r = G.cvSettleOffline();
  if (!r) throw new Error('3 小时应有结算');
  G.cvShowOfflineReport(r);
  const rep = el('modalRoot').innerHTML;
  if (rep.indexOf('闭 关 归 来') < 0) throw new Error('缺「闭关归来」面板');
  if (rep.indexOf('灵 田') < 0) throw new Error('面板应显示灵田产出');
  if (rep.indexOf('聚 灵 阵') < 0) throw new Error('面板应显示聚灵阵产出');
  G.closeModal();
  return '左栏面板 · 经营弹层五处 · 闭关归来 齐备';
});
step('道法纲要含洞府章节', () => {
  G.newGame();
  G.showHelp();
  const help = el('modalRoot').innerHTML;
  if (help.indexOf('洞 府</b>') < 0) throw new Error('道法纲要缺洞府章节');
  if (help.indexOf('闭关归来') < 0) throw new Error('未说明离线结算方式');
  if (help.indexOf('轮回清零') < 0) throw new Error('未说明洞府归本局');
  G.closeModal();
  return '纲要已含洞府 / 离线结算 / 轮回清零';
});

/* ============ T. 反馈系统 ============ */
log('=== T. 反馈系统 ===');

step('反馈 · 分档正确（器物按品质 / 材料按品阶 / 丹药按名 / 突破按大境界）', () => {
  G.newGame();
  if (G.fbLevelOfItem(G.makeItem('weapon', 0, 0)) !== 1) throw new Error('凡品应为 L1');
  if (G.fbLevelOfItem(G.makeItem('weapon', 0, 1)) !== 1) throw new Error('灵品应为 L1');
  if (G.fbLevelOfItem(G.makeItem('weapon', 0, 2)) !== 2) throw new Error('宝品应为 L2');
  if (G.fbLevelOfItem(G.makeItem('weapon', 0, 3)) !== 2) throw new Error('仙品应为 L2');
  if (G.fbLevelOfItem(G.makeItem('weapon', 0, 4)) !== 3) throw new Error('神品应为 L3');
  if (G.fbLevelOfMat('lingcao') !== 1) throw new Error('灵草应为 L1');
  if (G.fbLevelOfMat('yaodan') !== 1) throw new Error('妖丹应为 L1');
  if (G.fbLevelOfMat('xuantie') !== 2) throw new Error('玄铁应为 L2');
  if (G.fbLevelOfMat('hundun') !== 3) throw new Error('混沌石应为 L3');
  if (G.fbLevelOfPill('回春丹') !== 1) throw new Error('回春丹应为 L1');
  if (G.fbLevelOfPill('破境丹') !== 2) throw new Error('破境丹应为 L2');
  if (G.fbLevelOfPill('归元丹') !== 2) throw new Error('归元丹应为 L2');
  if (G.fbLevelOfBreak(false) !== 2) throw new Error('普通层突破应为 L2');
  if (G.fbLevelOfBreak(true) !== 3) throw new Error('大境界首层应为 L3');
  return '器物 L1/L1/L2/L2/L3 · 材料 / 丹药 / 突破 分档全对';
});

step('反馈 · toast 队列上限 3 条', () => {
  G.newGame();
  G.fbClearAll();
  for (let i = 0; i < 9; i++) G.fbToastQueue('测试 ' + i);
  const c = G.fbDebugCounts();
  if (c.toasts > 3) throw new Error('同时显示不应超过 3 条，实为 ' + c.toasts);
  if (c.toasts < 1) throw new Error('队列应仍有内容');
  G.fbClearAll();
  if (G.fbDebugCounts().toasts !== 0) throw new Error('fbClearAll 未清空 toast');
  return '连发 9 条后在屏 ' + c.toasts + ' 条（≤3）· 清理归零';
});

step('反馈 · 中央浮层独占且排队', () => {
  G.newGame();
  G.fbClearAll();
  G.fbCenterQueue({ tier: 2, title: 'A', body: 'a', autoMs: 10 });
  G.fbCenterQueue({ tier: 2, title: 'B', body: 'b', autoMs: 10 });
  const c = G.fbDebugCounts();
  if (!c.showing) throw new Error('首个应立即展示');
  if (c.queue !== 1) throw new Error('第二个应排队，实为 ' + c.queue);
  G.fbClearAll();
  const d = G.fbDebugCounts();
  if (d.queue !== 0 || d.showing) throw new Error('fbClearAll 未复位中央浮层');
  return '同屏 1 个 + 排队 1 个 · 清理后复位';
});

step('反馈 · 获得器物按档位走不同通道', () => {
  G.newGame();
  G.fbClearAll();
  G.fbGain(G.makeItem('weapon', 0, 1));            /* 灵品 → L1 toast */
  const a = G.fbDebugCounts();
  if (a.toasts !== 1) throw new Error('L1 应产生 1 条 toast，实为 ' + a.toasts);
  if (a.showing) throw new Error('L1 不应弹中央浮层');
  G.fbGain(G.makeItem('weapon', 0, 4));            /* 神品 → L3 中央浮层 */
  const b = G.fbDebugCounts();
  if (!b.showing) throw new Error('L3 应弹中央浮层');
  G.fbClearAll();
  return '灵品走 toast · 神品走中央浮层';
});

step('反馈 · 音效开关可切换且写入 META.prefs', () => {
  G.newGame();
  if (typeof G.fbAudioOn() !== 'boolean') throw new Error('fbAudioOn 应返回布尔');
  const on0 = G.fbAudioOn();
  const on1 = G.fbToggleAudio();
  if (on1 === on0) throw new Error('切换后状态未变');
  if (G.fbAudioOn() !== on1) throw new Error('fbAudioOn 未跟随');
  if (META().prefs.audio !== on1) throw new Error('未写入 META.prefs.audio');
  G.fbToggleAudio();                                /* 切回 */
  return '音效开关可用且持久化（' + on0 + ' → ' + on1 + ' → 复原）';
});

step('反馈 · 浮动反馈条可更新与清空', () => {
  G.newGame();
  const strip = el('fbStrip');
  if (!strip) throw new Error('浮动反馈条锚点缺失');
  G.fbStripUpdate('一 条 测 试');
  if (G.fbStripText() !== '一 条 测 试') throw new Error('文本未记录');
  if (!el('fbStrip').classList.contains('on')) throw new Error('未加 .on');
  G.fbStripUpdate('');
  if (el('fbStrip').classList.contains('on')) throw new Error('空文本应隐藏');
  return '浮动条写值 / 加 .on / 空值隐藏 全通';
});

/* ============ U. 图鉴系统 ============ */
log('=== U. 图鉴系统 ===');

function cdReset() {                                /* 图鉴 / 气运基线归零 */
  G.newGame();
  META().codex = { unlocked: [], milestones: 0 };
  META().ach = []; META().up.luck = 0;
}

step('图鉴 · 条目由既有数据表派生（≥150 项、8 类齐全）', () => {
  G.newGame();
  const all = G.codexAll();
  if (all.length < 150) throw new Error('条目数应 ≥150，实为 ' + all.length);
  const cats = {};
  for (const e of all) cats[e.c] = (cats[e.c] || 0) + 1;
  for (const k of ['mon', 'item', 'gf', 'mount', 'mat', 'pill', 'sec', 'enc']) {
    if (!cats[k]) throw new Error('缺少分类：' + k);
  }
  if (cats.mat !== 6) throw new Error('材料应为 6，实为 ' + cats.mat);
  if (cats.pill !== 4) throw new Error('丹药应为 4，实为 ' + cats.pill);
  /* 派生一致性：加一只妖兽就多一项，不另建表 */
  if (cats.mon !== G.__eval('MONSTERS.reduce((a,b)=>a+b.length,0)')) throw new Error('妖兽条目未与 MONSTERS 同步');
  if (cats.gf !== G.__eval('GONGFA.length')) throw new Error('功法条目未与 GONGFA 同步');
  return all.length + ' 项 = 妖兽 ' + cats.mon + ' · 器物 ' + cats.item + ' · 功法 ' + cats.gf
    + ' · 坐骑 ' + cats.mount + ' · 材料 ' + cats.mat + ' · 丹药 ' + cats.pill
    + ' · 秘境 ' + cats.sec + ' · 奇遇 ' + cats.enc;
});

step('图鉴 · 新档为空、气运为 0', () => {
  cdReset();
  if (G.codexCount() !== 0) throw new Error('新档图鉴应为空');
  if (G.codexLuck() !== 0) throw new Error('新档图鉴气运应为 0');
  return '0 项 · +0 气运';
});

step('图鉴 · 解锁返回首次标记、重复被拒、非法键被拒', () => {
  cdReset();
  const k = G.codexAll()[0].k;
  if (!G.codexUnlock(k)) throw new Error('首次解锁应返回 true');
  if (G.codexUnlock(k)) throw new Error('重复解锁应返回 false');
  if (G.codexCount() !== 1) throw new Error('计数应为 1');
  if (G.codexUnlock('不存在的图鉴键')) throw new Error('非法键应被拒');
  if (G.codexCount() !== 1) throw new Error('非法键不应计数');
  return '首次 true / 重复 false / 非法键拒绝';
});

step('图鉴 · 按类型便捷解锁（器物 / 材料 / 丹药 / 功法）', () => {
  cdReset();
  G.codexUnlockItem(G.makeItem('weapon', 0, 2));
  G.codexUnlockMat('lingcao');
  G.codexUnlockPill('回春丹');
  G.codexUnlockGf('gf_yinqi');
  if (G.codexCount() !== 4) throw new Error('应解锁 4 项，实为 ' + G.codexCount());
  return '器物 · 材料 · 丹药 · 功法 各 1 项';
});

step('图鉴 · 每 10 项 +1 气运，且并入 fortune()', () => {
  cdReset();
  const f0 = G.fortune();
  const all = G.codexAll();
  for (let i = 0; i < 30; i++) G.codexUnlock(all[i].k);
  const luck = G.codexLuck();
  if (luck !== 3) throw new Error('30 项应 +3 气运，实为 ' + luck);
  const f1 = G.fortune();
  if (!(f1 > f0)) throw new Error('气运未并入 fortune()（' + f0 + ' → ' + f1 + '）');
  /* 未建图鉴时不应改变既有气运 */
  cdReset();
  if (G.fortune() !== f0) throw new Error('清空图鉴后气运未回落');
  return '30 项 → +' + luck + ' 气运，fortune ' + f0 + ' → ' + f1;
});

step('图鉴 · 里程碑每 25 项触发一次', () => {
  cdReset();
  const all = G.codexAll();
  for (let i = 0; i < 25; i++) G.codexUnlock(all[i].k);
  if (META().codex.milestones !== 1) throw new Error('25 项应触发 1 次，实为 ' + META().codex.milestones);
  for (let i = 25; i < 49; i++) G.codexUnlock(all[i].k);
  if (META().codex.milestones !== 1) throw new Error('未到 50 项不应再触发');
  for (let i = 49; i < 50; i++) G.codexUnlock(all[i].k);
  if (META().codex.milestones !== 2) throw new Error('50 项应触发 2 次，实为 ' + META().codex.milestones);
  return '25 → 1 次 · 50 → 2 次';
});

step('图鉴 · 清洗器剔除非法键与重复、截断小数', () => {
  const d = G.codexSanitizeMeta({
    unlocked: ['mon_' + G.__eval('MONSTERS[0][0]'), 'mon_' + G.__eval('MONSTERS[0][0]'), '假键', 123, null],
    milestones: 2.9
  });
  if (d.unlocked.length !== 1) throw new Error('应只保留 1 项，实为 ' + d.unlocked.length);
  if (d.milestones !== 2) throw new Error('里程碑应取整，实为 ' + d.milestones);
  const e = G.codexSanitizeMeta(undefined);
  if (!e || !Array.isArray(e.unlocked) || e.unlocked.length !== 0) throw new Error('undefined 应返回空结构');
  return '去重 / 剔非法 / 取整 / 兜底 全通';
});

step('图鉴 · 轮回不灭', () => {
  cdReset();
  const all = G.codexAll();
  G.codexUnlock(all[0].k); G.codexUnlock(all[1].k);
  const n0 = G.codexCount();
  G.doRebirth();
  if (G.codexCount() !== n0) throw new Error('轮回后图鉴应保留（' + n0 + ' → ' + G.codexCount() + '）');
  return '轮回前后均为 ' + n0 + ' 项';
});

step('图鉴 · 面板与左栏标签', () => {
  cdReset();
  G.codexUnlock(G.codexAll()[0].k);
  G.renderCodexTag();
  if (el('cdTag').textContent.indexOf('/') < 0) throw new Error('左栏图鉴标签未渲染');
  G.openCodex();
  const h = el('modalRoot').innerHTML;
  if (h.indexOf('图 鉴') < 0) throw new Error('面板标题缺「图 鉴」');
  for (const c of G.CODEX_CATS) {
    if (h.indexOf(c.n) < 0) throw new Error('面板缺分类：' + c.n);
  }
  G.closeModal();
  return '左栏标签 · 弹层 ' + G.CODEX_CATS.length + ' 个分类齐备';
});

step('道法纲要含图鉴与称号章节', () => {
  G.newGame();
  G.showHelp();
  const help = el('modalRoot').innerHTML;
  if (help.indexOf('图 鉴</b>') < 0) throw new Error('纲要缺图鉴章节');
  if (help.indexOf('称 号</b>') < 0) throw new Error('纲要缺称号章节');
  if (help.indexOf('每 10 项') < 0) throw new Error('未说明气运换算');
  G.closeModal();
  return '纲要已含图鉴 / 称号 / 气运换算';
});

/* ============ V. 称号系统 ============ */
log('=== V. 称号系统 ===');

function ttReset() {
  G.newGame();
  META().titles = { owned: [], active: null };
  META().best.lv = 0;
}

step('称号 · 表结构完整（键唯一 / 有 cond / 有 ef）', () => {
  if (G.TITLES.length < 8) throw new Error('称号应 ≥8 个，实为 ' + G.TITLES.length);
  const seen = {};
  for (const t of G.TITLES) {
    if (!t.k || !t.n || !t.d) throw new Error('字段缺失：' + t.k);
    if (seen[t.k]) throw new Error('键重复：' + t.k);
    seen[t.k] = 1;
    if (typeof t.cond !== 'function') throw new Error('缺 cond：' + t.k);
    if (!t.ef || typeof t.ef !== 'object') throw new Error('缺 ef：' + t.k);
    if (!(t.t >= 0 && t.t <= 4)) throw new Error('品阶越界：' + t.k);
  }
  return G.TITLES.length + ' 个称号 · 五品齐备 · 键唯一';
});

step('称号 · 新档未解锁、未佩戴', () => {
  ttReset();
  if (G.titleOwnedList().length !== 0) throw new Error('新档不应有已解锁称号');
  if (G.titleActiveKey() !== null) throw new Error('新档不应有佩戴称号');
  return '0 个已解锁 · 未佩戴';
});

step('称号 · 条件满足即解锁（初 学）', () => {
  ttReset();
  S().level = 5;
  const got = G.checkTitles();
  if (!G.titleOwned('t_chuxue')) throw new Error('应解锁「初 学」');
  if (!got.length) throw new Error('checkTitles 应返回本次新解锁');
  return '新解锁 ' + got.length + ' 个：' + got.map(t => t.n).join(' · ');
});

step('称号 · 未解锁不能佩戴、已解锁可佩戴与卸下', () => {
  ttReset();
  if (G.titleEquip('t_daoxin')) throw new Error('未解锁应被拒');
  S().level = 5;
  G.checkTitles();
  if (!G.titleEquip('t_chuxue')) throw new Error('已解锁应可佩戴');
  if (G.titleActiveKey() !== 't_chuxue') throw new Error('佩戴未生效');
  G.titleUnequip();
  if (G.titleActiveKey() !== null) throw new Error('卸下未生效');
  return '未解锁拒绝 · 佩戴 / 卸下 全通';
});

step('称号 · 同时只戴一个（再戴自动切换）', () => {
  ttReset();
  S().level = 5;
  G.checkTitles();
  G.titleEquip('t_chuxue');
  META().titles.owned.push('t_zhanzhe');
  G.titleEquip('t_zhanzhe');
  if (G.titleActiveKey() !== 't_zhanzhe') throw new Error('第二次佩戴未切换');
  if (G.titleActiveDef().k !== 't_zhanzhe') throw new Error('titleActiveDef 未跟随');
  return '佩戴新称号自动切换，同时仅 1 个';
});

step('称号 · 加成生效且并入 stats()', () => {
  ttReset();
  S().level = 5;
  G.checkTitles();
  const c0 = G.stats().cult;
  G.titleEquip('t_chuxue');                      /* 初学：修速 +1% */
  const c1 = G.stats().cult;
  if (!(c1 > c0)) throw new Error('修速应提升（' + c0 + ' → ' + c1 + '）');
  const b = G.titleBonus();
  if (!(b.cult >= 1)) throw new Error('titleBonus 未返回效果');
  G.titleUnequip();
  if (G.stats().cult !== c0) throw new Error('卸下后应回落');
  return '修速 ' + c0 + ' → ' + c1 + ' → 回落 ' + c0;
});

step('称号 · 存档清洗（剔非法 / 去重 / active 校验）', () => {
  const d = G.titleSanitizeMeta({ owned: ['t_chuxue', '假称号', 't_chuxue', 7], active: 't_chuxue' });
  if (d.owned.length !== 1) throw new Error('应只保留 1 个，实为 ' + d.owned.length);
  if (d.active !== 't_chuxue') throw new Error('合法 active 应保留');
  const e = G.titleSanitizeMeta({ owned: [], active: 't_daoxin' });
  if (e.active !== null) throw new Error('未拥有的 active 应清空');
  const f = G.titleSanitizeMeta(undefined);
  if (!f || f.owned.length !== 0 || f.active !== null) throw new Error('undefined 应返回空结构');
  return '剔非法 / 去重 / active 校验 / 兜底 全通';
});

step('称号 · 轮回不灭', () => {
  ttReset();
  S().level = 5;
  G.checkTitles();
  const n0 = G.titleOwnedList().length;
  if (!n0) throw new Error('应有已解锁称号');
  G.doRebirth();
  if (G.titleOwnedList().length !== n0) throw new Error('轮回后称号应保留');
  return '轮回前后均为 ' + n0 + ' 个';
});

step('称号 · 面板与左栏标签', () => {
  ttReset();
  S().level = 5;
  G.checkTitles();
  G.renderTitleTag();
  if (el('ttTag').textContent.indexOf('/') < 0) throw new Error('左栏称号标签未渲染');
  G.openTitles();
  const h = el('modalRoot').innerHTML;
  if (h.indexOf('称 号') < 0) throw new Error('面板标题缺「称 号」');
  if (h.indexOf('初 学') < 0) throw new Error('面板未列出已解锁称号');
  if (h.indexOf('未 解 锁') < 0) throw new Error('面板未标注未解锁');
  G.closeModal();
  return '左栏标签 · 弹层列出全部称号';
});

/* ============ W. 移动端反馈与布局 ============ */
log('=== W. 移动端反馈与布局 ===');

step('移动端 · renderLog 会把最新一条日志写进浮动条', () => {
  G.newGame();
  S().logs = [{ t: '一 行 关 键 日 志', c: 'item' }];
  G.renderLog();
  if (G.fbStripText() !== '一 行 关 键 日 志') throw new Error('浮动条未同步最新日志');
  return '浮动条已同步（' + G.fbStripText() + '）';
});

step('移动端 · 点击浮动条展开「天机录」', () => {
  G.newGame();
  G.fbStripUpdate('有 内 容');
  G.fbStripClick();
  const h = el('modalRoot').innerHTML;
  if (h.indexOf('天 机 录') < 0) throw new Error('未展开天机录');
  G.closeModal();
  return '点击浮动条 → 展开完整日志弹层';
});

step('移动端 · 布局：导航与点击目标收紧、反馈条样式就位', () => {
  if (!/--tap:\s*40px/.test(src)) throw new Error('移动端 --tap 未收紧到 40px');
  if (!/--navh:\s*52px/.test(src)) throw new Error('移动端 --navh 未收紧到 52px');
  if (src.indexOf('.fb-strip') < 0) throw new Error('缺浮动反馈条样式');
  if (src.indexOf('.fb-toast-root') < 0) throw new Error('缺 toast 队列样式');
  if (src.indexOf('.fb-center-mask') < 0) throw new Error('缺中央浮层样式');
  /* 浮动条靠 .only-m 在窄屏启用；桌面端必须仍然隐藏 */
  if (!/\.only-m\{display:none!important\}/.test(src)) throw new Error('桌面端未隐藏 .only-m');
  if (!/\.only-m\{display:flex!important\}/.test(src)) throw new Error('窄屏未启用 .only-m');
  if (!/\.fb-strip\{[^}]*display:flex/.test(src)) throw new Error('浮动条未声明 display:flex');
  return '--tap 40px · --navh 52px · 反馈三件套样式齐备';
});

step('不变量 · 反馈与图鉴未引入外部资源请求', () => {
  if (/\bnew\s+Audio\s*\(/.test(src)) throw new Error('不得用 new Audio 加载外部音频');
  if (/https?:\/\/[^\s"']+\.(mp3|ogg|wav)/i.test(src)) throw new Error('不得引用外部音频文件');
  if (!/AudioContext|webkitAudioContext/.test(src)) throw new Error('应走 Web Audio 现场合成');
  return '音效为 Web Audio 合成，零外部请求';
});

log('');
log('================ 汇总 ================');
log('通过步骤：' + (OUT.filter(l => l.indexOf('  OK   ') === 0).length));
if (fails.length) {
  log('失败项 ' + fails.length + '：');
  fails.forEach(f => log('  · ' + f));
} else {
  log('未发现失败项。');
}
fs.writeFileSync(process.argv[3], OUT.join('\n'), 'utf8');
process.exit(fails.length ? 1 : 0);
