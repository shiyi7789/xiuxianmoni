import { META, saveMeta } from '../core/meta.js';
import { S } from '../core/state.js';
import { chance, clamp, num } from '../core/utils.js';
import { MAX_LV } from '../data/realms.js';
import { achBonus } from './achievement.js';
import { stats } from './character.js';
import { expNeed, isGroupStart, realmAt, realmName } from './cultivate.js';
import { gfBonus } from './gongfa.js';
import { addLog, addSep, toast } from './log.js';
import { doRebirth, rebirthGain } from './rebirth.js';
import { closeModal, showModal } from '../ui/modal.js';
import { after } from '../ui/render.js';


/* ---------------- 突破 ----------------
   平衡说明：
   · 基础成功率随大境界递减（74% → 45%），比旧版整体下调，用以抵消"溢出结转 + 连破"带来的提速
   · 破境丹加成随大境界增厚（14% → 26%），每个境界皆可用，至多连服三枚叠加
   · 修速（仅计器物）最多 +20%，丹道传承每重 +1.5%
   · 连破惩罚：每连破一境，下一境成功率 -3%（至多 -12%），失败即清零
   · 失败代价改为"当前境界所需修为的 32%"（封顶），不再按持有总量的 35% 扣除
----------------------------------------- */
export function pillBonus(){
  const g = realmAt(S.level).group;
  const base = 14 + Math.min(12, g*1.2);
  const n = clamp(S.pillStack||0, 0, 3);
  const mult = n >= 3 ? 1.55 : (n === 2 ? 1.3 : (n === 1 ? 1 : 0));
  return Math.round(base * mult);
}
export function breakChance(){
  const g = realmAt(S.level).group;
  let c = 74 - g*2.4;
  c += META.up.pill * 1.5;
  c += achBonus().brk;                                      /* 成就加成 */
  c += gfBonus().brk;                                       /* 心法「悟道」类加成 */
  c += Math.min(20, stats().cultGear * 0.28);
  c += pillBonus();
  c -= Math.min(12, (S.breakStreak||0) * 3);
  return clamp(Math.round(c), 20, 96);
}
export function pillTip(){
  const n = S.pillStack||0;
  if(n > 0) return ' · 破境丹 +'+pillBonus()+'%（'+n+' 枚）';
  return (S.pills['破境丹']||0) > 0 ? ' · 可服破境丹' : '';
}

/* 当前修为还够连破几境 */
export function readyCount(){
  if(S.level >= MAX_LV) return 0;
  let e = S.exp, lv = S.level, n = 0;
  while(lv < MAX_LV && e >= expNeed(lv)){ e -= expNeed(lv); lv++; n++; if(n > 99) break; }
  return n;
}

/* 单次突破，返回 'ok' / 'fail' / 'end' */
export function breakthroughOnce(quiet){
  if(S.level >= MAX_LV){ ascend(); return 'end'; }
  const need = expNeed(S.level);
  if(S.exp < need) return 'fail';

  const c = breakChance();
  S.pillStack = 0;                     /* 药力成或败皆尽 */

  if(chance(c)){
    S.level++;
    S.exp = Math.max(0, S.exp - need); /* 溢出结转：可继续冲击下一境 */
    S.breakStreak = (S.breakStreak||0) + 1;
    if(S.breakStreak > S.stat.chainMax) S.stat.chainMax = S.breakStreak;
    const st = stats();
    S.hp = st.hpMax; S.mp = st.mpMax;
    const gname = realmAt(S.level).groupName;
    const grp = realmAt(S.level).group;
    if(!quiet){
      addLog('轰——！','epic');
      addLog('周身灵气如潮水倒灌，经脉节节拓宽，骨骼发出细密脆响。你于剧痛中睁开双眼，眸中精光一闪而逝。','epic');
    }
    addLog('★ 突破成功，境界晋升为【'+realmName()+'】！' + (quiet ? '' : '气血灵力尽复。'),'epic');
    if(isGroupStart(S.level)) addLog('你踏入「'+gname+'」——天地在你眼中骤然不同。','sys');
    if(grp >= 10 && realmAt(S.level).i === 0){
      addLog(grp === 10 ? '仙道之上再无阶可循。至此，你已是准圣之姿，一念可断山河。'
           : grp === 11 ? '万法归一，诸天俯首。圣人之名，自此镌于天碑。'
           : '你触到了那层始终笼罩众生的幕布——天道，就在幕布之后。','epic');
    }
    if(S.level >= MAX_LV){
      addLog('九霄雷云翻涌，天地皆寂。你已走到这条路的尽头，只差最后一步。','epic');
    }
    return 'ok';
  }

  const lose = Math.min(S.exp, Math.floor(need*0.32));
  S.exp -= lose;
  S.breakStreak = 0;                   /* 失败，连破气机尽散 */
  S.stat.breakFail++;
  S.hp = Math.max(1, Math.round(S.hp * 0.42));
  addLog('突破失败！气机反冲，你闷哼一声，嘴角溢出一线暗红。','warn');
  addLog('修为倒退 '+num(lose)+'，气血大损。或许该多备几枚破境丹，或先淬炼几件法器。','dim');
  return 'fail';
}

