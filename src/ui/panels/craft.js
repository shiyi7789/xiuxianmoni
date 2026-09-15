import { S } from '../core/state.js';
import { $, num } from '../core/utils.js';
import { MATERIALS, MAT_ORDER, MAT_SHOP } from '../data/materials.js';
import { GEAR_RECIPES, PILL_RECIPES } from '../data/recipes.js';
import { buyMaterial, canCraftGear, canCraftPill, countMat, craftBlockReason, craftGear, craftMp, craftPill, gearCraftRate, matTierName, matText, pillCraftRate } from '../sys/craft.js';
import { godCls, qName } from '../sys/character.js';
import { realmNameOf } from '../sys/cultivate.js';

/* =========================================================
   材 料 · 炼 制 —— 界面层
   ---------------------------------------------------------
   规则：
   · 面板操作函数一律 crUi 前缀（构建后同作用域，重名会静默覆盖 sys 层）
   · **不用命名空间导入**（`import * as CR` 会被构建器整行剥掉，运行时 CR 就没了）
   · 不新增配色：品阶走 qName()/.qcN，面板行复用 .slot/.heritage/.card 等既有类
   ========================================================= */

/* ---------- 左栏「材 料」面板 ---------- */
export function renderMaterials(){
  const box = $('matBox');
  if(!box) return;
  const owned = MAT_ORDER.filter(k => countMat(k) > 0);

  const tag = $('matTag');
  if(tag) tag.textContent = owned.length + ' / ' + MAT_ORDER.length;

  if(!owned.length){
    box.innerHTML = '<div class="empty-note">囊 中 尚 无 材 料</div>'
      + '<div class="hint-mini">斩妖剥皮、秘境采撷、岩缝拾矿皆有所得。'
      + '材料可在「坊 市」页炼丹与炼器。</div>';
    return;
  }

  let h = '';
  for(const k of owned){
    const m = MATERIALS[k];
    const n = countMat(k);
    h += '<div class="slot'+godCls(m.t)+'">'
      + '<span class="k" style="flex:0 0 58px">'+m.n+'</span>'
      + '<span class="v">'+qName('×'+num(n), m.t)+'</span>'
      + '<span class="q qc'+m.t+'">'+matTierName(m.t)+'</span>'
      + '</div>';
  }
  h += '<div class="hint-mini">材料归本局所有，不随轮回带走。炼制请至「坊 市」页。</div>';
  box.innerHTML = h;
}

/* =========================================================
   坊市页 · 三段
   ========================================================= */

/* ---------- 丹 房 ---------- */
export function renderPillSection(){
  let h = '<div class="tip" style="margin-top:18px">丹 房 · 炼 丹'
    + ((S.pillStack || 0) > 0 ? '　<span class="muted-sm">丹田已蓄破境丹药力 '+S.pillStack+' 枚</span>' : '')
    + '</div>';
  h += '<div class="actgrid">';
  for(const r of PILL_RECIPES) h += crRecipeCard(r, 'pill');
  h += '</div>';
  h += '<div class="tip" style="font-size:11px">炼制消耗<b>灵力与天数</b>（不耗灵石）；失败返还四成材料。'
    + '丹道传承与境界优势可提升成丹率——越级炼则每差一档 -6%。</div>';
  return h;
}

/* ---------- 器 坊 ---------- */
export function renderGearSection(){
  let h = '<div class="tip" style="margin-top:18px">器 坊 · 炼 器</div>';
  h += '<div class="actgrid">';
  for(const r of GEAR_RECIPES) h += crRecipeCard(r, 'gear');
  h += '</div>';
  h += '<div class="tip" style="font-size:11px">所成之器品质随机，至少为'
    + ' <span class="qname qc2">宝品</span>；<b>气运</b>与<b>越级炼器</b>可再提一阶，'
    + '最高 <span class="flow q4">神品</span>。'
    + '坊市刷不出仙品武器，但你可以反复炼——这就是把随机产出变成可控产出。</div>';
  return h;
}

