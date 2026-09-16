import { META, heritageCult, luckBoost } from '../core/meta.js';
import { slotKey } from '../core/save.js';
import { S, noBusy } from '../core/state.js';
import { clamp, num, pick } from '../core/utils.js';
import { BASE_NAMES } from '../data/items.js';
import { QUALITIES, Q_FLOW } from '../data/qualities.js';
import { achBonus } from './achievement.js';
import { cvBonus } from './cave.js';
import { codexUnlockItem, codexUnlockMount } from './codex.js';
import { gfBonus } from './gongfa.js';
import { titleBonus } from './titles.js';
import { fbGain } from '../ui/feedback.js';
import { addLog } from './log.js';
import { mountLabel } from './mount.js';
import { after } from '../ui/render.js';


export let UID = 1;
export function makeItem(slot, lv, qi){
  const q = QUALITIES[qi];
  const s = 1 + lv*0.34;
  const it = { id: UID++, slot, q: qi, lv };
  if(slot === 'weapon'){
    it.atk  = Math.round(9 * q.mult * s);
    it.crit = +(q.crit * 0.9).toFixed(1);
    it.name = pick(BASE_NAMES.weapon);
  }else if(slot === 'armor'){
    it.def = Math.round(7 * q.mult * s);
    it.hp  = Math.round(47 * q.mult * s);
    it.name = pick(BASE_NAMES.armor);
  }else{
    it.mp   = Math.round(33 * q.mult * s);
    it.atk  = Math.round(3.4 * q.mult * s);
    it.def  = Math.round(2.3 * q.mult * s);
    it.cult = +(q.mult * 2.2 + lv * 0.12).toFixed(1);
    it.name = pick(BASE_NAMES.treasure);
  }
  it.power = Math.round((it.atk||0)*2 + (it.def||0)*2.6 + (it.hp||0)*0.16 + (it.mp||0)*0.1 + (it.crit||0)*6 + (it.cult||0)*5);
  return it;
}

/* 按运气（0~1）抽品质 —— 仙品与神品概率已整体下调 */
export function rollQuality(luck){
  luck = clamp(luck, 0, 1);
  const w = [
    Math.max(6, 70 - 54*luck),
    22 + 8*luck,
    6 + 14*luck,
    1.2 + 9*luck,
    0.15 + 4.5*luck
  ];
  const tot = w.reduce((a,b)=>a+b,0);
  let r = Math.random()*tot;
  for(let i=0;i<w.length;i++){ r -= w[i]; if(r <= 0) return i; }
  return 0;
}

export function rollItem(levelBias, luck){
  const slot = pick(['weapon','armor','treasure']);
  const lv = Math.max(0, S.level + levelBias);
  return makeItem(slot, lv, rollQuality((luck||0) + luckBoost()));
}

export function itemCost(it){
  const q = QUALITIES[it.q];
  return Math.round(55 * q.mult * (1 + it.lv*0.42));
}

/* -------- 品阶样式：仙品以上挂流光 -------- */
export function flowCls(qi){ return qi >= Q_FLOW ? 'flow q'+qi : ''; }
export function godCls(qi){ return qi > Q_FLOW ? ' shen' : (qi === Q_FLOW ? ' god' : ''); }
export function qName(text, qi){
  return qi >= Q_FLOW
    ? '<span class="flow q'+qi+'">'+text+'</span>'
    : '<span class="qname qc'+qi+'">'+text+'</span>';
}
export function qBadge(qi){
  const fc = flowCls(qi);
  return '<span class="q qc'+qi+(fc?' '+fc:'')+'">'+QUALITIES[qi].name+'</span>';
}
export function isMount(x){ return !!x && (x.kind === 'mount' || x.slot === 'mount'); }

export function itemLabel(it){
  const parts = [];
  if(it.atk) parts.push('攻+'+num(it.atk));
  if(it.def) parts.push('防+'+num(it.def));
  if(it.hp)  parts.push('血+'+num(it.hp));
  if(it.mp)  parts.push('灵+'+num(it.mp));
  if(it.crit) parts.push('暴+'+it.crit+'%');
  if(it.cult) parts.push('修速+'+it.cult+'%');
  return qName(it.name, it.q) + qBadge(it.q)
       + '<span class="muted-sm"> '+parts.join(' · ')+'</span>';
}

