import { fortDrop, fortStone } from '../core/meta.js';
import { S } from '../core/state.js';
import { chance, clamp, num, pick, rf } from '../core/utils.js';
import { MONSTERS, TIER_NAME } from '../data/monsters.js';
import { PILLS } from '../data/pills.js';
import { checkAch } from './achievement.js';
import { addItem, rollItem, stats } from './character.js';
import { codexUnlockMon } from './codex.js';
import { expNeed, gainExp } from './cultivate.js';
import { completeDungeon } from './dungeon.js';
import { addMaterials, matPlain, rollMaterialDrop } from './craft.js';
import { gfActiveSkill, gfSkillByKey, gfSkillMp } from './gongfa.js';
import { titleBonus } from './titles.js';
import { addLog, addSep, toast } from './log.js';
import { rollMount } from './mount.js';
import { usePill } from './pills.js';
import { advance } from './time.js';
import { after, renderAll } from '../ui/render.js';


/* =========================================================
   妖兽系统 / 战斗
   ---------------------------------------------------------
   回合模型：玩家的每个动作 = 自己出手一次 + 敌人行动一次（monsterTurn）
   功法主动技（阶段二）叠加在此模型上：
     · 冷却 cd：每个玩家回合开始递减（tickTurn）
     · 增益 buff：shield（减伤 n 回合）/ dodge（完全闪避 n 回合）
     · 减益 debuff：freeze（敌伤减半 n 回合）/ burn（每回合灼烧扣血 n 回合）
   基础「灵力斩」永远可用（不依赖功法），保证没有功法时战斗照旧。
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
  S.combat = {
    m, ctx: ctx||{}, turn:1,
    cd: {},                                              /* 技能冷却：key → 剩余回合 */
    buff: { shield:0, shieldDur:0, dodge:0, dodgeDur:0 },
    debuff: { freeze:0, burn:0, burnPct:0 }
  };
  S.fightPillN = 0;
  addSep();
  addLog('【'+m.name+'】出现在你面前——'+TIER_NAME[m.tier]+'，气血 '+num(m.hpMax)+'。','dmg');
  codexUnlockMon(m.name);          /* 图鉴：遭遇即收录 */
  renderAll();
}

/* 称号「妖 王 克 星」：对妖王伤害加成（独立乘区，不进 stats()） */
export function bossDmg(d, m){
  const b = titleBonus().boss || 0;
  if(!b || !m || !m.boss) return d;
  return Math.max(1, Math.round(d * (1 + b / 100)));
}

export function dmgRoll(atk, def, crit, mult){
  let d = Math.max(1, atk*rf(0.86,1.14) - def*0.6);
  const isCrit = chance(crit);
  if(isCrit) d *= 1.85;
  return { d: Math.max(1, Math.round(d*(mult||1))), crit: isCrit };
}

/* 战斗对象的安全读取（老存档/异常态下不炸） */
function combatState(c){
  if(!c) return null;
  if(!c.cd || typeof c.cd !== 'object') c.cd = {};
  if(!c.buff) c.buff = { shield:0, shieldDur:0, dodge:0, dodgeDur:0 };
  if(!c.debuff) c.debuff = { freeze:0, burn:0, burnPct:0 };
  return c;
}

/* 每个玩家回合开始时结算：冷却递减、增益/减益计时、灼烧扣血 */
export function tickTurn(){
  const c = combatState(S.combat);
  if(!c) return;
  for(const k in c.cd) if(c.cd[k] > 0) c.cd[k]--;

  if(c.buff.shieldDur > 0){
    c.buff.shieldDur--;
    if(c.buff.shieldDur <= 0){ c.buff.shield = 0; addLog('护体灵光散去。','dim'); }
  }
  if(c.buff.dodgeDur > 0){
    c.buff.dodgeDur--;
    if(c.buff.dodgeDur <= 0) c.buff.dodge = 0;
  }
  if(c.debuff.freeze > 0) c.debuff.freeze--;

  /* 灼烧：按我方攻击力的一定比例，每回合烧敌一次 */
  if(c.debuff.burn > 0 && c.m.hp > 0){
    const st = stats();
    const burn = Math.max(1, Math.round(st.atk * (c.debuff.burnPct || 0.05) * 4));
    c.m.hp -= burn;
    c.debuff.burn--;
    addLog('烈焰灼烧，'+c.m.name+'再受 '+num(burn)+' 点伤害。','dmg');
  }
}

