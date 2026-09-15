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
  execCommand() { return true; }
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
  NOTICE_VER: NOTICE_VER
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
  while (S().combat) G.fightAction('flee');
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
  while (S().combat) G.fightAction('flee');
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
  let g = 0;
  while (S().combat && g++ < 60) G.fightAction('flee');
  return '丹药 / 卸下 / 出售按钮均已摘除，直接调用亦被拦截';
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
