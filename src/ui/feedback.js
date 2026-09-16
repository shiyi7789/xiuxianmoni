import { META, saveMeta } from '../core/meta.js';
import { num } from '../core/utils.js';
import { MATERIALS } from '../data/materials.js';
import { achTierText } from '../sys/achievement.js';
import { godCls, isMount, itemLabel, mountLabel, qName } from '../sys/character.js';
import { gfEffectText, gfGrade } from '../sys/gongfa.js';
import { closeModal, showModal } from './modal.js';

/* =========================================================
   反 馈 系 统
   ---------------------------------------------------------
   设计目标：让每一次「获得」在合适的视觉重量下**即时可见**

   四级（频率与视觉重量成反比）：
     L0 · 微  —— 顶栏数字浮动 +N（修为/灵石），不阻塞
     L1 · 轻  —— 右下角 toast 队列，最多 3 条同时显示
     L2 · 中  —— 中央浮层，品质光晕，2 秒自动关闭
     L3 · 重  —— 全屏淡入 + 大浮层，需手动关闭

   约束：
     · 不新增配色，品质色走 .qc0~qc4 / godCls
     · 音效由 Web Audio 现场合成，**不引入资源文件、无第三方请求**
     · prefers-reduced-motion 时动画降级，音效保留
     · 队列化：中央浮层（L2/L3）独占，依次展示
     · 所有 DOM 操作都有 try/catch —— 测试沙箱里没有完整 DOM 也不能崩
   ========================================================= */

/* ---------- 状态 ---------- */
let FB_INITED = false;
let FB_ACTX = null;
let FB_TOASTS = [];            /* 当前在屏的 L1 元素 */
let FB_CENTER_QUEUE = [];      /* 待展示的 L2/L3 配置 */
let FB_CENTER_SHOWING = false;
let FB_LAST_STRIP = '';

/* ---------- 分档判定 ---------- */
export function fbLevelOfItem(it){
  if(!it) return 0;
  if(it.q >= 4) return 3;      /* 神品 → L3 */
  if(it.q >= 2) return 2;      /* 宝品 / 仙品 → L2 */
  return 1;                    /* 凡 / 灵品 → L1 */
}
export function fbLevelOfMat(k){
  const m = MATERIALS[k];
  if(!m) return 1;
  if(m.t >= 4) return 3;
  if(m.t >= 2) return 2;
  return 1;
}
export function fbLevelOfPill(name){
  return (name === '破境丹' || name === '归元丹') ? 2 : 1;
}
export function fbLevelOfBreak(isGroupStart){ return isGroupStart ? 3 : 2; }

/* ---------- 偏好 ---------- */
export function fbAudioOn(){
  if(!META || !META.prefs) return true;
  return META.prefs.audio !== false;
}
export function fbToggleAudio(){
  if(!META.prefs) META.prefs = { audio:true };
  META.prefs.audio = !fbAudioOn();
  saveMeta();
  return META.prefs.audio;
}

/* ---------- 音效（Web Audio 现场合成） ---------- */
export function fbInitAudio(){
  if(FB_INITED) return;
  FB_INITED = true;
  try{
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if(!AC) return;
    FB_ACTX = new AC();
  }catch(e){ FB_ACTX = null; }
}
function fbBeep(freq, dur, type, vol){
  if(!fbAudioOn() || !FB_ACTX) return;
  try{
    if(FB_ACTX.state === 'suspended') FB_ACTX.resume();
    const osc = FB_ACTX.createOscillator();
    const gain = FB_ACTX.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const t0 = FB_ACTX.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(FB_ACTX.destination);
    osc.start(); osc.stop(t0 + dur + 0.02);
  }catch(e){}
}
const FB_SOUND = {
  coin:    () => fbBeep(880, 0.06, 'sine', 0.04),
  item:    () => fbBeep(660, 0.10, 'triangle', 0.05),
  xian:    () => { fbBeep(990, 0.18, 'triangle', 0.07); setTimeout(() => fbBeep(1320, 0.22, 'sine', 0.05), 100); },
  shen:    () => { fbBeep(440, 0.30, 'sawtooth', 0.05); setTimeout(() => fbBeep(660, 0.40, 'sine', 0.07), 150); setTimeout(() => fbBeep(880, 0.50, 'sine', 0.06), 350); },
  breakth: () => { fbBeep(220, 0.40, 'sawtooth', 0.05); setTimeout(() => fbBeep(330, 0.50, 'triangle', 0.06), 220); },
  asc:     () => { fbBeep(196, 0.60, 'sine', 0.05); setTimeout(() => fbBeep(392, 0.80, 'triangle', 0.07), 300); setTimeout(() => fbBeep(784, 1.00, 'sine', 0.06), 700); },
  ach:     () => { fbBeep(523, 0.12, 'triangle', 0.05); setTimeout(() => fbBeep(784, 0.18, 'triangle', 0.05), 100); setTimeout(() => fbBeep(1046, 0.25, 'sine', 0.04), 240); }
};

