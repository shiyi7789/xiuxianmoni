import { META, saveMeta, MIX_DEFAULT, mixSanitize } from '../core/meta.js';
import { S } from '../core/state.js';
import { MAX_LV } from '../data/realms.js';
import { stats } from '../sys/character.js';

/* =========================================================
   音 频 引 擎（core）
   ---------------------------------------------------------
   信号链：事件源 → busGain[ui|sfx|amb|music] → duck → limiter → master → destination
                    └→ revSend → convolver → revReturn ┘
   设计文档见 音频设计.md §2~§5。本文件只负责：
     · 上下文与总线图构建（幂等；无 AudioContext 时静默降级）
     · 声部预算与优先级抢占（全局 24 / 窄屏 16）
     · 参数（tension/depth/clarity/vitality/fortune）与混音持久化
     · 场景混响区（open/hall/cave，IR 程序化生成并缓存）
     · 诊断（audioDebug）与开发者 HUD（audioHud）
   约束：全部 Web Audio 现场合成，零资源文件；无上下文时任何调用都不得抛。
   ========================================================= */

let ACTX = null, BOOTED = false, FAILED = false;
let BUS = {};                /* {ui,sfx,amb,music} → GainNode */
let VOICES = [];             /* 活动声部 {bus,prio,t0,end} */
let DROPPED = 0, PLAYED = 0;
let DUCK = null, LIMITER = null, SHAPER = null, MASTER = null, REV = null, REV_RET = null, REVAUX = null;
let ZONE = 'open', ZONE_IR = {};
let HUD = null;
let PARAMS = { tension:0, depth:0, clarity:0, vitality:1, fortune:0 };
let SEED = 20260916;         /* 可播种 PRNG：离线质检要能复现同一段音乐 */

/* 总线规格：上限 / 优先级（0 最高） */
const BUS_SPEC = {
  ui:    { lim:6,  prio:0 },
  sfx:   { lim:12, prio:1 },
  amb:   { lim:2,  prio:2 },
  music: { lim:8,  prio:3 }
};
/* ---------- 可播种随机（音乐/变体用，保证可复现） ---------- */
export function audioRand(){
  SEED = (SEED * 1664525 + 1013904223) >>> 0;
  return SEED / 4294967296;
}
export function audioSeed(s){ SEED = (s >>> 0) || 20260916; }

/* ---------- 上下文 ---------- */
export function audioCtx(){ return ACTX; }
export function audioReady(){ return !!ACTX; }
export function audioBus(k){ return BUS[k] || null; }

/* 软削波曲线（safety net）：把 ±1.5 平滑压进 ±1，
   过了它峰值**不可能**超过 1.0。放在限制器之后——压缩器有 3ms 起音，
   瞬态会穿过去（离线质检实测到 +9.6dB 的削波，就是被这一步拦下的）。 */
function softCurve(n){
  const c = new Float32Array(n);
  const k = 1.4, norm = Math.tanh(k * 1.5);
  for(let i = 0; i < n; i++){
    const x = (i / (n - 1)) * 3 - 1.5;
    c[i] = Math.tanh(x * k) / norm;
  }
  return c;
}

/* 构建整张图（幂等的纯构建函数）：
   真实上下文与离线质检上下文共用同一份代码 —— 质检才能验的就是线上跑的那张图 */
export function audioGraphBuild(A){
  ACTX = A;
  const mk = (v) => { const g = A.createGain(); g.gain.value = v; return g; };
  for(const k in BUS_SPEC) BUS[k] = mk(MIX_DEFAULT[k] || 0.6);
  DUCK = mk(1);
  LIMITER = A.createDynamicsCompressor();
  LIMITER.threshold.value = -3; LIMITER.knee.value = 3;
  LIMITER.ratio.value = 12; LIMITER.attack.value = 0.003; LIMITER.release.value = 0.25;
  SHAPER = A.createWaveShaper();
  SHAPER.curve = softCurve(2048);
  SHAPER.oversample = '2x';
  MASTER = mk(MIX_DEFAULT.master);
  for(const k in BUS) BUS[k].connect(DUCK);
  DUCK.connect(LIMITER); LIMITER.connect(SHAPER); SHAPER.connect(MASTER); MASTER.connect(A.destination);
  /* 混响支路：sfx/amb/music 送；ui 不送 —— 界面音必须干、准、近。
     ⚠ ConvolverNode 默认 normalize=true，会把噪声脉冲响应整体抬高很多，
     返送必须压到位（离线质检实测：返送 1.0 时混响尾就能盖过干声） */
  REVAUX = mk(1);
  REV = A.createConvolver();
  REV_RET = mk(0.22);
  REVAUX.connect(REV); REV.connect(REV_RET); REV_RET.connect(DUCK);
  if(BUS.sfx) BUS.sfx.connect(REVAUX);
  if(BUS.amb) BUS.amb.connect(REVAUX);
  if(BUS.music) BUS.music.connect(REVAUX);
  ZONE_IR = {};
  audioZone('open', true);
  audioApplyMix();
  return ACTX;
}

