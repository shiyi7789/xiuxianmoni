import { META, achList, fortune } from '../core/meta.js';
import { save } from '../core/save.js';
import { S, busy } from '../core/state.js';
import { clamp, num } from '../core/utils.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { GF_BY_KEY, GF_MAX, GF_SHU, GF_SLOT, GONGFA } from '../data/gongfa.js';
import { GROUNDS } from '../data/grounds.js';
import { TIER_NAME } from '../data/monsters.js';
import { MOUNT_MAX_LV, MOUNT_TIER_NAME } from '../data/mounts.js';
import { PILLS } from '../data/pills.js';
import { MAX_LV } from '../data/realms.js';
import { SECRETS } from '../data/secrets.js';
import { openAchievements } from '../sys/achievement.js';
import { breakChance, doBreakthrough, doBreakthroughChain, pillBonus, pillTip, readyCount } from '../sys/breakthrough.js';
import { autoEquip, clampVitals, dropItem, equipBag, godCls, isMount, itemCost, itemLabel, qName, stats, toggleAutoEquip, unequip, unequipAll } from '../sys/character.js';
import { fightAction, fightAttack, fightPill, fightSkill } from '../sys/combat.js';
import { actMeditate, actSeclusion, actStoneCultivate, askExp, expNeed, realmAt, realmName } from '../sys/cultivate.js';
import { dungeonBoss, dungeonForward, dungeonLeave, dungeonSearch, enterSecret } from '../sys/dungeon.js';
import { gfActiveList, gfBonus, gfBookPrice, gfEffectText, gfEnsure, gfFxText, gfGrade, gfLearnedList, gfLevel, gfPerLvText, gfShopBook, gfSkill, gfSkillMp } from '../sys/gongfa.js';
import { curGround, estPower, hunt } from '../sys/hunt.js';
import { renderLog } from '../sys/log.js';
import { buyMount, feedMount, mountCost, mountFeedCost, mountLabel, releaseMount } from '../sys/mount.js';
import { buyPill, pillPrice, usePill } from '../sys/pills.js';
import { openHeritage, openRebirth } from '../sys/rebirth.js';
import { SELL, SELL_Q, SELL_TYPES, matchSell, sellBagItem, sellBatch, sellEquipped, sellPrice, sellQuality, setSell } from '../sys/sell.js';
import { buyItem, refreshShop } from '../sys/shop.js';
import { travelDays } from '../sys/time.js';
import { showHelp } from './panels/notice.js';
import { renderMaterials, renderGearSection, renderMatShopSection, renderPillSection } from './panels/craft.js';
import { renderCave } from './panels/cave.js';
import { codexCount, codexTotal } from '../sys/codex.js';
import { titleActiveKey, titleOwnedList } from '../sys/titles.js';
import { TITLES } from '../data/titles.js';
import { openSavePanel } from './panels/save.js';
import { closeSheet } from './sheet.js';
import { toggleTheme } from './theme.js';


/* =========================================================
   渲染
   ========================================================= */
export function renderAll(){
  if(!S) return;
  clampVitals();
  renderTop();
  renderChar();
  renderEquip();
  renderGongfa();
  renderPills();
  renderMaterials();
  renderCave();
  renderCodexTag();
  renderTitleTag();
  renderMount();
  renderBag();
  renderTabs();
  renderActions();
  renderUtil();
  renderLog();
  save();
}

/* 左栏「图 鉴 · 称 号」两个按钮上的计数标签 */
export function renderCodexTag(){
  const el = $('cdTag');
  if(el) el.textContent = codexCount() + '/' + codexTotal();
}
export function renderTitleTag(){
  const el = $('ttTag');
  if(!el) return;
  el.textContent = titleOwnedList().length + '/' + TITLES.length + (titleActiveKey() ? ' · 佩' : '');
}

export function renderTop(){
  const st = stats();
  $('topRealm').textContent = realmName();
  $('topDay').textContent = '第 ' + num(S.day) + ' 日';
  $('topStones').textContent = num(S.stones);
  $('topPower').textContent = num(st.power);
  const f = fortune();
  $('topLuck').textContent = f;
  $('luckTs').className = 'ts luck' + (f >= 50 ? ' hi' : '');
  const ab = $('achBtn');
  if(ab) ab.textContent = '成 就 ' + achList().length + ' / ' + ACHIEVEMENTS.length;
  const box = $('metaTs');
  if(box){
    if(META.rebirths > 0){
      box.style.display = '';
      $('topMeta').textContent = '第 ' + META.rebirths + ' 世'
        + (META.points ? ' · ' + META.points + ' 点' : '');
    }else{
      box.style.display = 'none';
    }
  }
}

