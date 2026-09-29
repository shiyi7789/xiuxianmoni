import { audioBoot, audioCtx, audioBus, audioClaim, audioOn, audioRand, audioParam, audioParams } from './core.js';
import { S } from '../core/state.js';
import { synPluck, synBell, synDrone, synWind } from './synth.js';
import { audioScaleFreq } from './events.js';

/* =========================================================
   自 适 应 音 乐（music）
   ---------------------------------------------------------
   生成式而非循环曲：零素材、永不重复、体积为零（见 音频设计.md §6）
   四个声部（stem）：drone 常驻 / bell 点缀 / pluck 旋律 / pulse 紧张
   调度：25 ms 心跳 + 向前排 0.25 s 的音符，全部**量化到 1/8 拍网格**；
        状态切换在**下一个 1/4 拍边界**生效（不做硬切）
   随机：走引擎的可播种 PRNG（audioRand），保证离线质检可复现
   ========================================================= */

const STATE_SPEC = {
  calm:      { bpm:84,  bell:0.18, pluck:0,    pulse:0, pluckDeg:[0] },
  cultivate: { bpm:88,  bell:0.14, pluck:0.5,  pulse:0, pluckDeg:[0, 2, 4, 5] },
  secret:    { bpm:92,  bell:0.10, pluck:0.3,  pulse:0, pluckDeg:[0, 3, 5] },
  combat:    { bpm:96,  bell:0.06, pluck:0.55, pulse:0.8, pluckDeg:[0, 1, 2, 3, 5] },
  ascend:    { bpm:76,  bell:0.4,  pluck:0.6,  pulse:0.2, pluckDeg:[0, 2, 4, 7] }
};

let MSTATE = 'calm';      /* 已生效的状态 */
let MWANT = 'calm';       /* 目标状态（到边界才生效） */
let MON = false, MTIMER = null;
let NEXT = 0, IDX = 0, DEG = 0, DRONE_END = 0;
const LOOK = 0.25;        /* 向前排程窗口（秒） */
const HEART = 25;         /* 心跳间隔（毫秒） */

export function musicBpm(){
  const s = STATE_SPEC[MSTATE] || STATE_SPEC.calm;
  const t = audioParams().tension;
  /* tension 推高战斗 BPM：96 → 132 */
  return Math.round(MSTATE === 'combat' ? s.bpm + t * 36 : s.bpm);
}
function grid(){ return (60 / musicBpm()) / 2; }   /* 1/8 拍 */

export function musicState(){ return MSTATE; }
export function musicOn(){ return MON; }

/* 目标状态：到下一个 1/4 拍边界才真正切换 —— 不做硬切
   （同一状态的重复调用直接返回：renderAll 每步都会同步一次，不能每次都推时钟） */
export function musicSet(state){
  if(!STATE_SPEC[state]) return MSTATE;
  if(state === MWANT) return MSTATE;
  MWANT = state;
  const A = audioCtx();
  if(!A || !MON){ MSTATE = state; return MSTATE; }
  /* 把排程指针推到下一个 1/4 拍边界：之后的音符自然用新规格，等价于"在拍上换段" */
  const now = A.currentTime;
  NEXT = Math.max(NEXT, now) + grid() * 2;
  MSTATE = state;
  IDX = 0;
  return MSTATE;
}

export function musicStart(){
  if(MON) return true;
  if(!audioBoot() || !audioCtx()) return false;
  try{ if(audioCtx().state === 'suspended' && audioCtx().resume) audioCtx().resume(); }catch(e){}
  MON = true;
  MSTATE = MWANT;
  NEXT = Math.max(NEXT, audioCtx().currentTime + 0.06);
  try{
    if(typeof setInterval === 'function' && !MTIMER) MTIMER = setInterval(musicTick, HEART);
  }catch(e){}
  return true;
}
export function musicStop(){
  MON = false;
  try{ if(MTIMER && typeof clearInterval === 'function'){ clearInterval(MTIMER); MTIMER = null; } }catch(e){}
}