export function audioBoot(){
  if(BOOTED) return ACTX;
  BOOTED = true;
  try{
    const W = (typeof window !== 'undefined') ? window : null;
    const AC = W && (W.AudioContext || W.webkitAudioContext);
    if(!AC) { FAILED = true; return null; }
    return audioGraphBuild(new AC());
  }catch(e){ FAILED = true; ACTX = null; return null; }
}

/* 旧接口名（fbAudioOn/fbToggleAudio/fbInitAudio）留在 ui/feedback.js ——
   构建期有「顶层标识符全局唯一」硬守卫，同一名字不能在两处声明 */

/* ---------- 混音 ---------- */
export function audioMix(){
  const p = (META && META.prefs) || {};
  return mixSanitize(p.audioMix);
}
export function audioApplyMix(){
  if(!ACTX) return;
  try{
    const m = audioMix();
    const on = audioOn();
    if(BUS.ui)    BUS.ui.gain.value    = on ? m.sfx * 0.9 : 0;
    if(BUS.sfx)   BUS.sfx.gain.value   = on ? m.sfx : 0;
    if(BUS.amb)   BUS.amb.gain.value   = on ? m.amb : 0;
    if(BUS.music) BUS.music.gain.value = on ? m.music : 0;
    if(MASTER)    MASTER.gain.value    = on ? m.master : 0;
  }catch(e){}
}
export function audioOn(){
  if(!META || !META.prefs) return true;
  return META.prefs.audio !== false;
}
export function audioSetMix(k, v){
  if(!META.prefs) META.prefs = { audio:true };
  if(!META.prefs.audioMix) META.prefs.audioMix = {};
  if(k === 'mute') META.prefs.audio = !audioOn();
  else META.prefs.audioMix[k] = Math.max(0, Math.min(1, Number(v) || 0));
  saveMeta();
  audioApplyMix();
  return audioOn();
}
/* 静音开关走同一条持久化路径 */

/* ---------- 声部管理（预算 + 优先级抢占） ----------
   全局预算是**混音预算**而非 CPU 上限：目的是避免连击/连破时糊成一片。
   取 18（窄屏 14）——低于四条总线上限之和（6+12+2+8=28），
   于是"全局满"是常态，音乐必须真的给战斗让位（这正是想要的行为）。
   抢占规则：只抢「严格更不重要」或「同总线同级」的声部；
   两者都没有 → 直接丢弃并计数（例如全局已满、音乐总线为空时的新音乐声部）。 */
function voiceCap(){
  try{
    if(typeof window !== 'undefined' && window.innerWidth && window.innerWidth <= 820) return 14;
  }catch(e){}
  return 18;
}
function busCount(bus){
  let n = 0;
  for(const v of VOICES) if(v.bus === bus) n++;
  return n;
}
/* 本总线内的同级最旧者（用于「本总线满了」时原地换人，保证总线不超上限） */
function oldestIn(bus){
  const spec = BUS_SPEC[bus] || BUS_SPEC.sfx;
  let best = null, bi = -1;
  for(let i = 0; i < VOICES.length; i++){
    const v = VOICES[i];
    if(v.bus !== bus || v.prio !== spec.prio) continue;
    if(!best || v.t0 < best.t0){ best = v; bi = i; }
  }
  return bi;
}
/* 其它总线里「严格更不重要」的最旧者（跨总线抢，只在全局预算触顶时用） */
function leastIn(bus){
  const spec = BUS_SPEC[bus] || BUS_SPEC.sfx;
  let best = null, bi = -1;
  for(let i = 0; i < VOICES.length; i++){
    const v = VOICES[i];
    const vs = BUS_SPEC[v.bus] || BUS_SPEC.sfx;
    if(vs.prio <= spec.prio) continue;            /* 不抢比自己更重要的 */
    if(!best || v.prio > best.prio || (v.prio === best.prio && v.t0 < best.t0)){ best = v; bi = i; }
  }
  return bi;
}
/* 分配一个声部。
   规则：① 本总线满 → 只在本总线内换掉同级最旧者（**绝不让本总线超上限**）
        ② 全局预算触顶 → 去别的总线抢「更不重要」的；抢不到就丢弃新声部 */