export function renderChar(){
  const st = stats();
  const need = expNeed(S.level);
  const can = S.exp >= need;
  const n = can ? Math.max(1, readyCount()) : 0;
  $('expTxt').textContent = num(S.exp) + ' / ' + num(need) + (n > 1 ? '　可连破 ×' + n : (can ? '　圆满' : ''));
  $('expTxt').style.color = can ? 'var(--zhu)' : '';
  $('expBar').style.width = clamp(S.exp/need*100,0,100) + '%';
  $('hpTxt').textContent = num(S.hp) + ' / ' + num(st.hpMax);
  $('hpBar').style.width = clamp(S.hp/st.hpMax*100,0,100) + '%';
  $('mpTxt').textContent = num(S.mp) + ' / ' + num(st.mpMax);
  $('mpBar').style.width = clamp(S.mp/st.mpMax*100,0,100) + '%';
  $('sAtk').textContent = num(st.atk);
  $('sDef').textContent = num(st.def);
  $('sCrit').textContent = st.crit + '%';
  $('sCult').textContent = '+' + st.cult + '%';
  $('sSpeed').textContent = '+' + st.speed + '%';
  const f = fortune();
  $('sLuck').textContent = f;
  $('sLuck').style.color = f >= 50 ? 'var(--zhu)' : '';
  $('sKill').textContent = num(S.kills);
  $('sDeath').textContent = num(S.deaths);
}

export function slotRow(label, it, key, idx){
  if(!it){
    return '<div class="slot"><span class="k">'+label+'</span><span class="v empty">— 空 —</span></div>';
  }
  const body = '<span class="v">'+ (isMount(it) ? mountLabel(it) : itemLabel(it)) +'</span>'
    + (busy()
        ? '<span class="r" style="opacity:.3">卸下</span>'
        : '<span class="r" onclick="unequip(\''+key+'\','+idx+')">卸下</span>'
          + '<span class="r sell" onclick="sellEquipped(\''+key+'\','+idx+')">售'+num(sellPrice(it))+'</span>');
  return '<div class="slot'+godCls(it.q)+'"><span class="k">'+label+'</span>'+body+'</div>';
}

export function renderEquip(){
  let h = '';
  h += slotRow('武器', S.equip.weapon, 'weapon', 0);
  h += slotRow('防具', S.equip.armor, 'armor', 0);
  for(let i=0;i<3;i++){
    h += slotRow('法宝'+(i+1), S.equip.treasures[i], 'treasure', i);
  }
  $('equipBox').innerHTML = h;

  const tag = $('autoTag');
  tag.textContent = '自动换装 · ' + (S.autoEquipOn ? '开' : '关');
  tag.style.color = S.autoEquipOn ? 'var(--qing)' : 'var(--ink4)';
  tag.style.border = '1px solid ' + (S.autoEquipOn ? 'var(--qing)' : 'var(--line2)');
  tag.style.borderRadius = '2px';
  tag.style.padding = '1px 6px';
}

export function renderMount(){
  const m = S.equip.mount;
  const box = $('mountBox');
  const tag = $('mountTag');

  if(!m){
    box.innerHTML = '<div class="empty-row">' + slotRow('坐骑', null, 'mount', 0) + '</div>'
      + '<div class="hint-mini">尚无坐骑。驯服高阶妖兽、潜入秘境、或于坊市灵兽栏购买。</div>';
    tag.textContent = '';
    return;
  }

  const cost = mountFeedCost(m);
  const maxed = m.lv >= MOUNT_MAX_LV;
  box.innerHTML = slotRow('坐骑', m, 'mount', 0)
    + '<div class="hint-mini">'+MOUNT_TIER_NAME[m.tier]+' · '+m.lv+' / '+MOUNT_MAX_LV+' 阶 · 战力 '+num(m.power)+'</div>'
    + '<div style="display:flex;gap:6px;margin-top:6px">'
    + '<button class="mbtn" style="flex:1;padding:5px 0;font-size:11.5px;letter-spacing:.08em;'
      + (maxed?'opacity:.4;':'') + '" onclick="feedMount()">'
      + (maxed ? '已 至 化 境' : '喂 养 · '+num(cost)) + '</button>'
    + '<button class="mbtn" style="padding:5px 12px;font-size:11.5px;letter-spacing:.08em" onclick="releaseMount()">放 生</button>'
    + '</div>';

  tag.textContent = '遁速 +' + m.speed + '%';
  tag.style.color = 'var(--qing)';
}

