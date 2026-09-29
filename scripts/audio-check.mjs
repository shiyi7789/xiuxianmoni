#!/usr/bin/env node
/* ============================================================
 * 音频质检：无头浏览器离线渲染 → 逐事件测量 → 导出可试听 WAV
 * ------------------------------------------------------------
 * 为什么要有这个脚本（见 音频设计.md §8/§9）：
 *   音效是现场合成的，没法"看一眼"就确认没削波、没直流、没咔声。
 *   这里用 OfflineAudioContext 把**线上那张图**（audioGraphBuild）在
 *   离线上下文里重建一遍，把每个事件渲染成真实波形再逐项测量。
 *
 * 用法：
 *   node scripts/audio-check.mjs              测量 + 输出报告
 *   node scripts/audio-check.mjs --wav        额外导出 WAV 到 .workbuddy/audio-preview/
 *
 * 实现要点（都是踩过的坑，别改坏）：
 *   · 页面与驱动拼在**同一个 <script>** 里：跨 script 标签只能拿到 window 上的
 *     绑定（function 声明会挂上去，const/let 不会），而驱动要用 AUDIO_EVENTS 这类 const 表
 *   · 质检页必须带上**完整的 xiuxian.html**（DOM 与样式都在），否则 boot() 取不到元素就抛，
 *     整段脚本连同驱动一起中断
 *   · 每个 OfflineAudioContext 只能用一次且**必须 close()**：Chromium 对同时存在的
 *     音频上下文有上限，不关的话后面的渲染会卡住
 *   · **不要用 --virtual-time-budget**：虚拟时钟跑得比真实计算快得多，渲染 promise 会在
 *     半途被挂起、超时也无法区分"慢"与"卡死"。这里改为本地起 HTTP 服务，
 *     页面算完把 JSON POST 回来 —— 全是真实定时器，行为可预期
 *   · file:// 与固定 profile 会命中缓存（曾拿到上一次的结果）→ 用 http 服务即可绕开
 * ============================================================ */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = join(ROOT, 'xiuxian.html');
const REPORT = join(ROOT, '_audio_check.txt');
const WAVDIR = join(ROOT, '.workbuddy', 'audio-preview');
const WANT_WAV = process.argv.includes('--wav');
const DEADLINE_MS = 240000;

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find(p => existsSync(p));
if (!EDGE) {
  console.error('未找到 Edge/Chrome，无法做离线渲染质检');
  process.exit(2);
}

