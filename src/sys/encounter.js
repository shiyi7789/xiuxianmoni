import { META, fortStone, saveMeta } from '../core/meta.js';
import { S, busy } from '../core/state.js';
import { chance, clamp, num } from '../core/utils.js';
import { ENCOUNTERS, ENC_CD, ENC_RATE } from '../data/encounters.js';
import { checkAch } from './achievement.js';
import { addItem, clampVitals, rollItem, stats } from './character.js';
import { makeMonster, startFight } from './combat.js';
import { expNeed, gainExp, realmAt } from './cultivate.js';
import { addLog, addSep } from './log.js';
import { closeModal, showModal } from '../ui/modal.js';
import { after } from '../ui/render.js';


export function encSeg(){
  const g = realmAt(S.level).group;
  return g <= 1 ? 0 : g <= 3 ? 1 : g <= 6 ? 2 : g <= 9 ? 3 : 4;
}
export function encTier(){ return clamp(encSeg() + 1, 0, 4); }

export function eExp(m){ return Math.floor(expNeed(S.level) * m); }
export function eStone(m){ return fortStone(Math.round((50 + S.level*30) * m)); }
export function eStones(m){ const v = eStone(m); S.stones += v; addLog('灵石 +'+num(v)+' 枚。','item'); return v; }
export function eGain(m){ gainExp(eExp(m)); }
export function eLoot(luck, bias, n){
  n = n || 1;
  for(let i=0;i<n;i++) addItem(rollItem(bias === undefined ? 0 : bias, luck));
}
export function ePill(name, n){ S.pills[name] = (S.pills[name]||0) + n; addLog('得「'+name+'」×'+n+' 枚。','item'); }
export function eHeal(){ const st = stats(); S.hp = st.hpMax; S.mp = st.mpMax; addLog('气血与灵力尽复。','gain'); }
export function eHurt(m){ const d = Math.round(stats().hpMax*m); S.hp = Math.max(1, S.hp - d); addLog('气血 -'+num(d)+'。','dmg'); }
export function eSpend(mp){ const d = Math.round(stats().mpMax*mp); S.mp = Math.max(0, S.mp - d); return d; }
export function eFight(tier, boss){ startFight(makeMonster(clamp(tier,0,4), !!boss), { type:'enc' }); }
export function eMirror(){
  const st = stats();
  const hp = Math.round(st.hpMax*1.1);
  return { name:'镜中之我', tier:3, boss:false, hpMax:hp, hp:hp,
    atk: Math.round(st.atk*1.05), def: Math.round(st.def*0.95), crit: st.crit,
    exp: eExp(2.8), stones: eStone(3.2) };
}

export function tryEncounter(){
  if(!S || busy() || S.encOpen) return false;
  if(S.day - (S.encDay||0) < ENC_CD) return false;
  if(!chance(ENC_RATE)) return false;
  const seg = encSeg();
  const pool = ENCOUNTERS.filter(e => e.seg === seg);
  if(!pool.length) return false;
  const tot = pool.reduce((a,e)=>a+e.w, 0);
  let r = Math.random()*tot, sel = pool[0];
  for(const e of pool){ r -= e.w; if(r <= 0){ sel = e; break; } }
  S.encDay = S.day;
  S.encOpen = sel;
  META.encSeen = (META.encSeen||0) + 1;
  if(META.encKeys.indexOf(sel.k) < 0) META.encKeys.push(sel.k);
  if(S.stat) S.stat.enc++;
  saveMeta();
  addSep();
  addLog('【奇遇 · '+sel.t+'】'+sel.d,'enc');
  showEncounter();
  return true;
}

export function showEncounter(){
  const e = S.encOpen;
  if(!e) return;
  let h = '<div class="encintro">'+e.d+'</div><div class="encopts">';
  for(let i=0;i<e.ch.length;i++){
    const o = e.ch[i];
    h += '<div class="encopt" onclick="encChoose('+i+')">'
      + '<div class="et">'+o.t+'</div>'
      + (o.d ? '<div class="ed">'+o.d+'</div>' : '')
      + '</div>';
  }
  h += '</div>';
  showModal('奇 遇 · '+e.t, h, [], 'wide');
}

export function encChoose(i){
  const e = S.encOpen;
  if(!e) return;
  const o = e.ch[i];
  if(!o) return;
  S.encOpen = null;
  closeModal();
  addLog('你选择了「'+o.t+'」。','sys');
  try{ o.f(); }catch(err){}
  checkAch();
  clampVitals();
  after();
}
