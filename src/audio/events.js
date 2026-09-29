import { audioBoot, audioCtx, audioBus, audioClaim, audioOn, audioDuck, audioGapOk, audioParam, audioParams, audioRand, audioVoiceCount } from './core.js';
import { synPluck, synBell, synWind, synDrone, synImpact, synSweep } from './synth.js';

/* =========================================================
   事 件 注 册 表（events）
   ---------------------------------------------------------
   命名规范（见 音频设计.md §7）：分类.子类[.变体]
     ui.*  cult.*  combat.*  loot.*  dg.*  cave.*  meta.*
   每条规格 6 个字段，**不允许缺省**（audioAudit() 会逐条核对）：
     [ 总线, 优先级, 最小间隔ms, 时长s, 事件声部上限(0=用总线上限), 配方(t0, dest) ]
   分级约定：L0 极短干声 / L1 单两音 / L2 三音动机 / L3 长音+磬+触发 duck
   ========================================================= */

/* 五声音阶（宫商角徵羽），根音随 clarity（境界进度）上移 +0~+12 半音 */
const PENTA = [0, 2, 4, 7, 9];
export function audioScaleFreq(step, baseOct){
  const o = audioParams().clarity;
  const root = 196 * Math.pow(2, o);
  const oct = Math.floor(step / 5), idx = ((step % 5) + 5) % 5;
  return root * Math.pow(2, (PENTA[idx] + 12 * oct + (baseOct || 0)) / 12);
}
/* 获得动机：品质 → 音数与亮度（凡1灵2宝3仙4神5，仙神带磬）
   单音峰值按**音数反比**归一是必须的：KS 拨弦共振峰很高，几个音并行叠加
   时实测会直接顶到软削波上限（离线质检实测：不归一时 loot.item4 峰值 3.03） */
function lootMotif(t, dest, q, o){
  o = o || {};
  q = Math.max(0, Math.min(4, q | 0));
  const n = q + 1;
  const st = (o.step === undefined) ? (q >= 2 ? 0 : 2) : o.step;
  const per = 0.22 / n;
  let end = t;
  for(let i = 0; i < n; i++){
    const f = audioScaleFreq(st + i, q >= 3 ? 1 : 0);
    /* 音间距 0.19s、时长随品质略增：太密会 5 音叠加 */
    end = Math.max(end, synPluck(t + i * 0.19, dest, { freq:f, dur:0.45 + q * 0.14, peak:per * (1 - i * 0.08), decay:0.968 }));
  }
  if(q >= 3) end = Math.max(end, synBell(t + 0.05, dest, { freq:audioScaleFreq(st + n, 2), dur:1.2 + q * 0.25, peak:0.075, hp:700 }));
  return end;
}

/* 元素的扫频参数：火上行、冰下行、雷宽频、血低频、虚空反相 */
const ELEM = {
  fire:    { f1:420, f2:2400, type:'sawtooth', q:3 },
  ice:     { f1:2600, f2:420, type:'triangle', q:6 },
  thunder: { f1:900, f2:5200, type:'square',   q:2 },
  blood:   { f1:180, f2:520,  type:'sawtooth', q:5 },
  void:    { f1:1400, f2:220, type:'sine',     q:9 }
};
function elem(w){
  const c = ELEM[w] || ELEM.fire;
  return (t, d) => synSweep(t, d, { f1:c.f1, f2:c.f2, type:c.type, q:c.q, dur:0.42, peak:0.24 });
}

