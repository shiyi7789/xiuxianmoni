import { audioCtx, audioRand } from './core.js';

/* =========================================================
   合 成 器（synth）
   ---------------------------------------------------------
   四类音色（见 音频设计.md §1），全部现场合成、零素材：
     synPluck  古琴拨弦 —— Karplus-Strong：噪声激励 + 延迟线反馈
     synBell   编钟 / 磬 —— FM 非谐波比 1 : 2.76 + 长衰减
     synWind   风 / 噪声层 —— 粉噪 + 带通 + 可选 LFO 扫频
     synDrone  低吟 / 气机 —— 两个失谐振荡 + 低通 + 下滑
     synImpact 战斗冲击 —— 噪声爆 + 下滑低频体
     synSweep  元素技 —— 带通扫频
   统一约定：
     · 签名 (t0, dest, o)，自己接到 dest（总线或事件增益），返回**结束时刻**
     · 包络一律「起音 ≥3 ms + 收尾线性归零」——避免直流跳变的"咔"声
   ========================================================= */

/* 输出微调：这些数字是**离线质检实测校准**出来的（scripts/audio-check.mjs）。
   合成器的标称 peak 不等于实际输出峰值：
     · 拨弦的 KS 反馈环在谐振点把峰值放大约 1/(1-g)（g≈0.97 → 近一个数量级）
     · FM 的载波与调制、噪声与低频体会相加
   调完音色**必须重跑** scripts/audio-check.mjs，按实测回调这里（改错就是削波或过轻）。 */
const TRIM = { pluck:1.0, bell:0.5, wind:0.8, drone:0.5, impact:0.55, sweep:0.45 };

/* 包络：线性起音 → 指数衰减 → 最后 30 ms 线性归零 */
function env(t0, peak, dur, atk){
  const A = audioCtx();
  const g = A.createGain();
  const a = Math.max(0.003, atk || 0.006);
  const end = t0 + Math.max(a + 0.04, dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, end - 0.03);
  g.gain.linearRampToValueAtTime(0, end);
  return { g, end };
}
function noiseBuf(len, shape){
  const A = audioCtx();
  const n = Math.max(1, Math.floor(A.sampleRate * len));
  const buf = A.createBuffer(1, n, A.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < n; i++){
    const w = audioRand() * 2 - 1;
    d[i] = shape ? w * Math.pow(1 - i / n, shape) : w;
  }
  return buf;
}

/* ---------- 古琴拨弦 ---------- */
export function synPluck(t0, dest, o){
  const A = audioCtx();
  const f = Math.max(40, o.freq || 220);
  const e = env(t0, (o.peak || 0.45) * TRIM.pluck, o.dur || 0.9, 0.004);
  const src = A.createBufferSource(); src.buffer = noiseBuf(0.012, 2);
  const dl = A.createDelay(0.05); dl.delayTime.value = Math.min(0.049, 1 / f);
  const fb = A.createGain(); fb.gain.value = o.decay || 0.94;
  const lp = A.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, Math.max(900, f * 5));
  /* ⚠ lowpass 的 Q 单位是**分贝**，不是线性 Q：Q=0.7 会在截止点留下 +0.7dB 的谐振峰，
     而环路损耗只有 (1-0.94) —— 峰盖过损耗，反馈环就自激。
     离线质检实测：低音拨弦峰值冲到 276（标称的 1384 倍），整条链路被削波器压平。
     这里必须 Q=0（无谐振峰），环路才无条件稳定。 */
  lp.Q.value = 0;
  src.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl);
  lp.connect(e.g); e.g.connect(dest);
  src.start(t0); src.stop(t0 + 0.02);
  return e.end;
}

/* ---------- 编钟 / 磬 ---------- */
export function synBell(t0, dest, o){
  const A = audioCtx();
  const f = Math.max(60, o.freq || 880);
  const e = env(t0, (o.peak || 0.3) * TRIM.bell, o.dur || 1.6, 0.005);
  const car = A.createOscillator(); car.type = 'sine'; car.frequency.value = f;
  const mod = A.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 2.76;
  const mg = A.createGain(); mg.gain.value = f * 1.4;
  const hp = A.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 420;
  mod.connect(mg); mg.connect(car.frequency);
  car.connect(hp); hp.connect(e.g); e.g.connect(dest);
  car.start(t0); mod.start(t0); car.stop(e.end); mod.stop(e.end);
  return e.end;
}

