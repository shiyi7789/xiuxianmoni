/* =========================================================
   audio.js — 交互式音频引擎（WebAudio 程序化合成，零外部资源）
   ---------------------------------------------------------
   声学身份：冷冽 / 高压 / 脆裂（Cold · Pressure · Crisp）

   总线结构
     voice(source→envelope→[pan→distance-filters])
       → SFX / UI / MUSIC bus
       → sum → DynamicsCompressor(限幅) → master → destination

   三条硬约束
     1. 声部预算：并发上限 + 优先级抢占，Boss 死亡/核弹不会被.auto 的普通击杀挤掉
     2. 同名节流：主炮 6 发/秒、经验球雨、同伴 Bleh 同时闪的资源 spike 必须削峰
     3. 空间化：540×960 画面做横向声像 + 距离衰减（远处的声音更闷更小）

   音乐：AudioContext 时钟前瞻调度（不用 setInterval 直接发音，避免节奏抖动）
         4 个 stem 按小节边界进出，由 intensity(0..1) 驱动，无硬切
   ========================================================= */
'use strict';

const SFX = (() => {
  /* =======================================================
     0. 上下文与总线
     ======================================================= */
  let ac = null;
  let supported = true;          // 浏览器是否提供 WebAudio
  let enabled = true;            // 用户是否静音

  let master = null, comp = null;
  const BUS = { sfx: null, ui: null, music: null, wpn: null };
  let wpnGlue = null;            // 武器组 glue 压缩器
  let voiceCount = 0;
  let trim = 1;              // 事件级混音增益：play() 按 SPEC[].g 赋值，outNode 落到每个声部

  /* 音乐链：musicBus → filter → vca → duck → master */
  let musicFilter = null, musicVca = null, musicDuck = null;

  /* 诊断计数（开发者用 SFX.debug() 取，不在 UI 展示） */
  const STAT = { voices: 0, peak: 0, dropped: 0, throttled: 0, fires: 0 };

  const VOICE_MAX = 26;          // 并发声部软上限（低端机留有足够安全余量）
  const VOICE_HARD = 44;         // 绝对硬顶：任何优先级都不许越过，防御极端帧
  const TIER_SLACK = [14, 4, 0, 0];   // 各 tier 可挤占的冗余声部

  /* -------------------------------------------------------
     声像 / 距离：画布 540×960，玩家通常在下半区
     ------------------------------------------------------- */
  const FIELD_W = 540, FIELD_H = 960;
  function panFor(x) {
    if (x == null) return 0;
    return clamp((x - FIELD_W / 2) / (FIELD_W / 2) * 0.72, -0.8, 0.8);
  }
  function distFor(x, y) {
    if (x == null) return 0;
    const px = FIELD_W / 2, py = FIELD_H * 0.78;   // 听者位置 ≈ 玩家常态位置
    return clamp(Math.hypot(x - px, y - py) / 560, 0, 1);
  }

  /* =======================================================
     1. 初始化
     ======================================================= */
  function init() {
    if (ac || !supported) return;
    const AC = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) { supported = false; enabled = false; return; }
    try {
      ac = new AC();
    } catch (e) { supported = false; enabled = false; return; }

    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;     // dB
    comp.knee.value = 14;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    master = ac.createGain();
    master.gain.value = enabled ? 0.55 : 0;
    comp.connect(master);
    master.connect(ac.destination);

    /* 总线级配平：SFX / 武器整体抬 ~3.2dB，让枪声、命中、敌弹确实压在音乐床之上；
       UI 保持克制（比 SFX 低 ~5dB），否则菜单音效会盖过战斗反馈。
       实测依据见 musicLevel() 注释。 */
    BUS.sfx = ac.createGain();   BUS.sfx.gain.value = 1.45;
    BUS.ui = ac.createGain();    BUS.ui.gain.value = 0.80;
    BUS.music = ac.createGain(); BUS.music.gain.value = 1.0;
    BUS.wpn = ac.createGain();   BUS.wpn.gain.value = 1.45;

    /* 武器专属子总线：后期 4~6 把武器同时自动开火时，用一台 glue 压缩把它们
       粘成"一个整体"而不是各响各的，避免叠加成噪音墙 */
    wpnGlue = ac.createDynamicsCompressor();
    wpnGlue.threshold.value = -18;
    wpnGlue.knee.value = 10;
    wpnGlue.ratio.value = 4;
    wpnGlue.attack.value = 0.004;
    wpnGlue.release.value = 0.13;
    BUS.wpn.connect(wpnGlue);
    wpnGlue.connect(comp);

    musicFilter = ac.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 16000;
    musicFilter.Q.value = 0.6;

    musicVca = ac.createGain();
    musicVca.gain.value = 0;

    musicDuck = ac.createGain();
    musicDuck.gain.value = 1;

    BUS.music.connect(musicFilter);
    musicFilter.connect(musicVca);
    musicVca.connect(musicDuck);
    musicDuck.connect(comp);

    BUS.sfx.connect(comp);
    BUS.ui.connect(comp);

    buildNoise();
  }

  function resume() {
    init();
    if (ac && ac.state === 'suspended') {
      ac.resume();
    }
  }

  /* =======================================================
     2. 合成原语
     ======================================================= */
  let noiseBuf = null, pinkBuf = null;
  function buildNoise() {
    const n = Math.floor(ac.sampleRate * 2.0);   // 比最长尾音(1.8s)更长，避免尾巴被截断
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    /* 粉噪：Paul Kellet 的 6 极点近似（-3dB/oct）。旧实现是"单极点 + 硬 clamp"，
       极点 0.99765 会在 15Hz 附近堆出巨大的次低频随机游走，尾巴听上去是一坨
       低频晃动而不是噪声，还要靠 clamp 削回来（带来失真）。 */
    pinkBuf = ac.createBuffer(1, n, ac.sampleRate);
    const p = pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  /** 声部追踪：start 计数，ended 释放 */
  function hold(src, cost) {
    voiceCount += cost;
    STAT.voices = voiceCount;
    if (voiceCount > STAT.peak) STAT.peak = voiceCount;
    src.onended = () => {
      voiceCount -= cost;
      if (voiceCount < 0) voiceCount = 0;
      STAT.voices = voiceCount;
    };
  }

  /* -------------------------------------------------------
     连发升温：持续输出时音高微微上扬，停火后自动回落。
     纯基于时间差的惰性计算，不需要任何定时器。
     amount = 每次射击升温量，rate = 每秒衰减速度
     ------------------------------------------------------- */
  let _heatT = 0, _heat = 0;
  function heatPulse(amount, rate) {
    const nowMs = clockMs();
    _heat = Math.max(0, _heat - (nowMs - _heatT) / 1000 * rate);
    _heatT = nowMs;
    _heat = Math.min(1, _heat + amount);
    return _heat;
  }

  /**
   * 一次发声的输出链：gain → [distance lowpass] → panner → bus
   * 返回可连接的入口节点
   */
  function outNode(bus, pan, dist) {
    const g = ac.createGain();
    g.gain.value = trim;
    let tail = g;
    if (dist > 0.01) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lerp(15000, 950, dist);
      lp.Q.value = 0.4;
      tail.connect(lp); tail = lp;
    }
    if (pan && ac.createStereoPanner) {
      try {
        const pn = ac.createStereoPanner();
        pn.pan.value = pan;
        tail.connect(pn); tail = pn;
      } catch (e) { /* 老浏览器无 StereoPanner，跳过空间化 */ }
    }
    tail.connect(BUS[bus] || BUS.sfx);
    return g;
  }

  /** 振荡器音。o = {f, f2, dur, type, vol, atk, curve, pan, dist, bus, jitter} */
  function tone(o) {
    if (!ac) return;
    const t0 = ac.currentTime + (o.at || 0);
    const dur = o.dur || 0.12;
    const jit = o.jitter == null ? 0.05 : o.jitter;
    const f0 = (o.f || 440) * (1 + rand(jit, -jit));
    const vol = (o.vol == null ? 0.15 : o.vol) * (1 + rand(0.08, -0.08));

    const osc = ac.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);

    const g = ac.createGain();
    const atk = o.atk == null ? 0.005 : o.atk;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    if (o.curve === 'hold') {
      g.gain.setValueAtTime(vol, t0 + dur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    }

    const dst = outNode(o.bus || 'sfx', o.pan, o.dist);
    osc.connect(g); g.connect(dst);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
    hold(osc, o.cost || 1);
  }

  /** 噪声瞬态。o = {dur, vol, f0, f1, type, q, pan, dist, bus, pink} */
  function hiss(o) {
    if (!ac || !noiseBuf) return;
    const t0 = ac.currentTime + (o.at || 0);
    const dur = o.dur || 0.2;
    const vol = (o.vol == null ? 0.16 : o.vol) * (1 + rand(0.1, -0.1));

    const s = ac.createBufferSource();
    const env = o.pink ? pinkBuf : noiseBuf;
    s.buffer = env;
    s.loop = true;
    s.playbackRate.value = 1 + rand(0.12, -0.12);

    const f = ac.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.Q.value = o.q == null ? 1 : o.q;
    const a = (o.f0 || 1800) * (1 + rand(0.07, -0.07));
    f.frequency.setValueAtTime(a, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.f1), t0 + dur);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.atk == null ? 0.004 : o.atk));
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    const dst = outNode(o.bus || 'sfx', o.pan, o.dist);
    s.connect(f); f.connect(g); g.connect(dst);
    /* 每次随机取缓冲区里不同的一段。旧代码永远从第 0 帧开始，等于全场所有
       命中 / 爆炸 / 尾焰共用同一份噪声切片，快速连发时会听出"卡带"式重复，
       也违背了"连打 100 发不重样"的设计目标。 */
    s.start(t0, rand(Math.max(0, env.duration - dur - 0.1)));
    s.stop(t0 + dur + 0.02);
    hold(s, o.cost || 1);
  }

  /* =======================================================
     3. 事件表：优先级(tier) / 最小间隔(ms) / 声部成本
        tier 0 = 永不被抢占（UI、Boss、核弹、升级）
        tier 1 = 玩家生存相关（冲刺、受伤、护盾、技能）
        tier 2 = 武器与击杀反馈
        tier 3 = 世界杂声（敌人射击、远程拾取、命中）
     ======================================================= */
  const SPEC = {
    /* g = 每个事件的混音增益（线性）。阶梯目标（实测峰值 dBFS）：
       武器 -16 / 命中 -22 / 击杀 -15 / 里程碑 -9 / 核弹 -7 / UI -28
       cost = 该事件真实的声部数（振荡器+噪声源），budgetOK 用它做预留，
       旧表普遍少记一半，导致密集开火时实际并发高于预算。 */
    shoot:    { tier: 2, gap: 44,  cost: 4, g: 0.80 },
    spread:   { tier: 2, gap: 70,  cost: 3, g: 0.93 },
    laser:    { tier: 2, gap: 66,  cost: 3, g: 0.91 },
    missile:  { tier: 2, gap: 105, cost: 3, g: 0.93 },
    void:     { tier: 2, gap: 0,   cost: 3, g: 1.19 },
    /* 无人机数量多且同时开火：提高节流、压低 tier，防止多架叠加成噪音 */
    droneShoot:{ tier: 3, gap: 52,  cost: 2, g: 1.32 },
    zap:      { tier: 2, gap: 0,   cost: 5, g: 1.64 },
    blade:    { tier: 2, gap: 0,   cost: 3, g: 1.88 },
    /* 敌方火力提到 tier 2：听声躲弹，不能再被音乐盖掉 */
    eshoot:   { tier: 2, gap: 78,  cost: 2, g: 2.42 },
    hit:      { tier: 3, gap: 32,  cost: 2, g: 3.60 },
    crit:     { tier: 2, gap: 40,  cost: 3, g: 2.04 },
    kill:     { tier: 2, gap: 52,  cost: 3, g: 1.06 },
    bigKill:  { tier: 1, gap: 0,   cost: 4, g: 1.17 },
    hurt:     { tier: 1, gap: 110, cost: 3, g: 1.27 },
    shield:   { tier: 1, gap: 95,  cost: 2, g: 1.43 },
    pickup:   { tier: 3, gap: 58,  cost: 2, g: 1.88 },
    heal:     { tier: 1, gap: 70,  cost: 3, g: 1.68 },
    dash:     { tier: 1, gap: 70,  cost: 2, g: 1.40 },
    bomb:     { tier: 0, gap: 0,   cost: 4, g: 1.30 },
    slow:     { tier: 1, gap: 0,   cost: 3, g: 1.35 },
    levelup:  { tier: 0, gap: 0,   cost: 5, g: 2.37 },
    uiClick:  { tier: 0, gap: 38,  cost: 1, g: 1.60 },
    uiBack:   { tier: 0, gap: 38,  cost: 1, g: 1.78 },
    uiHover:  { tier: 3, gap: 55,  cost: 1, g: 1.91 },
    warn:     { tier: 3, gap: 90,  cost: 1, g: 1.60 },
    combo:    { tier: 2, gap: 260, cost: 2, g: 1.84 },
    waveover: { tier: 1, gap: 0,   cost: 2, g: 2.85 },
    gameover: { tier: 0, gap: 0,   cost: 3, g: 1.60 },
    bossWarn: { tier: 0, gap: 0,   cost: 3, g: 1.40 },
    bossPhase:{ tier: 0, gap: 0,   cost: 3, g: 1.38 },
    /* ---- v2 元素状态音（6）：短促、有色彩、彼此可辨；高频命中会走节流，不会刷屏 ---- */
    eZap:     { tier: 3, gap: 0,   cost: 2, g: 2.60 },
    eFreeze:  { tier: 3, gap: 0,   cost: 2, g: 2.60 },
    eBurn:    { tier: 3, gap: 0,   cost: 2, g: 2.60 },
    eToxin:   { tier: 3, gap: 0,   cost: 2, g: 2.60 },
    eVoid:    { tier: 2, gap: 0,   cost: 3, g: 2.20 },
    eLight:   { tier: 3, gap: 0,   cost: 2, g: 2.60 },
    /* ---- v2 元素反应音（按强度分档：低 / 中 / 高）---- */
    rxLow:    { tier: 3, gap: 62,  cost: 2, g: 2.20 },
    rxMid:    { tier: 2, gap: 72,  cost: 3, g: 1.80 },
    rxBig:    { tier: 1, gap: 92,  cost: 4, g: 1.45 },
    /* ---- v2 Boss 签名音（区域技 / 部件击破）---- */
    bossZone: { tier: 0, gap: 180, cost: 3, g: 1.22 },
    bossParts:{ tier: 0, gap: 220, cost: 2, g: 1.30 },
  };

  const lastAt = Object.create(null);
  function clockMs() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }
  function throttled(name, gap) {
    if (!gap) return false;
    const t = clockMs();
    const prev = lastAt[name];
    if (prev !== undefined && t - prev < gap) { STAT.throttled++; return true; }
    lastAt[name] = t;
    return false;
  }
  function budgetOK(tier, cost) {
    // 硬顶优先于一切：版本 Ships with no defaults，tier0 也必须受限
    if (voiceCount >= VOICE_HARD) {
      STAT.dropped++;
      return false;
    }
    if (voiceCount + cost <= VOICE_MAX + (TIER_SLACK[tier] || 0)) return true;
    STAT.dropped++;
    return false;
  }

  /* =======================================================
     4. 音效设计
        每个事件都带 ±随机：同一把枪连打 100 发也不重样
     ======================================================= */
  const S = {
    /* ---- 玩家武器 ---- */
    /* ===================================================
       战机武器 —— 每把武器都要能被"听出来"，这是 Build 反馈的一半。
       全部走 wpn glue 总线，所有音色都带 ±随机，连打不重样。
       =================================================== */

    /* 主炮：射速最快（基础 0.16s），必须极短极利落，否则糊成白噪。
       三层：击发瞬态(square) + 中频 body(triangle) + 尾焰(bandpass noise)。
       heat = 连发升温值，持续输出时音高微微上扬，手上能感觉到"枪管变热"。 */
    shoot(p, d) {
      const k = 1 + heatPulse(0.09, 3.2) * 0.05;
      /* 街机主炮配方：低频"顶"一下给重量，方波下扫给 pew，噪声给脆度。
         三层都 <=70ms，6 发/秒也不会糊成一片白噪。 */
      tone({ f: 260,      f2: 88,  dur: 0.05,  type: 'sine',     vol: 0.05,  bus: 'wpn', pan: p, dist: d, jitter: 0.05 });
      tone({ f: 1700 * k, f2: 420, dur: 0.055, type: 'square',   vol: 0.045, bus: 'wpn', pan: p, dist: d, jitter: 0.07 });
      tone({ f: 850 * k,  f2: 250, dur: 0.07,  type: 'triangle', vol: 0.028, bus: 'wpn', pan: p, dist: d, jitter: 0.05 });
      hiss({ dur: 0.05, vol: 0.05, f0: 4600 * k, f1: 1200, type: 'bandpass', q: 1.6, bus: 'wpn', pan: p, dist: d });
    },

    /* 散射炮：一把霰弹枪，追求"厚"与"宽"。低频为骨架，粉噪下扫画包络。 */
    spread(p, d) {
      tone({ f: 520, f2: 176, dur: 0.13, type: 'square',   vol: 0.055, bus: 'wpn', pan: p, dist: d, jitter: 0.08 });
      tone({ f: 260, f2: 118, dur: 0.16, type: 'sawtooth', vol: 0.028, bus: 'wpn', pan: p, dist: d, jitter: 0.06 });
      hiss({ dur: 0.19, vol: 0.08, f0: 1900, f1: 310, q: 0.8, bus: 'wpn', pan: p, dist: d, pink: true });
    },

    /* 贯穿激光：一条持续 beam，特征是"上滑"而非"下滑"——能量向前推进。 */
    laser(p, d) {
      tone({ f: 300,  f2: 1900, dur: 0.15, type: 'sawtooth', vol: 0.045, bus: 'wpn', pan: p, dist: d, jitter: 0.05 });
      tone({ f: 1500, f2: 2600, dur: 0.11, type: 'sine',     vol: 0.026, bus: 'wpn', pan: p, dist: d, jitter: 0.05, at: 0.03 });
      hiss({ dur: 0.21, vol: 0.055, f0: 700, f1: 6200, type: 'bandpass', q: 3.2, bus: 'wpn', pan: p, dist: d });
    },

    /* 追踪导弹：发射闷响(低频下坠) + 推进 pitch-up + 粉噪尾流，听感有"远去"的方向。 */
    missile(p, d) {
      tone({ f: 150, f2: 58,  dur: 0.14, type: 'square', vol: 0.06,  bus: 'wpn', pan: p, dist: d, jitter: 0.05 });
      tone({ f: 420, f2: 920, dur: 0.32, type: 'sine',   vol: 0.042, bus: 'wpn', pan: p, dist: d, jitter: 0.04 });
      hiss({ dur: 0.44, vol: 0.05, f0: 520, f1: 2400, type: 'bandpass', q: 1.0, bus: 'wpn', pan: p, dist: d, pink: true, at: 0.04 });
    },

    /* 环绕无人机：主炮的 mini 版——更高、更短、更轻。
       多架同时开火是常态，所以音量必须压得很低，靠数量而非单个音量制造整齐感。 */
    droneShoot(p, d) {
      tone({ f: 2600, f2: 1300, dur: 0.028, type: 'square', vol: 0.024, bus: 'wpn', pan: p, dist: d, jitter: 0.09 });
      hiss({ dur: 0.03, vol: 0.02, f0: 6000, f1: 2400, type: 'bandpass', q: 2.4, bus: 'wpn', pan: p, dist: d });
    },

    /* 电弧链：4 连高频脉冲串，间隔 28ms，音量递减——"啪啪啪"串起来的放电感。 */
    zap(p, d) {
      for (let i = 0; i < 4; i++) {
        const f = rand(3600, 1500);
        tone({ f, f2: f * 0.4, dur: 0.03, type: 'square', vol: 0.03 - i * 0.005,
               bus: 'wpn', pan: p, dist: d, jitter: 0.12, at: i * 0.028 });
      }
      hiss({ dur: 0.23, vol: 0.048, f0: 5200, f1: 900, type: 'bandpass', q: 2.6, bus: 'wpn', pan: p, dist: d });
    },

    /* 回旋飞刃：金属 whoosh。带通噪声先扫上去再落下，叠一个金属泛音，用来标识"这是一把刀"。 */
    blade(p, d) {
      tone({ f: 880,  f2: 1760, dur: 0.18, type: 'triangle', vol: 0.032, bus: 'wpn', pan: p, dist: d, jitter: 0.05 });
      tone({ f: 2640, f2: 2200, dur: 0.12, type: 'sine',     vol: 0.016, bus: 'wpn', pan: p, dist: d, jitter: 0.04, at: 0.02 });
      hiss({ dur: 0.27, vol: 0.05, f0: 500, f1: 3400, type: 'bandpass', q: 4.5, bus: 'wpn', pan: p, dist: d });
    },

    /* 引力黑洞：向内塌陷的低频嗡鸣，方向感由 pan 决定。 */
    void(p, d) {
      tone({ f: 220, f2: 52, dur: 0.9, type: 'sine',     vol: 0.1,  pan: p, dist: d });
      tone({ f: 110, f2: 40, dur: 1.2, type: 'triangle', vol: 0.07, pan: p, dist: d, at: 0.04 });
      hiss({ dur: 0.85, vol: 0.06, f0: 1800, f1: 120, type: 'lowpass', q: 2, pan: p, dist: d, pink: true });
    },

    /* ---- 敌人攻击：原先误用 UI 语义的 warn，这里换成独立的敌方音色 ---- */
    eshoot(p, d) {
      /* 与玩家主炮刻意拉开音区：更低更闷更脏，一耳朵就能分辨"这是打向我的" */
      tone({ f: 340, f2: 125, dur: 0.085, type: 'square', vol: 0.05,  pan: p, dist: d, jitter: 0.09 });
      hiss({ dur: 0.075, vol: 0.045, f0: 2400, f1: 420, type: 'bandpass', q: 1.3, pan: p, dist: d });
    },
    warn(p, d) {
      tone({ f: 900, dur: 0.09, type: 'square', vol: 0.045, pan: p, dist: d, jitter: 0.04 });
    },

    /* ---- 命中与击杀 ---- */
    hit(p, d) {
      hiss({ dur: 0.05, vol: 0.06, f0: 3400, f1: 900, type: 'bandpass', q: 2.2, pan: p, dist: d, atk: 0.002 });
      tone({ f: 2200, f2: 1100, dur: 0.035, type: 'triangle', vol: 0.026, pan: p, dist: d, jitter: 0.1 });
    },
    crit(p, d) {
      hiss({ dur: 0.06, vol: 0.07, f0: 4600, f1: 900, type: 'bandpass', q: 3.2, pan: p, dist: d });
      tone({ f: 1560, f2: 2900, dur: 0.07, type: 'square', vol: 0.045, pan: p, dist: d });
      tone({ f: 2340, f2: 3600, dur: 0.05, type: 'sine', vol: 0.03, pan: p, dist: d, at: 0.02 });
    },
    kill(p, d) {
      hiss({ dur: 0.26, vol: 0.15, f0: 1700, f1: 80, q: 1.3, pan: p, dist: d });
      tone({ f: 210, f2: 58, dur: 0.2, type: 'triangle', vol: 0.09, pan: p, dist: d, jitter: 0.07 });
      tone({ f: 90, f2: 40, dur: 0.34, type: 'sine', vol: 0.06, pan: p, dist: d });
    },
    bigKill(p, d) {
      hiss({ dur: 0.55, vol: 0.24, f0: 1400, f1: 45, q: 0.9, pan: p, dist: d });
      tone({ f: 130, f2: 34, dur: 0.5, type: 'sawtooth', vol: 0.13, pan: p, dist: d });
      tone({ f: 64, f2: 26, dur: 0.8, type: 'sine', vol: 0.16, pan: p, dist: d });
      hiss({ dur: 0.9, vol: 0.06, f0: 300, f1: 90, type: 'lowpass', pan: p, dist: d, pink: true, at: 0.05 });
    },

    /* ---- 玩家状态 ---- */
    hurt(p, d) {
      tone({ f: 240, f2: 66, dur: 0.28, type: 'sawtooth', vol: 0.14, pan: p, dist: d, jitter: 0.04 });
      hiss({ dur: 0.2, vol: 0.11, f0: 1100, f1: 130, pan: p, dist: d });
      tone({ f: 118, f2: 84, dur: 0.5, type: 'square', vol: 0.05, pan: p, dist: d, at: 0.03 });
    },
    shield(p, d) {
      tone({ f: 300, f2: 1240, dur: 0.3, type: 'triangle', vol: 0.09, pan: p, dist: d, curve: 'hold' });
      tone({ f: 600, f2: 1860, dur: 0.22, type: 'sine', vol: 0.045, pan: p, dist: d, at: 0.03 });
    },
    heal(p, d) {
      tone({ f: 620, f2: 1180, dur: 0.16, type: 'sine', vol: 0.08, pan: p, dist: d });
      tone({ f: 930, f2: 1620, dur: 0.2, type: 'sine', vol: 0.055, pan: p, dist: d, at: 0.055 });
      tone({ f: 1390, f2: 2100, dur: 0.24, type: 'triangle', vol: 0.035, pan: p, dist: d, at: 0.11 });
    },
    dash(p, d) {
      hiss({ dur: 0.24, vol: 0.12, f0: 3200, f1: 260, q: 1.1, pan: p, dist: d });
      tone({ f: 760, f2: 1750, dur: 0.18, type: 'sine', vol: 0.055, pan: p, dist: d });
    },

    /* ---- 主动技能 ---- */
    bomb() {
      hiss({ dur: 1.0, vol: 0.3, f0: 2600, f1: 38, q: 0.7 });
      tone({ f: 84, f2: 30, dur: 0.9, type: 'sawtooth', vol: 0.17 });
      tone({ f: 42, f2: 22, dur: 1.3, type: 'sine', vol: 0.2 });
      hiss({ dur: 1.6, vol: 0.07, f0: 420, f1: 70, type: 'lowpass', pink: true, at: 0.06 });
      duckMusic(0.35, 0.9);
    },
    slow() {
      tone({ f: 1500, f2: 190, dur: 0.55, type: 'sine', vol: 0.09 });
      tone({ f: 748, f2: 96, dur: 0.7, type: 'triangle', vol: 0.07, at: 0.04 });
      hiss({ dur: 0.5, vol: 0.05, f0: 5200, f1: 400, type: 'bandpass', q: 1.6 });
    },

    /* ---- 拾取 ---- */
    pickup(p, d) {
      /* 两段式上滑：经典"吃到东西"提示音，短到不打断战斗节奏 */
      const f = 1180 + rand(140, -140);
      tone({ f, f2: f * 1.02, dur: 0.055, type: 'sine', vol: 0.05, pan: p, dist: d, jitter: 0.04 });
      tone({ f: f * 1.5, f2: f * 1.52, dur: 0.075, type: 'sine', vol: 0.038, pan: p, dist: d, jitter: 0.04, at: 0.05 });
    },
    combo() {
      tone({ f: 880, dur: 0.1, type: 'triangle', vol: 0.05 });
      tone({ f: 1320, dur: 0.12, type: 'triangle', vol: 0.045, at: 0.06 });
    },

    /* ---- 阶段事件 ---- */
    levelup() {
      /* 9 声部太重（吃掉 VOICE_MAX 的三分之一），减到 5 声部再补回增益 */
      const seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => tone({ f, dur: 0.34, type: 'triangle', vol: 0.1, at: i * 0.075, bus: 'ui' }));
      hiss({ dur: 0.5, vol: 0.06, f0: 600, f1: 6000, type: 'bandpass', q: 1.2, bus: 'ui' });
      duckMusic(0.5, 0.6);
    },
    bossWarn() {
      tone({ f: 146, f2: 88, dur: 1.1, type: 'sawtooth', vol: 0.13, curve: 'hold' });
      tone({ f: 293, f2: 176, dur: 1.1, type: 'square', vol: 0.05, curve: 'hold', at: 0.1 });
      hiss({ dur: 1.2, vol: 0.08, f0: 260, f1: 90, type: 'lowpass', pink: true });
      duckMusic(0.4, 1.4);
    },
    bossPhase() {
      tone({ f: 420, f2: 1500, dur: 0.4, type: 'square', vol: 0.1 });
      tone({ f: 210, f2: 700, dur: 0.45, type: 'sawtooth', vol: 0.07, at: 0.05 });
      hiss({ dur: 0.45, vol: 0.1, f0: 1600, f1: 180, q: 1 });
      duckMusic(0.5, 0.7);
    },
    waveover() {
      [660, 880].forEach((f, i) =>
        tone({ f, dur: 0.26, type: 'triangle', vol: 0.06, at: i * 0.09, bus: 'ui' }));
    },
    gameover() {
      musicFade(0, 0.6);
      tone({ f: 320, f2: 60, dur: 1.5, type: 'sawtooth', vol: 0.12 });
      tone({ f: 160, f2: 38, dur: 2.0, type: 'sine', vol: 0.14, at: 0.12 });
      hiss({ dur: 1.8, vol: 0.08, f0: 900, f1: 60, type: 'lowpass', pink: true });
    },

    /* ---- UI（走独立 ui bus，音量更低且不与枪声抢总线） ---- */
    uiClick() {
      tone({ f: 880, f2: 1180, dur: 0.045, type: 'square', vol: 0.05, bus: 'ui', jitter: 0.03 });
    },
    uiBack() {
      tone({ f: 700, f2: 460, dur: 0.06, type: 'square', vol: 0.045, bus: 'ui', jitter: 0.03 });
    },
    uiHover() {
      tone({ f: 1500, dur: 0.025, type: 'sine', vol: 0.022, bus: 'ui' });
    },

    /* =====================================================
       v2 · 元素状态音（6）
       设计口径：短（≤0.22s）、有色彩、彼此可辨；每命中一次才响一次，
       且高频武器本身就受 hit/eXxx 的 tier 3 预算压制，不会糊成噪音。
       ===================================================== */
    /* 雷：高频电流噼啪 —— 用 square 的抖动摇出「电荷」而不是「爆炸」 */
    eZap(p, d) {
      tone({ f: 3100, f2: 1200, dur: 0.035, type: 'square', vol: 0.026, pan: p, dist: d, jitter: 0.14 });
      hiss({ dur: 0.09, vol: 0.03, f0: 6200, f1: 1800, type: 'bandpass', q: 3, pan: p, dist: d });
    },
    /* 冰：结晶上滑 —— 唯一「向上走」的元素音，和火的下压摩擦完全相反 */
    eFreeze(p, d) {
      tone({ f: 2400, f2: 3400, dur: 0.07, type: 'sine', vol: 0.03, pan: p, dist: d, jitter: 0.05 });
      tone({ f: 3600, f2: 2000, dur: 0.1, type: 'triangle', vol: 0.018, pan: p, dist: d, at: 0.03 });
    },
    /* 火：低频摩擦上扬（与敌弹音区刻意错开，元素音永远比敌弹「更高更亮」） */
    eBurn(p, d) {
      hiss({ dur: 0.11, vol: 0.035, f0: 700, f1: 2600, type: 'bandpass', q: 1.1, pan: p, dist: d });
      tone({ f: 260, f2: 520, dur: 0.08, type: 'sawtooth', vol: 0.022, pan: p, dist: d, jitter: 0.08 });
    },
    /* 毒：粘稠气泡（低通 + 粉噪声，唯一「闷」的元素音） */
    eToxin(p, d) {
      tone({ f: 520, f2: 190, dur: 0.11, type: 'triangle', vol: 0.028, pan: p, dist: d, jitter: 0.07 });
      hiss({ dur: 0.13, vol: 0.024, f0: 900, f1: 300, type: 'lowpass', q: 1.4, pan: p, dist: d, pink: true });
    },
    /* 虚空：向内塌陷（下滑 sine + 粉噪声，唯一「往低处收」的元素音） */
    eVoid(p, d) {
      tone({ f: 380, f2: 74, dur: 0.22, type: 'sine', vol: 0.04, pan: p, dist: d });
      hiss({ dur: 0.2, vol: 0.024, f0: 1500, f1: 130, type: 'lowpass', q: 1.8, pan: p, dist: d, pink: true });
    },
    /* 光：钟形高音（纯 sine 泛音，唯一不带噪声的元素音 → 一耳朵能认出） */
    eLight(p, d) {
      tone({ f: 1760, f2: 2640, dur: 0.09, type: 'sine', vol: 0.028, pan: p, dist: d });
      tone({ f: 3520, dur: 0.07, type: 'sine', vol: 0.012, pan: p, dist: d, at: 0.02 });
    },

    /* =====================================================
       v2 · 元素反应音（按强度分档）
       低 = 战术补强（只做提示）· 中 = 输出放大（有明确「事件感」）
       高 = 清场质变（压音乐、抢注意力，因为它是这一局的高光）
       ===================================================== */
    rxLow(p, d) {
      tone({ f: 900, f2: 1500, dur: 0.09, type: 'triangle', vol: 0.05, pan: p, dist: d, bus: 'ui' });
      hiss({ dur: 0.12, vol: 0.04, f0: 2600, f1: 700, type: 'bandpass', q: 2, pan: p, dist: d });
    },
    rxMid(p, d) {
      tone({ f: 620, f2: 1560, dur: 0.16, type: 'square', vol: 0.055, pan: p, dist: d });
      tone({ f: 1240, f2: 2480, dur: 0.14, type: 'triangle', vol: 0.04, pan: p, dist: d, at: 0.03 });
      hiss({ dur: 0.2, vol: 0.055, f0: 3400, f1: 500, type: 'bandpass', q: 1.6, pan: p, dist: d });
    },
    rxBig(p, d) {
      tone({ f: 220, f2: 60, dur: 0.42, type: 'sawtooth', vol: 0.1, pan: p, dist: d });
      tone({ f: 880, f2: 2200, dur: 0.24, type: 'square', vol: 0.06, pan: p, dist: d, at: 0.02 });
      hiss({ dur: 0.46, vol: 0.1, f0: 4200, f1: 120, q: 1.1, pan: p, dist: d });
      duckMusic(0.45, 0.5);
    },

    /* =====================================================
       v2 · Boss 签名音
       ===================================================== */
    /* 区域技（熔渣带 / 静电场 / 零域冰封）：先把「压力」铺开，不制造瞬态惊吓 */
    bossZone(p, d) {
      tone({ f: 110, f2: 62, dur: 0.8, type: 'sawtooth', vol: 0.09, curve: 'hold', pan: p, dist: d });
      hiss({ dur: 0.7, vol: 0.06, f0: 800, f1: 140, type: 'lowpass', q: 1.2, pan: p, dist: d, pink: true });
    },
    /* 部件击破：金属断裂 + 低频闷响（Boss 战里最重要的正向反馈） */
    bossParts(p, d) {
      tone({ f: 1400, f2: 280, dur: 0.16, type: 'square', vol: 0.06, pan: p, dist: d, jitter: 0.06 });
      hiss({ dur: 0.24, vol: 0.07, f0: 3000, f1: 300, type: 'bandpass', q: 1.1, pan: p, dist: d });
      tone({ f: 180, f2: 70, dur: 0.3, type: 'triangle', vol: 0.05, pan: p, dist: d, at: 0.02 });
    },
  };

  /* =======================================================
     5. 播放入口（唯一的出声口径）
     ======================================================= */
  function play(name, x, y, opt) {
    const spec = SPEC[name];
    if (!spec) return;
    if (!enabled || !supported) return;
    init();
    if (!ac) return;
    if (ac.state === 'suspended') { ac.resume(); }
    if (throttled(name, spec.gap)) return;
    if (!budgetOK(spec.tier, spec.cost)) return;

    const fn = S[name];
    if (!fn) return;
    STAT.fires++;

    const pan = panFor(x);
    const dist = distFor(x, y);
    // 距离削弱：远处的爆炸只留低频闷响，近处才有完整高频瞬态
    const near = 1 - dist * 0.55;
    if (dist > 0.62 && spec.tier >= 2 && opt && opt.cull !== false) {
      // 屏幕边缘的世界杂声直接让位给预算（玩家注意力也在中央）
      if (voiceCount > VOICE_MAX * 0.7) return;
    }
    if (spec.tier === 3 && near < 0.5) {
      if (voiceCount > VOICE_MAX * 0.8) return;
    }
    const gPrev = trim;
    trim = spec.g == null ? 1 : spec.g;
    try { fn(pan, dist, near); } catch (e) { /* 音频失败绝不影响 gameplay */ }
    finally { trim = gPrev; }
  }

  /* =======================================================
     6. 自适应音乐 —— AudioContext 时钟前瞻调度
        157 BPM / 16 分 step；4 个 stem 在乐句边界进出
        intensity 0.0 勘探 → 0.3  percussion → 0.6 lead → 0.85 alarm
     ======================================================= */
  const BPM = 104;
  const STEP = 60 / BPM / 4;          // 16 分音符时长
  const LOOKAHEAD = 0.14;             // 提前排程窗口
  const TICK_MS = 25;                 // 调度器心跳（不直接发音）

  const PROG = [0, -4, 3, -2];        // 4 小节和声进行（Am - F - C - G 色彩）
  const SCALE = [0, 2, 3, 5, 7, 8, 10]; // 自然小调
  const ROOT = 55;                    // A1

  let musicOn = false, schedTimer = null, nextTime = 0, step = 0;
  let intensity = 0, warp = 0, scene = 'menu';

  function stepDur() { return STEP * (1 + warp * 0.55); }

  function scheduleStep(i, t) {
    const bar = Math.floor(i / 16) % 4;
    const rootF = ROOT * Math.pow(2, PROG[bar] / 12);
    const s16 = i % 16;
    const it = intensity;

    /* --- Stem A：低频脉冲（永远在；这是"飞船引擎"的心跳） --- */
    if (s16 % 8 === 0) {
      kick(t, 0.24 + it * 0.11);
    }
    if (s16 === 8 && it > 0.2) kick(t, 0.13);

    /* --- Stem A2：低音线 --- */
    const BASS = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1];
    if (BASS[s16]) {
      bassNote(t, rootF * 2, STEP * 2.4, 0.12 + it * 0.05);
    }

    /* --- Stem B：琶音（intensity 0.15+ 才进入，避免勘探段疲劳） --- */
    if (it > 0.15 && s16 % 2 === 0) {
      const half = Math.floor(i / 8) % 2;
      const deg = SCALE[(i * 3 + half * 2) % SCALE.length];
      const f = rootF * 8 * Math.pow(2, deg / 12);
      arpNote(t, f, STEP * 1.7, 0.055 + it * 0.04);
    }

    /* --- Stem C：打击乐（0.3+ 闭合 hihat / 0.5+ 军鼓） --- */
    if (it > 0.3 && s16 % 2 === 1) hat(t, 0.028 + it * 0.022);
    if (it > 0.5 && (s16 === 4 || s16 === 12)) snare(t, 0.062 + it * 0.042);

    /* --- Stem D：紧张动机 + 警报（0.6+ / 0.85+） --- */
    if (it > 0.6) {
      const LEAD = [1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0];
      if (LEAD[s16]) {
        const deg = SCALE[(i * 5) % SCALE.length];
        const f = rootF * 16 * Math.pow(2, deg / 12);
        leadNote(t, f, STEP * 1.3, 0.038 + it * 0.038);
      }
    }
    if (it > 0.85 && s16 % 4 === 0) {
      alarmNote(t, rootF * 12, STEP * 1.2, 0.026);
    }

    /* --- 乐句起点的 riser（每 4 小节，只有高压段落才出现） --- */
    if (i % 64 === 0 && it > 0.55) riser(t);
  }

  /* --- 音色 --- */
  function musicOut() { return musicFilter; }

  function kick(t, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    o.connect(g); g.connect(musicOut());
    o.start(t); o.stop(t + 0.3);
    hold(o, 1);
  }
  function bassNote(t, f, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(lp); lp.connect(g); g.connect(musicOut());
    o.start(t); o.stop(t + dur + 0.05);
    hold(o, 1);
  }
  function arpNote(t, f, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(lp); lp.connect(g); g.connect(musicOut());
    o.start(t); o.stop(t + dur + 0.05);
    hold(o, 1);
  }
  function leadNote(t, f, dur, vol) {
    // 双振荡微失谐 → 声音更宽，避免单薄方波的廉价感
    for (let i = 0; i < 2; i++) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.detune.value = i === 0 ? -7 : 7;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(musicOut());
      o.start(t); o.stop(t + dur + 0.05);
      hold(o, 1);
    }
  }
  function alarmNote(t, f, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.06, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(musicOut());
    o.start(t); o.stop(t + dur + 0.05);
    hold(o, 1);
  }
  function hat(t, vol) {
    if (!noiseBuf) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    s.playbackRate.value = 1.6;
    f.type = 'highpass'; f.frequency.value = 7200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.045);
    s.connect(f); f.connect(g); g.connect(musicOut());
    s.start(t); s.stop(t + 0.06);
    hold(s, 1);
  }
  function snare(t, vol) {
    if (!noiseBuf) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
    s.connect(f); f.connect(g); g.connect(musicOut());
    s.start(t); s.stop(t + 0.16);
    hold(s, 1);
  }
  function riser(t) {
    if (!noiseBuf) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = pinkBuf || noiseBuf;
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + STEP * 8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.038, t + STEP * 6);
    g.gain.exponentialRampToValueAtTime(0.0008, t + STEP * 8);
    s.connect(f); f.connect(g); g.connect(musicOut());
    s.start(t); s.stop(t + STEP * 8 + 0.05);
    hold(s, 1);
  }

  function scheduler() {
    if (!ac || !musicOn) return;
    try {
      while (nextTime < ac.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        nextTime += stepDur();
        step++;
      }
    } catch (e) { /* 排程异常不应中断游戏帧 */ }
  }

  function musicFade(target, sec) {
    if (!ac || !musicVca) return;
    musicVca.gain.setTargetAtTime(target, ac.currentTime, sec || 0.8);
  }
  function duckMusic(amount, sec) {
    if (!ac || !musicDuck) return;
    const t = ac.currentTime;
    musicDuck.gain.cancelScheduledValues(t);
    musicDuck.gain.setTargetAtTime(amount, t, 0.03);
    musicDuck.gain.setTargetAtTime(1, t + (sec || 0.6), 0.35);
  }

  function startMusic() {
    init();
    resume();
    if (!ac || musicOn) return;
    musicOn = true;
    step = 0;
    nextTime = ac.currentTime + 0.08;
    musicVca.gain.cancelScheduledValues(ac.currentTime);
    musicVca.gain.setTargetAtTime(musicLevel(), ac.currentTime, 1.4);
    schedTimer = setInterval(scheduler, TICK_MS);
    scheduler();
  }

  function stopMusic() {
    musicOn = false;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (ac && musicVca) musicVca.gain.setTargetAtTime(0, ac.currentTime, 0.4);
  }

  function musicLevel() {
    /* 音乐是"床"，不是主角：始终压在音效之下，枪声/命中/敌弹才留得住可读性。
       旧值让音乐峰值(-11dB)高过主炮(-15dB)、比敌弹(-28dB)高 17dB，等于把战斗反馈全盖住。 */
    if (scene === 'menu') return 0.09;
    if (scene === 'over') return 0.045;
    if (scene === 'paused') return 0.032;
    return 0.105 + intensity * 0.09;
  }

  /** 战斗强度 0..1；做脏检查，避免每帧排程自动化 */
  function setIntensity(v) {
    if (!ac) return;
    v = clamp(v || 0, 0, 1);
    if (Math.abs(v - intensity) < 0.02) return;
    intensity = v;
    if (musicOn) musicVca.gain.setTargetAtTime(musicLevel(), ac.currentTime, 1.2);
  }

  /** 场景切换：menu / playing / paused / over */
  function setScene(s) {
    if (!ac) { scene = s; return; }
    if (s === scene) return;
    scene = s;
    if (musicOn) musicVca.gain.setTargetAtTime(musicLevel(), ac.currentTime, scene === 'paused' ? 0.15 : 0.5);
    if (musicFilter) {
      const target = scene === 'paused' ? 700 : 16000;
      musicFilter.frequency.setTargetAtTime(target, ac.currentTime, 0.12);
    }
  }

  /** 时间畸变（技能）：音乐变慢变闷 */
  function setSlow(on) {
    const w = on ? 1 : 0;
    if (w === warp) return;          // 脏检查：允许游戏每帧调用
    warp = w;
    if (!ac || !musicFilter) return;
    musicFilter.frequency.setTargetAtTime(on ? 900 : (scene === 'paused' ? 700 : 16000), ac.currentTime, 0.08);
  }

  /* =======================================================
     7. 对外 API
     ======================================================= */
  return {
    /** play(name) 或 play(name, x, y) —— 传坐标即自动空间化 */
    play(name, x, y, opt) { play(name, x, y, opt); },
    playAt(name, x, y, opt) { play(name, x, y, opt); },
    resume,
    init,
    startMusic,
    stopMusic,
    setIntensity,
    setScene,
    setSlow,
    get muted() { return !enabled; },
    get supported() { return supported; },
    toggleMute() {
      enabled = !enabled;
      if (master) master.gain.setTargetAtTime(enabled ? 0.55 : 0, ac ? ac.currentTime : 0, 0.05);
      return enabled;
    },
    debug() {
      return {
        voices: voiceCount, peak: STAT.peak, dropped: STAT.dropped,
        throttled: STAT.throttled, fires: STAT.fires,
        intensity, scene, max: VOICE_MAX, musicOn,
      };
    },
  };
})();