/* ---------- 1. 页面内驱动 ---------- */
const DRIVER = `
(async function(){
  const OUT = { events: [], stress: null, music: null, wav: {}, stage: 'start' };
  const SR = 44100;
  const stage = s => { OUT.stage = s; try { document.title = 'qc:' + s; } catch(e){} };

  function analyze(d, at, len){
    const i0 = Math.floor((at || 0) * SR);
    const n = Math.min(Math.max(1, Math.floor((len || 1.2) * SR)), d.length - i0);
    let peak = 0, sum = 0, dc = 0, clip = 0;
    for (let i = 0; i < n; i++) {
      const v = d[i0 + i], a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v; dc += v;
      if (a >= 0.999) clip++;
    }
    let tailPeak = 0;
    const tn = Math.min(Math.floor(SR * 0.01), n);
    for (let i = n - tn; i < n; i++) { const a = Math.abs(d[i0 + i]); if (a > tailPeak) tailPeak = a; }
    /* 最后一个「还有明显声音」的时刻（相对事件起点，秒）——
       尾部没归零时用它定位到底是哪一段还在响 */
    let lastLoud = -1;
    for (let i = n - 1; i >= 0; i--) if (Math.abs(d[i0 + i]) > 0.02) { lastLoud = +(i / SR).toFixed(3); break; }
    return {
      peak: +peak.toFixed(5), rms: +Math.sqrt(sum / n).toFixed(5),
      dc: +(dc / n).toFixed(5), clip: clip, tailPeak: +tailPeak.toFixed(5),
      lastLoud: lastLoud, dur: +(n / SR).toFixed(3)
    };
  }
  function toWav(buf){
    const d = buf.getChannelData(0), n = d.length;
    const ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, d[i]));
      dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
    }
    let s = '';
    const u8 = new Uint8Array(ab);
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  async function renderAt(seconds, fill){
    const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
    audioSetContextForTest(oc);
    audioGraphBuild(oc);
    fill(oc);
    const buf = await oc.startRendering();
    try { oc.close(); } catch (e) {}
    return buf;
  }

  /* 逐事件：批量排成一条时间轴再按窗口切（上下文只能用一次，且并发有上限） */
  const plan = audioEventNames().map(n => ({
    name: n, bus: AUDIO_EVENTS[n][0], prio: AUDIO_EVENTS[n][1],
    len: Math.min(6, AUDIO_EVENTS[n][3] + 0.5)      /* 判定窗：事件声明的时长 + 0.5s 余量 */
  }));
  const chunks = [];
  let cur = [], at = 0.35;
  for (const p of plan) {
    if (cur.length && at + p.len > 22) { chunks.push({ list: cur, total: at + 1.2 }); cur = []; at = 0.35; }
    p.at = at; at += p.len + 1.8; cur.push(p);
  }
  if (cur.length) chunks.push({ list: cur, total: at + 1.2 });

  for (let ci = 0; ci < chunks.length; ci++) {
    const ch = chunks[ci];
    stage('events ' + (ci + 1) + '/' + chunks.length);
    let buf = null;
    try {
      buf = await renderAt(ch.total, () => {
        for (const p of ch.list) { audioResetVoices(); audioPlay(p.name, { delay: p.at }); }
      });
    } catch (e) {
      for (const p of ch.list) OUT.events.push({ name: p.name, bus: p.bus, prio: p.prio, error: String(e && e.message) });
      continue;
    }
    const d = buf.getChannelData(0);
    for (const p of ch.list) OUT.events.push(Object.assign({ name: p.name, bus: p.bus, prio: p.prio }, analyze(d, p.at, p.len)));
    buf = null;
  }

  /* 合成器裸测：直接接到 destination，跳过总线 / 限制器 / 混响 ——
     用来判断"过响"到底是音色本身，还是总线与混响的加成 */
  stage('synths');
  OUT.synths = {};
  try {
    const probes = [
      ['synPluck', oc2 => synPluck(0.05, oc2, { freq:220, dur:0.9, peak:0.2, decay:0.968 })],
      ['synPluck-hi', oc2 => synPluck(0.05, oc2, { freq:1320, dur:0.1, peak:0.2, decay:0.9 })],
      ['synBell', oc2 => synBell(0.05, oc2, { freq:587, dur:1.2, peak:0.11, hp:700 })],
      ['synDrone', oc2 => synDrone(0.05, oc2, { freq:147, dur:1.2, peak:0.24, atk:0.05 })],
      ['synImpact', oc2 => synImpact(0.05, oc2, { dur:0.22, peak:0.34 })],
      ['synSweep', oc2 => synSweep(0.05, oc2, { f1:420, f2:2400, type:'sawtooth', q:3, dur:0.42, peak:0.26 })],
      ['synWind', oc2 => synWind(0.05, oc2, { dur:1.5, peak:0.2, cf:520 })]
    ];
    for (const [nm, fn] of probes) {
      const buf = await renderAt(2.0, () => {
        const probe = audioCtx().createGain();
        probe.gain.value = 1;
        probe.connect(audioCtx().destination);
        fn(probe);
      });
      OUT.synths[nm] = analyze(buf.getChannelData(0), 0, 2.0);
    }
  } catch (e) { OUT.synths.error = String(e && e.message); }

  /* 压力：24 声部同时触发，看限制器兜不兜得住 */
  stage('stress');  const loud = ['combat.hit','combat.hit.heavy','combat.skill.fire','combat.skill.ice','combat.skill.thunder',
                'loot.item3','loot.item4','cult.break.ok','meta.ach','craft.ok','cave.up','dg.floor'];
  const sbuf = await renderAt(3.0, () => {
    for (let i = 0; i < 24; i++) { audioResetVoices(); audioPlay(loud[i % loud.length], { delay: 0.2 }); }
  });
  OUT.stress = analyze(sbuf.getChannelData(0), 0, 3.0);

  /* 音乐：接管时钟把调度器推着走，渲染 12 秒战斗段 */
  stage('music');
  const mtime = { t: 0 };
  let mbuf = null;
  try {
    mbuf = await renderAt(12.0, (oc) => {
      Object.defineProperty(oc, 'currentTime', { get: () => mtime.t, configurable: true });
      audioSeed(20260916);
      audioParam('tension', 0.8); audioParam('clarity', 0.4); audioParam('fortune', 0.5);
      audioZone('cave');
      musicSet('combat');
      musicStart();
      for (let i = 0; i < 400; i++) { mtime.t = i * 0.03; musicTick(); }
      musicStop();
    });
    OUT.music = analyze(mbuf.getChannelData(0), 0, mbuf.duration);
  } catch (e) { OUT.music = { error: String(e && e.message) }; }

  /* 试听合集 */
  if (${WANT_WAV ? 'true' : 'false'}) {
    stage('demo');
    const demo = ['ui.click','ui.open','cult.meditate','cult.stone','cult.seclusion','cult.break.ok',
                  'cult.break.fail','loot.item0','loot.item2','loot.item3','loot.item4','loot.mat4',
                  'loot.gongfa','combat.hit','combat.hit.heavy','combat.skill.fire','combat.skill.ice',
                  'combat.skill.thunder','combat.defend','combat.win','dg.enter','dg.search.bad','dg.boss',
                  'cave.up','craft.ok','craft.fail','meta.ach','meta.rebirth','cult.ascend'];
    const GAP = 1.5, total = demo.length * GAP + 4;
    const dbuf = await renderAt(total, () => {
      demo.forEach((ev, i) => { audioResetVoices(); audioPlay(ev, { delay: 0.4 + i * GAP }); });
    });
    OUT.wav['demo-事件合集'] = toWav(dbuf);
    if (mbuf) OUT.wav['music-战斗段'] = toWav(mbuf);
    OUT.wav['stress-压力测试'] = toWav(sbuf);
  }

  stage('done');
  try {
    await fetch('/result', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(OUT) });
  } catch (e) {}
})().catch(function(e){
  try {
    fetch('/result', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ fatal: String(e && (e.stack || e.message)), stage: (document.title || '') }) });
  } catch (x) {}
});
`;

