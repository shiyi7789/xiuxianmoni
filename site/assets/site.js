/* ============================================================
 * 游戏站 · 共享脚本（大厅 / 玩法详情 / 网站声明 三页共用）
 * ------------------------------------------------------------
 * 设计纪律：
 *   1) 所有增强都是「可选装饰」——任何一块抛错都不能让页面失去可用性，
 *      因此每个模块都先找元素、找不到就直接 return。
 *   2) 不引入任何第三方库，不发任何跨域请求。
 *   3) 一律尊重 prefers-reduced-motion：动效只做减法，不做加法。
 * 模块：主题 / 星空 / 卡片光斑 / 滚动入场 / 最近游玩 / 页内试玩 / 版本轮询
 * ============================================================ */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var TKEY = 'site_theme_v1';   /* 与 <head> 内联脚本保持一致 */
  var GKEY = 'site_last_game_v1';

  /* ---------- 1. 主题切换（初始值已由 head 内联脚本在首帧前设好） ---------- */
  (function theme() {
    var btn = doc.getElementById('themeBtn');
    if (!btn) return;
    function label() {
      var dark = root.getAttribute('data-theme') === 'dark';
      btn.textContent = dark ? '☀' : '☾';
      btn.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
      btn.title = btn.getAttribute('aria-label');
    }
    label();
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(TKEY, next); } catch (e) {}
      label();
      /* 星空颜色取自 CSS 变量，切主题后需要重新取样 */
      doc.dispatchEvent(new CustomEvent('site:theme', { detail: next }));
    });
    try {
      if (window.matchMedia) {
        var mq = matchMedia('(prefers-color-scheme: dark)');
        var on = function () {
          var saved = null;
          try { saved = localStorage.getItem(TKEY); } catch (e) {}
          if (saved === 'light' || saved === 'dark') return;   /* 用户手动选过就不再跟随系统 */
          root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
          label();
          doc.dispatchEvent(new CustomEvent('site:theme', { detail: root.getAttribute('data-theme') }));
        };
        if (mq.addEventListener) mq.addEventListener('change', on);
        else if (mq.addListener) mq.addListener(on);
      }
    } catch (e) {}
  })();

  /* ---------- 2. 星空 / 浮尘（纯 CSS 做不出的那一点点“活气”） ---------- */
  (function sky() {
    var cv = doc.getElementById('sky');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dots = [], line = null, t = 0, raf = 0, alive = true;

    function color() {
      var c = '';
      try { c = getComputedStyle(root).getPropertyValue('--star').trim(); } catch (e) {}
      return c || 'rgba(200,200,200,.5)';
    }
    function seed() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(28, Math.min(86, Math.round(W * H / 17000)));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 1.5 + .35,
          a: Math.random() * .5 + .18,
          vx: (Math.random() - .5) * .09,
          vy: Math.random() * .07 + .015,
          ph: Math.random() * Math.PI * 2
        });
      }
      line = { x: -80, y: H * .18, v: 1.35, on: false, wait: 260 };
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var c = color();
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx; d.y += d.vy; d.ph += .016;
        if (d.y > H + 3) { d.y = -3; d.x = Math.random() * W; }
        if (d.x < -3) d.x = W + 3; else if (d.x > W + 3) d.x = -3;
        ctx.globalAlpha = d.a * (.62 + .38 * Math.sin(d.ph));
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
      }
      /* 偶尔划过的流星：也用来暗示“这是星海，不是静态背景” */
      if (line.on) {
        ctx.globalAlpha = .5;
        ctx.strokeStyle = c; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(line.x, line.y); ctx.lineTo(line.x - 74, line.y - 40); ctx.stroke();
        line.x += line.v; line.y += .72;
        if (line.x - 74 > W + 80) line.on = false;
      } else if (--line.wait < 0) {
        line.on = true; line.wait = 300 + Math.random() * 420;
        line.x = Math.random() * W * .4; line.y = H * (.08 + Math.random() * .35);
      }
      ctx.globalAlpha = 1;
    }
    function frame() { t++; if (!reduce || t === 1) draw(); raf = requestAnimationFrame(frame); }
    function start() { if (!raf) { raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    seed();
    if (reduce) { draw(); } else { start(); }
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt); rt = setTimeout(function () { seed(); if (reduce) draw(); }, 220);
    });
    doc.addEventListener('site:theme', function () { if (reduce) draw(); });
    doc.addEventListener('visibilitychange', function () {
      alive = !doc.hidden;
      if (reduce) { if (alive) draw(); return; }
      alive ? start() : stop();
    });
  })();

  /* ---------- 3. 卡片光斑：跟随指针（键盘用户不受影响） ---------- */
  (function spotlight() {
    if (!window.matchMedia || matchMedia('(hover: none)').matches) return;
    var cards = [].slice.call(doc.querySelectorAll('.gcard'));
    cards.forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var b = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - b.left) + 'px');
        c.style.setProperty('--my', (e.clientY - b.top) + 'px');
      });
    });
  })();

  /* ---------- 4. 滚动入场 ---------- */
  (function reveal() {
    var items = [].slice.call(doc.querySelectorAll('.rv'));
    if (!items.length) return;
    /* 关掉动效 / 浏览器不支持观察器 → 直接全部显示，不做任何隐藏 */
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (i) { i.classList.add('in'); });
      return;
    }
    /* 先开总闸再观察：rv-on 一旦挂上，未入场的元素才收起。
       进到这里说明观察器一定在工作，不存在「收起了却没人放出来」的状态。 */
    root.classList.add('rv-on');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = items.indexOf(e.target);
        e.target.style.transitionDelay = Math.min(i % 6, 5) * 55 + 'ms';
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    items.forEach(function (i) { io.observe(i); });
  })();

  /* ---------- 5. 最近游玩：只记「哪个游戏」，不记任何身份信息 ---------- */
  (function recent() {
    var links = [].slice.call(doc.querySelectorAll('[data-game]'));
    if (!links.length) return;
    function mark(id) {
      links.forEach(function (a) {
        if (a.getAttribute('data-game') !== id) return;
        var card = a.closest('.gcard');
        var badge = card && card.querySelector('.badge[data-last]');
        if (badge) badge.hidden = false;
      });
    }
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-game');
        try { localStorage.setItem(GKEY, id); } catch (e) {}
        mark(id);
      });
    });
    var last = null;
    try { last = localStorage.getItem(GKEY); } catch (e) {}
    if (last) mark(last);
  })();

  /* ---------- 6. 页内试玩（仅大厅有）：点击才加载 iframe ---------- */
  (function play() {
    var stage = doc.querySelector('.stage');
    if (!stage) return;
    var poster = doc.getElementById('poster');
    var urlTag = doc.getElementById('tryUrl');
    var full = doc.getElementById('tryFull');
    var btns = [].slice.call(doc.querySelectorAll('[data-try]'));
    var MAP = {
      xiuxian: { src: 'xiuxian.html', path: 'xiuxian.html', title: '修仙模拟器 · 文字版（页内试玩）' },
      rogue: { src: 'rogue/', path: 'rogue/', title: '星际裂隙 · ROGUE THUNDER（页内试玩）' }
    };
    var cur = (btns.length && btns[0].getAttribute('data-try')) || 'xiuxian';
    if (!MAP[cur]) return;

    function boot(force) {
      var f = stage.querySelector('iframe');
      if (f) { if (force) f.src = pick().src; return; }
      f = doc.createElement('iframe');
      f.src = pick().src;
      f.title = pick().title;
      f.loading = 'lazy';
      f.setAttribute('allow', 'fullscreen');
      f.setAttribute('referrerpolicy', 'same-origin');
      stage.appendChild(f);
      if (poster) poster.hidden = true;
    }
    function pick() { return MAP[cur] || MAP.xiuxian; }
    function sync() {
      if (urlTag) urlTag.textContent = pick().path;
      if (full) full.setAttribute('href', pick().src);
      btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-try') === cur)); });
      var f = stage.querySelector('iframe');
      if (f) { f.src = pick().src; f.title = pick().title; }
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        cur = b.getAttribute('data-try');
        if (!MAP[cur]) cur = 'xiuxian';
        sync();
      });
    });
    if (poster) poster.addEventListener('click', function () { boot(false); });
    var jump = doc.querySelectorAll('a[href="#try"]');
    [].slice.call(jump).forEach(function (a) {
      a.addEventListener('click', function () { setTimeout(function () { boot(true); }, 300); });
    });
    sync();
  })();

  /* ---------- 7. 版本轮询：发版后已在页面的访客能收到提示 ---------- */
  (function version() {
    var verText = doc.getElementById('verText');
    var bar = doc.getElementById('updBar');
    var btn = doc.getElementById('updBtn');
    if (!verText && !bar) return;
    var src = (doc.body && doc.body.getAttribute('data-ver')) || 'version.json';
    var cur = null, pending = null, timer = 0;
    function check() {
      fetch(src + '?_=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) {
          if (!j || !j.v) return;
          if (cur === null) { cur = j.v; if (verText) verText.textContent = j.v; return; }
          if (j.v !== cur) { pending = j.v; if (bar) { var vv = doc.getElementById('updVer'); if (vv) vv.textContent = j.v; bar.hidden = false; } }
        })
        .catch(function () {});
    }
    if (btn) btn.addEventListener('click', function () { if (pending) location.reload(); });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) check(); });
    window.addEventListener('online', check);
    check();
    timer = setInterval(check, 60000);
    window.addEventListener('pagehide', function () { if (timer) clearInterval(timer); });
  })();

  /* ---------- 7. 继续上次（v3.3 大厅重做）：只读本机存档，不发任何请求 ---------- */
  (function resume() {
    var box = doc.getElementById('resume');
    if (!box) return;
    var nameEl = doc.getElementById('resumeName');
    var noteEl = doc.getElementById('resumeNote');
    var goEl = doc.getElementById('resumeGo');
    function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
    var xi = read('xiuxian_save_v2');
    var rg = read('rt_save_v2');
    var last = null;
    try { last = localStorage.getItem(GKEY); } catch (e) {}
    var pick = null;
    /* 优先"上次玩的那款"，其次修仙（长线），再其次星际 */
    var order = last === 'rogue' ? ['rogue', 'xiuxian'] : ['xiuxian', 'rogue'];
    for (var i = 0; i < order.length && !pick; i++) {
      var k = order[i];
      if (k === 'xiuxian' && xi) pick = { id: 'xiuxian', href: 'xiuxian.html', name: '修仙模拟器', note: '本机有存档' };
      if (k === 'rogue' && rg) {
        var best = (rg.best && rg.best.wave) | 0;
        var rec = (rg.recent || []).slice().sort(function (a, b) { return a - b; });
        var med = rec.length ? rec[Math.floor((rec.length - 1) / 2)] : 0;
        pick = { id: 'rogue', href: 'rogue/', name: '星际裂隙',
          note: '最高 W' + best + (med ? ' · 近 ' + rec.length + ' 局中位 W' + med : '') };
      }
    }
    if (!pick) return;                     // 没存档就整块不出现，绝不占位
    box.hidden = false;
    box.classList.add('on');
    if (nameEl) nameEl.textContent = pick.name;
    if (noteEl) noteEl.textContent = pick.note;
    if (goEl) { goEl.href = pick.href; goEl.setAttribute('data-game', pick.id); }
  })();

  /* ---------- 8. 泊位封面：轻量 canvas 预览（不加载游戏本体，不联网） ---------- */
  (function berthCover() {
    var list = [].slice.call(doc.querySelectorAll('canvas[data-cov]'));
    if (!list.length) return;
    var raf = 0, t = 0;
    function drawOne(cv) {
      var g = cv.getContext && cv.getContext('2d');
      if (!g) return;
      var kind = cv.getAttribute('data-cov'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      var bg = g.createLinearGradient(0, 0, W * 0.4, H);
      if (kind === 'rogue') { bg.addColorStop(0, '#0a1030'); bg.addColorStop(1, '#1a0f2c'); }
      else { bg.addColorStop(0, '#12100c'); bg.addColorStop(1, '#241a14'); }
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (var s = 0; s < 60; s++) {
        var sx = (s * 97 + t * (kind === 'rogue' ? 12 : 3)) % W, sy = (s * 53) % H;
        g.globalAlpha = 0.15 + ((s * 37) % 50) / 160;
        g.fillStyle = kind === 'rogue' ? '#dff2ff' : '#ffe6b8';
        g.fillRect(sx, sy, 1.6, 1.6);
      }
      g.globalAlpha = 1;
      if (kind === 'rogue') {
        g.lineCap = 'round';
        for (var i = 0; i < 7; i++) {
          var x = 80 + i * 72 + Math.sin(t + i) * 18;
          g.strokeStyle = i % 2 ? 'rgba(255,122,138,.75)' : 'rgba(126,249,255,.8)';
          g.lineWidth = i % 2 ? 2 : 2.6;
          g.beginPath(); g.moveTo(x, 40 + i * 12); g.lineTo(x, 150 + i * 8); g.stroke();
        }
        g.fillStyle = 'rgba(126,249,255,.45)';
        g.beginPath(); g.arc(W / 2, H - 82, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#d9f7ff';
        g.beginPath(); g.moveTo(W / 2, H - 96); g.lineTo(W / 2 + 13, H - 66);
        g.lineTo(W / 2, H - 74); g.lineTo(W / 2 - 13, H - 66); g.closePath(); g.fill();
      } else {
        g.fillStyle = 'rgba(224,101,79,.32)';
        g.beginPath(); g.arc(W * 0.72, H * 0.34, 52, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(20,14,10,.55)';
        g.beginPath(); g.moveTo(0, H * 0.78);
        for (var m = 0; m <= 8; m++) g.lineTo(W * m / 8, H * (0.56 + 0.16 * Math.abs(Math.sin(m * 1.7 + 1))));
        g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,232,190,.28)'; g.lineWidth = 2;
        g.beginPath();
        for (var c = 0; c < W; c += 6) g.lineTo(c, H * 0.3 + Math.sin(c * 0.02 + t) * 5);
        g.stroke();
      }
    }
    function drawAll() { for (var i = 0; i < list.length; i++) drawOne(list[i]); }
    function frame() { t += 0.016; drawAll(); raf = requestAnimationFrame(frame); }
    drawAll();
    if (reduce) return;                    // 尊重 prefers-reduced-motion：只画一帧静态图
    try {
      var io = new IntersectionObserver(function (es) {
        var on = es.some(function (e) { return e.isIntersecting; });
        if (on && !raf) frame();
        else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
      list.forEach(function (c) { io.observe(c); });
    } catch (e) { frame(); }
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      else if (!raf && !reduce) frame();
    });
  })();
})();
