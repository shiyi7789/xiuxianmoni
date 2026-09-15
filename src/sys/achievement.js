import { META, achList, blankStat, fortune, luckBoost, saveMeta } from '../core/meta.js';
import { S } from '../core/state.js';
import { ACHIEVEMENTS, ACH_BY_KEY, ACH_TIER, achTierText, fmtBonus } from '../data/achievements.js';
import { SECRETS } from '../data/secrets.js';
import { realmAt } from './cultivate.js';
import { addLog } from './log.js';
import { closeModal, showModal } from '../ui/modal.js';


/* 汇总当前可判定的一切数据（本局 + 历世累计） */
export function achAgg(){
  const s = S.stat || blankStat(), l = META.life || blankStat();
  const sum = k => (s[k]||0) + (l[k]||0);
  const eq = S.equip;
  return {
    lv: Math.max(S.level, META.best.lv||0),
    grp: realmAt(Math.max(S.level, META.best.lv||0)).group,
    day: Math.max(S.day, META.best.day||0),
    kills: S.kills + META.totalKills,
    deaths: S.deaths + META.totalDeaths,
    rebirths: META.rebirths,
    asc: META.ascensions,
    med: sum('med'), sec: sum('sec'), secEnter: sum('secEnter'),
    ins: sum('ins'), boss: sum('boss'), secret: sum('secret'),
    stones: sum('stones'), items: sum('items'),
    xian: sum('xian'), shen: sum('shen'),
    mountMax: Math.max(s.mountMax||0, l.mountMax||0),
    chain: Math.max(s.chainMax||0, l.chainMax||0),
    pillUse: sum('pillUse'), breakFail: sum('breakFail'), enc: META.encSeen||0,
    secretAll: (META.secSet||[]).length >= SECRETS.length,
    gearFull: !!(eq.weapon && eq.armor && eq.treasures[0] && eq.treasures[1] && eq.treasures[2]),
    fort: fortune()
  };
}

/* 成就加成的汇总（供 stats / 突破率使用） */
export function achBonus(){
  const b = { atk:0, def:0, hp:0, cult:0, brk:0, f:0 };
  for(const k of achList()){
    const d = ACH_BY_KEY[k];
    if(!d) continue;
    const tb = ACH_TIER[d.t].b;
    b.atk += tb.atk||0; b.def += tb.def||0; b.hp += tb.hp||0;
    b.cult += tb.cult||0; b.brk += tb.brk||0;
  }
  return b;
}

/* 扫描并解锁；返回本次新解锁的成就数组 */
export function checkAch(){
  if(!S) return [];
  const list = achList();
  const a = achAgg();
  const got = [];
  for(const d of ACHIEVEMENTS){
    if(list.indexOf(d.k) >= 0) continue;
    let ok = false;
    try{ ok = !!d.c(a); }catch(e){ ok = false; }
    if(ok){ list.push(d.k); got.push(d); }
  }
  if(got.length){
    saveMeta();
    for(const d of got){
      addLog('【成就 · '+ACH_TIER[d.t].n+'品】'+d.n+' —— '+d.d+'　（'+achTierText(d.t)+'）','ach');
    }
    showAchPop(got[got.length-1], got.length);
  }
  return got;
}

/* 解锁横幅：金色卷轴自顶垂下 */
export function showAchPop(d, total){
  if(!d) return;
  const t = ACH_TIER[d.t];
  const el = document.createElement('div');
  el.className = 'achpop' + (d.t >= 4 ? ' shen' : '');
  el.innerHTML = '<span class="aseal">'+t.n+'</span>'
    + '<span class="atxt">'
    + '<span class="ak">成 就 达 成'+(total>1 ? ' ×'+total : '')+'</span><br>'
    + '<span class="an">'+d.n+'</span><br>'
    + '<span class="ab">'+achTierText(d.t)+'</span>'
    + '</span>';
  document.body.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); }, 2600);
  setTimeout(()=>{ el.remove(); }, 3100);
}

/* 成就面板 */
export function openAchievements(){
  const a = achAgg();
  const list = achList();
  const have = list.length, all = ACHIEVEMENTS.length;
  const ab = achBonus();
  const fb = Object.assign({}, ab); fb.f = fortune();
  let h = '<div class="achhd">'
    + '<span class="achsum">已 得 <b style="color:var(--zhu-d)">'+have+'</b> / '+all+'</span>'
    + '<span class="achbar"><i style="width:'+Math.round(have/all*100)+'%"></i></span>'
    + '<span class="achsum">气 运 <b style="color:#a07a2c">'+fortune()+'</b></span>'
    + '</div>';
  h += '<div class="meta-note">成就一旦达成便永久留存，<b>轮回也不消散</b>。'
    + '累积加成：<b>'+fmtBonus(fb)+'</b><br>'
    + '气运同时增益三处：掉落品质（运气 +'+(luckBoost()).toFixed(2)+'）、'
    + '灵石收益（+'+Math.round(fortune()*0.6)+'%）、掉落概率（+'+Math.round(fortune()*0.8)+'%）。'
    + '已遇奇遇 <b>'+META.encSeen+'</b> 次。</div>';
  h += '<div class="pb-scroll">';
  for(let t=4;t>=0;t--){
    const list2 = ACHIEVEMENTS.filter(x => x.t === t);
    const got = list2.filter(x => list.indexOf(x.k) >= 0).length;
    h += '<div class="achsec" style="color:'+ACH_TIER[t].c+'">'
      + ACH_TIER[t].n+' 品 · '+got+'/'+list2.length+'</div>';
    h += '<div class="achg">';
    for(const d of list2){
      const on = list.indexOf(d.k) >= 0;
      h += '<div class="ach'+(on?' got':'')+'">'
        + (on ? '<span class="tick">已 达 成</span>' : '')
        + '<div class="ant"><span class="tier" style="color:'+ACH_TIER[d.t].c+'">'+ACH_TIER[d.t].n+'</span>'+d.n+'</div>'
        + '<div class="ad">'+d.d+'</div>'
        + '<div class="ab2">'+achTierText(d.t)+'</div>'
        + '</div>';
    }
    h += '</div>';
  }
  h += '</div>';
  showModal('成 就 · 道 心 有 痕', h, [{label:'关 闭', primary:true, fn:closeModal}], 'wide');
}