/* ---------- 2. 起本地服务：首页给质检页，/result 收回结果 ---------- */
const html = readFileSync(GAME, 'utf8');
if (!/<\/script>\s*<\/body>/.test(html)) throw new Error('成品结构与预期不符（找不到脚本结尾）');
const harness = html.replace(/<\/script>\s*<\/body>/, () => '\n' + DRIVER + '\n</script>\n</body>');

let got = null, clientErr = '';
const srv = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      got = body;
      res.writeHead(204); res.end();
    });
    return;
  }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(harness);
});

await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const profile = join(tmpdir(), 'xx-audio-qc-' + randomUUID());
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--user-data-dir=' + profile,
  'http://127.0.0.1:' + port + '/'
], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stderr.on('data', d => { clientErr += d.toString(); });

const t0 = Date.now();
while (!got && Date.now() - t0 < DEADLINE_MS) {
  await new Promise(r => setTimeout(r, 250));
}
try { child.kill(); } catch (e) {}
srv.close();
try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}

if (!got) {
  const msg = '离线渲染未返回结果（' + ((Date.now() - t0) / 1000).toFixed(1) + 's 超时）\n'
    + (clientErr ? clientErr.split('\n').slice(0, 12).join('\n') : '(无 stderr)');
  writeFileSync(REPORT, msg, 'utf8');
  console.error(msg);
  process.exit(2);
}
const res = JSON.parse(got);
if (res.fatal || !res.events) {
  const msg = '离线渲染异常（阶段 ' + (res.stage || '?') + '）\n' + (res.fatal || JSON.stringify(res).slice(0, 800));
  writeFileSync(REPORT, msg, 'utf8');
  console.error(msg);
  process.exit(2);
}

/* ---------- 3. 阈值判定（对应 音频设计.md §8） ---------- */
const L = [];
let fail = 0;
const ok = s => L.push('  OK   ' + s);
const bad = s => { fail++; L.push('  FAIL ' + s); };

