import { ACH_TIER } from '../../data/achievements.js';
import { TITLE_TIER_NAME, TITLES } from '../../data/titles.js';
import { godCls, qName } from '../../sys/character.js';
import { titleActiveKey, titleDefOf, titleEquip, titleOwnedList, titleUnequip } from '../../sys/titles.js';
import { closeModal, showModal } from '../modal.js';
import { uiSeg } from '../kit.js';

/* =========================================================
   称 号 · 名 帖（面板 · 第二版重排）
   ---------------------------------------------------------
   第二版改动
     · 顶部先给「当前佩戴」一个醒目的位置，再按品阶分段
     · 新增品阶分段筛选（五品 + 全部），不必一路滚到底
     · 未解锁的条目只留印记说明，不再与已解锁条目视觉等重
   规则：操作函数一律 ttUi 前缀（防顶层重名）；复用 .heritage / .achsec 既有样式
   ========================================================= */

const EF_LABEL = {
  atk:'攻击 +%', def:'防御 +%', hp:'气血 +%', cult:'修速 +%',
  brk:'突破 +%', speed:'遁速 +%', drop:'掉落率 +%',
  pill:'成丹率 +%', boss:'对妖王伤害 +%', all:'全属性 +%'
};

export function ttEffectText(t){
  if(!t || !t.ef) return '无';
  const parts = [];
  for(const k in t.ef){
    const v = t.ef[k];
    if(k === 'stone'){ parts.push('初始灵石 +' + v); continue; }
    const label = EF_LABEL[k] || (k + ' +');
    parts.push(label.replace('%', v + '%'));
  }
  return parts.join(' · ');
}

export function openTitles(){
  const owned = titleOwnedList();
  const active = titleActiveKey();
  const act = active ? titleDefOf(active) : null;
  const cnt = {};
  for(const t of TITLES) cnt[t.t] = (cnt[t.t] || 0) + 1;

  let h = '<div class="achhd">'
    + '<span class="achsum">已解锁 <b>' + owned.length + '</b> / ' + TITLES.length + '</span>'
    + '<span class="achbar"><i style="width:' + Math.round(owned.length / TITLES.length * 100) + '%"></i></span>'
    + '<span class="achsum">' + (act ? '佩戴中' : '未佩戴') + '</span>'
    + '</div>';

  /* 当前佩戴（或提示去佩戴） */
  if(act){
    h += '<div class="heritage' + godCls(act.t) + '">'
      + '<div class="hr">'
      +   '<span class="hn">' + qName(act.n, act.t) + '</span>'
      +   '<span class="q qc' + act.t + '">' + TITLE_TIER_NAME[act.t] + '品</span>'
      +   '<span class="hl gold">当 前 佩 戴</span>'
      +   '<span class="hbrow"><button class="btn btn-sm" onclick="ttUiUnequip()">卸 下</button></span>'
      + '</div>'
      + '<div class="hd">佩戴效果 <b>' + ttEffectText(act) + '</b>（独立乘区，不与功法 / 成就叠乘混淆）</div>'
      + '</div>';
  }else{
    h += '<div class="meta-note">当前未佩戴任何称号。同一时刻<b>只可佩戴一个</b>——效果是独立乘区，不与功法 / 成就叠乘混淆。</div>';
  }

  /* 品阶分段 */
  const items = [{ k:'all', n:'全 部', c:TITLES.length }];
  for(let t = 4; t >= 0; t--){
    if(cnt[t]) items.push({ k:'t' + t, n:TITLE_TIER_NAME[t] + ' 品', c:cnt[t] });
  }
  h += uiSeg('ttSeg', items, 'all');

  h += '<div class="pb-scroll">';
  for(let t = 4; t >= 0; t--){
    const list = TITLES.filter(x => x.t === t);
    if(!list.length) continue;
    h += '<div class="achsec" style="color:' + ACH_TIER[t].c + '" data-seg="t' + t + '">'
      + TITLE_TIER_NAME[t] + ' 品 · ' + list.length + ' 个</div>';
    for(const tt of list){
      const on = owned.indexOf(tt.k) >= 0;
      const cur = active === tt.k;
      h += '<div class="heritage' + godCls(tt.t) + (on ? '' : ' off') + '" data-seg="t' + t + '">'
        + '<div class="hr">'
        +   '<span class="hn">' + (on ? qName(tt.n, tt.t) : '<span class="dim">' + tt.n + '</span>') + '</span>'
        +   '<span class="q qc' + tt.t + '">' + TITLE_TIER_NAME[tt.t] + '品</span>'
        +   (cur ? '<span class="hl gold">已 佩 戴</span>' : '')
        +   '<span class="hbrow">'
        +     (on
              ? (cur
                ? '<button class="btn btn-sm" onclick="ttUiUnequip()">卸 下</button>'
                : '<button class="btn btn-sm" onclick="ttUiEquip(\'' + tt.k + '\')">佩 戴</button>')
              : '<button class="btn btn-sm dis">未 解 锁</button>')
        +   '</span>'
        + '</div>'
        + '<div class="hd">' + tt.d + '</div>'
        + '<div class="hd">佩戴效果 <b>' + ttEffectText(tt) + '</b>'
        +   (on ? '' : '　（解锁后可用）') + '</div>'
        + '</div>';
    }
  }
  h += '</div>';

  showModal('称 号 · 名 帖', h, [{ label:'关 闭', primary:true, fn: closeModal }], 'wide',
    { sub: '已解锁 ' + owned.length + ' / ' + TITLES.length });
}

export function ttUiEquip(k){ if(titleEquip(k)) openTitles(); }
export function ttUiUnequip(){ titleUnequip(); openTitles(); }
