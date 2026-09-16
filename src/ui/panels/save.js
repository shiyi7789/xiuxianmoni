import { META } from '../../core/meta.js';
import { SAVE_KEY, SLOT_N, exportCode, importSave, restore, saveData, slotKey } from '../../core/save.js';
import { S } from '../../core/state.js';
import { num } from '../../core/utils.js';
import { stats } from '../../sys/character.js';
import { realmName, realmNameOf } from '../../sys/cultivate.js';
import { addLog, toast } from '../../sys/log.js';
import { wipeConfirm } from '../../sys/rebirth.js';
import { closeModal, showModal } from '../modal.js';
import { after, renderAll } from '../render.js';
import { uiKV, uiSec } from '../kit.js';


/* =========================================================
   存 档 · 玉 简（面板 · 第二版重排）
   ---------------------------------------------------------
   第二版改动
     · 顶部一行「当前进度」摘要，替掉原来的大段说明
     · 三枚玉简改为并列卡片，操作按钮规格统一
     · 导出 / 导入分成两段，danger 操作单独收在最后
   ========================================================= */

/* -------- 玉简（手动槽位） -------- */
export function slotInfo(i){
  try{
    const raw = localStorage.getItem(slotKey(i));
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
export function saveToSlot(i){
  try{
    localStorage.setItem(slotKey(i), JSON.stringify(saveData()));
    addLog('你将今世的一切封入第 '+(i+1)+' 枚玉简。','sys');
    after();
    openSavePanel();
  }catch(e){ toast('存档失败：本机存储不可用'); }
}
export function clearSlot(i){
  try{ localStorage.removeItem(slotKey(i)); }catch(e){}
  toast('第 '+(i+1)+' 枚玉简已抹去');
  openSavePanel();
}
export function loadFromSlot(i){
  const d = slotInfo(i);
  if(!d){ toast('此玉简空空如也'); return; }
  if(!restore(d)){ toast('玉简已损，无法读取'); return; }
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(saveData())); }catch(e){}
  closeModal();
  addLog('你以神识探入第 '+(i+1)+' 枚玉简，旧日的自己重新回到身上。','epic');
  renderAll();
  toast('已读取第 '+(i+1)+' 枚玉简');
}
export function copyCode(){
  const el = $('saveCode');
  const code = exportCode();
  if(el) el.value = code;
  const done = () => toast('存档码已复制');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(code).then(done).catch(()=>{ if(el){ el.select(); document.execCommand('copy'); done(); } });
      return;
    }
  }catch(e){}
  if(el){ el.select(); try{ document.execCommand('copy'); done(); }catch(e){ toast('复制失败，请手动选中'); } }
}
export function importFile(){
  const el = $('impFile');
  if(!el) return;
  el.value = '';
  el.click();
}
export function onImportFile(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const fr = new FileReader();
  fr.onload = () => importSave(String(fr.result||''));
  fr.onerror = () => toast('文件读取失败');
  fr.readAsText(f);
}
export function downloadSave(){
  const code = exportCode();
  const blob = new Blob([code], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '修仙存档-'+realmName()+'-第'+S.day+'日.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}
export function fmtTime(ts){
  try{
    const d = new Date(ts);
    const p = n => (n<10?'0':'')+n;
    return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());
  }catch(e){ return ''; }
}

export function openSavePanel(){
  /* ---- 当前进度摘要 ---- */
  let h = uiKV([
    ['当前境界', '<b>'+realmName()+'</b>'],
    ['修行日 / 战力', '第 '+num(S.day)+' 日 · <b>'+num(stats().power)+'</b>'],
    ['斩妖 / 殒身', num(S.kills)+' 头 · '+num(S.deaths)+' 次'],
    ['轮回印记', META.rebirths ? ('第 <b>'+META.rebirths+'</b> 世') : '尚无']
  ]);
  h += '<div class="meta-note">进度每走一步都会自动存入本机。此处另有 <b>3 枚玉简</b>可手动封存；'
    + '存档亦可导出为存档码或文件，用于备份、换机或分享。</div>';

  /* ---- 三枚玉简 ---- */
  h += uiSec('玉 简 · 手 动 封 存', '存下的每一枚都独立于自动存档，可随时读取或抹去。');
  for(let i=0;i<SLOT_N;i++){
    const d = slotInfo(i);
    const sd = d
      ? realmNameOf(d.level) + ' · 第 ' + num(d.day||0) + ' 日 · 灵石 ' + num(d.stones||0)
        + (d.kills ? ' · 斩妖 ' + num(d.kills) : '') + (d.t ? ' · ' + fmtTime(d.t) : '')
      : '空 白　尚未封存任何进度';
    h += '<div class="slotcard">'
      + '<div class="si"><div class="sn">玉 简 '+(i+1)+'</div><div class="sd">'+sd+'</div></div>'
      + '<button class="btn btn-sm" onclick="saveToSlot('+i+')">存 档</button>'
      + '<button class="btn btn-sm'+(d?'':' dis')+'" onclick="'+ (d ? 'loadFromSlot('+i+')' : "toast('此玉简空空如也')") +'">读 档</button>'
      + '<button class="btn btn-sm'+(d?'':' dis')+'" onclick="'+ (d ? 'clearSlot('+i+')' : "toast('此玉简空空如也')") +'">抹 除</button>'
      + '</div>';
  }

  /* ---- 导出 ---- */
  h += uiSec('导 出', '存档码是一串纯文本，可另存为文件，也可发给别人。');
  h += '<textarea class="savecode" id="saveCode" readonly>'+exportCode()+'</textarea>';
  h += '<div class="btnrow">'
    + '<button class="btn btn-sm" onclick="copyCode()">复 制 存 档 码</button>'
    + '<button class="btn btn-sm" onclick="downloadSave()">下 载 为 文 件</button>'
    + '<button class="btn btn-sm" onclick="importFile()">从 文 件 导 入</button>'
    + '</div>';

  /* ---- 导入 / 抹除 ---- */
  h += uiSec('导 入', '粘贴他人或自己备份的存档码，覆盖当前进度。');
  h += '<textarea class="savecode" id="impCode" style="height:58px" placeholder="在此粘贴存档码…"></textarea>';
  h += '<div class="btnrow">'
    + '<button class="btn btn-sm" onclick="importSave(document.getElementById(\'impCode\').value)">导 入 此 码</button>'
    + '<button class="btn btn-sm btn-danger" onclick="wipeConfirm()">抹 除 全 部 进 度</button>'
    + '</div>';

  showModal('存 档 · 玉 简', h, [{label:'关 闭', primary:true, fn:closeModal}], 'wide',
    { sub: realmName() + ' · 第 ' + num(S.day) + ' 日' });
}
