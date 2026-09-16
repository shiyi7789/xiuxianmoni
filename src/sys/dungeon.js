import { META, fortStone, saveMeta } from '../core/meta.js';
import { S } from '../core/state.js';
import { chance, num, rf, ri } from '../core/utils.js';
import { SECRETS } from '../data/secrets.js';
import { checkAch } from './achievement.js';
import { addItem, rollItem, stats } from './character.js';
import { makeMonster, startFight } from './combat.js';
import { codexUnlockSec } from './codex.js';
import { expNeed, gainExp, realmAt } from './cultivate.js';
import { addMaterials, matPlain, rollBossMats, rollSearchMats } from './craft.js';
import { gfGrant, gfRollDrop } from './gongfa.js';
import { addLog, addSep, toast } from './log.js';
import { rollMount } from './mount.js';
import { advance, travelDays } from './time.js';
import { after, renderAll } from '../ui/render.js';
import { fbDungeon } from '../ui/feedback.js';


/* =========================================================
   秘境系统
   ========================================================= */
export function enterSecret(si){
  if(S.combat || S.dungeon) return;
  const d = SECRETS[si];
  if(S.level < d.min){ toast('境界不足，需 '+realmAt(d.min).name); return; }
  if(S.mp < d.mp){ toast('灵力不足，需 '+num(d.mp)); return; }
  S.mp -= d.mp;
  advance(travelDays(d.days));
  S.dungeon = { idx:si, floor:1, total:d.floors, searched:false, gained:0, items:0 };
  addSep();
  addLog('你以灵力 '+num(d.mp)+' 打开「'+d.name+'」的入口禁制，踏入其中。','epic');
  addLog(d.desc,'dim');
  S.stat.secEnter++;
  codexUnlockSec(si);              /* 图鉴：进入即收录 */
  floorIntro();
  checkAch();
  after();
}

export function floorIntro(){
  const d = S.dungeon, def = SECRETS[d.idx];
  if(d.floor === d.total){
    addLog('═══ 第 '+d.floor+' 层 · 终点 ═══  前方妖气冲霄，守关妖王的气息压得你几乎喘不过气。','warn');
  }else{
    addLog('─── 第 '+d.floor+'/'+d.total+' 层 ───','sys');
  }
}

export function dungeonSearch(){
  const d = S.dungeon;
  if(!d || d.searched) return;
  d.searched = true;
  const def = SECRETS[d.idx];
  const r = Math.random()*100;

  if(r < 34){
    const s = fortStone(Math.round((30 + def.tier*70) * (1 + S.level*0.35) * rf(0.8,1.3)));
    S.stones += s; d.gained += s; S.stat.stones += s;
    addLog('崖壁暗格中藏着一只玉匣，启开是满满灵石。','item');
    addLog('灵石 +'+num(s),'gain');
  }else if(r < 54){
    const it = rollItem(ri(0,2), def.luck);
    if(addItem(it)) d.items++;
  }else if(r < 68){
    const e = Math.floor(expNeed(S.level) * (0.28 + def.tier*0.1));
    gainExp(e);
    addLog('石壁上刻着上古修士的修行心得，你默诵良久，受益匪浅。','act');
  }else if(r < 76){
    addLog('石室角落一只异兽被禁制锁了不知多少岁月，见你破阵，竟低头伏地。','act');
    addItem(rollMount(ri(0, def.tier+1), def.luck + 0.16));
  }else if(r < 90){
    addLog('你拨开藤蔓，一头妖兽猛然扑出！','warn');
    startFight(makeMonster(def.tier, false), { type:'dungeon' });
    renderAll(); return;
  }else{
    const dm = Math.round(stats().hpMax*0.18);
    S.hp = Math.max(1, S.hp - dm);
    addLog('脚下法阵骤然亮起，万千雷芒穿体而过——但你并非全无收获。','warn');
    const s = fortStone(Math.round((45 + def.tier*90) * (1 + S.level*0.35)));
    S.stones += s; S.stat.stones += s;
    addLog('气血 -'+num(dm)+'，却从阵眼中剥离出灵石 '+num(s)+' 枚。','dmg');
  }
  after();
}

