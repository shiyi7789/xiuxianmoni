/* =========================================================
   utils.js — 数学 / 绘制 / 特效基础库
   ========================================================= */
'use strict';

const TAU = Math.PI * 2;
const rand  = (a = 1, b = 0) => Math.random() * (a - b) + b;
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const pick  = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (p) => Math.random() < p;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 角度差归一到 [-PI, PI] */
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/* ---------- 颜色 ---------- */
function hexRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- 预渲染光晕精灵（性能关键：避免每帧建渐变） ---------- */
const _glowCache = new Map();
function glowSprite(color, soft = 0.34) {
  const key = color + '|' + soft;
  if (_glowCache.has(key)) return _glowCache.get(key);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(soft, rgba(color, 0.55));
  grd.addColorStop(0.72, rgba(color, 0.14));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  _glowCache.set(key, c);
  return c;
}
/** 以 (x,y) 为中心绘制一个直径 d 的彩色光斑 */
function drawGlow(ctx, x, y, d, color, alpha = 1, soft = 0.34) {
  const sp = glowSprite(color, soft);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sp, x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = 1;
}

/* ---------- 简易圆角矩形 ---------- */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 屏幕外回收判定 ---------- */
function offscreen(o, pad = 80) {
  return o.y < -pad || o.y > 960 + pad || o.x < -pad || o.x > 540 + pad;
}

/* ---------- 数组安全删除（倒序） ---------- */
function sweep(arr, fn) {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i], i)) arr.splice(i, 1);
}

/* ---------- 原地紧凑删除（零分配 · O(n) · 保持顺序） ----------
   drop(item) 返回 true 表示移除。
   用于替代每帧热路径上的 `X = X.filter(...)`：filter 的成本不在遍历，而在「每帧新建一个数组」。
   与 filter 语义一致：drop 对每个元素恰好求值一次（含带副作用的谓词）。 */
function compact(arr, drop) {
  let k = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!drop(v)) { if (k !== i) arr[k] = v; k++; }
  }
  arr.length = k;
  return arr;
}

/* ---------- 加权随机 ---------- */
function weightedPick(items, weightFn) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weightFn(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/* ---------- 数字格式化 ---------- */
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
