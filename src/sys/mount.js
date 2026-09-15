import { luckBoost } from '../core/meta.js';
import { S, noBusy } from '../core/state.js';
import { clamp, num, pick } from '../core/utils.js';
import { MOUNT_MAX_LV, MOUNT_NAMES } from '../data/mounts.js';
import { QUALITIES } from '../data/qualities.js';
import { checkAch } from './achievement.js';
import { UID, addItem, clampVitals, qBadge, qName, rollQuality } from './character.js';
import { addLog, toast } from './log.js';
import { after } from '../ui/render.js';


export function mountPower(m){
  return Math.round((m.atk||0)*2 + (m.def||0)*2.6 + (m.hp||0)*0.16 + (m.mp||0)*0.1
    + (m.crit||0)*6 + (m.cult||0)*5 + (m.speed||0)*14);
}

/* 依等级重算坐骑属性（喂养后调用） */
export function applyMountStats(m){
  const q = QUALITIES[m.q];
  const s = 1 + m.lv*0.42;
  m.atk   = Math.round(10 * q.mult * s);
  m.def   = Math.round(6  * q.mult * s);
  m.hp    = Math.round(55 * q.mult * s);
  m.mp    = Math.round(22 * q.mult * s);
  m.crit  = +(q.crit * 1.2).toFixed(1);
  m.speed = +(2 + m.tier*1.6 + q.mult*1.1).toFixed(1);
  m.cult  = +(q.mult * 1.3).toFixed(1);
  m.power = mountPower(m);
  return m;
}

export function makeMount(tier, qi, lv){
  tier = clamp(tier, 0, MOUNT_NAMES.length-1);
  const m = {
    id: UID++, kind:'mount', slot:'mount',
    name: pick(MOUNT_NAMES[tier]),
    tier, q: qi, lv: lv || 0
  };
  return applyMountStats(m);
}

export function rollMount(tier, luck){
  return makeMount(tier, rollQuality(clamp((luck||0) + luckBoost(), 0, 1)), 0);
}

export function mountLabel(m){
  const parts = [];
  if(m.atk) parts.push('攻+'+num(m.atk));
  if(m.def) parts.push('防+'+num(m.def));
  if(m.hp)  parts.push('血+'+num(m.hp));
  if(m.mp)  parts.push('灵+'+num(m.mp));
  if(m.crit) parts.push('暴+'+m.crit+'%');
  if(m.speed) parts.push('遁速+'+m.speed+'%');
  if(m.cult) parts.push('修速+'+m.cult+'%');
  return qName(m.name, m.q) + qBadge(m.q)
       + '<span class="muted-sm"> '+parts.join(' · ')+'</span>';
}

export function mountFeedCost(m){
  return Math.round(70 * QUALITIES[m.q].mult * (1 + m.lv*0.7) * (1 + S.level*0.25));
}
export function mountCost(m){
  return Math.round(240 * QUALITIES[m.q].mult * (1 + m.tier*0.55) * (1 + S.level*0.2));
}

export function buyMount(){
  const m = S.shopMount;
  if(!m) return;
  const cost = mountCost(m);
  if(S.stones < cost){ toast('灵石不足（需 '+num(cost)+'）'); return; }
  S.stones -= cost;
  addLog('你以 '+num(cost)+' 枚灵石从灵兽栏中买下【'+m.name+'】。','item');
  addItem(m, true);
  S.shopMount = null;
  after();
}

/* 喂养坐骑：以灵石淬炼，每阶重算属性 */
export function feedMount(){
  if(noBusy('战中无暇温养灵兽')) return;
  const m = S.equip.mount;
  if(!m){ toast('尚无坐骑'); return; }
  if(m.lv >= MOUNT_MAX_LV){ toast('此兽已至化境，无需再喂'); return; }
  const cost = mountFeedCost(m);
  if(S.stones < cost){ toast('灵石不足（需 '+num(cost)+'）'); return; }
  S.stones -= cost;
  m.lv++;
  applyMountStats(m);
  if(m.lv > S.stat.mountMax) S.stat.mountMax = m.lv;
  checkAch();
  addLog('你以灵石温养【'+m.name+'】，其气息愈发凝练——已至 '+m.lv+' 阶，战力 '+num(m.power)+'。','gain');
  clampVitals(); after();
}

export function releaseMount(){
  if(noBusy('战中无暇他顾')) return;
  const m = S.equip.mount;
  if(!m) return;
  S.equip.mount = null;
  addLog('你松了缰绳，【'+m.name+'】长鸣一声，没入云中。','dim');
  clampVitals(); after();
}