export function doBreakthrough(){
  if(S.combat || S.dungeon) return;
  if(S.exp < expNeed(S.level)){ toast('修为尚未圆满'); return; }
  const r = breakthroughOnce(false);
  if(r === 'ok') addSep();
  after();
}

/* 连续突破：一口气冲到修为不够或失败为止 */
export function doBreakthroughChain(){
  if(S.combat || S.dungeon) return;
  if(S.level >= MAX_LV){ ascend(); return; }
  if(S.exp < expNeed(S.level)){ toast('修为尚未圆满'); return; }
  addLog('你不再压抑体内翻涌的气机，任由修为一次又一次撞向瓶颈——','act');
  let n = 0, fail = false;
  while(S.level < MAX_LV && S.exp >= expNeed(S.level) && n < 99){
    const r = breakthroughOnce(true);
    n++;
    if(r === 'fail'){ fail = true; break; }
    if(r === 'end') break;
  }
  const got = fail ? n-1 : n;
  if(got > 0) addLog('════ 一连冲破 '+got+' 重境界，气机至此方歇 ════','epic');
  addSep();
  after();
}

/* 飞升结局 */
export function ascend(){
  S.ended = true;
  META.ascensions = (META.ascensions||0) + 1;
  META.best.lv = Math.max(META.best.lv, S.level);
  saveMeta();
  const g = rebirthGain();
  const mountLine = S.equip.mount
    ? '座下【'+S.equip.mount.name+'】长鸣一声，随你一同没入云海。'
    : '你孤身一人，踏碎虚空而去。';
  showModal(
    '白 日 飞 升',
    '九道紫霄神雷自天穹垂落，尽数被你收入体内。<br>你回首望向这片修行了 <b>'+num(S.day)+'</b> 日的天地——'
    + '青云山麓的晨雾、幽冥沼泽的瘴气、天外仙宫的琉璃瓦，一一在眼底流转。<br>'
    + '你从一介炼气小修，走到准圣、圣人，直至叩问天道。<br><br>'
    + mountLine + '<br>'
    + '从此，天碑之上多了一个名字。<br>'
    + '<span style="color:var(--ink3);font-size:12.5px">斩妖 '+num(S.kills)+' 头 · 殒身 '+S.deaths+' 次 · 终境 '+realmName()+
      ' · 此为第 '+(META.ascensions)+' 次飞升</span><br><br>'
    + '<span style="font-size:12.5px">若就此转世，可结 <b>'+g+'</b> 点轮回点，并让下一世修炼更快。'
    + '留在本界亦可，顶栏「轮 回」随时可用。</span>',
    [{ label:'入 轮 回（+'+g+' 点）', primary:true, fn:()=>doRebirth() },
     { label:'留 于 此 界', fn:closeModal }]
  );
}