L.push('=== 音频质检报告（离线渲染 ' + res.events.length + ' 个事件 · 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's）===');
L.push('');
L.push('  事件名'.padEnd(26) + '总线  峰值     RMS      直流      尾部     时长   削波  最后有声');
for (const e of res.events) {
  if (e.error) { L.push('  ' + e.name.padEnd(22) + '渲染失败：' + e.error); fail++; continue; }
  L.push('  ' + e.name.padEnd(22) + e.bus.padEnd(6) + String(e.peak).padEnd(8) + String(e.rms).padEnd(9)
    + String(e.dc).padEnd(10) + String(e.tailPeak).padEnd(9) + String(e.dur).padEnd(7) + String(e.clip).padEnd(6) + e.lastLoud);
}
L.push('');

for (const e of res.events) {
  if (e.error) continue;
  if (e.peak <= 0.0008) bad(e.name + ' 近乎无声（peak ' + e.peak + '）');
  if (e.peak > 1.0) bad(e.name + ' 峰值超 1.0（' + e.peak + '）');
  if (e.clip > 0) bad(e.name + ' 有削波采样 ' + e.clip + ' 个');
  if (Math.abs(e.dc) > 0.005) bad(e.name + ' 直流偏移过大 ' + e.dc);
  if (e.tailPeak > 0.006) bad(e.name + ' 尾部未归零（' + e.tailPeak + '）→ 可能"咔"声；最后有声时刻 ' + e.lastLoud + 's / 窗口 ' + e.dur + 's');
  if (e.dur < 0.04) bad(e.name + ' 时长过短 ' + e.dur);
}
ok('单事件：非静音 · 峰值 ≤ 1.0 · 无削波 · 无直流 · 尾部归零 · 时长达标（' + res.events.length + ' 条）');

const peaks = res.events.filter(e => !e.error).map(e => e.peak).sort((a, b) => a - b);
L.push('');
L.push('峰值区间：' + peaks[0] + ' ~ ' + peaks[peaks.length - 1] + '（设计目标约 0.13 ~ 0.5，即 −18 ~ −6 dBFS）');
const loudest = res.events.filter(e => !e.error && e.peak > 0.62).map(e => e.name);
if (loudest.length) bad('过响事件（峰值 >0.62 ≈ −4 dBFS）：' + loudest.slice(0, 8).join(' '));
else ok('无异常过响事件（全部 ≤ 0.62 ≈ −4 dBFS）');

L.push('');
if (res.synths && !res.synths.error) {
  L.push('合成器裸测（绕过总线 / 限制器 / 混响，标称 peak → 实际峰值）：');
  const expect = { synPluck:0.2, 'synPluck-hi':0.2, synBell:0.11, synDrone:0.24, synImpact:0.34, synSweep:0.26, synWind:0.2 };
  let hot = 0;
  for (const k in res.synths) {
    const s = res.synths[k], ex = expect[k] || 0;
    const ratio = ex ? (s.peak / ex) : 0;
    L.push('  ' + k.padEnd(14) + '标称 ' + String(ex).padEnd(6) + '实测 ' + String(s.peak).padEnd(9) + '倍率 ×' + ratio.toFixed(2));
    if (ratio > 2.5) hot++;
  }
  if (hot) L.push('  ⚠ ' + hot + ' 个音色的实际输出远超标称 → 请调 src/audio/synth.js 的 TRIM');
  else ok('各音色实际输出与标称相符（倍率 ≤ 2.5×）');
} else bad('合成器裸测失败：' + (res.synths ? res.synths.error : '未知'));

L.push('');
if (res.stress) {
  L.push('压力测试（24 声部同时触发）：峰值 ' + res.stress.peak + ' · 削波 ' + res.stress.clip + ' · 直流 ' + res.stress.dc);
  if (res.stress.clip > 0) bad('压力测试出现削波 —— 限制器未兜住');
  else ok('限制器兜住 24 声部叠加（峰值 ' + res.stress.peak + ' ≤ 1.0）');
} else bad('压力测试未产出');

L.push('');
if (res.music && !res.music.error) {
  const m = res.music;
  L.push('音乐段（12s / combat / tension 0.8）：峰值 ' + m.peak + ' · RMS ' + m.rms + ' · 削波 ' + m.clip);
  if (m.peak <= 0.005) bad('音乐段近乎无声 —— 调度器可能没排出音符');
  else if (m.clip > 0) bad('音乐段削波 ' + m.clip);
  else if (m.rms < 0.002) bad('音乐段能量过低（RMS ' + m.rms + '）');
  else ok('音乐段有内容且未削波（RMS ' + m.rms + '）');
} else bad('音乐段渲染失败：' + (res.music ? res.music.error : '未知'));

L.push('');
L.push('================ 汇总 ================');
L.push(fail === 0 ? '全部通过（' + res.events.length + ' 个事件 + 压力 + 音乐段）' : '失败 ' + fail + ' 项');

/* ---------- 4. 导出 WAV ---------- */
if (WANT_WAV && res.wav) {
  if (!existsSync(WAVDIR)) mkdirSync(WAVDIR, { recursive: true });
  let bytes = 0;
  for (const k in res.wav) {
    const b = Buffer.from(res.wav[k], 'base64');
    writeFileSync(join(WAVDIR, k + '.wav'), b);
    bytes += b.length;
    L.push('已导出 .workbuddy/audio-preview/' + k + '.wav  ' + (b.length / 1024).toFixed(0) + ' KB');
  }
  L.push('WAV 合计 ' + (bytes / 1024 / 1024).toFixed(2) + ' MB（.workbuddy/ 已被 .gitignore 忽略）');
}

writeFileSync(REPORT, L.join('\n') + '\n', 'utf8');
console.log(L.join('\n'));
process.exit(fail ? 1 : 0);
