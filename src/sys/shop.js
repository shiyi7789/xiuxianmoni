import { S } from '../core/state.js';
import { clamp, num, ri } from '../core/utils.js';
import { addItem, itemCost, rollItem } from './character.js';
import { gfRollBook } from './gongfa.js';
import { addLog, toast } from './log.js';
import { rollMount } from './mount.js';
import { after } from '../ui/render.js';


/* =========================================================
   坊市 / 装备
   ========================================================= */
export function refreshShop(free){
  if(!free){
    if(S.stones < 3){ toast('灵石不足'); return; }
    S.stones -= 3;
    addLog('你付了 3 枚灵石，请掌柜换了批新货。','dim');
  }
  S.shop = [];
  for(let i=0;i<4;i++){
    S.shop.push(rollItem(ri(-1,2), 0.08 + S.level/60));
  }
  // 灵兽栏：坊市常设一头坐骑，随境界与刷新浮动
  const mt = clamp(ri(0,1) + Math.floor(S.level/12), 0, 4);
  S.shopMount = rollMount(mt, 0.10 + S.level/70);
  /* 藏经阁：每批货摆两部未习得的功法 */
  S.shopBook = gfRollBook();
  S.shopDay = S.day;
  if(!free) after();
}

export function buyItem(i){
  const it = S.shop[i];
  if(!it) return;
  const cost = itemCost(it);
  if(S.stones < cost){ toast('灵石不足（需 '+num(cost)+'）'); return; }
  S.stones -= cost;
  S.shop.splice(i,1);
  addLog('你以 '+num(cost)+' 枚灵石购得【'+it.name+'】。','item');
  addItem(it, true);
  after();
}