/* ---------- DOM 小工具（沙箱无 DOM 时不崩） ---------- */
function fbDoc(){ return (typeof document !== 'undefined') ? document : null; }
function fbEl(id){ const d = fbDoc(); return d ? d.getElementById(id) : null; }

/* ---------- L0 · 数字浮动 ---------- */
export function fbDelta(anchorEl, txt, kind){
  const d = fbDoc();
  if(!d || !anchorEl || !d.body) return;
  try{
    const r = (anchorEl.getBoundingClientRect && anchorEl.getBoundingClientRect()) || { left:0, top:0, width:0, height:0 };
    const el = d.createElement('div');
    el.className = 'fb-delta fb-delta-' + (kind || 'gain');
    el.textContent = txt;
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.top + r.height / 2) + 'px';
    d.body.appendChild(el);
    setTimeout(() => { try{ el.remove(); }catch(e){} }, 1400);
  }catch(e){}
}

/* 修为 / 灵石：120ms 节流合并，避免连击时刷屏
   ⚠ 方案原稿把 fbExpDelta 定义了两遍（锚点版 + 节流版），节流版再回调同名函数
     → 无限递归。这里只保留一个入口，内部调 fbDelta。 */
let FB_EXP_ACC = 0, FB_EXP_TIMER = null;
let FB_STONE_ACC = 0, FB_STONE_TIMER = null;

export function fbExpDelta(v){
  if(!v) return;
  FB_EXP_ACC += v;
  if(FB_EXP_TIMER) return;
  FB_EXP_TIMER = setTimeout(() => {
    const n = FB_EXP_ACC;
    FB_EXP_ACC = 0; FB_EXP_TIMER = null;
    fbDelta(fbEl('expTxt'), (n > 0 ? '+' : '') + num(n), n > 0 ? 'gain' : 'cost');
  }, 120);
}
export function fbStoneDelta(v){
  if(!v) return;
  FB_STONE_ACC += v;
  if(FB_STONE_TIMER) return;
  FB_STONE_TIMER = setTimeout(() => {
    const n = FB_STONE_ACC;
    FB_STONE_ACC = 0; FB_STONE_TIMER = null;
    fbDelta(fbEl('topStones'), (n > 0 ? '+' : '') + num(n), n > 0 ? 'gold' : 'cost');
  }, 120);
}

/* ---------- L1 · toast 队列 ---------- */
const FB_TOAST_MAX = 3;
export function fbToastQueue(text, cls){
  const d = fbDoc();
  if(!d || !d.body) return;
  try{
    let root = fbEl('fbToastRoot');
    if(!root){
      root = d.createElement('div');
      root.id = 'fbToastRoot';
      root.className = 'fb-toast-root';
      d.body.appendChild(root);
    }
    if(FB_TOASTS.length >= FB_TOAST_MAX){
      const old = FB_TOASTS.shift();
      if(old){ old.className += ' out'; setTimeout(() => { try{ old.remove(); }catch(e){} }, 240); }
    }
    const el = d.createElement('div');
    el.className = 'fb-toast' + (cls ? ' ' + cls : '');
    el.innerHTML = text;
    root.appendChild(el);
    FB_TOASTS.push(el);
    setTimeout(() => el.className += ' on', 16);
    setTimeout(() => {
      el.className += ' out';
      const i = FB_TOASTS.indexOf(el);
      if(i >= 0) FB_TOASTS.splice(i, 1);
      setTimeout(() => { try{ el.remove(); }catch(e){} }, 260);
    }, 2400);
  }catch(e){}
}

