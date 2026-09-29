import { META, saveMeta } from '../core/meta.js';
import { num } from '../core/utils.js';
import { MATERIALS } from '../data/materials.js';
import { audioBoot, audioOn, audioSetMix } from '../audio/core.js';
import { audioPlay } from '../audio/events.js';
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

/* ---------- 偏好（实现在音频引擎，这里保留旧名以免既有调用点漂移） ---------- */
export function fbAudioOn(){ return audioOn(); }
export function fbToggleAudio(){ return audioSetMix('mute'); }
export function fbInitAudio(){ return audioBoot(); }

/* ---------- 音效：全部交给音频引擎的命名事件（见 音频设计.md §7） ----------
   旧版是 7 个直连 destination 的 beep；现在由 src/audio/ 统一管理总线、
   声部预算与优先级。这里只做「语义 → 事件名」的映射。 */
export const FB_SOUND = {
  item:  () => audioPlay('loot.item1'),
  xian:  () => audioPlay('loot.item3'),
  shen:  () => audioPlay('loot.item4'),
  breakth:() => audioPlay('cult.break.ok'),
  asc:   () => audioPlay('cult.ascend'),
  ach:   () => audioPlay('meta.ach'),
  coin:  () => audioPlay('loot.mat0')
};
/* 品质 → 获得动机（凡1音灵2音宝3音仙4音+磬神5音+磬） */
function fbLootSound(q){
  audioPlay('loot.item' + Math.max(0, Math.min(4, q | 0)));
}
/* 材料品阶 → 三档（凡灵 / 宝仙 / 神） */
function fbMatSound(t){
  audioPlay(t >= 4 ? 'loot.mat4' : (t >= 2 ? 'loot.mat2' : 'loot.mat0'));
  return t >= 4 ? 'q4' : (t >= 2 ? 'q' + t : '');
}

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

    if(cfg.sound === 'none'){ /* 调用方已经自己发过音，避免重复 */ }
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
  fbLootSound(it.q);                     /* 品质 → 音数/亮度（凡1灵2宝3仙4神5） */

  if(lv >= 3){
    fbCenterQueue({ tier:3, quality:it.q, sound:'none',
      title:(im ? '得 神 兽' : '得 神 器'),
      body: label + '<br><span class="muted-sm">威能远超同阶，宜即刻祭炼。</span>',
      hint:'这是难得的造化。' });
  }else if(lv >= 2){
    fbCenterQueue({ tier:2, quality:it.q, sound:'none',
      title:(im ? '获 得 坐 骑' : '获 得 器 物'),
      body: label, autoMs:2000 });
  }else{
    fbToastQueue('<span class="fb-ico">◈</span> ' + label, it.q >= 2 ? 'q' + it.q : '');
  }
}
export function fbGainMat(k, n){
  if(!n) return;
  const m = MATERIALS[k];
  if(!m) return;
  const txt = qName(m.n, m.t) + '<span class="muted-sm"> ×' + num(n) + '</span>';
  const cls = fbMatSound(m.t);           /* 品阶 → 三档音色 */
  fbToastQueue('<span class="fb-ico">◆</span> 拾得 ' + txt, cls);
}
export function fbGainPill(name, n){
  n = n || 1;
  const txt = '<b>' + name + '</b><span class="muted-sm"> ×' + n + '</span>';
  audioPlay('loot.pill');
  if(fbLevelOfPill(name) >= 2){
    fbCenterQueue({ tier:2, title:'得 丹', body:txt, autoMs:1800, sound:'none' });
  }else{
    fbToastQueue('<span class="fb-ico">◎</span> ' + txt);
  }
}
export function fbGrantGongfa(gf){
  if(!gf) return;
  audioPlay('loot.gongfa');
  fbCenterQueue({ tier:2, quality:gf.t, sound:'none',
    title:'悟 得 功 法',
    body: qName(gf.n, gf.t) + ' ' + gfGrade(gf)
      + '<br><span class="muted-sm">' + gfEffectText(gf, 1) + '（每重）</span>'
      + '<br><span class="muted-sm">刻入道基，<b>轮回不灭</b>。</span>',
    autoMs:2600 });
}
export function fbBreak(isGroupStart, realmName){
  audioPlay('cult.break.ok');
  fbCenterQueue({ tier: fbLevelOfBreak(isGroupStart), sound:'none',
    title: isGroupStart ? '境 界 跃 迁' : '境 界 精 进',
    body: '气机贯通，你已踏入 <b>' + realmName + '</b>。'
      + (isGroupStart ? '<br><span class="muted-sm">天地在你眼中骤然不同。</span>' : ''),
    autoMs:2000 });
}
/* 飞升刻意**不**弹中央浮层：`breakthrough.js` 的 `ascend()` 已有专属全屏弹层，
   再叠一层「需手动关闭」的遮罩会互相打架。这里只放一声长音作为情绪落点。 */
export function fbAscend(){ audioPlay('cult.ascend'); }
export function fbAchievement(d){
  if(!d) return;
  audioPlay(d.t >= 4 ? 'meta.ach.shen' : 'meta.ach');
  if(d.t >= 4){
    fbCenterQueue({ tier:3, quality:4, sound:'none', title:'神 品 成 就',
      body: d.n + '<br><span class="muted-sm">' + d.d + '</span>',
      hint: achTierText(d.t), btnLabel:'收 下' });
  }
}
export function fbDungeon(def){
  if(!def) return;
  audioPlay('loot.item3');
  fbCenterQueue({ tier:2, title:'秘 境 贯 通',
    body:'「' + def.name + '」已尽归你手。', autoMs:2200, sound:'none' });
}
export function fbRebirth(n){
  audioPlay('meta.rebirth');
  fbCenterQueue({ tier:3, sound:'none', title:'轮 回 转 世',
    body:'一世修行尽付东流。<br>你自凡俗中，再一次睁开眼——',
    hint:'第 ' + n + ' 世', btnLabel:'睁 开 眼' });
}
export function fbCodexMilestone(n){
  audioPlay('ui.milestone');
  fbCenterQueue({ tier:3, sound:'none', title:'图 鉴 · 里 程 碑',
    body:'已点亮 <b>' + n + '</b> 项图鉴。', hint:'气运随之增长。',
    btnLabel:'收 下' });
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
