import { S } from '../../core/state.js';
import { $, num } from '../../core/utils.js';
import { CAVE_FACILITIES, caveFullCost } from '../../data/cave.js';
import { caveEnsure, cvBonus, cvFacLv, cvFacSummary, cvFmtDuration, cvOfflineCapHours, cvTotalLv, cvTotalMax, cvUpgrade, cvUpgradeCost } from '../../sys/cave.js';
import { toast } from '../../sys/log.js';
import { closeModal, showModal } from '../modal.js';
import { uiDots, uiKV, uiSec } from '../kit.js';

/* =========================================================
   洞 府 · 面 板（第二版重排）
   ---------------------------------------------------------
   第二版改动
     · 弹层顶部加一块「当前总加成 + 进度」总览
     · 五处设施改为「名称 / 等级点阵 / 当前→下级 / 一个按钮」的等高行
     · 离线结算面板改为键值式，一眼看清收了多少
   规则
     · 操作函数一律 cvUi 前缀（构建后同作用域，重名会静默覆盖）
     · 只用具名导入；不新增配色
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

  let h = '<div class="hint-mini" style="margin-top:0">'
    + (parts.length ? parts.join(' · ') : '洞府尚未开垦，点下方开始布置。')
    + '</div>';
  h += '<div class="btnrow">'
    + '<button class="btn btn-sm btn-block" onclick="cvUiOpen()">整 修 洞 府</button></div>';
  box.innerHTML = h;
}

/* ---------- 弹层 ---------- */
export function cvUiOpen(){
  const capH = cvOfflineCapHours();
  const full = caveFullCost();
  const b = cvBonus();
  const prod = [];
  if(b.herb)  prod.push('灵草 <b>' + b.herb.toFixed(2) + '</b>/时');
  if(b.stone) prod.push('灵石 <b>' + b.stone + '</b>/时');

  let h = uiKV([
    ['已开垦', '<b>' + cvTotalLv() + '</b> / ' + cvTotalMax() + ' 级'],
    ['灵田 · 聚灵阵', prod.length ? prod.join('　') : '未 建'],
    ['丹房 · 器坊', '成丹 <b>+' + Math.round(b.pillRate*100) + '%</b>　成器 <b>+' + Math.round(b.gearRate*100) + '%</b>'],
    ['修速', '<b>+' + b.cult + '%</b>'],
    ['离线可累积', '<b>' + capH + ' 小时</b>（静室等级决定）'],
    ['五处全满约需', num(full.stones) + ' 灵石 · ' + full.days + ' 日']
  ]);
  h += '<div class="meta-note">升级消耗<b>灵石与天数</b>——天数即时光流逝，与出门打怪形成节奏竞争。'
    + '<b>离线时灵田与聚灵阵仍在运转</b>，超时可累积上限的部分不再计入，故升静室才有意义。'
    + '洞府归本局所有，<b>轮回清零</b>。</div>';

  h += uiSec('五 处 设 施', '灵田产灵草 · 聚灵阵加修速并凝石 · 丹房加成丹率 · 器坊加成器率 · 静室延长离线时长。');
  h += '<div class="pb-scroll">';
  for(const f of CAVE_FACILITIES) h += cvFacRow(f);
  h += '</div>';

  showModal('洞 府 · 经 营', h, [{ label:'关 闭', primary:true, fn: closeModal }], 'wide',
    { sub: cvTotalLv() + ' / ' + cvTotalMax() + ' 级' });
}

export function cvFacRow(f){
  const lv = cvFacLv(f.k);
  const max = f.max;
  const isFull = lv >= max;
  const cost = isFull ? null : f.cost(lv + 1);
  const can = !!(cost && S && S.stones >= cost.stones);
  const eff = lv > 0 ? cvFacSummary(f, lv) : '未 建';
  const nextEff = isFull ? null : cvFacSummary(f, lv + 1);

  let acts;
  if(isFull){
    acts = '<button class="btn btn-sm dis">已 圆 满</button>';
  }else{
    const price = num(cost.stones);
    const onclick = can
      ? 'cvUiUp(\'' + f.k + '\')'
      : 'toast(\'灵石不足（需 ' + price + '）\')';
    acts = '<button class="btn btn-sm' + (can ? '' : ' dis') + '"'
      + ' onclick="' + onclick + '">整 修 · ' + price + '</button>';
  }

  return '<div class="heritage">'
    + '<div class="hr">'
    +   '<span class="hn">' + f.n + '</span>'
    +   '<span class="hl">' + lv + ' / ' + max + ' 级</span>'
    +   uiDots(lv, max)
    +   '<span class="hbrow">' + acts + '</span>'
    + '</div>'
    + '<div class="hd">' + f.d + '</div>'
    + '<div class="hd"><span class="muted-sm">当前</span> <b>' + eff + '</b>'
    +   (nextEff ? '　<span class="muted-sm">下级</span> <b>' + nextEff + '</b>' : '')
    +   (cost ? '　<span class="muted-sm">费 ' + num(cost.stones) + ' 灵石 · ' + cost.days + ' 日</span>' : '')
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
  h += uiKV([
    report.herb > 0 ? ['灵 田', '已收 <b>' + report.herb + '</b> 株灵草'] : null,
    report.stone > 0 ? ['聚 灵 阵', '已凝 <b>' + num(report.stone) + '</b> 枚灵石'] : null,
    ['离线时长', timeTxt + (report.capped ? '　（已达上限）' : '')]
  ].filter(Boolean));
  if(report.capped){
    h += '<div class="meta-note" style="margin-top:10px">'
      + '离线累积已达 <b>' + cvOfflineCapHours() + ' 小时</b>上限，超出的部分不再计入。'
      + '升级「静 室」可延长可累积时长。</div>';
  }
  showModal('闭 关 归 来', h, [{ label:'收 下', primary:true, fn: closeModal }], 'wide');
}
