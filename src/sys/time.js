import { S } from '../core/state.js';
import { clamp } from '../core/utils.js';
import { stats } from './character.js';
import { refreshShop } from './shop.js';


/* ---------------- 时间 ---------------- */
export function advance(days){
  S.day += days;
  const st = stats();
  S.hp = Math.min(st.hpMax, S.hp + Math.round(st.hpMax * 0.07 * days));
  S.mp = Math.min(st.mpMax, S.mp + Math.round(st.mpMax * 0.09 * days));
  if(S.day - S.shopDay >= 6) refreshShop(true);
}

/* 坐骑遁速：缩短赶路耗时（修炼不受影响） */
export function travelDays(base){
  const cut = clamp(stats().speed, 0, 65);
  return Math.max(1, Math.round(base * (1 - cut/100)));
}