/* ---------- L2 / L3 · 中央浮层（队列，独占） ---------- */
export function fbCenterQueue(cfg){
  FB_CENTER_QUEUE.push(cfg);
  if(!FB_CENTER_SHOWING) fbCenterNext();
}
function fbCenterNext(){
  if(FB_CENTER_SHOWING) return;
  const cfg = FB_CENTER_QUEUE.shift();
  if(!cfg) return;
  const d = fbDoc();
  if(!d || !d.body){ FB_CENTER_SHOWING = false; return; }
  FB_CENTER_SHOWING = true;

  let mask = null;
  try{
    mask = d.createElement('div');
    mask.className = 'fb-center-mask' + (cfg.tier >= 3 ? ' heavy' : '');
    const box = d.createElement('div');
    box.className = 'fb-center'
      + (cfg.tier >= 3 ? ' tier-3' : ' tier-2')
      + (cfg.quality !== undefined ? godCls(cfg.quality) : '');
    box.innerHTML = '<div class="fb-c-title">' + (cfg.title || '') + '</div>'
      + '<div class="fb-c-body">' + (cfg.body || '') + '</div>'
      + (cfg.hint ? '<div class="fb-c-hint">' + cfg.hint + '</div>' : '');
    mask.appendChild(box);
    d.body.appendChild(mask);

    if(cfg.tier >= 3 && cfg.sound === 'shen') FB_SOUND.shen();
    else if(cfg.sound && FB_SOUND[cfg.sound]) FB_SOUND[cfg.sound]();
    else if(cfg.tier >= 3) FB_SOUND.shen();
    else FB_SOUND.item();

    setTimeout(() => { try{ mask.className += ' on'; }catch(e){} }, 16);

    const closeIt = () => {
      try{ mask.className = mask.className.replace(' on', ''); }catch(e){}
      setTimeout(() => {
        try{ mask.remove(); }catch(e){}
        FB_CENTER_SHOWING = false;
        fbCenterNext();
      }, 280);
    };

    if(cfg.tier >= 3){
      const btn = d.createElement('button');
      btn.className = 'mbtn primary fb-c-btn';
      btn.textContent = cfg.btnLabel || '收 下';
      btn.onclick = closeIt;
      box.appendChild(btn);
      setTimeout(() => { mask.onclick = e => { if(e.target === mask) closeIt(); }; }, 300);
    }else{
      setTimeout(closeIt, cfg.autoMs || 2000);
      mask.onclick = closeIt;
    }
  }catch(e){
    FB_CENTER_SHOWING = false;
  }
}

/* ---------- 对外：各类获得 ---------- */
export function fbGain(it){
  if(!it) return;
  const lv = fbLevelOfItem(it);
  const im = isMount(it);
  const label = im ? mountLabel(it) : itemLabel(it);

  if(lv >= 3){
    fbCenterQueue({ tier:3, quality:it.q, sound:'shen',
      title:(im ? '得 神 兽' : '得 神 器'),
      body: label + '<br><span class="muted-sm">威能远超同阶，宜即刻祭炼。</span>',
      hint:'这是难得的造化。' });
  }else if(lv >= 2){
    fbCenterQueue({ tier:2, quality:it.q,
      title:(im ? '获 得 坐 骑' : '获 得 器 物'),
      body: label, autoMs:2000 });
  }else{
    fbToastQueue('<span class="fb-ico">◈</span> ' + label, it.q >= 2 ? 'q' + it.q : '');
    FB_SOUND.item();
  }
}
export function fbGainMat(k, n){
  if(!n) return;
  const m = MATERIALS[k];
  if(!m) return;
  const txt = qName(m.n, m.t) + '<span class="muted-sm"> ×' + num(n) + '</span>';
  fbToastQueue('<span class="fb-ico">◆</span> 拾得 ' + txt, m.t >= 2 ? 'q' + m.t : '');
}
export function fbGainPill(name, n){
  n = n || 1;
  const txt = '<b>' + name + '</b><span class="muted-sm"> ×' + n + '</span>';
  if(fbLevelOfPill(name) >= 2){
    fbCenterQueue({ tier:2, title:'得 丹', body:txt, autoMs:1800 });
  }else{
    fbToastQueue('<span class="fb-ico">◎</span> ' + txt);
  }
}
export function fbGrantGongfa(gf){
  if(!gf) return;
  fbCenterQueue({ tier:2, quality:gf.t,
    title:'悟 得 功 法',
    body: qName(gf.n, gf.t) + ' ' + gfGrade(gf)
      + '<br><span class="muted-sm">' + gfEffectText(gf, 1) + '（每重）</span>'
      + '<br><span class="muted-sm">刻入道基，<b>轮回不灭</b>。</span>',
    autoMs:2600, sound: gf.t >= 3 ? 'xian' : 'item' });
}
export function fbBreak(isGroupStart, realmName){
  fbCenterQueue({ tier: fbLevelOfBreak(isGroupStart),
    title: isGroupStart ? '境 界 跃 迁' : '境 界 精 进',
    body: '气机贯通，你已踏入 <b>' + realmName + '</b>。'
      + (isGroupStart ? '<br><span class="muted-sm">天地在你眼中骤然不同。</span>' : ''),
    autoMs:2000, sound:'breakth' });
}
/* 飞升刻意**不**弹中央浮层：`breakthrough.js` 的 `ascend()` 已有专属全屏弹层，
   再叠一层「需手动关闭」的遮罩会互相打架。这里只放一声长音作为情绪落点。 */