export function audioClaim(bus, prio, dur){
  const spec = BUS_SPEC[bus] || BUS_SPEC.sfx;
  const now = ACTX ? ACTX.currentTime : 0;
  const p = (prio === undefined || prio === null) ? spec.prio : prio;
  VOICES = VOICES.filter(v => v.end > now);
  const busFull = busCount(bus) >= spec.lim;
  const globalFull = VOICES.length >= voiceCap();
  if(busFull || globalFull){
    let vi = busFull ? oldestIn(bus) : leastIn(bus);
    if(vi < 0){ DROPPED++; return false; }
    VOICES.splice(vi, 1);
  }
  VOICES.push({ bus, prio:p, t0:now, end:now + Math.max(0.05, dur || 0.3) });
  PLAYED++;
  return true;
}
export function audioRelease(bus){ VOICES = VOICES.filter(v => v.bus !== bus); }
export function audioVoiceCount(bus){
  const now = ACTX ? ACTX.currentTime : 0;
  VOICES = VOICES.filter(v => v.end > now);
  if(!bus) return VOICES.length;
  /* music 是常驻声部，按 stem 数计入 */
  return VOICES.filter(v => v.bus === bus).length;
}
export function audioDropped(){ return DROPPED; }

/* ---------- 参数 ---------- */
const P_SPEC = { tension:[0,1], depth:[0,1], clarity:[0,1], vitality:[0,1], fortune:[0,1] };
export function audioParam(k, v){
  const s = P_SPEC[k];
  if(!s || v === undefined) return PARAMS[k];
  const x = Math.max(s[0], Math.min(s[1], Number(v) || 0));
  PARAMS[k] = x;
  /* 参数是慢变量：混响与总线只在这里做一次平滑，事件触发时不再计算 */
  if(hudOn) audioHudDraw();
  return x;
}
export function audioParams(){ return { tension:PARAMS.tension, depth:PARAMS.depth, clarity:PARAMS.clarity, vitality:PARAMS.vitality, fortune:PARAMS.fortune }; }
/* 从游戏状态一次性喂参（各系统只需调这一个，避免到处都是散落的参数逻辑） */
export function audioSyncState(){
  try{
    if(!S) return;
    audioParam('clarity', S.level / Math.max(1, MAX_LV));
    if(S.combat && S.combat.m){
      const st = stats();
      audioParam('vitality', S.hp / Math.max(1, st.hpMax));
      const m = S.combat.m;
      const t = 1 - Math.max(0, m.hp) / Math.max(1, m.hpMax);
      audioParam('tension', m.boss ? Math.min(1, 0.55 + t * 0.45) : t * 0.8);
    }else{
      audioParam('tension', 0);
      audioParam('vitality', S.hp / Math.max(1, stats().hpMax));
    }
    if(S.dungeon) audioParam('depth', S.dungeon.floor / Math.max(1, S.dungeon.total));
  }catch(e){}
}

/* ---------- 场景混响区（IR 程序化生成） ---------- */
function irKey(zone){
  if(zone !== 'cave') return zone;
  const d = PARAMS.depth;
  return 'cave' + (d > 0.66 ? 2 : (d > 0.33 ? 1 : 0));
}
function buildIR(zone){
  const A = ACTX;
  /* 规格见 音频设计.md §5：预延迟 / 衰减 / 湿度 */
  const spec = {
    open: { pre:0.02, dec:0.8, wet:0.15, pow:2.2 },
    hall: { pre:0.03, dec:1.5, wet:0.35, pow:1.9 },
    cave: { pre:0.05, dec:3.5, wet:0.60, pow:1.4 }
  }[zone.split('0')[0].split('1')[0].split('2')[0]] || { pre:0.03, dec:1.5, wet:0.35, pow:1.9 };
  const sr = A.sampleRate || 44100;
  const n = Math.max(1, Math.floor(sr * (spec.pre + spec.dec)));
  const buf = A.createBuffer(2, n, sr);
  const pre = Math.floor(sr * spec.pre);
  for(let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    for(let i = pre; i < n; i++){
      const t = (i - pre) / sr;
      /* 噪声 × 指数衰减；用音频 PRNG 保证可复现 */
      const e = Math.pow(1 - (i - pre) / (n - pre), spec.pow);
      d[i] = (audioRand() * 2 - 1) * e * spec.wet;
    }
    /* 洞府加三个早期反射抽头，形成"房间"感 */
    if(spec.wet > 0.3){
      const taps = [[0.011, 0.5], [0.019, 0.38], [0.031, 0.28]];
      for(const [tt, g] of taps){
        const k = pre + Math.floor(sr * tt);
        if(k < n) d[k] += g * spec.wet;
      }
    }
  }
  return buf;
}
export function audioZone(zone, silent){
  ZONE = zone || 'open';
  if(!ACTX || !REV) return ZONE;
  try{
    const k = irKey(ZONE);
    if(!ZONE_IR[k]) ZONE_IR[k] = buildIR(k);
    if(!silent){
      /* 换 IR 会有爆音：做 120 ms 的增益下凹再抬升 */
      const t = ACTX.currentTime;
      REV_RET.gain.cancelScheduledValues(t);
      REV_RET.gain.setValueAtTime(REV_RET.gain.value, t);
      REV_RET.gain.linearRampToValueAtTime(0.0001, t + 0.06);
      REV_RET.gain.linearRampToValueAtTime(1, t + 0.12);
    }
    REV.buffer = ZONE_IR[k];
  }catch(e){}
  return ZONE;
}
export function audioZoneName(){ return ZONE; }

