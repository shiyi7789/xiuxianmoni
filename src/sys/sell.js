import { S, noBusy } from '../core/state.js';
import { num } from '../core/utils.js';
import { checkAch } from './achievement.js';
import { clampVitals, isMount, itemCost } from './character.js';
import { addLog, toast } from './log.js';
import { mountCost } from './mount.js';
import { after } from '../ui/render.js';


/* -------- 出售价：约为买价的四成 -------- */
export function sellPrice(x){
  if(!x) return 0;
  if(isMount(x)) return Math.max(1, Math.round(mountCost(x)*0.42));
  return Math.max(1, Math.round(itemCost(x)*0.42));
}

/* =========================================================
   出售 · 以器易石
   ========================================================= */
export const SELL_TYPES = [
  {k:'all', n:'全部'}, {k:'weapon', n:'武器'}, {k:'armor', n:'防具'},
  {k:'treasure', n:'法宝'}, {k:'mount', n:'坐骑'}
];
export const SELL_Q = [
  {k:'all', n:'全部'}, {k:'0', n:'凡品'}, {k:'1', n:'灵品'},
  {k:'2', n:'宝品'}, {k:'3', n:'仙品'}, {k:'4', n:'神品'}
];
export let SELL = { type:'all', q:'all' };

export function setSell(type, q){
  if(type) SELL.type = type;
  if(q) SELL.q = q;
  after();
}
export function matchSell(it){
  if(SELL.type !== 'all'){
    if(SELL.type === 'mount'){ if(!isMount(it)) return false; }
    else if(it.slot !== SELL.type || isMount(it)) return false;
  }
  if(SELL.q !== 'all' && it.q !== +SELL.q) return false;
  return true;
}
export function sellBatch(){
  if(noBusy('战中无暇谈价')) return;
  const list = S.bag.filter(matchSell);
  if(!list.length){ toast('没有符合条件的器物'); return; }
  let tot = 0;
  for(const it of list){
    const i = S.bag.indexOf(it);
    if(i >= 0) S.bag.splice(i,1);
    tot += sellPrice(it);
  }
  S.stones += tot;
  S.stat.stones += tot;
  addLog('你抱出一堆器物摊在柜上，掌柜逐件验看，共付灵石 '+num(tot)+' 枚（'+list.length+' 件）。','item');
  checkAch();
  after();
}
export function sellQuality(maxQ){
  if(noBusy('战中无暇谈价')) return;
  const list = S.bag.filter(x => x.q <= maxQ);
  if(!list.length){ toast('没有符合条件的器物'); return; }
  let tot = 0;
  for(const it of list){
    const i = S.bag.indexOf(it);
    if(i >= 0) S.bag.splice(i,1);
    tot += sellPrice(it);
  }
  S.stones += tot;
  S.stat.stones += tot;
  addLog('你把那些用不上的器物尽数卖给掌柜，得灵石 '+num(tot)+' 枚（'+list.length+' 件）。','item');
  checkAch();
  after();
}
export function sellBagItem(id){
  if(noBusy('战中无暇谈价')) return;
  const i = S.bag.findIndex(x=>x.id===id);
  if(i < 0) return;
  const it = S.bag[i], p = sellPrice(it);
  S.bag.splice(i,1);
  S.stones += p;
  S.stat.stones += p;
  addLog('你将【'+it.name+'】售与坊市，得灵石 '+num(p)+' 枚。','item');
  checkAch();
  after();
}
export function sellEquipped(key, idx){
  if(noBusy('战中无暇谈价')) return;
  let it = null;
  if(key === 'treasure'){
    it = S.equip.treasures[idx];
    if(!it) return;
    S.equip.treasures[idx] = null;
  }else{
    it = S.equip[key];
    if(!it) return;
    S.equip[key] = null;
  }
  const p = sellPrice(it);
  S.stones += p;
  S.stat.stones += p;
  addLog('你解下【'+it.name+'】当场售出，得灵石 '+num(p)+' 枚。','item');
  clampVitals(); checkAch(); after();
}