/* ---------- 材 料 铺 ---------- */
export function renderMatShopSection(){
  let h = '<div class="tip" style="margin-top:18px">材 料 铺</div>';
  h += '<div class="actgrid">';
  for(const row of MAT_SHOP){
    const m = MATERIALS[row.k];
    if(!m) continue;
    const can = S.stones >= row.price;
    h += '<div class="card'+(can ? '' : ' lock')+'"'
      + (can ? ' onclick="crUiBuyMat(\''+row.k+'\',1)"' : '')+'>'
      + '<div class="t">'+qName(m.n, m.t)+' <span class="tier-tag">'+matTierName(m.t)+'</span></div>'
      + '<div class="d">来路：'+m.src+'</div>'
      + '<div class="cost">'+row.price+' 灵石 · 已有 '+countMat(row.k)+'</div>'
      + '</div>';
  }
  h += '</div>';
  h += '<div class="tip" style="font-size:11px">材料主要靠<b>打怪与探秘境</b>捡，近乎免费；'
    + '材料铺只是<b>应急补差</b>，故标价略高于成品。'
    + '星辰砂与混沌石不上架——只能自己去高阶秘境与妖王身上找。</div>';
  return h;
}

/* =========================================================
   配方卡片
   ========================================================= */
function crRecipeCard(r, type){
  const isPill = (type === 'pill');
  const rate = Math.round((isPill ? pillCraftRate(r.k) : gearCraftRate(r.k)) * 100);
  const mp = craftMp(r);
  const canOne = isPill ? canCraftPill(r.k, 1) : canCraftGear(r.k, 1);
  const canFive = isPill ? canCraftPill(r.k, 5) : canCraftGear(r.k, 5);
  const fn = isPill ? 'crUiCraftPill' : 'crUiCraftGear';
  const title = isPill
    ? '《'+r.out+'》'
    : ({ weapon:'铸 · 兵 器', armor:'铸 · 护 甲', treasure:'铸 · 法 宝' }[r.slot] || '铸 器');
  const lvTag = (r.lv > 0) ? ' <span class="tier-tag">需 '+realmNameOf(r.lv)+'</span>' : '';

  let h = '<div class="card'+(canOne ? ' hot' : ' lock')+'">';
  h += '<div class="t">'+title+lvTag+'</div>';
  h += '<div class="d">'+r.d+'</div>';
  h += '<div class="d" style="margin-top:4px">用料：'+matText(r.need)+'</div>';
  h += '<div class="cost">成率 '+rate+'% · 灵力 '+num(mp)+' · '+r.days+' 日/次'
    + (isPill ? '' : ' · 最低 '+matTierName(r.qiMin))+'</div>';

  if(canOne){
    h += '<div style="display:flex;gap:6px;margin-top:7px">'
      + '<button class="mbtn" style="flex:1;padding:5px 0;font-size:11.5px;letter-spacing:.06em"'
      + ' onclick="'+fn+'(\''+r.k+'\',1)">炼 一 次</button>'
      + (canFive ? '<button class="mbtn" style="padding:5px 12px;font-size:11.5px;letter-spacing:.06em"'
          + ' onclick="'+fn+'(\''+r.k+'\',5)">×5</button>' : '')
      + '</div>';
  }else{
    const why = craftBlockReason(r) || '暂无余裕';
    h += '<div class="hint-mini" style="margin-top:6px">'+why+'</div>';
  }
  h += '</div>';
  return h;
}

/* =========================================================
   按 钮（crUi 前缀，必须是顶层 function 声明）
   ========================================================= */
export function crUiCraftPill(k, n){ craftPill(k, n); }
export function crUiCraftGear(k, n){ craftGear(k, n); }
export function crUiBuyMat(k, n){ buyMaterial(k, n); }
