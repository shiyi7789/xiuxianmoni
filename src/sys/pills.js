import { S, busy } from '../core/state.js';
import { PILLS } from '../data/pills.js';
import { pillBonus } from './breakthrough.js';
import { stats } from './character.js';
import { realmAt } from './cultivate.js';
import { addLog, toast } from './log.js';
import { after } from '../ui/render.js';

/* 丹药价格随大境界上浮 */
export function pillPrice(p){
  const g = S ? realmAt(S.level).group : 0;
  return Math.round(p.price * (1 + g*0.30));
}

export function buyPill(name){
  const p = PILLS.find(x=>x.name===name);
  if(!p) return;
  if(p.craft){ toast('此丹坊市不售，须自己在丹房炼'); return; }
  if(S.stones < p.price){ toast('灵石不足（需 '+p.price+'）'); return; }
  S.stones -= p.price;
  S.pills[name] = (S.pills[name]||0) + 1;
  addLog('购得「'+name+'」一枚。','item');
  after();
}

export function usePill(name, force){
  if(!S.pills[name]) return;
  if(!force && busy()){ toast('战中无暇服丹，请在战斗面板中点「服丹」'); return; }
  const st = stats();
  if(name === '回春丹'){
    if(S.hp >= st.hpMax){ toast('气血已满'); return; }
    S.pills[name]--;
    S.hp = Math.min(st.hpMax, S.hp + Math.round(st.hpMax*0.45));
    addLog('你服下回春丹，暖流游走周身，伤口以肉眼可见的速度愈合。','gain');
  }else if(name === '聚灵丹'){
    if(S.mp >= st.mpMax){ toast('灵力已满'); return; }
    S.pills[name]--;
    S.mp = Math.min(st.mpMax, S.mp + Math.round(st.mpMax*0.65));
    addLog('聚灵丹入喉即化，枯竭的灵力迅速充盈。','gain');
  }else if(name === '归元丹'){
    if(S.hp >= st.hpMax && S.mp >= st.mpMax){ toast('气血与灵力皆满'); return; }
    S.pills[name]--;
    S.hp = st.hpMax;
    S.mp = st.mpMax;
    addLog('归元丹入腹，药力如春水漫过四肢百骸——气血与灵力尽复。','epic');
  }else if(name === '破境丹'){
    const stack = S.pillStack||0;
    if(stack >= 3){ toast('丹田药力已至极限，再服无益'); return; }
    S.pills[name]--;
    S.pillStack = stack + 1;
    addLog('你服下第 '+(stack+1)+' 枚破境丹，一股雄浑药力沉入丹田，静待突破之时迸发。'
      + '（本次突破 +'+pillBonus()+'%）','epic');
  }else{
    toast('此丹尚不知用法');
    return;
  }
  S.stat.pillUse++;
  after();
}