/* --- 功法（左栏面板）：只做摘要，详情与操作都在「悟道录」弹层 --- */
export function gfSlotRow(label, gf, lv, extra){
  if(!gf){
    return '<div class="slot"><span class="k">'+label+'</span><span class="v empty">— 空 —</span>'
      + '<span class="r" onclick="openGongfa()">习 法</span></div>';
  }
  const full = lv >= GF_MAX[gf.t];
  return '<div class="slot'+godCls(gf.t)+'"><span class="k">'+label+'</span>'
    + '<span class="v">'+qName(gf.n, gf.t)
    + '<span class="muted-sm">　'+lv+' / '+GF_MAX[gf.t]+' 重'+(full?' · 圆满':'')
    + (extra?' · '+extra:'')+'</span></span>'
    + '<span class="r" onclick="openGongfa()">改 修</span></div>';
}

export function renderGongfa(){
  const box = $('gfBox');
  if(!box) return;
  const g = gfEnsure();
  let h = '';
  for(let i=0;i<GF_SLOT.passive;i++){
    const gf = GF_BY_KEY[g.passive[i]];
    h += gfSlotRow('被动'+(i+1), gf, gf ? gfLevel(gf.k) : 0);
  }
  for(let i=0;i<GF_SLOT.active;i++){
    const gf = GF_BY_KEY[g.active[i]];
    const prof = gf ? GF_SHU[gf.sk] : null;
    h += gfSlotRow('主动'+(i+1), gf, gf ? gfLevel(gf.k) : 0, prof ? prof.n : '');
  }
  const n = gfLearnedList().length;
  const b = gfBonus();
  const parts = [];
  if(b.cult) parts.push('修速 +'+b.cult+'%');
  if(b.atk) parts.push('攻 +'+b.atk+'%');
  if(b.hp) parts.push('血 +'+b.hp+'%');
  if(b.def) parts.push('防 +'+b.def+'%');
  if(b.luck) parts.push('气运 +'+b.luck);
  const tip = parts.length ? '被动合计：'+parts.join(' · ')
    : (n ? '被动槽尚未装心法，点「改 修」择一部运转。' : '尚未习得。秘境妖王与坊市藏经阁皆可求得功法。');
  h += '<div class="hint-mini">'+tip+'</div>';
  box.innerHTML = h;

  const tag = $('gfTag');
  if(tag) tag.textContent = '已 习 ' + n + ' / ' + GONGFA.length;
}

export function renderPills(){
  const lock = busy();
  let h = '';
  for(const p of PILLS){
    const n = S.pills[p.name]||0;
    const off = !n || lock;
    const bonus = (p.name === '破境丹' && (S.pillStack||0) > 0)
      ? ' <span style="color:var(--zhu)">+'+pillBonus()+'%</span>' : '';
    h += '<button class="mbtn" style="padding:6px 12px;font-size:12px;letter-spacing:.06em;'
      + (off?'opacity:.4;':'') + '"'
      + (off ? '' : ' onclick="usePill(\''+p.name+'\')"')
      + ' title="'+p.desc+(lock?'（战斗中请在战斗面板用「服丹」）':'')+'">'
      + p.name + ' ×' + n + bonus + '</button>';
  }
  $('pillBox').innerHTML = h;
}

export function renderBag(){
  const box = $('bagBox');
  $('bagCount').textContent = S.bag.length + ' / 40';
  if(!S.bag.length){ box.innerHTML = '<div class="empty-note">囊 中 空 空</div>'; return; }
  const lock = busy();
  let h = '';
  for(const it of S.bag){
    const label = isMount(it) ? mountLabel(it) : itemLabel(it);
    h += '<div class="bagrow2' + godCls(it.q) + (lock ? ' locked-row' : '') + '">'
      + '<div class="l1"><span class="nm">'+label+'</span>'
      + '<span class="pw">战力 '+num(it.power)+'</span></div>';
    if(lock){
      h += '<div class="l2"><span class="pw" style="opacity:.7">战 中 不 可 取 用</span></div>';
    }else{
      h += '<div class="l2">'
        + '<button onclick="equipBag('+it.id+')">'+ (isMount(it) ? '骑 乘' : '装 备') +'</button>'
        + '<button class="sell-btn" onclick="sellBagItem('+it.id+')">售 '+num(sellPrice(it))+'</button>'
        + '<button onclick="dropItem('+it.id+')" style="opacity:.6">弃</button>'
        + '</div>';
    }
    h += '</div>';
  }
  box.innerHTML = h;
}

