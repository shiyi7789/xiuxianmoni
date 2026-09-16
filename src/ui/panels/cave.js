import { S } from '../../core/state.js';
import { $, num } from '../../core/utils.js';
import { CAVE_FACILITIES, caveFullCost } from '../../data/cave.js';
import { caveEnsure, cvBonus, cvFacLv, cvFacSummary, cvFmtDuration, cvOfflineCapHours, cvTotalLv, cvTotalMax, cvUpgrade, cvUpgradeCost } from '../../sys/cave.js';
import { toast } from '../../sys/log.js';
import { closeModal, showModal } from '../modal.js';

/* =========================================================
   洞 府 · 面 板
   ---------------------------------------------------------
   规则：
   · 面板操作函数一律 cvUi 前缀（构建后同作用域，重名会静默覆盖）
   · 只用具名导入（禁止 import * as / 默认导入，构建器会剥掉整行）
   · 不新增配色：面板行复用 .heritage / .hr / .hn / .hl / .dots / .hd / .hb
   · 弹层而非新页签（#tabs 移动端写死 5 等分，加第 6 个会破坏布局）
   ========================================================= */

/* ---------- 左栏摘要 ---------- */
export function renderCave(){
  const box = $('caveBox');
  if(!box) return;
  if(!caveEnsure()){ box.innerHTML = ''; return; }

  const tag = $('caveTag');
  if(tag) tag.textContent = cvTotalLv() + ' / ' + cvTotalMax();

  const b = cvBonus();
  const parts = [];
  if(b.herb)     parts.push('灵草 ' + b.herb.toFixed(2) + '/时');
  if(b.stone)    parts.push('灵石 ' + b.stone + '/时');
  if(b.cult)     parts.push('修速 +' + b.cult + '%');
  if(b.pillRate) parts.push('成丹 +' + Math.round(b.pillRate*100) + '%');
  if(b.gearRate) parts.push('成器 +' + Math.round(b.gearRate*100) + '%');

  let h = '<div class="hint-mini">'
    + (parts.length ? parts.join(' · ') : '洞府尚未开垦，点下方开始布置。')
    + '</div>';
  h += '<div style="margin-top:8px">'
    + '<button class="mbtn" style="width:100%;padding:6px 0;font-size:11.5px;letter-spacing:.08em"'
    + ' onclick="cvUiOpen()">整 修 洞 府</button></div>';
  box.innerHTML = h;
}

/* ---------- 弹层 ---------- */
export function cvUiOpen(){
  const capH = cvOfflineCapHours();
  const full = caveFullCost();
  let h = '<div class="meta-note" style="margin-bottom:10px">'
    + '洞府五处：<b>灵田</b>产灵草、<b>聚灵阵</b>加修速并自动凝石、<b>丹房</b>加成丹率、'
    + '<b>器坊</b>加成器率、<b>静室</b>延长离线可累积时长。<br>'
    + '升级消耗<b>灵石与天数</b>（天数即时光流逝，与出门打怪形成节奏竞争）。'
    + '离线时灵田与聚灵阵仍在运转 —— 可累积时长上限为 <b>' + capH + ' 小时</b>，超出的部分不再计入。<br>'
    + '洞府归本局所有，<b>轮回清零</b>（与装备、灵石、材料同轴）。'
    + '<span class="muted-sm">五处全满约需 ' + num(full.stones) + ' 灵石 · ' + full.days + ' 日。</span>'
    + '</div>';

  h += '<div class="pb-scroll">';
  for(const f of CAVE_FACILITIES) h += cvFacRow(f);
  h += '</div>';

  showModal('洞 府 · 经 营', h, [{ label:'关 闭', primary:true, fn: closeModal }], 'wide');
}

export function cvFacRow(f){
  const lv = cvFacLv(f.k);
  const max = f.max;
  const full = lv >= max;
  const cost = full ? null : f.cost(lv + 1);
  const can = !!(cost && S && S.stones >= cost.stones);
  const eff = lv > 0 ? cvFacSummary(f, lv) : '未 建';
  const nextEff = full ? null : cvFacSummary(f, lv + 1);

  let dots = '<span class="dots">';
  for(let i = 0; i < max; i++) dots += '<i class="' + (i < lv ? 'f' : '') + '"></i>';
  dots += '</span>';

  let acts;
  if(full){
    acts = '<button class="hb dis" style="margin-left:0;padding:4px 10px">已 圆 满</button>';
  }else{
    const price = num(cost.stones);
    const onclick = can
      ? 'cvUiUp(\'' + f.k + '\')'
      : 'toast(\'灵石不足（需 ' + price + '）\')';
    acts = '<button class="hb' + (can ? '' : ' dis') + '"'
      + ' style="margin-left:0;padding:4px 10px"'
      + ' onclick="' + onclick + '">整 修 · ' + price + '</button>';
  }

  return '<div class="heritage">'
    + '<div class="hr">'
    +   '<span class="hn">' + f.n + '</span>'
    +   '<span class="hl">' + lv + ' / ' + max + '</span>'
    +   dots
    +   '<span style="margin-left:auto">' + acts + '</span>'
    + '</div>'
    + '<div class="hd">' + f.d + '</div>'
    + '<div class="hd">当前 <b>' + eff + '</b>'
    +   (nextEff ? '　→　下级 <b>' + nextEff + '</b>' : '')
    +   (cost ? '　（费 ' + num(cost.stones) + ' 灵石 · ' + cost.days + ' 日）' : '')
    + '</div>'
    + '</div>';
}

export function cvUiUp(k){
  if(cvUpgrade(k)) cvUiOpen();
}

/* ---------- 离线归来 ---------- */
export function cvShowOfflineReport(report){
  if(!report) return;
  const timeTxt = cvFmtDuration(report.elapsedMs);
  let h = '<div class="encintro">'
    + '你自入定中醒来，洞府一切如常。离山 <b>' + timeTxt + '</b>'
    + (report.capped ? '（已达上限）' : '')
    + '，灵田与聚灵阵一日未曾停歇。</div>';
  h += '<div class="heritage">';
  if(report.herb > 0){
    h += '<div class="hr"><span class="hn">灵 田</span>'
      + '<span class="hl" style="margin-left:auto">已收 <b>' + report.herb + '</b> 株灵草</span></div>';
  }
  if(report.stone > 0){
    h += '<div class="hr"><span class="hn">聚 灵 阵</span>'
      + '<span class="hl" style="margin-left:auto">已凝 <b>' + num(report.stone) + '</b> 枚灵石</span></div>';
  }
  h += '</div>';
  if(report.capped){
    h += '<div class="meta-note" style="margin-top:10px">'
      + '离线累积已达 <b>' + cvOfflineCapHours() + ' 小时</b>上限，超出的部分不再计入。'
      + '升级「静 室」可延长可累积时长。</div>';
  }
  showModal('闭 关 归 来', h, [{ label:'收 下', primary:true, fn: closeModal }], 'wide');
}
