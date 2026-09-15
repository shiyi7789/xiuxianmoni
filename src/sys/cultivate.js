import { fortStone } from '../core/meta.js';
import { S } from '../core/state.js';
import { chance, clamp, num, pick, rf } from '../core/utils.js';
import { MAX_LV, REALMS } from '../data/realms.js';
import { checkAch } from './achievement.js';
import { stats } from './character.js';
import { tryEncounter } from './encounter.js';
import { addLog, toast } from './log.js';
import { advance } from './time.js';
import { after } from '../ui/render.js';

export function realmAt(lv){ return REALMS[clamp(lv,0,MAX_LV)]; }
export function realmName(){ return realmAt(S.level).name; }
/* 是否为某个大境界的第一层（用于日志提示） */
export function isGroupStart(lv){ return lv > 0 && realmAt(lv).i === 0; }

/* 修为需求：随境界指数增长 */
export function expNeed(lv){ return Math.floor(140 * Math.pow(1.42, lv)); }
export function askExp(lv){ return expNeed(lv) * 0.22; }          // 一次打坐
export function realmNameOf(lv){ return REALMS[clamp(lv||0,0,MAX_LV)].name; }

/* ---------------- 修为 ---------------- */
export function gainExp(v, silent){
  S.exp += v;
  if(!silent && v > 0) addLog('修为 +' + num(v), 'gain');
}

/* =========================================================
   修炼系统
   ========================================================= */
export function medGain(){
  const st = stats();
  return Math.floor(askExp(S.level) * (1 + st.cult/100) * rf(0.9, 1.16));
}

export function actMeditate(){
  if(S.combat || S.dungeon) return;
  const before = S.exp;
  const g = medGain();
  advance(1);
  gainExp(g);
  const st = stats();
  S.hp = Math.min(st.hpMax, S.hp + Math.round(st.hpMax*0.18));
  S.mp = Math.min(st.mpMax, S.mp + Math.round(st.mpMax*0.28));
  addLog('你在蒲团上盘膝而坐，以「'+pick(['引气诀','玄门吐纳法','周天导引术','清心诀'])+'」运转周天，灵气自百会入，沉于丹田。','act');
  addLog('一日苦修，气血与灵力皆有所复。','dim');
  S.stat.med++;
  medEvent();
  checkBreakReady(before);
  checkAch();
  if(tryEncounter()) return;
  after();
}

export function actStoneCultivate(){
  if(S.combat || S.dungeon) return;
  const cost = 25 + S.level*6;
  if(S.stones < cost){ toast('灵石不足（需 '+cost+'）'); return; }
  const before = S.exp;
  S.stones -= cost;
  const st = stats();
  const g = Math.floor(expNeed(S.level) * 0.85 * (1 + st.cult/100) * rf(0.95,1.15));
  advance(1);
  gainExp(g);
  addLog('你将 '+cost+' 枚灵石布成聚灵阵，盘坐阵眼。灵石寸寸碎裂，化作精纯灵气涌入四肢百骸——比枯坐快上数倍。','act');
  S.stat.med++;
  medEvent();
  checkBreakReady(before);
  checkAch();
  if(tryEncounter()) return;
  after();
}

export function actSeclusion(){
  if(S.combat || S.dungeon) return;
  const st = stats();
  if(S.mp < st.mpMax*0.9){ toast('灵力不足九成，无法闭关'); return; }
  if(S.hp < st.hpMax*0.9){ toast('气血不足九成，无法闭关'); return; }
  const before = S.exp;
  S.hp = Math.round(st.hpMax*0.5);
  S.mp = Math.round(st.mpMax*0.2);
  advance(7);
  addLog('你封死洞府石门，布下九重禁制，闭关七日。','act');
  let g = Math.floor(expNeed(S.level) * 4.2 * (1 + st.cult/100));
  if(chance(26)){
    const lose = Math.floor(g * 0.42);
    g -= lose;
    S.hp = Math.max(1, Math.round(S.hp*0.5));
    addLog('闭关第三日，心魔骤起——过往执念化作幻影直刺神魂。你咬破舌尖以痛制妄，七日功成时，修为竟折损近半。','warn');
  }else if(chance(22)){
    g = Math.floor(g * 1.55);
    addLog('闭关第五日，潮汐般的灵机忽然贯通，你于恍惚间窥见天地至理——顿悟！','epic');
  }else{
    addLog('洞中无日月。七日后石门开启，你周身气息沉凝了几分。','act');
  }
  gainExp(g);
  S.stat.sec++;
  checkBreakReady(before);
  checkAch();
  if(tryEncounter()) return;
  after();
}

export function medEvent(){
  const r = Math.random()*100;
  if(r < 4){
    const bonus = Math.floor(expNeed(S.level)*0.35);
    gainExp(bonus, true);
    S.stat.ins++;
    addLog('入定之中，忽有灵光乍现，你抓住那一瞬——顿悟！额外修为 +'+num(bonus),'epic');
  }else if(r < 6.5){
    const s = fortStone(12);
    S.stones += s;
    S.stat.stones += s;
    addLog('吐纳时地脉灵气涌动，竟在身侧凝出 '+s+' 枚灵石。','item');
  }else if(r < 8){
    addLog('灵气岔行，你急忙收功调息，所幸并无大碍。','warn');
  }
}

export function checkBreakReady(before){
  const need = expNeed(S.level);
  if(S.exp >= need && before < need){
    if(S.level >= MAX_LV) addLog('════ 修为再无可增，天穹之上雷云翻涌——可以「白日飞升」了！ ════','epic');
    else addLog('════ 修为圆满，气机已至瓶颈，可冲击「'+realmAt(S.level+1).name+'」！ ════','epic');
  }
}