/* ---------- 侧链闪避（L3 大事件用） ---------- */
export function audioDuck(ms){
  if(!ACTX || !DUCK) return;
  try{
    const t = ACTX.currentTime, dur = (ms || 1400) / 1000;
    DUCK.gain.cancelScheduledValues(t);
    DUCK.gain.setValueAtTime(DUCK.gain.value, t);
    DUCK.gain.linearRampToValueAtTime(0.5, t + 0.08);
    DUCK.gain.setValueAtTime(0.5, t + dur * 0.55);
    DUCK.gain.linearRampToValueAtTime(1, t + dur);
  }catch(e){}
}

/* ---------- 诊断 ---------- */
export function audioDebug(){
  const v = { ui:0, sfx:0, amb:0, music:0, total:audioVoiceCount() };
  for(const k in BUS_SPEC) v[k] = audioVoiceCount(k);
  return {
    ready: audioReady(), failed: FAILED, state: ACTX ? ACTX.state : 'none',
    voices: v, cap: voiceCap(), played: PLAYED, dropped: DROPPED,
    params: audioParams(), zone: ZONE, mix: audioMix(), on: audioOn()
  };
}
let hudOn = false;
export function audioHud(v){
  hudOn = (v === undefined) ? !hudOn : !!v;
  try{
    const d = (typeof document !== 'undefined') ? document : null;
    if(!d || !d.body) return hudOn;
    if(!HUD){
      HUD = d.createElement('div');
      HUD.id = 'audioHud';
      HUD.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9998;font:11px/1.5 ui-monospace,monospace;'
        + 'background:rgba(0,0,0,.72);color:#cfc;padding:6px 9px;border-radius:4px;pointer-events:none;white-space:pre';
      d.body.appendChild(HUD);
    }
    HUD.style.display = hudOn ? 'block' : 'none';
    audioHudDraw();
  }catch(e){}
  return hudOn;
}
export function audioHudDraw(){
  if(!hudOn || !HUD) return;
  try{
    const g = audioDebug();
    HUD.textContent = 'AUDIO ' + (g.ready ? g.state : 'off') + '  bus ' + g.zone + '\n'
      + 'voices ' + g.voices.total + '/' + g.cap
      + '  ui' + g.voices.ui + ' sfx' + g.voices.sfx + ' amb' + g.voices.amb + ' mus' + g.voices.music + '\n'
      + 'played ' + g.played + '  dropped ' + g.dropped + '\n'
      + 'tension ' + g.params.tension.toFixed(2) + '  clarity ' + g.params.clarity.toFixed(2)
      + '  depth ' + g.params.depth.toFixed(2) + '  vit ' + g.params.vitality.toFixed(2);
  }catch(e){}
}

/* ---------- 频率限制（防连点刷屏）：表放在这里，重置瞬态时一并清 ---------- */
let LAST = {};
export function audioGapOk(name, ms, now){
  const prev = LAST[name];
  if(prev !== undefined && (now - prev) * 1000 < ms) return false;
  LAST[name] = now;
  return true;
}

/* ---------- 质检支撑：重置瞬态（回归测试与离线质检脚本用） ---------- */
export function audioSetContextForTest(ctx){
  ACTX = ctx; ZONE_IR = {}; VOICES = []; LAST = {};
  return ACTX;
}
/* 清空声部表与频率限制表 —— 无头环境里上下文时钟可能不前进，
   不清限制表会让「同一事件」在后续断言里永远被间隔挡住 */
export function audioResetVoices(){
  VOICES = []; DROPPED = 0; PLAYED = 0; LAST = {};
}