export function fightAttack(){ fightAction('atk'); }
export function fightSkill(){ fightAction('skill'); }

export function fightAction(kind, skIdx){
  const c = combatState(S.combat);
  if(!c) return;
  tickTurn();
  if(c.m.hp <= 0){ winFight(); after(); return; }

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

  let mult = 1, cost = 0;
  if(kind === 'skill'){
    cost = Math.round(st.mpMax*0.15) + 8;
    if(S.mp < cost){ toast('灵力不足（需 '+cost+'）'); return; }
    S.mp -= cost;
    mult = 2.3;
  }

  const r = dmgRoll(st.atk, m.def, st.crit, mult);
  const d = bossDmg(r.d, m);
  m.hp -= d;
  addLog('你'+(kind==='skill' ? '催动灵力，一道灵光斩落' : '挥动法器直取')+'——'
    + (r.crit?'<b>暴击！</b>':'') + '造成 '+num(d)+' 点伤害。', r.crit?'epic':'dmg');

  if(m.hp <= 0){ winFight(); after(); return; }
  monsterTurn();
  after();
}

/* ---------- 功法主动技（阶段二） ---------- */
/* 槽位 0/1 的技能；k 也可直接给功法键（UI 按 key 调用） */
export function castSkill(arg){
  const c = combatState(S.combat);
  if(!c) return;
  const sk = typeof arg === 'number' ? gfActiveSkill(arg) : gfSkillByKey(arg);
  if(!sk){ toast('尚未备下此术'); return; }
  tickTurn();
  if(c.m.hp <= 0){ winFight(); after(); return; }

  const st = stats();
  if((c.cd[sk.key] || 0) > 0){ toast('【'+sk.n+'】尚在冷却（'+c.cd[sk.key]+' 回合）'); return; }
  const cost = gfSkillMp(sk, st.mpMax);
  if(S.mp < cost){ toast('灵力不足（需 '+cost+'）'); return; }

  S.mp -= cost;
  c.cd[sk.key] = sk.cd;

  const m = c.m;
  const fx = sk.fx || {};
  const defUse = m.def * (1 - (fx.pierce || 0));
  const critUse = st.crit + (fx.crit || 0);

  let total = 0, anyCrit = false;
  for(let i=0;i<(sk.hits||1);i++){
    const r = dmgRoll(st.atk, defUse, critUse, sk.mult);
    const d = bossDmg(r.d, m);
    m.hp -= d;
    total += d;
    if(r.crit) anyCrit = true;
    if(m.hp <= 0) break;
  }

  if(sk.mult > 0){
    addLog('你施展【'+sk.n+'】——' + (anyCrit?'<b>暴击！</b>':'')
      + '造成 '+num(total)+' 点伤害' + ((sk.hits||1) > 1 ? '（'+sk.hits+' 段合计）' : '') + '。',
      anyCrit ? 'epic' : 'dmg');
  }else{
    addLog('你施展【'+sk.n+'】。','act');
  }

  /* 附加效果 */
  if(fx.heal && total > 0){
    const h = Math.round(total * fx.heal);
    S.hp = Math.min(st.hpMax, S.hp + h);
    addLog('所伤之血化作一缕精气回流，气血 +'+num(h)+'。','gain');
  }
  if(fx.shield){
    c.buff.shield = fx.shield;
    c.buff.shieldDur = fx.dur || 1;
    addLog('护体灵光凝如实质，'+Math.round(fx.shield*100)+'% 伤害将被卸去（'+c.buff.shieldDur+' 回合）。','gain');
  }
  if(fx.dodge){
    c.buff.dodge = 1;
    c.buff.dodgeDur = fx.dodge;
    addLog('身形一晃，已遁入虚空——'+fx.dodge+' 回合内敌手难着其身。','gain');
  }
  if(fx.freeze){
    c.debuff.freeze = Math.max(c.debuff.freeze, fx.freeze);
    addLog('寒气入体，'+m.name+'动作一滞（'+fx.freeze+' 回合内伤害减半）。','gain');
  }
  if(fx.burn){
    c.debuff.burn = Math.max(c.debuff.burn, fx.burn);
    c.debuff.burnPct = fx.burnPct || 0.05;
    addLog('烈焰附骨，'+m.name+'陷入灼烧（'+fx.burn+' 回合）。','gain');
  }
  if(fx.mpBack){
    const back = Math.round(st.mpMax * fx.mpBack);
    S.mp = Math.min(st.mpMax, S.mp + back);
    addLog('一息运转，灵力回了 '+back+' 点。','sys');
  }
  if(fx.selfDmgPct){
    const sd = Math.max(1, Math.round(st.hpMax * fx.selfDmgPct));
    S.hp -= sd;
    addLog('因果反噬，你自身承受 '+num(sd)+' 点伤害。','warn');
    if(S.hp <= 0){ loseFight(); after(); return; }
  }

  if(m.hp <= 0){ winFight(); after(); return; }
  monsterTurn();
  after();
}
/* 按功法键施放（未装在槽位上也可调用，用于测试与快捷键） */
export function castSkillAt(i){ castSkill(i); }

