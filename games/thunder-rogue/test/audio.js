/* 音频自检：用 WebAudio 桩验证 audio.js 的合成 / 声部预算 / 同名节流 / 前瞻调度链路
   运行： node test/audio.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ---------------- AudioContext 桩 ---------------- */
const ST = { made: 0, live: 0, peak: 0 };

function param(v = 0) {
  return {
    value: v,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime(v2) {
      // 真实浏览器：目标值为 0 会抛 RangeError，这里同样拦下
      if (v2 === 0) throw new Error('exponentialRampToValueAtTime(0) 非法');
      return this;
    },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  };
}

function node(extra = {}) {
  ST.made++;
  return {
    connect(dst) { if (!dst) throw new Error('connect(undefined)'); return dst; },
    disconnect() {},
    ...extra,
  };
}

class AudioContextStub {
  constructor() {
    this.sampleRate = 48000;
    this.state = 'suspended';
    this.destination = node();
    this._t = 0;
    this._tick = setInterval(() => { this._t += 0.02; }, 8);
    if (this._tick.unref) this._tick.unref();
  }
  get currentTime() { return this._t; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() {
    const o = node({
      type: 'sine', frequency: param(440), detune: param(0),
      start(t) { if (!(t >= 0)) throw new Error('start 时间非法: ' + t); ST.live++; ST.peak = Math.max(ST.peak, ST.live); },
      stop() { setImmediate(() => { ST.live--; if (o.onended) o.onended(); }); },
      onended: null,
    });
    return o;
  }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(350), Q: param(1) }); }
  createStereoPanner() { return node({ pan: param(0) }); }
  createDynamicsCompressor() {
    return node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) });
  }
  createBufferSource() {
    const s = node({
      buffer: null, playbackRate: param(1),
      start() { ST.live++; ST.peak = Math.max(ST.peak, ST.live); },
      stop() { setImmediate(() => { ST.live--; if (s.onended) s.onended(); }); },
      onended: null,
    });
    return s;
  }
  createBuffer(ch, len, sr) {
    const data = new Float32Array(len);
    return { length: len, sampleRate: sr, getChannelData: () => data };
  }
}

/* ---------------- 沙箱 ---------------- */
const sandbox = {
  __PROC: process,
  console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Error,
  isFinite, isNaN, parseInt, parseFloat, Boolean, Proxy, Reflect, Promise, Symbol,
  setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
  performance: { now: () => Date.now() },
  window: { AudioContext: AudioContextStub },
};
sandbox.__ST = ST;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = ['js/utils.js', 'js/audio.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

const probe = `
const R = { errors: [] };
function guard(label, fn) {
  try { fn(); } catch (e) { R.errors.push(label + ': ' + (e && e.message)); }
}

const NAMES = ['shoot','spread','laser','missile','droneShoot','zap','blade','void','eshoot','warn','hit','crit','kill','bigKill',
  'hurt','shield','heal','dash','bomb','slow','pickup','combo','levelup','uiClick','uiBack','uiHover',
  'waveover','gameover','bossWarn','bossPhase'];

guard('resume', () => SFX.resume());

/* 阶段 1：全部事件逐个触发（带坐标，覆盖空间化与距离衰减分支） */
for (const n of NAMES) {
  guard('at:' + n, () => SFX.playAt(n, Math.random() * 540, Math.random() * 960));
  guard('2d:' + n, () => SFX.play(n));
}

/* 阶段 2：同步炸弹式压测 —— 检验硬顶是否真的拦得住 */
const base = SFX.debug();
for (let i = 0; i < 400; i++) {
  guard('burst#' + i, () => SFX.playAt(NAMES[i % NAMES.length], Math.random() * 540, Math.random() * 960));
}
R.syncPeak = SFX.debug().peak;

guard('scene', () => ['menu','playing','paused','over','playing'].forEach(s => SFX.setScene(s)));
guard('intensity', () => { for (let i = 0; i <= 20; i++) SFX.setIntensity(i / 20); });
guard('slow', () => { SFX.setSlow(true); SFX.setSlow(true); SFX.setSlow(false); });
guard('mute', () => { SFX.toggleMute(); SFX.play('shoot'); SFX.toggleMute(); });

guard('music', () => SFX.startMusic());
guard('music-again', () => SFX.startMusic());   // 重复启动必须幂等

/* 阶段 3：按真实 60fps 节奏模拟战斗 —— 这才是玩家真正会听到的密度 */
const frameStart = SFX.debug();
let fi = 0;
function frameSim() {
  if (fi++ >= 180) return finish();
  SFX.playAt('shoot', 270, 700);                        // 主炮每帧
  if (fi % 3 === 0) SFX.playAt('hit', 200 + (fi % 5) * 40, 500);
  if (fi % 12 === 0) SFX.playAt('kill', 300, 420);
  if (fi % 7 === 0) SFX.playAt('eshoot', 100 + (fi % 4) * 80, 300);
  if (fi % 2 === 0) SFX.playAt('pickup', 260 + (fi % 3) * 10, 800);
  if (fi % 30 === 0) SFX.playAt('spread', 270, 700);
  if (fi % 45 === 0) SFX.playAt('bigKill', 270, 400);
  /* 后期 Build 常态：多把武器同时自动开火，检验 weapon glue 总线与预算 */
  if (fi % 10 === 0) SFX.playAt('laser', 270, 700);
  if (fi % 55 === 0) SFX.playAt('missile', 270, 700);
  if (fi % 4 === 0) SFX.playAt('droneShoot', 220 + (fi % 4) * 33, 680);
  if (fi % 69 === 0) SFX.playAt('zap', 270, 700);
  if (fi % 80 === 0) SFX.playAt('blade', 270, 700);
  if (fi % 95 === 0) SFX.playAt('void', 270, 500);
  SFX.setIntensity(Math.min(1, fi / 120));
  setTimeout(frameSim, 16);
}

function finish() {
  const d = SFX.debug();
  R.realtime = {
    dropped: d.dropped - frameStart.dropped,
    throttled: d.throttled - frameStart.throttled,
    fires: d.fires - frameStart.fires,
    voicesPeak: d.peak,
  };
  guard('stopMusic', () => SFX.stopMusic());
  guard('stopMusic-twice', () => SFX.stopMusic());
  setTimeout(() => {
    console.log(JSON.stringify({
      ok: R.errors.length === 0,
      errors: R.errors.slice(0, 10),
      syncBombPeakVoices: R.syncPeak,
      realtime: R.realtime,
      nodes: __ST,
      final: SFX.debug(),
    }, null, 1));
    /* 失败必须以非零码退出；异步回调里只能用宿主 process */
    if (R.errors.length) __PROC.exitCode = 1;
  }, 60);
}

setTimeout(frameSim, 16);
`;

const script = new vm.Script(src + '\n' + probe, { filename: 'audio-probe.js' });
script.runInContext(sandbox, { timeout: 60000 });