export function renderTabs(){
  const locked = !!(S.combat || S.dungeon);
  const tabs = [
    { k:'cult',   n:'修 炼' },
    { k:'hunt',   n:'妖 兽' },
    { k:'secret', n:'秘 境' },
    { k:'gear',   n:'装 备' },
    { k:'shop',   n:'坊 市' }
  ];
  let h = '';
  for(const t of tabs){
    const on = (!locked && S.tab === t.k) ? ' on' : '';
    const dis = locked ? ' dis' : '';
    h += '<div class="tab'+on+dis+'" onclick="'+(locked?'':'switchTab(\''+t.k+'\')')+'">'+t.n+'</div>';
  }
  $('tabs').innerHTML = h;
}

export function switchTab(k){
  S.tab = k;
  renderTabs(); renderActions(); save();
}

export function card(title, desc, cost, fn, opt){
  opt = opt || {};
  const cls = 'card' + (opt.lock?' lock':'') + (opt.hot?' hot':'') + (opt.danger?' danger':'')
    + (opt.q !== undefined ? godCls(opt.q) : '');
  const oc = (opt.lock || !fn) ? '' : ' onclick="'+fn+'"';
  return '<div class="'+cls+'"'+oc+'>'
    + '<div class="t">'+title+'</div>'
    + '<div class="d">'+desc+'</div>'
    + (cost ? '<div class="cost">'+cost+'</div>' : '')
    + '</div>';
}

export function renderActions(){
  const p = $('actPanel');
  if(S.combat){ p.innerHTML = renderCombat(); return; }
  if(S.dungeon){ p.innerHTML = renderDungeon(); return; }
  p.innerHTML = ({
    cult:   actionsCult,
    hunt:   actionsHunt,
    secret: actionsSecret,
    gear:   actionsGear,
    shop:   actionsShop
  }[S.tab] || actionsCult)();
}