/* ---------- 注册表 ---------- */
export const AUDIO_EVENTS = {
  /* 界面：干声、极短、不送混响（bus=ui 不接 revSend） */
  'ui.click':    ['ui', 0, 60, 0.18, 4, (t,d) => synPluck(t, d, { freq:1320, dur:0.07, peak:0.16, decay:0.9 })],
  'ui.open':     ['ui', 0, 80, 0.3,  3, (t,d) => { synPluck(t, d, { freq:660, dur:0.16, peak:0.2, decay:0.94 }); return synPluck(t + 0.07, d, { freq:990, dur:0.2, peak:0.18, decay:0.94 }); }],
  'ui.close':    ['ui', 0, 80, 0.3,  3, (t,d) => { synPluck(t, d, { freq:990, dur:0.14, peak:0.18, decay:0.94 }); return synPluck(t + 0.07, d, { freq:660, dur:0.18, peak:0.16, decay:0.94 }); }],
  'ui.tab':      ['ui', 0, 90, 0.2,  3, (t,d) => synPluck(t, d, { freq:784, dur:0.1, peak:0.17, decay:0.92 })],
  'ui.error':    ['ui', 0, 200, 0.35, 2, (t,d) => { synDrone(t, d, { freq:150, dur:0.22, peak:0.2, glide:0.7 }); return synDrone(t + 0.1, d, { freq:110, dur:0.25, peak:0.18, glide:0.7 }); }],
  'ui.milestone':['ui', 0, 300, 1.1, 2, (t,d) => lootMotif(t, d, 2, { step:4 })],

  /* 修炼：L1/L2 */
  'cult.meditate':   ['sfx', 1, 400, 1.0, 3, (t,d) => synDrone(t, d, { freq:146, dur:1.0, peak:0.22, atk:0.18, lp:520, glide:0.94 })],
  'cult.stone':      ['sfx', 1, 400, 0.8, 3, (t,d) => { synDrone(t, d, { freq:196, dur:0.7, peak:0.2, atk:0.05 }); return synBell(t + 0.06, d, { freq:1568, dur:0.7, peak:0.1 }); }],
  'cult.seclusion':  ['sfx', 1, 900, 2.0, 2, (t,d) => { synDrone(t, d, { freq:98, dur:2.0, peak:0.26, atk:0.5, glide:1.4 }); synWind(t, d, { dur:2.0, cf:360, peak:0.14, sweep:true }); return synBell(t + 1.1, d, { freq:784, dur:1.0, peak:0.12 }); }],
  'cult.break.ok':   ['sfx', 1, 700, 1.8, 3, (t,d) => { synDrone(t, d, { freq:123, dur:1.4, peak:0.3, atk:0.06, glide:2.0 }); synBell(t, d, { freq:1046, dur:1.4, peak:0.18, hp:520 }); return synBell(t + 0.18, d, { freq:1568, dur:1.6, peak:0.12, hp:800 }); }],
  'cult.break.fail': ['sfx', 1, 800, 1.2, 2, (t,d) => { synImpact(t, d, { dur:0.3, peak:0.3, tone:'heavy' }); return synDrone(t + 0.1, d, { freq:110, dur:0.9, peak:0.22, atk:0.08, glide:0.6 }); }],
  'cult.ascend':     ['sfx', 1, 4000, 4.2, 2, (t,d) => { audioDuck(2600); synDrone(t, d, { freq:65, dur:4.0, peak:0.34, atk:1.2, lp:900, glide:2.6 }); synWind(t, d, { dur:4.0, cf:620, peak:0.16, sweep:true }); synBell(t + 0.6, d, { freq:523, dur:3.0, peak:0.16, hp:420 }); synBell(t + 1.4, d, { freq:1046, dur:3.0, peak:0.14, hp:520 }); synBell(t + 2.2, d, { freq:1568, dur:2.6, peak:0.12, hp:640 }); return t + 4.2; }],

  /* 战斗 */
  'combat.hit':      ['sfx', 1, 50, 0.3, 6, (t,d) => synImpact(t, d, { dur:0.16, peak:0.26 })],
  'combat.hit.heavy':['sfx', 1, 80, 0.5, 4, (t,d) => synImpact(t, d, { dur:0.3, peak:0.36, tone:'heavy' })],
  'combat.hurt':     ['sfx', 1, 90, 0.5, 4, (t,d) => { synImpact(t, d, { dur:0.24, peak:0.34, tone:'heavy' }); return synDrone(t + 0.02, d, { freq:170, dur:0.5, peak:0.2, glide:0.6 }); }],
  'combat.skill.fire':   ['sfx', 1, 120, 0.6, 4, elem('fire')],
  'combat.skill.ice':    ['sfx', 1, 120, 0.6, 4, elem('ice')],
  'combat.skill.thunder':['sfx', 1, 120, 0.6, 4, elem('thunder')],
  'combat.skill.blood':  ['sfx', 1, 120, 0.6, 4, elem('blood')],
  'combat.skill.void':   ['sfx', 1, 120, 0.6, 4, elem('void')],
  'combat.defend':   ['sfx', 1, 300, 0.8, 3, (t,d) => synBell(t, d, { freq:392, dur:0.8, peak:0.16, hp:300 })],
  'combat.flee':     ['sfx', 1, 400, 0.7, 2, (t,d) => synSweep(t, d, { f1:1200, f2:300, type:'triangle', q:2, dur:0.4, peak:0.18 })],
  'combat.win':      ['sfx', 1, 900, 1.6, 3, (t,d) => { synDrone(t, d, { freq:147, dur:1.2, peak:0.24, atk:0.05, glide:1.5 }); synPluck(t, d, { freq:audioScaleFreq(0,1), dur:0.7, peak:0.10 }); synPluck(t + 0.19, d, { freq:audioScaleFreq(2,1), dur:0.7, peak:0.09 }); return synBell(t + 0.2, d, { freq:audioScaleFreq(4,2), dur:1.4, peak:0.12, hp:600 }); }],
  'combat.lose':     ['sfx', 1, 1200, 2.0, 2, (t,d) => { synDrone(t, d, { freq:130, dur:1.8, peak:0.3, atk:0.06, glide:0.55 }); return synWind(t, d, { dur:1.8, cf:260, peak:0.14 }); }],

  /* 获得（品质 → 音数/亮度） */
  'loot.item0': ['sfx', 1, 80, 0.6, 6, (t,d) => lootMotif(t, d, 0)],
  'loot.item1': ['sfx', 1, 80, 0.7, 6, (t,d) => lootMotif(t, d, 1)],
  'loot.item2': ['sfx', 1, 120, 1.0, 4, (t,d) => lootMotif(t, d, 2)],
  'loot.item3': ['sfx', 1, 200, 1.7, 3, (t,d) => lootMotif(t, d, 3)],
  'loot.item4': ['sfx', 1, 600, 2.0, 2, (t,d) => { audioDuck(1600); return lootMotif(t, d, 4); }],
  'loot.mat0':  ['sfx', 1, 70, 0.3, 6, (t,d) => synPluck(t, d, { freq:audioScaleFreq(1), dur:0.22, peak:0.16, decay:0.93 })],
  'loot.mat2':  ['sfx', 1, 80, 0.5, 5, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(1), dur:0.3, peak:0.18 }); return synPluck(t + 0.06, d, { freq:audioScaleFreq(3), dur:0.36, peak:0.16 }); }],
  'loot.mat4':  ['sfx', 1, 150, 1.2, 3, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(3), dur:0.5, peak:0.09 }); return synBell(t + 0.08, d, { freq:audioScaleFreq(5,1), dur:1.1, peak:0.11, hp:640 }); }],
  'loot.pill':  ['sfx', 1, 90, 0.6, 5, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(2), dur:0.4, peak:0.09 }); return synBell(t + 0.05, d, { freq:2093, dur:0.6, peak:0.07, hp:1200 }); }],
  'loot.gongfa':['sfx', 1, 400, 1.8, 2, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(0), dur:0.7, peak:0.10 }); synPluck(t + 0.19, d, { freq:audioScaleFreq(2), dur:0.7, peak:0.09 }); synPluck(t + 0.38, d, { freq:audioScaleFreq(4), dur:0.9, peak:0.08 }); return synBell(t + 0.3, d, { freq:audioScaleFreq(7,1), dur:1.5, peak:0.11, hp:700 }); }],
  'cave.up':    ['sfx', 1, 200, 0.9, 3, (t,d) => { synImpact(t, d, { dur:0.14, peak:0.2 }); return synDrone(t + 0.05, d, { freq:175, dur:0.8, peak:0.2, glide:1.3 }); }],
  'cave.offline':['sfx', 1, 900, 1.6, 2, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(2), dur:0.6, peak:0.10 }); return synBell(t + 0.14, d, { freq:audioScaleFreq(4,1), dur:1.4, peak:0.11, hp:640 }); }],
  'craft.ok':   ['sfx', 1, 200, 1.1, 3, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(2), dur:0.5, peak:0.22 }); synDrone(t, d, { freq:147, dur:0.9, peak:0.16, atk:0.08, glide:1.4 }); return synBell(t + 0.12, d, { freq:audioScaleFreq(5,1), dur:1.0, peak:0.12, hp:680 }); }],
  'craft.fail': ['sfx', 1, 300, 0.9, 3, (t,d) => { synImpact(t, d, { dur:0.3, peak:0.3, tone:'heavy' }); return synWind(t + 0.02, d, { dur:0.7, cf:220, peak:0.16 }); }],

  /* 秘境 */
  'dg.enter':      ['amb', 2, 600, 2.0, 2, (t,d) => { synWind(t, d, { dur:2.0, cf:280, peak:0.2, sweep:true }); return synDrone(t, d, { freq:73, dur:1.8, peak:0.24, atk:0.4 }); }],
  'dg.floor':      ['sfx', 1, 300, 0.9, 3, (t,d) => { synImpact(t, d, { dur:0.2, peak:0.22, tone:'heavy' }); return synPluck(t + 0.08, d, { freq:audioScaleFreq(0), dur:0.5, peak:0.18 }); }],
  'dg.search.ok':  ['sfx', 1, 200, 0.8, 4, (t,d) => lootMotif(t, d, 1)],
  'dg.search.bad': ['sfx', 1, 250, 0.7, 3, (t,d) => { synImpact(t, d, { dur:0.22, peak:0.26, tone:'heavy' }); return synSweep(t + 0.05, d, { f1:700, f2:180, type:'sawtooth', q:3, dur:0.4, peak:0.16 }); }],
  'dg.boss':       ['sfx', 1, 900, 2.4, 2, (t,d) => { audioDuck(1800); synDrone(t, d, { freq:82, dur:2.2, peak:0.34, atk:0.3, glide:1.6 }); synImpact(t, d, { dur:0.5, peak:0.3, tone:'heavy' }); return synWind(t, d, { dur:2.2, cf:420, peak:0.16 }); }],

  /* 元进度 */
  'meta.ach':       ['sfx', 1, 300, 1.0, 3, (t,d) => lootMotif(t, d, 2, { step:4 })],
  'meta.ach.shen':  ['sfx', 1, 900, 2.2, 2, (t,d) => { audioDuck(2000); synBell(t, d, { freq:523, dur:2.0, peak:0.2, hp:520 }); synBell(t + 0.2, d, { freq:784, dur:2.0, peak:0.17, hp:640 }); return synBell(t + 0.4, d, { freq:1046, dur:2.0, peak:0.14, hp:760 }); }],
  'meta.title':     ['sfx', 1, 400, 1.2, 3, (t,d) => { synPluck(t, d, { freq:audioScaleFreq(4), dur:0.6, peak:0.10 }); return synBell(t + 0.1, d, { freq:audioScaleFreq(7,1), dur:1.1, peak:0.11, hp:700 }); }],
  'meta.rebirth':   ['sfx', 1, 2000, 3.6, 2, (t,d) => { audioDuck(2800); synDrone(t, d, { freq:58, dur:3.4, peak:0.32, atk:0.8, glide:2.4 }); synWind(t, d, { dur:3.4, cf:300, peak:0.18, sweep:true }); return synBell(t + 1.6, d, { freq:392, dur:1.8, peak:0.13, hp:420 }); }]
};

