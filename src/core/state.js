import { META, blankStat, heritageSummary } from './meta.js';
import { num } from './utils.js';
import { stats } from '../sys/character.js';
import { addLog, toast } from '../sys/log.js';
import { refreshShop } from '../sys/shop.js';
import { renderAll } from '../ui/render.js';


/* =========================================================
   状态
   ========================================================= */
export let S = null;

/* 战中/秘境中禁止的操作 */
export function busy(){ return !!(S && (S.combat || S.dungeon)); }
export function noBusy(msg){ if(busy()){ toast(msg || '此刻无暇他顾'); return true; } return false; }

export function newGame(){
  S = {
    level:0, exp:0, day:1, stones:40 + META.up.stone*200,
    hp:0, mp:0,
    equip:{ weapon:null, armor:null, mount:null, treasures:[null,null,null] },
    bag:[],
    pills:{ '回春丹':2, '聚灵丹':1, '破境丹':0 },
    logs:[],
    combat:null,
    dungeon:null,
    shop:[],
    shopMount:null,
    shopDay:1,
    pillStack:0,
    breakStreak:0,
    autoEquipOn:true,
    kills:0, deaths:0,
    tab:'cult',
    ended:false,
    stat: blankStat(),
    encDay:0,
    encOpen:null,
    /* 功法：本局的重数与装备槽
       被动（心法）3 格 · 主动（术法）2 格 —— 已习得清单在 META.gongfa，轮回不灭 */
    gongfa:{ passive:[null,null,null], active:[null,null], lv:{} },
    /* 坊市藏经阁的当期货品（功法键） */
    shopBook:[]
  };
  const st = stats();
  S.hp = st.hpMax; S.mp = st.mpMax;
  refreshShop(true);
  addLog('你自凡俗中醒来，只觉丹田处一缕微弱灵气缓缓流转——那便是修行的起点。','epic');
  if(META.rebirths > 0){
    addLog('════ 第 '+META.rebirths+' 世 ════','epic');
    addLog('前尘如潮水般退去，唯有刻在神魂里的那点东西留了下来：'+heritageSummary()+'。','sys');
    if(META.up.stone) addLog('囊中另有前世积攒的灵石 '+num(40 + META.up.stone*200)+' 枚。','item');
  }
  addLog('提示：先在「修炼」中打坐吐纳积累修为，修为圆满后即可冲击境界。','sys');
  renderAll();
}
