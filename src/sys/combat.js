import { fortDrop, fortStone } from '../core/meta.js';
import { S } from '../core/state.js';
import { chance, clamp, num, pick, rf } from '../core/utils.js';
import { MONSTERS, TIER_NAME } from '../data/monsters.js';
import { PILLS } from '../data/pills.js';
import { checkAch } from './achievement.js';
import { addItem, rollItem, stats } from './character.js';
import { expNeed, gainExp } from './cultivate.js';
import { completeDungeon } from './dungeon.js';
import { gfSkill, gfSkillMp } from './gongfa.js';
import { addLog, addSep, toast } from './log.js';
import { rollMount } from './mount.js';
import { usePill } from './pills.js';
import { advance } from './time.js';
import { after, renderAll } from '../ui/render.js';


/* =========================================================
   妖兽系统
   ========================================================= */
export function makeMonster(tier, boss){
  const lv = S.level;
  const base = 1 + tier*0.58;
  const k = 1 + lv*0.30;
  const m = {
    name: pick(MONSTERS[tier]) + (boss ? '（妖王）' : ''),
    tier, boss: !!boss,
    hpMax: Math.round(95 * base * k * (boss?2.8:1)),
    atk:   Math.round(11 * base * k * (boss?1.32:1)),
    def:   Math.round(3.4 * base * k * (boss?1.25:1)),
    crit:  5 + tier*3,
    exp:   Math.floor(expNeed(lv) * (0.45 + tier*0.18) * (boss?3.2:1)),
    stones:Math.round((10 + tier*16) * (1 + lv*0.32) * (boss?4:1))
  };
  m.hp = m.hpMax;
  return m;
}

export function startFight(m, ctx){
  S.combat = { m, ctx: ctx||{}, turn:1 };
  S.fightPillN = 0;
  addSep();
  addLog('【'+m.name+'】出现在你面前——'+TIER_NAME[m.tier]+'，气血 '+num(m.hpMax)+'。','dmg');
  renderAll();
}

export function dmgRoll(atk, def, crit, mult){
  let d = Math.max(1, atk*rf(0.86,1.14) - def*0.6);
  const isCrit = chance(crit);
  if(isCrit) d *= 1.85;
  return { d: Math.max(1, Math.round(d*(mult||1))), crit: isCrit };
}

export function fightAttack(){ fightAction('atk'); }
export function fightSkill(){ fightAction('skill'); }
/* 术法两式（仅当识海中备有术法时可用） */
export function fightSkillA(){ fightAction('skill', 0); }
export function fightSkillB(){ fightAction('skill', 1); }

export function fightAction(kind, skIdx){
  const c = S.combat;
  if(!c) return;
  const st = stats();
  const m = c.m;

  if(kind === 'defend'){
    c.defend = true;
    const rec = Math.round(st.mpMax*0.14);
    S.mp = Math.min(st.mpMax, S.mp + rec);
    addLog('你掐诀布下护体灵光，静待其势。（灵力 +'+rec+'）','sys');
    monsterTurn();
    after(); return;
  }

  if(kind === 'flee'){
    if(m.boss){ toast('妖王当前，无从遁走'); return; }
    const fc = Math.min(94, 58 + st.speed*0.8);
    if(chance(fc)){
      addLog('你脚下一错，踏罡步斗，身形暴退数十丈——脱身了。'
        + (st.speed ? '（坐骑遁速 +'+st.speed+'%）' : ''),'sys');
      endFight('flee');
    }else{
      addLog('你转身欲走，却被其拦住去路！','warn');
      monsterTurn();
    }
    after(); return;
  }

  /* 术法：识海中备下的两式之一（未备则回落到基础「灵力斩」） */
  const sk = (kind === 'skill' && (skIdx === 0 || skIdx === 1)) ? gfSkill(skIdx) : null;

  let mult = 1, cost = 0;
  if(kind === 'skill'){
    cost = sk ? gfSkillMp(sk, st.mpMax) : Math.round(st.mpMax*0.15) + 8;
    if(S.mp < cost){ toast('灵力不足（需 '+cost+'）'); return; }
    S.mp -= cost;
    mult = sk ? sk.mult : 2.3;
  }

  const hits = sk ? (sk.hits||1) : 1;
  const pierce = sk ? (sk.pierce||0) : 0;
  const bonusCrit = sk ? (sk.crit||0) : 0;
  const defUse = m.def * (1 - pierce);

  let total = 0, anyCrit = false;
  for(let i=0;i<hits;i++){
    const r = dmgRoll(st.atk, defUse, st.crit + bonusCrit, mult);
    m.hp -= r.d;
    total += r.d;
    if(r.crit) anyCrit = true;
    if(m.hp <= 0) break;
  }

  const verb = sk ? ('催动【'+sk.gf.n+'】')
    : (kind === 'skill' ? '催动灵力，一道灵光斩落' : '挥动法器直取');
  addLog('你'+verb+'——'+ (anyCrit?'<b>暴击！</b>':'')
    + '造成 '+num(total)+' 点伤害'+(hits>1?'（'+hits+' 段合计）':'')+'。', anyCrit?'epic':'dmg');

  if(sk && sk.heal > 0 && total > 0){
    const h = Math.round(total * sk.heal);
    S.hp = Math.min(st.hpMax, S.hp + h);
    addLog('所伤之血化作一缕精气回流，气血 +'+num(h)+'。','gain');
  }
  if(sk && sk.guard > 0){
    c.guard = sk.guard;
    addLog('你一式未收便已结印，护体灵光罩身（本回合减伤 '+Math.round(sk.guard*100)+'%）。','sys');
  }

  if(m.hp <= 0){ winFight(); after(); return; }
  monsterTurn();
  after();
}