/* --- 战斗面板 --- */
export function renderCombat(){
  const c = S.combat, m = c.m, st = stats();
  const hpPct = clamp(m.hp/m.hpMax*100,0,100);
  let h = '<div class="fbar" style="margin:-13px -14px 12px;border-radius:0">'
    + '<span class="fname">'+m.name+'</span>'
    + '<span class="ftrack"><span class="ffill" style="width:'+hpPct+'%"></span></span>'
    + '<span class="fnum">'+num(Math.max(0,m.hp))+' / '+num(m.hpMax)+'</span>'
    + '</div>';
  h += '<div class="tip">第 <b>'+c.turn+'</b> 回合 · 灵力 '+num(S.mp)+' / '+num(st.mpMax)
    + ' · 灵技需 '+num(Math.round(st.mpMax*0.15)+8)+' 灵力</div>';
  const myDmg  = Math.max(1, Math.round(st.atk - m.def*0.6));
  const foeDmg = Math.max(1, Math.round(m.atk - st.def*0.6));
  const myTurns  = Math.ceil(Math.max(0, m.hp) / myDmg);
  const foeTurns = Math.ceil(Math.max(1, S.hp) / foeDmg);
  h += '<div class="foe">'
    + '<span>我 攻 <b>'+num(st.atk)+'</b> · 防 <b>'+num(st.def)+'</b></span>'
    + '<span>敌 攻 <b>'+num(m.atk)+'</b> · 防 <b>'+num(m.def)+'</b></span>'
    + '<span>一击约 <b>'+num(myDmg)+'</b> · 需 <b>'+myTurns+'</b> 回合</span>'
    + '<span>敌伤约 <b>'+num(foeDmg)+'</b> · 可撑 <b>'+foeTurns+'</b> 回合</span>'
    + '<span class="'+(myTurns <= foeTurns ? 'up' : 'dn')+'">'
      + (myTurns <= foeTurns ? '我占上风' : '宜守宜走') + '</span>'
    + '</div>';
  /* 功法状态：护盾 / 虚空 / 冰封 / 灼烧 剩余回合 */
  const buffs = [];
  if(c.buff && c.buff.shield > 0) buffs.push('<span class="up">护体 '+Math.round(c.buff.shield*100)+'% · 余 '+c.buff.shieldDur+'</span>');
  if(c.buff && c.buff.dodge > 0) buffs.push('<span class="up">虚空 · 余 '+c.buff.dodgeDur+'</span>');
  if(c.debuff && c.debuff.freeze > 0) buffs.push('<span class="dn">冰封 · 余 '+c.debuff.freeze+'</span>');
  if(c.debuff && c.debuff.burn > 0) buffs.push('<span class="dn">灼烧 · 余 '+c.debuff.burn+'</span>');
  if(buffs.length){
    h += '<div class="foe" style="margin-bottom:10px">'+buffs.join('')+'</div>';
  }

  h += '<div class="actgrid">';
  h += card('挥 击','以手中法器直取要害，不耗灵力。','', "fightAttack()");
  h += card('灵 力 斩','催动灵力一击，伤害约 2.3 倍。','耗灵力 '+num(Math.round(st.mpMax*0.15)+8), "fightSkill()", S.mp < Math.round(st.mpMax*0.15)+8 ? {lock:true}:{});
  /* 识海中的主动功法（功法系统）：带冷却与附加效果 */
  const skills = gfActiveList();
  for(const sk of skills){
    const cd = (c.cd && c.cd[sk.key]) || 0;
    const mc = gfSkillMp(sk, st.mpMax);
    const canCast = cd === 0 && S.mp >= mc;
    const fx = gfFxText(sk.fx);
    const desc = '伤害 ×'+sk.mult + ((sk.hits||1) > 1 ? ' · '+sk.hits+' 段' : '') + (fx ? ' · '+fx : '');
    h += card('【'+sk.n+'】', desc,
      cd > 0 ? ('冷却中 · 余 '+cd+' 回合') : ('耗灵力 '+num(mc)),
      "castSkill('"+sk.key+"')",
      canCast ? {hot:true} : {lock:true});
  }
  if(!skills.length){
    h += card('未 备 术 法','在「功 法」中把主动功法备入识海，战斗中便多出可放之技。','主动槽 2 格', "openGongfa()", {});
  }
  h += card('御 守','架起护体灵光，本回合受伤减至三成，并回灵力。','', "fightAction('defend')");
  const hasPill = (S.pills['回春丹']||0) > 0;
  h += card('服 丹','服一枚回春丹，恢复气血 45%。', (S.pills['回春丹']||0)+' 枚 · 至多 3 次', "fightPill()", hasPill?{}:{lock:true});
  h += card('遁 走','有五成八的把握脱身。妖王当前则无从遁走。','', "fightAction('flee')", m.boss?{lock:true}:{});
  h += '</div>';
  return h;
}

/* --- 秘境面板 --- */
export function renderDungeon(){
  const d = S.dungeon, def = SECRETS[d.idx];
  const maxFloor = d.floor === d.total;
  let h = '<div class="tip">秘境：<b>'+def.name+'</b> · 当前第 <b>'+d.floor+'/'+d.total+'</b> 层'
    + ' · 已获灵石 <b>'+num(d.gained)+'</b> · 得宝 <b>'+d.items+'</b> 件'
    + (maxFloor ? ' · <b style="color:var(--warn)">终点已至，妖王在前</b>' : '')
    + '</div>'
    + '<div class="dtrack"><i style="width:'+Math.round(d.floor/d.total*100)+'%"></i></div>';
  h += '<div class="actgrid">';
  if(maxFloor){
    h += card('挑 战 妖 王','守关妖王镇于此层，胜则秘境尽归你手，败则前功尽弃。','', "dungeonBoss()", {hot:true, danger:true});
  }else{
    h += card('深 入 一 层','向下推进一层，途中或遇妖兽。','1 日', "dungeonForward()", {hot:true});
  }
  h += card('搜 寻 此 层', d.searched ? '这一层已被你翻检殆尽。' : '翻查石室与暗格，可能得宝，也可能引来杀机。',
    '每层一次', "dungeonSearch()", d.searched?{lock:true}:{});
  h += card('退 出 秘 境','见好就收。所得之物归你所有。','', "dungeonLeave()");
  h += '</div>';
  return h;
}