/* 主调度：把 NEXT 之前的音符排完 */
export function musicTick(){
  if(!MON) return 0;
  const A = audioCtx();
  if(!A) return 0;
  let n = 0, guard = 0;
  const now = A.currentTime;
  if(NEXT < now) NEXT = now + 0.02;            /* 掉帧/切后台后重新对齐 */
  while(NEXT < now + LOOK && guard++ < 64){
    if(scheduleStep(NEXT, IDX)) n++;
    NEXT += grid();
    IDX++;
  }
  return n;
}

function scheduleStep(t, idx){
  if(!audioOn()) return 0;
  const s = STATE_SPEC[MSTATE] || STATE_SPEC.calm;
  const P = audioParams();
  const bus = audioBus('music');
  if(!bus) return 0;
  let did = 0;
  const beatPos = idx % 16;                    /* 2 拍一循环 */

  /* drone：常驻低吟，每次续 4 拍（只在需要时补，避免堆叠） */
  if(t + 0.05 >= DRONE_END){
    if(audioClaim('music', 3, 3.0)){
      synDrone(t, bus, {
        freq:(MSTATE === 'ascend' ? 65 : 98) * Math.pow(2, P.clarity * 0.5),
        dur:4.0, peak:0.10 + P.tension * 0.04, atk:0.6, lp:600 + P.clarity * 500
      });
      DRONE_END = t + 3.6;
      did++;
    }
  }
  /* bell：稀疏点缀（气运提高密度；秘境越深越疏） */
  const bellP = s.bell * (1 + P.fortune * 1.2) * (1 - P.depth * 0.5);
  if(beatPos % 8 === 0 && audioRand() < bellP){
    if(audioClaim('music', 3, 1.6)){
      synBell(t, bus, { freq:audioScaleFreq(4 + Math.floor(audioRand() * 2), 2), dur:2.2, peak:0.055, hp:760 });
      did++;
    }
  }
  /* pluck：五声音阶随机游走（邻级偏好，避免大跳听起来像乱弹） */
  if(s.pluck > 0 && audioRand() < s.pluck){
    const pool = s.pluckDeg;
    const dir = audioRand() < 0.5 ? -1 : 1;
    DEG = Math.max(-4, Math.min(9, DEG + dir * (audioRand() < 0.7 ? 1 : 2)));
    if(pool.indexOf(DEG) >= 0 || audioRand() < 0.6){
      if(audioClaim('music', 3, 1.4)){
        synPluck(t, bus, { freq:audioScaleFreq(DEG, 1), dur:1.1, peak:0.07 + P.clarity * 0.03, decay:0.97 });
        did++;
      }
    }
  }
  /* pulse：紧张脉冲（心跳），tension > 0.35 渐入 */
  if(s.pulse > 0 && P.tension > 0.35 && beatPos % 2 === 0){
    if(audioClaim('music', 2, 0.5)){
      synDrone(t, bus, { freq:62 + P.tension * 18, dur:0.26, peak:0.09 + P.tension * 0.07, atk:0.01, lp:200, glide:0.72 });
      did++;
    }
  }
  /* ascend：额外的风层铺底 */
  if(MSTATE === 'ascend' && beatPos === 0 && audioClaim('music', 3, 2.0)){
    synWind(t, bus, { dur:2.0, cf:520, peak:0.05, sweep:true });
    did++;
  }
  return did;
}

/* 由游戏状态推导音乐状态（各系统只调这一个） */
export function musicSyncState(){
  try{
    if(!S) return MSTATE;
    let want = 'calm';
    if(S.combat) want = 'combat';
    else if(S.dungeon) want = 'secret';
    else if(S.tab === 'cult') want = 'cultivate';
    return musicSet(want);
  }catch(e){ return MSTATE; }
}