export function fbAscend(){ FB_SOUND.asc(); }
export function fbAchievement(d){
  if(!d) return;
  if(d.t >= 4){
    fbCenterQueue({ tier:3, quality:4, sound:'shen', title:'神 品 成 就',
      body: d.n + '<br><span class="muted-sm">' + d.d + '</span>',
      hint: achTierText(d.t), btnLabel:'收 下' });
  }else{
    FB_SOUND.ach();
  }
}
export function fbDungeon(def){
  if(!def) return;
  fbCenterQueue({ tier:2, title:'秘 境 贯 通',
    body:'「' + def.name + '」已尽归你手。', autoMs:2200, sound:'xian' });
}
export function fbRebirth(n){
  fbCenterQueue({ tier:3, title:'轮 回 转 世',
    body:'一世修行尽付东流。<br>你自凡俗中，再一次睁开眼——',
    hint:'第 ' + n + ' 世', btnLabel:'睁 开 眼' });
}
export function fbCodexMilestone(n){
  fbCenterQueue({ tier:3, title:'图 鉴 · 里 程 碑',
    body:'已点亮 <b>' + n + '</b> 项图鉴。', hint:'气运随之增长。',
    btnLabel:'收 下', sound:'xian' });
}

/* ---------- 清空（导入存档 / 轮回时用） ---------- */
export function fbClearAll(){
  const d = fbDoc();
  try{
    FB_TOASTS.forEach(el => { try{ el.remove(); }catch(e){} });
  }catch(e){}
  FB_TOASTS = [];
  FB_CENTER_QUEUE = [];
  FB_CENTER_SHOWING = false;
  if(d){
    try{
      const masks = d.querySelectorAll ? d.querySelectorAll('.fb-center-mask') : [];
      for(let i = 0; i < masks.length; i++){ try{ masks[i].remove(); }catch(e){} }
    }catch(e){}
  }
}

/* ---------- 移动端浮动反馈条 ---------- */
export function fbStripUpdate(text){
  FB_LAST_STRIP = text || '';
  const el = fbEl('fbStrip');
  if(!el) return;
  try{
    /* 用 classList 增删，不整体覆盖 className —— 覆盖会把别处动态挂上的类一并抹掉 */
    if(!text){ el.classList.remove('on'); return; }
    el.classList.add('on');
    const inner = (el.querySelectorAll ? el.querySelectorAll('.fb-strip-txt')[0] : null)
      || el.querySelector ? el.querySelector('.fb-strip-txt') : null;
    if(inner) inner.innerHTML = text;
    else el.innerHTML = '<span class="fb-strip-txt">' + text + '</span>'
      + '<span class="fb-strip-hint">点 击 展 开 天 机 录</span>';
  }catch(e){}
}
export function fbStripText(){ return FB_LAST_STRIP; }
export function fbStripClick(){
  if(!FB_LAST_STRIP) return;
  /* 展开完整「天机录」——内容就是当前日志面板的文字 */
  try{
    const box = fbEl('log');
    const html = box ? box.innerHTML : '';
    showModal('天 机 录', '<div class="pb-scroll">' + (html || '<div class="hint-mini">尚 无 记 载</div>') + '</div>',
      [{ label:'收 起', primary:true, fn: closeModal }], 'wide');
  }catch(e){}
}

/* ---------- 测试用：不依赖 DOM 的状态快照 ---------- */
export function fbDebugCounts(){
  return { toasts: FB_TOASTS.length, queue: FB_CENTER_QUEUE.length, showing: FB_CENTER_SHOWING };
}