/* --- 修炼 --- */
export function actionsCult(){
  const st = stats();
  const need = expNeed(S.level);
  const atMax = S.level >= MAX_LV;
  const ready = S.exp >= need;
  const chain = atMax ? 0 : readyCount();
  const cost = 25 + S.level*6;
  let h = '<div class="actgrid">';

  if(atMax){
    if(ready){
      h += card('白 日 飞 升','凡世修行的尽头已至。九霄雷云为你聚拢，只待踏出最后一步。',
        '无 需 条 件', "doBreakthrough()", {hot:true});
    }
  }else if(ready){
    h += card('冲 击 境 界','修为圆满，尝试晋升至【'+realmAt(S.level+1).name+'】。',
      '成功率 ' + breakChance() + '%' + pillTip(), "doBreakthrough()", {hot:true});
    if(chain >= 2){
      h += card('连 续 突 破','气机已足，一次冲到尽处。每成一境修为便结转下去，失败即止。',
        '可连破 ' + chain + ' 境 · 首破 ' + breakChance() + '%', "doBreakthroughChain()", {hot:true});
    }
  }

  if(!atMax && (S.pills['破境丹']||0) > 0){
    const stack = S.pillStack||0;
    h += card('服 破 境 丹','药力随大境界增厚，每个境界皆可用；至多连服三枚叠加。',
      '丹田已蓄 ' + stack + ' 枚 · 本次 +' + pillBonus() + '%',
      "usePill('破境丹')", stack >= 3 ? {lock:true} : {});
  }

  h += card('打 坐 吐 纳','盘膝运转周天，凝聚天地灵气。回复少量气血灵力。','1 日 · 修为 +'+num(Math.floor(askExp(S.level)*(1+st.cult/100))), "actMeditate()", ready?{}:{hot:true});
  h += card('灵 石 修 炼','布下聚灵阵，以灵石催发磅礴灵气，约四倍于枯坐。','1 日 · '+num(cost)+' 灵石', "actStoneCultivate()", S.stones<cost?{lock:true}:{});
  h += card('闭 关 七 日','封洞苦修，所得丰厚，然心魔或顿悟难料。需气血灵力皆满九成。','7 日 · 修为 +'+num(Math.floor(need*4.2*(1+st.cult/100))), "actSeclusion()",
    (S.mp<st.mpMax*0.9||S.hp<st.hpMax*0.9)?{lock:true}:{});

  h += '</div>';

  h += '<div class="tip" style="margin-top:12px">'
    + '当前境界 <b>'+realmName()+'</b> · 距下一境还需修为 <b>'+num(Math.max(0,need-S.exp))+'</b>'
    + (ready && S.exp > need ? ' · <b>修为溢出 '+num(S.exp-need)+'</b>，突破后结转' : '')
    + ' · 修速加成 <b>+'+st.cult+'%</b>（法宝 · 坐骑 · 传承 · 功法）</div>';
  if((S.pillStack||0) > 0){
    h += '<div class="tip" style="font-size:11px">丹田中已蓄破境丹之力，本次突破 <b>+'+pillBonus()+'%</b>，成或败皆会耗尽。'
      + ((S.breakStreak||0) > 0 ? ' 连破已 '+S.breakStreak+' 境，气机浮动，成功率 -'+Math.min(12,S.breakStreak*3)+'%。' : '') + '</div>';
  }else if((S.breakStreak||0) > 0){
    h += '<div class="tip" style="font-size:11px">连破已 '+S.breakStreak+' 境，气机未稳，本次突破成功率 <b>-'+Math.min(12,S.breakStreak*3)+'%</b>。</div>';
  }
  return h;
}

/* --- 妖兽 --- */
export function actionsHunt(){
  let h = '<div class="tip">选择历练之地。斩妖可得修为、灵石与法器掉落，凶兽以上还可能驯得坐骑，但有重伤之险。</div><div class="actgrid">';
  for(let i=0;i<GROUNDS.length;i++){
    const g = GROUNDS[i];
    const lk = S.level < g.min;
    h += card(g.name + ' <span class="tier-tag">'+TIER_NAME[g.tier]+'</span>',
      g.desc, (lk ? '需 '+realmAt(g.min).name : travelDays(g.days)+' 日 · 推荐战力 '+num(estPower(g.tier))),
      "hunt("+i+")", lk?{lock:true}:{hot: i===curGround()});
  }
  h += '</div>';
  return h;
}

/* --- 秘境 --- */
export function actionsSecret(){
  let h = '<div class="tip">秘境为高风险之地，一旦踏入，气血不济便可能重创而归。层数越深，收获越丰。'
    + (stats().speed ? '坐骑遁速已令赶路耗时降至 <b>'+Math.round((1-stats().speed/100)*100)+'%</b>。' : '') + '</div><div class="actgrid">';
  for(let i=0;i<SECRETS.length;i++){
    const d = SECRETS[i];
    const lk = S.level < d.min;
    const lm = S.mp < d.mp;
    h += card(d.name + ' <span class="tier-tag">' + d.floors + ' 层</span>',
      d.desc,
      (lk ? '需 '+realmAt(d.min).name : travelDays(d.days)+' 日 · 灵力 '+num(d.mp) + (lm ? '（不足）':'')),
      "enterSecret("+i+")", (lk||lm)?{lock:true}:{});
  }
  h += '</div>';
  return h;
}

