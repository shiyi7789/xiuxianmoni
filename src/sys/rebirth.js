import { META, META_KEY, blankMeta, blankStat, hCost, rebirthCult, saveMeta } from '../core/meta.js';
import { SAVE_KEY, SAVE_OLD, SLOT_N, hardWipeSave, slotKey } from '../core/save.js';
import { S, newGame } from '../core/state.js';
import { num } from '../core/utils.js';
import { HERITAGE } from '../data/heritage.js';
import { clampVitals, stats } from './character.js';
import { realmName, realmNameOf } from './cultivate.js';
import { addLog, toast } from './log.js';
import { closeModal, showModal } from '../ui/modal.js';
import { openSavePanel } from '../ui/panels/save.js';
import { renderAll } from '../ui/render.js';

export function wipeConfirm(){
  showModal('抹 除 全 部 进 度',
    '此举将删除本机的自动存档、三枚玉简，以及<b>轮回传承</b>与轮回点，无法挽回。<br><br>'
    + '<span style="color:var(--ink3);font-size:12.5px">若只是想把这一世重开、又要保留传承，请用顶栏的「轮 回」。</span>',
    [{label:'取 消', fn:openSavePanel}, {label:'彻 底 抹 除', primary:true, fn:wipeAll}]);
}
export function wipeAll(){
  try{
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_OLD);
    for(let i=0;i<SLOT_N;i++) localStorage.removeItem(slotKey(i));
    localStorage.removeItem(META_KEY);
  }catch(e){}
  META = blankMeta();
  closeModal();
  newGame();
  addLog('前尘尽忘，一切归零。你重新成为一个凡人。','sys');
  renderAll();
  toast('进度与传承皆已抹除');
}

/* =========================================================
   轮回 / 传承 面板
   ========================================================= */
export function rebirthGain(){
  if(!S) return 1;
  return Math.max(1, 1 + Math.floor(S.level/3) + Math.floor(S.kills/30));
}

export function openRebirth(){
  const g = rebirthGain();
  const next = META.rebirths + 1;
  showModal('轮 回 转 世',
    '你将以今世的全部所得，换一枚投向未来的种子。<br><br>'
    + '今世：<b>'+realmName()+'</b> · 修行 <b>'+num(S.day)+'</b> 日 · 斩妖 <b>'+num(S.kills)+'</b> 头 · 战力 <b>'+num(stats().power)+'</b><br>'
    + '可结轮回点 <b>'+g+'</b>；下一世为 <b>第 '+next+' 世</b>，轮回印记使修炼速度 <b>+'+Math.min(20,next*2)+'%</b>。<br><br>'
    + '<span style="color:var(--ink3);font-size:12.5px">灵石、法器、丹药、境界与修为尽数归零，进度归零重来；'
    + '已点化的传承与轮回印记永不消散，<b>已习得的功法亦刻入道基</b>（唯重数须重新参悟），故每一世都比上一世更好走。</span>',
    [{label:'再 想 想', fn:closeModal},
     {label:'入 轮 回（+'+g+' 点）', primary:true, fn:()=>doRebirth()}]);
}

export function doRebirth(){
  if(!S) return;
  const g = rebirthGain();
  META.points += g;
  META.rebirths++;
  META.totalKills += S.kills;
  META.totalDeaths += S.deaths;
  META.best.lv = Math.max(META.best.lv, S.level);
  META.best.day = Math.max(META.best.day, S.day);
  META.best.kills = Math.max(META.best.kills, S.kills);
  if(S.ended) META.ascensions = (META.ascensions||0) + 1;
  /* 历世累计（成就判定跨越轮回） */
  const s0 = S.stat || blankStat();
  for(const k in META.life){
    if(k === 'chainMax' || k === 'mountMax') META.life[k] = Math.max(META.life[k]||0, s0[k]||0);
    else META.life[k] = (META.life[k]||0) + (s0[k]||0);
  }
  saveMeta();
  closeModal();
  hardWipeSave();
  newGame();
  addLog('════ 轮 回 ════','epic');
  addLog('一世修行尽付东流，唯有那点不肯散去的执念留在了神魂里。你自凡俗中再一次睁开眼。','epic');
  if(g) addLog('结得轮回点 '+g+'，可用以点化传承。','item');
  renderAll();
  toast('轮回第 '+META.rebirths+' 世 · 轮回点 +'+g);
}

export function openHeritage(){
  let h = '<div class="meta-note">轮回点由「入轮回」时结算：<b>境界 ÷ 3</b> 与 <b>斩妖 ÷ 30</b> 皆计入，飞升另有厚赏。'
    + '传承一经点化便永久留存，不随肉壳消散，每一世都从更高处起步。<br>'
    + '当前：<b>轮回 '+META.rebirths+' 世</b> · 可用轮回点 <b>'+META.points+'</b>'
    + (rebirthCult() ? ' · 轮回印记 修炼速度 <b>+'+rebirthCult()+'%</b>' : '')
    + (META.best.lv ? ' · 历史最高 '+realmNameOf(META.best.lv) : '') + '</div>';
  h += '<div class="pb-scroll">';
  for(const it of HERITAGE){
    const cur = META.up[it.k]||0;
    const full = cur >= it.max;
    const c = hCost(it);
    let dots = '';
    for(let i=0;i<it.max;i++) dots += '<i class="'+(i<cur?'f':'')+'"></i>';
    h += '<div class="heritage">'
      + '<div class="hr">'
      + '<span class="hn">'+it.name+'</span>'
      + '<span class="hl">'+cur+' / '+it.max+'</span>'
      + '<span class="dots">'+dots+'</span>'
      + '<button class="hb'+((full||META.points<c)?' dis':'')+'" onclick="'
        + (full ? "toast('此传承已至圆满')" : 'buyHeritage(\''+it.k+'\')') + '">'
      + (full ? '已 圆 满' : '点 化 · '+c+' 点') + '</button>'
      + '</div>'
      + '<div class="hd">'+it.desc+'　每重 <b style="color:var(--zhu)">'+it.unit+'</b></div>'
      + '</div>';
  }
  h += '</div>';
  h += '<div class="hrline"></div>';
  h += '<div class="meta-note" style="margin-bottom:0">累计：斩妖 <b>'+num(META.totalKills)+'</b> 头 · '
    + '殒身 <b>'+META.totalDeaths+'</b> 次 · 飞升 <b>'+META.ascensions+'</b> 次 · '
    + '最好战绩 第 '+num(META.best.day)+' 日 / '+realmNameOf(META.best.lv)+'</div>';
  showModal('传 承 · 轮 回 印 记', h, [{label:'关 闭', primary:true, fn:closeModal}], 'wide');
}

export function buyHeritage(k){
  const h = HERITAGE.find(x=>x.k===k);
  if(!h) return;
  const cur = META.up[k]||0;
  if(cur >= h.max){ toast('此传承已至圆满'); return; }
  const c = hCost(h);
  if(META.points < c){ toast('轮回点不足（需 '+c+'）'); return; }
  META.points -= c;
  META.up[k] = cur + 1;
  saveMeta();
  addLog('你在神魂深处点化了「'+h.name+'」第 '+(cur+1)+' 重——'+h.unit+'。','epic');
  clampVitals();
  renderAll();
  openHeritage();
}

/* 兼容旧调用 */
export function hardReset(){ openRebirth(); }