/* ---------- 触发 ---------- */
export function audioPlay(name, opt){
  opt = opt || {};
  if(!audioOn()) return false;
  const A = audioBoot();
  if(!A || !audioCtx()) return false;
  const e = AUDIO_EVENTS[name];
  if(!e) return false;
  let dest = audioBus(e[0]);
  if(!dest) return false;
  /* 自动播放策略：被挂起的上下文在用户手势触发的调用里恢复 */
  try{ if(A.state === 'suspended' && A.resume) A.resume(); }catch(x){}
  const now = A.currentTime;
  if(!audioGapOk(name, e[2], now)) return false;                       /* 频率限制 */
  const lim = e[4] || 0;
  if(lim > 0 && audioVoiceCount(e[0]) >= lim) return false;            /* 事件级上限 */
  if(!audioClaim(e[0], e[1], e[3])) return false;                      /* 总线级：抢占或丢弃 */
  try{
    if(opt.gain !== undefined){
      const g = audioCtx().createGain();
      g.gain.value = Math.max(0, Math.min(2, opt.gain));
      g.connect(dest);
      dest = g;
    }
    e[5](now + (opt.delay || 0.008), dest);
    return true;
  }catch(x){ return false; }
}

/* ---------- 完整性自检：每条都必须声明齐全（专家的硬规则） ---------- */
export function audioAudit(){
  const bad = [];
  const okBus = { ui:1, sfx:1, amb:1, music:1 };
  for(const k in AUDIO_EVENTS){
    const e = AUDIO_EVENTS[k];
    if(!e || e.length < 6){ bad.push(k + ':字段不足'); continue; }
    if(!okBus[e[0]]) bad.push(k + ':总线非法 ' + e[0]);
    if(typeof e[1] !== 'number' || e[1] < 0 || e[1] > 3) bad.push(k + ':优先级非法');
    if(!(e[2] > 0)) bad.push(k + ':缺最小间隔');
    if(!(e[3] > 0)) bad.push(k + ':缺时长');
    if(typeof e[5] !== 'function') bad.push(k + ':缺配方');
  }
  return bad;
}
export function audioEventNames(){ return Object.keys(AUDIO_EVENTS); }

/* ---------- 玩家可见的试听（设置面板用） ---------- */
export function audioPreview(name){
  const map = { ui:'ui.click', sfx:'loot.item2', music:'ui.milestone', amb:'dg.enter' };
  return audioPlay(map[name] || name);
}