/* --- 装备 --- */
export function actionsGear(){
  const st = stats();
  let h = '<div class="tip">法器分 <span style="color:#8a8378">凡</span>·<span style="color:#2f7d63">灵</span>·<span style="color:#5b4a9e">宝</span>·<span style="color:#b0701c">仙</span>·<span style="color:var(--zhu)">神</span> 五品。'
    + '法宝可同时温养三件，额外提供修炼速度加成；坐骑独有<b>遁速</b>，可缩短赶路耗时并提高脱身成功率。</div>';
  h += '<div class="actgrid">';
  h += card('当前战力','攻 '+num(st.atk)+' · 防 '+num(st.def)+' · 气血 '+num(st.hpMax)+' · 灵力 '+num(st.mpMax)
    + ' · 暴击 '+st.crit+'% · 修速 +'+st.cult+'% · 遁速 +'+st.speed+'%','', '');
  h += card('择 优 换 装','以神识扫过储物袋，自动挑出威能最盛者祭炼上身。', S.bag.length+' 件备选', "autoEquip()", S.bag.length?{hot:true}:{lock:true});
  h += card('自 动 换 装 · ' + (S.autoEquipOn ? '开' : '关'),
    S.autoEquipOn ? '开关开启：此后所得器物若胜于在身者，自动认主。' : '开关关闭：所得器物一律先收进储物袋，由你亲自过目。',
    '点击切换', "toggleAutoEquip()", S.autoEquipOn?{hot:true}:{});
  h += card('卸 下 全 部','将身上法器与坐骑尽数收回储物袋。','', "unequipAll()");
  h += '</div>';
  return h;
}