/* ---------- 风 / 噪声层（可长循环） ---------- */
export function synWind(t0, dest, o){
  const A = audioCtx();
  const len = Math.max(0.1, o.dur || 2);
  const src = A.createBufferSource(); src.buffer = noiseBuf(Math.min(len, 4)); src.loop = true;
  const bp = A.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = o.cf || 520; bp.Q.value = 0.8;
  const e = env(t0, (o.peak || 0.2) * TRIM.wind, len, o.atk || 0.3);
  src.connect(bp); bp.connect(e.g); e.g.connect(dest);
  src.start(t0); src.stop(t0 + len);
  /* 缓扫：让风"呼吸" */
  if(o.sweep){
    try{
      bp.frequency.setValueAtTime(bp.frequency.value, t0);
      bp.frequency.linearRampToValueAtTime((o.cf || 520) * 1.6, t0 + len * 0.5);
      bp.frequency.linearRampToValueAtTime(o.cf || 520, t0 + len);
    }catch(x){}
  }
  return e.end;
}

/* ---------- 低吟 / 气机 ---------- */
export function synDrone(t0, dest, o){
  const A = audioCtx();
  const f = Math.max(30, o.freq || 110);
  const dur = o.dur || 1.2;
  const e = env(t0, (o.peak || 0.28) * TRIM.drone, dur, o.atk || 0.06);
  const lp = A.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = o.lp || 700; lp.Q.value = 1.1;
  const o1 = A.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = A.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.006;
  if(o.glide){
    o1.frequency.linearRampToValueAtTime(Math.max(28, f * o.glide), t0 + dur);
    o2.frequency.linearRampToValueAtTime(Math.max(28, f * 1.006 * o.glide), t0 + dur);
  }
  const g2 = A.createGain(); g2.gain.value = 0.4;
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(e.g); e.g.connect(dest);
  o1.start(t0); o2.start(t0); o1.stop(e.end); o2.stop(e.end);
  return e.end;
}

/* ---------- 战斗冲击 ---------- */
export function synImpact(t0, dest, o){
  const A = audioCtx();
  const len = Math.max(0.06, o.dur || 0.22);
  const heavy = o.tone === 'heavy';
  const pk = (o.peak || 0.34) * TRIM.impact;
  const e = env(t0, pk, len, 0.003);
  const src = A.createBufferSource(); src.buffer = noiseBuf(len, heavy ? 3 : 5);
  const lp = A.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = heavy ? 1400 : 3400;
  src.connect(lp); lp.connect(e.g); e.g.connect(dest);
  src.start(t0); src.stop(t0 + len);
  /* 低频体：从 160/240 Hz 迅速下滑，给"闷响"的重量 */
  const sub = A.createOscillator(); sub.type = 'sine';
  const f0 = heavy ? 160 : 240;
  sub.frequency.setValueAtTime(f0, t0);
  sub.frequency.exponentialRampToValueAtTime(heavy ? 52 : 90, t0 + len);
  const sg = A.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.linearRampToValueAtTime(pk * 0.7, t0 + 0.006);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  sg.gain.linearRampToValueAtTime(0, t0 + len + 0.01);
  sub.connect(sg); sg.connect(dest);
  sub.start(t0); sub.stop(t0 + len + 0.02);
  return e.end;
}

/* ---------- 元素技扫频 ---------- */
export function synSweep(t0, dest, o){
  const A = audioCtx();
  const dur = o.dur || 0.5;
  const f1 = Math.max(60, o.f1 || 300), f2 = Math.max(50, o.f2 || 1200);
  const e = env(t0, (o.peak || 0.26) * TRIM.sweep, dur, o.atk || 0.02);
  const bp = A.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q || 4;
  bp.frequency.setValueAtTime(f1, t0);
  bp.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const osc = A.createOscillator(); osc.type = o.type || 'sawtooth';
  osc.frequency.setValueAtTime(f1 * 0.6, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, f2 * 0.6), t0 + dur);
  osc.connect(bp); bp.connect(e.g); e.g.connect(dest);
  osc.start(t0); osc.stop(e.end);
  return e.end;
}
