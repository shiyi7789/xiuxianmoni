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
  let h = '<div class="meta-note">进度每走一步都会自动存入本机。此处另有 <b>3 枚玉简</b>可手动封存；'
    + '存档亦可导出为存档码或文件，用于备份、换机或分享。<br>'
    + '当前：<b>'+realmName()+'</b> · 第 '+num(S.day)+' 日 · 战力 '+num(stats().power)
    + ' · 斩妖 '+num(S.kills)+' 头 · 轮回 '+META.rebirths+' 世</div>';

  for(let i=0;i<SLOT_N;i++){
    const d = slotInfo(i);
    const sd = d
      ? realmNameOf(d.level) + ' · 第 ' + num(d.day||0) + ' 日 · 灵石 ' + num(d.stones||0)
        + (d.kills ? ' · 斩妖 ' + num(d.kills) : '') + (d.t ? ' · ' + fmtTime(d.t) : '')
      : '空 白';
    h += '<div class="slotcard">'
      + '<div class="si"><div class="sn">玉简 '+(i+1)+'</div><div class="sd">'+sd+'</div></div>'
      + '<button class="sb" onclick="saveToSlot('+i+')">存 档</button>'
      + '<button class="sb'+(d?'':' dis')+'" onclick="'+ (d ? 'loadFromSlot('+i+')' : "toast('此玉简空空如也')") +'">读 档</button>'
      + '<button class="sb'+(d?'':' dis')+'" onclick="'+ (d ? 'clearSlot('+i+')' : "toast('此玉简空空如也')") +'">抹 除</button>'
      + '</div>';
  }

  h += '<div class="hrline"></div>';
  h += '<div class="meta-note" style="margin-bottom:6px">存 档 码（可另存为文本，或粘贴他人的存档码导入）</div>';
  h += '<textarea class="savecode" id="saveCode" readonly>'+exportCode()+'</textarea>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
    + '<button class="sb" onclick="copyCode()">复 制 存 档 码</button>'
    + '<button class="sb" onclick="downloadSave()">下 载 为 文 件</button>'
    + '<button class="sb" onclick="importFile()">从 文 件 导 入</button>'
    + '</div>';
  h += '<textarea class="savecode" id="impCode" style="height:58px;margin-top:10px" placeholder="在此粘贴存档码…"></textarea>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
    + '<button class="sb" onclick="importSave(document.getElementById(\'impCode\').value)">导 入 此 码</button>'
    + '<button class="sb" onclick="wipeConfirm()">抹 除 全 部 进 度</button>'
    + '</div>';

  showModal('存 档 · 玉 简', h, [{label:'关 闭', primary:true, fn:closeModal}], 'wide');
}