export function monsterTurn(){
  const c = S.combat;
  if(!c || c.m.hp <= 0) return;
  const st = stats();
  const m = c.m;

  if(c.defend){
    const raw = dmgRoll(m.atk, st.def, m.crit, 1);
    const d = Math.max(1, Math.round(raw.d*0.32));
    S.hp -= d;
    addLog(m.name+'猛扑而来，被护体灵光卸去大半力道，你仍受 '+num(d)+' 点伤害。','sys');
    c.defend = false;
  }else{
    const r = dmgRoll(m.atk, st.def, m.crit, 1);
    let d = r.d;
    const guarded = !!(c.guard > 0);
    if(guarded) d = Math.max(1, Math.round(d * (1 - c.guard)));
    S.hp -= d;
    addLog(m.name+(r.crit?'狞笑一声，一击命中要害':'扑上来撕咬')+'——你受 '+num(d)+' 点伤害'
      + (guarded?'（守御之法卸去 '+Math.round(c.guard*100)+'%）':'')
      + (r.crit?'（暴击）':'') + '。','dmg');
    c.guard = 0;
  }
  if(S.hp <= 0){ loseFight(); return; }
  c.turn++;
}

export function winFight(){
  const c = S.combat;
  const m = c.m;
  S.kills++;
  if(m.boss) S.stat.boss++;
  addLog('【'+m.name+'】发出一声哀鸣，轰然倒地。','epic');
  gainExp(m.exp);
  const got = fortStone(m.stones);
  S.stones += got; S.stat.stones += got;
  addLog('拾得灵石 '+num(got)+' 枚。','item');

  // 掉落（气运提高掉落概率）
  const dropChance = (m.boss ? 100 : fortDrop(26 + m.tier*7));
  if(chance(dropChance)){
    const it = rollItem(-1 + m.tier, 0.12 + m.tier*0.14 + (m.boss?0.28:0));
    addItem(it);
  }else if(chance(22)){
    const p = pick(PILLS);
    S.pills[p.name] = (S.pills[p.name]||0) + 1;
    addLog('从残骸中摸出一枚「'+p.name+'」。','item');
  }

  // 灵兽幼崽：只有凶兽以上的妖兽才有，妖王概率大涨
  const mtChance = fortDrop(m.boss ? 55 : (m.tier >= 1 ? 5 + m.tier*3.5 : 1.5));
  if(chance(mtChance)){
    addLog('你在其巢穴深处发现一枚尚有余温的兽卵——还能驯服。','act');
    addItem(rollMount(clamp(m.tier - 1, 0, 4), 0.10 + m.tier*0.13 + (m.boss?0.25:0)));
  }
  checkAch();
  endFight('win');
}

export function loseFight(){
  playerDefeated();
}

export function endFight(outcome){
  const c = S.combat;
  const ctx = c.ctx;
  S.combat = null;
  if(outcome === 'win' && ctx.type === 'boss'){ completeDungeon(); return; }
  if(outcome === 'win' && ctx.type === 'dungeon'){
    addLog('你退回秘境甬道，继续前行。','dim');
  }
  renderAll();
}

export function playerDefeated(){
  S.combat = null;
  S.deaths++;
  const lose = Math.floor(S.exp * 0.25);
  S.exp = Math.max(0, S.exp - lose);
  advance(3);
  const st = stats();
  S.hp = Math.round(st.hpMax*0.3);
  S.mp = Math.round(st.mpMax*0.3);
  addLog('你眼前一黑，栽倒在地……','dmg');
  addLog('三日后于溪边醒来，周身剧痛。修为流失 '+num(lose)+'，气血仅余三成。','warn');
  if(S.dungeon){
    addLog('秘境之行就此中断，所得之物尽数遗落在深处。','warn');
    S.dungeon = null;
  }
  addSep();
  after();
}

export function fightPill(){
  if(!S.pills['回春丹']){ toast('没有回春丹'); return; }
  if((S.fightPillN||0) >= 3){ toast('药力已过，再服无用'); return; }
  S.fightPillN = (S.fightPillN||0)+1;
  usePill('回春丹', true);
  addLog('你趁隙吞下一枚回春丹。','gain');
  monsterTurn();
  after();
}
