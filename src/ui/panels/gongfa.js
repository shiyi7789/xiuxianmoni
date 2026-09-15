import { S } from '../core/state.js';
import { num } from '../core/utils.js';
import { GF_BY_KEY, GF_MAX, GF_SEG_NAME, GF_SHU, GF_XIN, GONGFA } from '../data/gongfa.js';
import { closeModal, showModal } from '../modal.js';
import { gfAllOff, gfCost, gfEffectText, gfEquip, gfExpCost, gfGrade, gfLearned, gfLearnedList, gfLevel, gfPerLvText, gfSeg, gfUpgrade } from '../sys/gongfa.js';
import { godCls, qName } from '../sys/character.js';
import { toast } from '../sys/log.js';

/* =========================================================
   功 法 · 悟 道 录（面板）
   ---------------------------------------------------------
   全部复用既有样式类（.heritage / .hr / .hn / .hl / .dots / .hb / .hd
   / .achsec / .meta-note / .pb-scroll），不新增配色
   ========================================================= */

function gfDots(lv, max){
  let s = '<span class="dots">';
  for(let i = 0; i < max; i++) s += '<i class="' + (i < lv ? 'f' : '') + '"></i>';
  return s + '</span>';
}

/* 单行：已习得的可运转 / 参悟；未习得的只作图鉴并提示来路 */
function gfRow(gf, owned){
  const lv = owned ? gfLevel(gf.k) : 0;
  const max = GF_MAX[gf.t];
  const on = !!(S.gongfa && (S.gongfa.xin === gf.k || (S.gongfa.shu || []).indexOf(gf.k) >= 0));
  const full = lv >= max;
  const cost = gfCost(gf.k), ce = gfExpCost(gf.k);
  const short = owned && (S.stones < cost || S.exp < ce);
  const profName = gf.kind === 'xin' ? GF_XIN[gf.p].n : GF_SHU[gf.sk].n;

  let acts = '';
  if(owned){
    const eq = gf.kind === 'xin' ? (on ? '收 起' : '运 转') : (on ? '撤 术' : '备 术');
    acts = '<span style="margin-left:auto;display:flex;gap:6px;flex:0 0 auto">'
      + '<button class="hb" style="margin-left:0;padding:4px 10px" onclick="gfEquip(\'' + gf.k + '\')">' + eq + '</button>'
      + (full
          ? '<button class="hb dis" style="margin-left:0;padding:4px 10px">已 圆 满</button>'
          : '<button class="hb' + (short ? ' dis' : '') + '" style="margin-left:0;padding:4px 10px" onclick="'
            + (short ? "toast('灵石或修为不足')" : "gfUpgrade('" + gf.k + "')") + '">参 悟 · ' + num(cost) + '</button>')
      + '</span>';
  }

  const line2 = owned
    ? gfEffectText(gf, lv)
    : '尚未习得';
  const line3 = '　' + (gf.kind === 'xin' ? '' : '') + gfPerLvText(gf);

  return '<div class="heritage' + godCls(gf.t) + (owned ? '' : ' off') + '">'
    + '<div class="hr">'
    + '<span class="hn">' + qName(gf.n, gf.t) + '</span>'
    + '<span class="hl">' + (owned ? lv + ' / ' + max + ' 重' : '第 ' + (gf.seg + 1) + ' 段') + '</span>'
    + (owned ? gfDots(lv, max) : '')
    + acts
    + '</div>'
    + '<div class="hd">' + gfGrade(gf) + ' · ' + profName + ' · ' + line2
      + (owned && !full ? '　参悟需 <b>' + num(cost) + '</b> 灵石 + <b>' + num(ce) + '</b> 修为' : '')
      + (owned ? '' : '　秘境妖王或坊市藏经阁可得')
    + '</div>'
    + '<div class="hd" style="opacity:.72">' + gf.d + '</div>'
    + '<div class="hd" style="opacity:.62">' + line3 + '</div>'
    + '</div>';
}

export function openGongfa(){
  const learned = gfLearnedList();
  const xin = GF_BY_KEY[S.gongfa && S.gongfa.xin];
  const shu = ((S.gongfa && S.gongfa.shu) || [null, null]).map(k => GF_BY_KEY[k] || null);
  const cur = gfSeg();

  let h = '<div class="meta-note">'
    + '功法分 <b>心法</b>与<b>术法</b>二类。心法只可运转 <b>1 部</b>，术法只可备于识海 <b>2 部</b>'
    + '——习得多寡不等同于强弱，<b>如何取舍才是关键</b>。<br>'
    + '已习得的功法<b>刻入道基、轮回不灭</b>；重数与装备则归本局，须重新参悟。'
    + '参悟同时耗灵石与修为，故「冲境界」与「厚积功法」需自行权衡。<br>'
    + '来路：<b>秘境妖王</b>必有所遗、坊市<b>藏经阁</b>可购。当前境界段 <b>' + GF_SEG_NAME[cur] + '</b>，'
    + '已习得 <b>' + learned.length + '</b> / ' + GONGFA.length + ' 部。'
    + '</div>';

  h += '<div class="heritage"><div class="hr">'
    + '<span class="hn">心 法 一 格</span>'
    + '<span class="hl">' + (xin ? xin.n + ' · ' + gfLevel(xin.k) + ' 重' : '— 空 —') + '</span>'
    + '<span style="margin-left:auto;display:flex;gap:6px;flex:0 0 auto">'
    + (xin ? '<button class="hb" style="margin-left:0;padding:4px 10px" onclick="gfEquip(\'' + xin.k + '\')">收 起</button>' : '')
    + '<button class="hb" style="margin-left:0;padding:4px 10px" onclick="gfAllOff()">尽 数 收 起</button>'
    + '</span></div>'
    + '<div class="hd">术 法 两 格　'
      + (shu[0] || shu[1]
          ? shu.map(x => x ? x.n + ' · ' + gfLevel(x.k) + ' 重' : '空').join('　/　')
          : '— 空 —')
      + '　（战斗中于「灵 力 斩」之外另出此二式）</div></div>';

  h += '<div class="pb-scroll">';

  const owned = GONGFA.filter(g => gfLearned(g.k)).sort((a, b) => b.seg - a.seg || b.t - a.t);
  h += '<div class="achsec" style="color:var(--zhu-d)">已 习 得 · ' + owned.length + '</div>';
  if(!owned.length){
    h += '<div class="meta-note" style="margin-bottom:6px">尚无一部在身。秘境妖王与坊市藏经阁，是功法唯二的来路。</div>';
  }
  for(const gf of owned) h += gfRow(gf, true);

  const rest = GONGFA.filter(g => !gfLearned(g.k));
  h += '<div class="achsec" style="color:var(--ink3)">未 习 得 · ' + rest.length + '</div>';
  for(const gf of rest) h += gfRow(gf, false);

  h += '</div>';

  showModal('功 法 · 悟 道 录', h, [{ label: '关 闭', primary: true, fn: closeModal }], 'wide');
}