export function dungeonForward(){
  const d = S.dungeon;
  if(!d || d.floor >= d.total) return;
  const def = SECRETS[d.idx];
  const e = Math.floor(expNeed(S.level) * (0.16 + def.tier*0.06));
  gainExp(e);
  d.floor++;
  d.searched = false;
  advance(1);
  /* 每层保底：走一趟总有点收获（与既有分支并行，不改动它们） */
  const got = rollSearchMats(def.tier);
  addMaterials(got, true);
  addLog('沿途采撷：'+matPlain(got)+'。','dim');
  floorIntro();
  if(chance(48)){
    addLog('转角处一道黑影直扑而至！','warn');
    startFight(makeMonster(def.tier, false), { type:'dungeon' });
  }
  after();
}

export function dungeonBoss(){
  const d = S.dungeon;
  if(!d) return;
  const def = SECRETS[d.idx];
  addLog('你踏上最后一级台阶，守关妖王缓缓转身——','dmg');
  startFight(makeMonster(def.tier, true), { type:'boss' });
  renderAll();
}

export function completeDungeon(){
  const d = S.dungeon;
  const def = SECRETS[d.idx];
  addSep();
  addLog('═══ 「'+def.name+'」 已 被 贯 通 ═══','epic');
  const e = Math.floor(expNeed(S.level) * (0.9 + def.tier*0.35));
  gainExp(e);
  const s = fortStone(Math.round((160 + def.tier*380) * (1 + S.level*0.35)));
  S.stones += s; S.stat.stones += s;
  addLog('妖王陨落，其守护的宝藏尽归你手：灵石 +'+num(s)+'。','item');
  const n = def.tier + 1;
  for(let i=0;i<n;i++){
    const it = rollItem(ri(1,4), def.luck + 0.2);
    addItem(it);
  }
  addLog('你自秘境深处掠出，衣衫猎猎。此番所得，抵得上数月苦修。','epic');
  if(S.pills['破境丹'] === 0 && chance(50)){
    S.pills['破境丹'] = 1;
    addLog('妖王内丹中竟凝着一缕破境之机，可炼为破境丹。','item');
  }
  if(chance(38)){
    addLog('妖王尸身前，一头幼兽蜷缩着低鸣——它认你为主了。','act');
    addItem(rollMount(ri(1, def.tier+1), def.luck + 0.22));
  }
  /* 妖王身上的材料包（与既有掉落并行） */
  const bm = rollBossMats(def.tier);
  addMaterials(bm, true);
  addLog('妖王陨落，尸身中剥出：'+matPlain(bm)+'。','item');
  /* 妖王遗物：必有一部功法石壁（已尽数参透则折算灵石） */
  const gf = gfRollDrop();
  if(gf){
    addLog('洞府最深处，石壁上刻着一部功法，笔意森然——','act');
    gfGrant(gf);
  }else{
    const gift = fortStone(220 + def.tier * 300);
    S.stones += gift; S.stat.stones += gift;
    addLog('石壁上的功法你早已参透，只将拓本收起，换作灵石 +'+num(gift)+'。','dim');
  }
  S.dungeon = null;
  S.stat.secret++;
  fbDungeon(def);                  /* L2 中央浮层：秘境贯通 */
  if(META.secSet.indexOf(d.idx) < 0){ META.secSet.push(d.idx); saveMeta(); }
  addSep();
  checkAch();
  after();
}

export function dungeonLeave(){
  const d = S.dungeon;
  if(!d) return;
  addLog('你见好就收，循原路退出「'+SECRETS[d.idx].name+'」。','sys');
  S.dungeon = null;
  after();
}