export function monsterTurn(){
  const c = combatState(S.combat);
  if(!c || c.m.hp <= 0) return;
  const st = stats();
  const m = c.m;

  /* 虚空：完全闪避 */
  if(c.buff.dodge > 0){
    addLog('你的身形在虚空与现世之间闪烁，'+m.name+'扑了个空。','gain');
    c.buff.dodgeDur--;
    if(c.buff.dodgeDur <= 0) c.buff.dodge = 0;
    c.turn++;
    return;
  }

  let dmg;
  if(c.defend){
    const raw = dmgRoll(m.atk, st.def, m.crit, 1);
    dmg = Math.max(1, Math.round(raw.d*0.32));
    addLog(m.name+'猛扑而来，被护体灵光卸去大半力道，你仍受 '+num(dmg)+' 点伤害。','sys');
    c.defend = false;
  }else{
    const r = dmgRoll(m.atk, st.def, m.crit, 1);
    dmg = r.d;
    let tail = (r.crit?'（暴击）':'');
    /* 冰封：伤害减半 */
    if(c.debuff.freeze > 0){
      const cut = Math.round(dmg * 0.5);
      dmg -= cut;
      tail += '（寒气封脉，伤害减半）';
    }
    /* 护盾：按比例减伤 */
    if(c.buff.shield > 0){
      const cut = Math.round(dmg * c.buff.shield);
      dmg = Math.max(1, dmg - cut);
      tail += '（护体灵光卸去 '+num(cut)+'）';
    }
    S.hp -= dmg;
    addLog(m.name+(r.crit?'狞笑一声，一击命中要害':'扑上来撕咬')+'——你受 '+num(dmg)+' 点伤害'+tail+'。','dmg');
    if(S.hp <= 0){ loseFight(); return; }
    c.turn++;
    return;
  }

  /* 御守分支也可能被护盾/冰封补足减伤 */
  if(c.debuff.freeze > 0) dmg = Math.max(1, Math.round(dmg * 0.5));
  if(c.buff.shield > 0) dmg = Math.max(1, dmg - Math.round(dmg * c.buff.shield));
  S.hp -= dmg;
  if(S.hp <= 0){ loseFight(); return; }
  c.turn++;
}

/* 兼容旧 API（阶段一的 fightSkillA/B 现在等价于槽位 0/1 的主动技） */
export function fightSkillA(){ castSkill(0); }
export function fightSkillB(){ castSkill(1); }

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

  /* 材料：与上面三类掉落**并行**，用独立判定，不挤占既有概率（老玩家收益节奏不变） */
  const mats = rollMaterialDrop(m.tier, m.boss);
  if(Object.keys(mats).length){
    addMaterials(mats, true);
    addLog('从残骸中剥取：'+matPlain(mats)+'。','dim');
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