/* ---------------- 属性计算 ---------------- */
export function stats(){
  const lv = S ? S.level : 0;
  const st = {
    hpMax: Math.round(130 + lv*54),
    mpMax: Math.round(65 + lv*27),
    atk: 13 + lv*5.2,
    def: 6 + lv*2.8,
    crit: 5,
    cult: 0,
    cultGear: 0,
    speed: 0
  };
  if(S){
    const eq = [S.equip.weapon, S.equip.armor, S.equip.mount, ...S.equip.treasures].filter(Boolean);
    for(const it of eq){
      st.hpMax += it.hp||0; st.mpMax += it.mp||0;
      st.atk += it.atk||0;  st.def += it.def||0;
      st.crit += it.crit||0; st.cult += it.cult||0;
      st.speed += it.speed||0;
    }
  }
  st.cultGear = st.cult;                                   /* 仅器物提供的修速，用于突破判定 */
  const ab = achBonus();
  const gb = gfBonus();                                    /* 已运转心法（功法系统） */
  st.hpMax = Math.round(st.hpMax * (1 + META.up.body*0.05) * (1 + ab.hp/100) * (1 + gb.hp/100));
  st.mpMax = Math.round(st.mpMax * (1 + gb.mp/100));
  st.atk *= (1 + ab.atk/100) * (1 + gb.atk/100);
  st.def *= (1 + ab.def/100) * (1 + gb.def/100);
  st.crit += gb.crit;
  st.cult += heritageCult() + ab.cult + gb.cult + cvBonus().cult;   /* 悟性传承 + 轮回印记 + 成就 + 心法 + 洞府 */
  /* 称号：独立乘区，由这里手动合并（不并入既有公式） */
  const tb = titleBonus();
  if(tb.all){
    st.atk *= (1 + tb.all/100); st.def *= (1 + tb.all/100);
    st.hpMax = Math.round(st.hpMax * (1 + tb.all/100));
  }
  if(tb.atk)  st.atk *= (1 + tb.atk/100);
  if(tb.def)  st.def *= (1 + tb.def/100);
  if(tb.hp)   st.hpMax = Math.round(st.hpMax * (1 + tb.hp/100));
  if(tb.cult) st.cult += tb.cult;
  if(tb.speed) st.speed += tb.speed;
  st.atk = Math.round(st.atk);
  st.def = Math.round(st.def);
  st.crit = +st.crit.toFixed(1);
  st.speed = +st.speed.toFixed(1);
  st.cult = +st.cult.toFixed(1);
  st.gf = gb;                                              /* 供界面展示功法那一份加成 */
  st.power = Math.round(st.atk*2 + st.def*2.6 + st.hpMax*0.16 + st.mpMax*0.1 + st.crit*6);
  return st;
}
export function clampVitals(){
  const st = stats();
  S.hp = clamp(S.hp, 0, st.hpMax);
  S.mp = clamp(S.mp, 0, st.mpMax);
}

/* 把一件器物与当前槽位对比：更强就换上，被替换的退回储物袋。
   返回 true 表示已装备。法宝三格优先填空位，满了才替换其中最弱的一件。 */
export function tryEquipIfBetter(it){
  if(!it || !it.slot) return false;

  if(it.slot === 'treasure'){
    let idx = S.equip.treasures.indexOf(null);
    if(idx < 0){
      let worst = 0;
      for(let i=1;i<3;i++){
        const t = S.equip.treasures[i];
        if(t && t.power < S.equip.treasures[worst].power) worst = i;
      }
      if(!(it.power > S.equip.treasures[worst].power)) return false;
      S.bag.push(S.equip.treasures[worst]);
      S.equip.treasures[worst] = it;
    }else{
      S.equip.treasures[idx] = it;
    }
    return true;
  }

  const cur = S.equip[it.slot];
  if(cur && !(it.power > cur.power)) return false;
  S.equip[it.slot] = it;
  if(cur) S.bag.push(cur);
  return true;
}

/* 统一入库：开启自动换装时，更强的直接上身；否则进储物袋。
   force = true 用于玩家手动购买/拾取时也要走自动逻辑（默认就是） */
/* 器物统计（供成就判定） */
export function countItem(it){
  if(!S || !S.stat || !it) return;
  S.stat.items++;
  if(it.q >= 4) S.stat.shen++;
  else if(it.q >= 3) S.stat.xian++;
  if(isMount(it) && (it.lv||0) > S.stat.mountMax) S.stat.mountMax = it.lv||0;
}

