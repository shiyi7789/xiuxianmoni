import { ACH_TIER } from '../../data/achievements.js';
import { TITLE_TIER_NAME, TITLES } from '../../data/titles.js';
import { godCls, qName } from '../../sys/character.js';
import { titleActiveKey, titleDefOf, titleEquip, titleOwnedList, titleUnequip } from '../../sys/titles.js';
import { closeModal, showModal } from '../modal.js';

/* =========================================================
   称 号 · 面 板
   ---------------------------------------------------------
   规则：操作函数一律 ttUi 前缀（防顶层重名）
   复用 .heritage / .hr / .hn / .hl / .hd / .hb / .achsec 既有样式
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

  let h = '<div class="meta-note" style="margin-bottom:10px">'
    + '称号是玩法行为的具象化印记。解锁后<b>永久留存</b>，但同时<b>只可佩戴一个</b>'
    + '——佩戴效果是独立乘区，不与功法 / 成就叠乘混淆。<br>'
    + '已解锁 <b>' + owned.length + '</b> / ' + TITLES.length + '。'
    + (active ? '当前佩戴：<b>' + titleDefOf(active).n + '</b>' : '当前未佩戴任何称号。')
    + '</div>';

  h += '<div class="pb-scroll">';
  for(let t = 4; t >= 0; t--){
    const list = TITLES.filter(x => x.t === t);
    if(!list.length) continue;
    h += '<div class="achsec" style="color:' + ACH_TIER[t].c + '">'
      + TITLE_TIER_NAME[t] + ' 品 · ' + list.length + ' 个</div>';
    for(const tt of list){
      const on = owned.indexOf(tt.k) >= 0;
      const act = active === tt.k;
      h += '<div class="heritage' + godCls(tt.t) + '">'
        + '<div class="hr">'
        +   '<span class="hn">' + (on ? qName(tt.n, tt.t) : '<span class="dim">' + tt.n + '</span>') + '</span>'
        +   '<span class="q qc' + tt.t + '">' + TITLE_TIER_NAME[tt.t] + '品</span>'
        +   (act ? '<span class="hl gold">已 佩 戴</span>' : '')
        +   '<span style="margin-left:auto">'
        +     (on
              ? (act
                ? '<button class="hb" style="margin-left:0;padding:4px 10px" onclick="ttUiUnequip()">卸 下</button>'
                : '<button class="hb" style="margin-left:0;padding:4px 10px" onclick="ttUiEquip(\'' + tt.k + '\')">佩 戴</button>')
              : '<button class="hb dis" style="margin-left:0;padding:4px 10px">未 解 锁</button>')
        +   '</span>'
        + '</div>'
        + '<div class="hd">' + tt.d + '</div>'
        + '<div class="hd">佩戴效果 <b>' + ttEffectText(tt) + '</b>'
        +   (on ? '' : '　（解锁后可用）') + '</div>'
        + '</div>';
    }
  }
  h += '</div>';

  showModal('称 号 · 名 帖', h, [{ label:'关 闭', primary:true, fn: closeModal }], 'wide');
}

export function ttUiEquip(k){ if(titleEquip(k)) openTitles(); }
export function ttUiUnequip(){ titleUnequip(); openTitles(); }