/* --- 坊市 --- */
export function actionsShop(){
  let h = '<div class="tip">坊市每 6 日自动换新，也可花 <b>3 灵石</b> 请掌柜再换一批。</div>';
  h += '<div class="actgrid">';
  for(let i=0;i<S.shop.length;i++){
    const it = S.shop[i];
    const cost = itemCost(it);
    h += card(itemLabel(it), '战力 '+num(it.power)+' · '+(it.lv+1)+' 阶',
      cost+' 灵石 · 售 '+num(sellPrice(it)), "buyItem("+i+")", { q:it.q, lock:S.stones<cost });
  }
  h += '</div>';

  h += '<div class="tip" style="margin-top:14px">灵兽栏 · 坐骑</div>';
  h += '<div class="actgrid">';
  if(S.shopMount){
    const m = S.shopMount;
    h += card(mountLabel(m),
      MOUNT_TIER_NAME[m.tier] + ' · 战力 '+num(m.power)+' · 遁速 +'+m.speed+'%',
      mountCost(m)+' 灵石', "buyMount()", { q:m.q, lock:S.stones<mountCost(m) });
  }else{
    h += card('栏 中 空 空','这一批灵兽已被买走，换货后或有新兽。','', '', {lock:true});
  }
  h += '</div>';

  h += '<div class="tip" style="margin-top:14px">丹药铺 · 常备三味</div>';
  h += '<div class="actgrid">';
  for(const p of PILLS){
    if(p.craft) continue;                      /* 只能自炼的丹药不上架（如归元丹） */
    const pr = pillPrice(p);
    h += card(p.name, p.desc, pr+' 灵石', "buyPill('"+p.name+"')", S.stones<pr?{lock:true}:{});
  }
  h += '</div>';
  h += '<div class="actgrid" style="margin-top:10px">';
  h += card('换 一 批 货','支付 3 灵石，请掌柜重新取货。','3 灵石', "refreshShop(false)", S.stones<3?{lock:true}:{});
  h += '</div>';

  /* ---------- 藏经阁 · 功法 ---------- */
  h += '<div class="tip" style="margin-top:18px">藏 经 阁 · 功 法</div>';
  h += '<div class="actgrid">';
  const books = gfShopBook();
  if(!books.length){
    h += card('书 架 已 空','这一批功法已被你收去，换货后或有新卷。','', '', {lock:true});
  }
  for(let i=0;i<books.length;i++){
    const gf = GF_BY_KEY[books[i]];
    if(!gf) continue;
    const p = gfBookPrice(gf);
    h += card('《'+gf.n+'》', gfGrade(gf) + ' · ' + gfPerLvText(gf),
      p+' 灵石 · 买下即习得', "gfBuyBook("+i+")", { q:gf.t, lock:S.stones<p });
  }
  const learnedN = gfLearnedList().length;
  h += card('悟 道 录','心法一格、术法两格——习得多寡不等同于强弱，如何取舍才是关键。',
    '已习得 '+learnedN+' / '+GONGFA.length+' 部', "openGongfa()", {hot:true});
  h += '</div>';

  /* ---------- 丹房 · 炼丹 ---------- */
  h += renderPillSection();

  /* ---------- 器坊 · 炼器 ---------- */
  h += renderGearSection();

  /* ---------- 材料铺 ---------- */
  h += renderMatShopSection();

  /* ---------- 出售台 ---------- */
  h += '<div class="tip" style="margin-top:18px">出 售 台 · 以 器 易 石</div>';
  h += '<div class="filters"><span class="fl">类 型</span>';
  for(const t of SELL_TYPES){
    h += '<span class="chip'+(SELL.type===t.k?' on':'')+'" onclick="setSell(\''+t.k+'\',null)">'+t.n+'</span>';
  }
  h += '</div>';
  h += '<div class="filters"><span class="fl">品 质</span>';
  for(const q of SELL_Q){
    h += '<span class="chip'+(SELL.q===q.k?' on':'')+'" onclick="setSell(null,\''+q.k+'\')">'+q.n+'</span>';
  }
  h += '</div>';

  const list = S.bag.filter(matchSell);
  const tot = list.reduce((a,it)=>a+sellPrice(it), 0);
  h += '<div class="sellbox"><span class="sv">符合条件 <b>'+list.length+'</b> 件 · 可得 <b>'+num(tot)+'</b> 灵石</span>'
    + '<button class="mbtn" style="margin-left:auto;padding:6px 18px;font-size:12px;letter-spacing:.12em;'
      + (list.length?'':'opacity:.4;') + '"' + (list.length?' onclick="sellBatch()"':'') + '>全 部 售 出</button></div>';

  const q0 = S.bag.filter(x=>x.q===0);
  const q1 = S.bag.filter(x=>x.q<=1);
  h += '<div class="actgrid" style="margin-top:9px">';
  h += card('清 空 凡 品','一应凡品法器与坐骑尽数售出，只留可用之物。',
    q0.length ? '共 '+num(q0.reduce((a,it)=>a+sellPrice(it),0))+' 灵石' : '囊中并无凡品',
    "sellQuality(0)", q0.length?{}:{lock:true});
  h += card('清 空 凡 品 与 灵 品','连灵品一起处理，腾出囊中空位。',
    q1.length ? '共 '+num(q1.reduce((a,it)=>a+sellPrice(it),0))+' 灵石' : '囊中并无凡灵之物',
    "sellQuality(1)", q1.length?{}:{lock:true});
  h += '</div>';
  h += '<div class="tip" style="font-size:11px;margin-top:8px">出售价约为购入价的四成，坐骑亦在可售之列。'
    + '储物袋每行右侧的「售」可单件出手；若怕误售，可先在左栏「法器」中关闭自动换装。</div>';
  return h;
}

/* =========================================================
   收尾 / 存档 / 弹层
   ========================================================= */
export function after(){
  clampVitals();
  renderAll();
}

/* 移动端抽屉内的功能入口 */
export function renderUtil(){
  const box = $('utilBox');
  if(!box) return;
  const items = [
    ['道 法', 'showHelp()'],
    ['成 就 ' + achList().length + '/' + ACHIEVEMENTS.length, 'openAchievements()'],
    ['功 法 ' + gfLearnedList().length + '/' + GONGFA.length, 'openGongfa()'],
    ['存 档', 'openSavePanel()'],
    ['传 承' + (META.points ? ' · ' + META.points + ' 点' : ''), 'openHeritage()'],
    ['轮 回', 'openRebirth()'],
    ['明 暗', 'toggleTheme()'],
    ['收 起', 'closeSheet()']
  ];
  let h = '';
  for(const [n, f] of items){
    h += '<button class="mbtn" style="padding:9px 14px;font-size:12.5px;letter-spacing:.08em"'
       + ' onclick="' + f + '">' + n + '</button>';
  }
  box.innerHTML = h;
}