export function addItem(it, quiet){
  if(!it) return false;
  countItem(it);
  /* 图鉴 + 反馈：quiet 只决定「写不写日志」，**不影响反馈** ——
     获得是玩家最该被看见的瞬间，静默获取也要给一次提示 */
  if(isMount(it)) codexUnlockMount(it); else codexUnlockItem(it);
  fbGain(it);

  if(S.autoEquipOn && tryEquipIfBetter(it)){
    if(!quiet){
      const isMount = it.slot === 'mount';
      addLog('获得'+(isMount?'坐骑':'法器')+'：'+ (isMount ? mountLabel(it) : itemLabel(it))
        + '，威能胜于在身者，已自动祭炼。','item');
    }
    return true;
  }

  if(S.bag.length >= 40){
    addLog('储物袋已满，'+it.name+'被随手丢弃。','dim');
    return false;
  }
  S.bag.push(it);
  if(!quiet){
    const isMount = it.slot === 'mount';
    addLog('获得'+(isMount?'坐骑':'法器')+'：'+ (isMount ? mountLabel(it) : itemLabel(it))
      + (S.autoEquipOn ? '（不及在身者，收于囊中）' : ''),'item');
  }
  return true;
}

export function toggleAutoEquip(){
  S.autoEquipOn = !S.autoEquipOn;
  addLog(S.autoEquipOn
    ? '你放开神识，此后所得器物若胜于在身者，皆自行祭炼认主。'
    : '你敛起神识，此后每一件所得都要亲手过目。','sys');
  after();
}

export function equipBag(id){
  if(noBusy('战中无暇换装')) return;
  const i = S.bag.findIndex(x=>x.id===id);
  if(i < 0) return;
  const it = S.bag[i];
  if(it.slot === 'treasure'){
    let slot = S.equip.treasures.indexOf(null);
    if(slot < 0) slot = 0;
    const old = S.equip.treasures[slot];
    S.equip.treasures[slot] = it;
    S.bag.splice(i,1);
    if(old) S.bag.push(old);
  }else if(it.slot === 'mount'){
    const old = S.equip.mount;
    S.equip.mount = it;
    S.bag.splice(i,1);
    if(old) S.bag.push(old);
  }else{
    const old = S.equip[it.slot];
    S.equip[it.slot] = it;
    S.bag.splice(i,1);
    if(old) S.bag.push(old);
  }
  addLog(it.slot === 'mount'
    ? '你翻身上了【'+it.name+'】，四蹄生云。'
    : '你祭炼了【'+it.name+'】，将其纳入体内温养。','act');
  clampVitals();
  after();
}

export function unequip(slotKey, idx){
  if(noBusy('战中无暇换装')) return;
  let it;
  if(slotKey === 'treasure'){
    it = S.equip.treasures[idx];
    if(!it) return;
    S.equip.treasures[idx] = null;
  }else{
    it = S.equip[slotKey];
    if(!it) return;
    S.equip[slotKey] = null;
  }
  S.bag.push(it);
  addLog('你收回【'+it.name+'】。','dim');
  clampVitals();
  after();
}

export function dropItem(id){
  if(noBusy()) return;
  const i = S.bag.findIndex(x=>x.id===id);
  if(i < 0) return;
  const it = S.bag[i];
  S.bag.splice(i,1);
  addLog('你将【'+it.name+'】弃于荒野。','dim');
  after();
}

/* 自动装备：按战力择优（法宝含修炼加成权重，坐骑含遁速权重） */
export function autoEquip(){
  const all = [];
  ['weapon','armor','mount'].forEach(k => { if(S.equip[k]) all.push(S.equip[k]); S.equip[k] = null; });
  for(let i=0;i<3;i++){ if(S.equip.treasures[i]) all.push(S.equip.treasures[i]); S.equip.treasures[i] = null; }
  all.push(...S.bag);
  S.bag = [];

  const by = { weapon:[], armor:[], treasure:[], mount:[] };
  for(const it of all) if(by[it.slot]) by[it.slot].push(it);
  const best = k => by[k].sort((a,b) => b.power - a.power);

  S.equip.weapon = best('weapon')[0] || null;
  S.equip.armor  = best('armor')[0]  || null;
  S.equip.mount  = best('mount')[0]  || null;
  const ts = best('treasure');
  for(let i=0;i<3;i++) S.equip.treasures[i] = ts[i] || null;

  const used = new Set();
  ['weapon','armor','mount'].forEach(k => { if(S.equip[k]) used.add(S.equip[k].id); });
  S.equip.treasures.forEach(t => { if(t) used.add(t.id); });
  S.bag = all.filter(it => !used.has(it.id)).slice(0, 40);

  addLog('你以神识扫过周身器物，挑出威能最盛者重新祭炼——战力至此为 '+num(stats().power)+'。','act');
  clampVitals(); after();
}

export function unequipAll(){
  ['weapon','armor','mount'].forEach(k=>{ if(S.equip[k]){ S.bag.push(S.equip[k]); S.equip[k]=null; } });
  for(let i=0;i<3;i++){ if(S.equip.treasures[i]){ S.bag.push(S.equip.treasures[i]); S.equip.treasures[i]=null; } }
  addLog('你解下周身法器与坐骑，纳入储物袋中。','dim');
  clampVitals(); after();
}
