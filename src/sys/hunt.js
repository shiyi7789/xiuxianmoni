import { fortStone } from '../core/meta.js';
import { S } from '../core/state.js';
import { chance, clamp, num, rf } from '../core/utils.js';
import { GROUNDS } from '../data/grounds.js';
import { checkAch } from './achievement.js';
import { addItem, rollItem, stats } from './character.js';
import { makeMonster, startFight } from './combat.js';
import { realmAt } from './cultivate.js';
import { tryEncounter } from './encounter.js';
import { addLog, toast } from './log.js';
import { rollMount } from './mount.js';
import { advance, travelDays } from './time.js';
import { after, renderAll } from '../ui/render.js';


/* ---------------- 历练 ---------------- */
export function hunt(gi){
  if(S.combat || S.dungeon) return;
  const g = GROUNDS[gi];
  if(S.level < g.min){ toast('境界不足，需 '+realmAt(g.min).name); return; }
  const days = travelDays(g.days);
  advance(days);
  const r = Math.random()*100;
  if(r < 62){
    startFight(makeMonster(g.tier, chance(4)), { type:'hunt' });
    renderAll(); return;
  }else if(r < 78){
    const s = fortStone(Math.round((14 + g.tier*22) * (1 + S.level*0.3) * rf(0.7,1.4)));
    S.stones += s; S.stat.stones += s;
    addLog('你在'+g.name+'搜寻半日，于岩缝中寻得灵石 '+num(s)+' 枚。','item');
  }else if(r < 89){
    addLog('你在'+g.name+'游走'+days+'日，只见风过林梢，未遇敌手。','dim');
  }else if(r < 95){
    const it = rollItem(0, 0.15 + g.tier*0.12);
    addLog('涧边一具枯骨半掩于落叶之下，手中犹握一物。','act');
    addItem(it);
  }else if(r < 98){
    addLog('林间一只受伤的幼兽伏在溪边，见你并不躲闪，反而低鸣着凑了过来。','act');
    addItem(rollMount(clamp(g.tier-1, 0, 4), 0.12 + g.tier*0.13));
  }else{
    const d = Math.round(stats().hpMax*0.22);
    S.hp = Math.max(1, S.hp - d);
    addLog('你误入兽群伏击圈！一番苦战后脱身，气血 -'+num(d)+'。','warn');
  }
  checkAch();
  if(tryEncounter()) return;
  after();
}

export function estPower(tier){
  return Math.round((13 + S.level*5.2) * (1 + tier*0.58) * 5 + 120);
}

export function curGround(){
  let best = 0;
  for(let i=0;i<GROUNDS.length;i++) if(S.level >= GROUNDS[i].min) best = i;
  return best;
}
