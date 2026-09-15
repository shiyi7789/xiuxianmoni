#!/usr/bin/env node
/* ============================================================
 * 构建：src/**（多模块源码） → xiuxian.html（单文件成品）
 * ------------------------------------------------------------
 * 为什么不用打包器：本游戏的分发形态是「一个 HTML 文件、双击即用、
 * 零依赖零构建」。所以构建只做一件事——把 src/ 的模块按清单顺序
 * 拼回一个 <script>，并重新内联 CSS 与模板。
 *
 * 用法：
 *   node scripts/build.mjs                     构建 → xiuxian.html
 *   node scripts/build.mjs --check <参考文件>   额外做「一字未改」校验
 *
 * 校验原理：把成品与参考文件的脚本各自拆成「非空行多重集」比较。
 * 行序被打乱（模块顺序）不影响，但任何一行被删改/重复都会被抓出。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'xiuxian.html');
const REPORT = path.join(ROOT, '_build_report.txt');

const read = p => fs.readFileSync(p, 'utf8');
const lines = [];

/* ---------- 1. 读清单与模板 ---------- */
const manifest = JSON.parse(read(path.join(SRC, 'manifest.json')));
const { head, css, mid, scriptOpen, tail } = manifest.template;

const headPart = read(path.join(SRC, head));
const cssPart = read(path.join(SRC, css));
const midPart = read(path.join(SRC, mid));
const openPart = read(path.join(SRC, scriptOpen));
const tailPart = read(path.join(SRC, tail));

/* ---------- 2. 模块 → 脚本片段 ---------- */
const stripImports = body => body
  .split('\n')
  .filter(l => !/^\s*import\s+.*\s+from\s+['"].*['"];?\s*$/.test(l))
  .join('\n');

const stripExports = body => body
  .replace(/^export\s+(?=(?:async\s+)?function\s|const\s|let\s|var\s)/gm, '');

const SEP = m => `/* ── ${m} ─${'─'.repeat(Math.max(4, 60 - m.length))} */`;

const chunks = [];
const missing = [];
for (const mod of manifest.order) {
  const file = path.join(SRC, mod);
  if (!fs.existsSync(file)) { missing.push(mod); continue; }
  let body = stripExports(stripImports(read(file)))
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  chunks.push({ mod, body });
}
if (missing.length) throw new Error('清单里的模块不存在：' + missing.join(', '));

/* ---------- 3. 拼装 ---------- */
let js = openPart.replace(/\s+$/, '');
for (const { mod, body } of chunks) js += '\n\n' + SEP(mod) + '\n\n' + body;
js += '\n';

const output = headPart + cssPart + midPart + js + tailPart;
fs.writeFileSync(OUT, output, 'utf8');

lines.push('模块数: ' + chunks.length);
lines.push('成品: xiuxian.html  ' + Buffer.byteLength(output, 'utf8') + ' 字节');

/* ---------- 4. 可选：与参考文件做「一字未改」校验 ---------- */
const args = process.argv.slice(2);
const ci = args.indexOf('--check');
if (ci >= 0) {
  const refPath = args[ci + 1];
  if (!refPath) throw new Error('--check 需要参考文件路径');
  const SCRIPT_RE = /<script>([\s\S]*)<\/script>/;

  const grab = file => {
    const s = read(file);
    const m = s.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    if (!m) throw new Error('取不到脚本段: ' + file);
    return m[1];
  };

  /* 非空行多重集：忽略模块分隔注释与 import 行 */
  const bag = text => {
    const out = new Map();
    for (let l of text.split('\n')) {
      l = l.trim();
      if (!l) continue;
      if (/^\/\* ── \S+ ─+ \*\/$/.test(l)) continue;   // 构建器加的分隔行
      if (/^import\s+.*\s+from\s+['"].*['"];?$/.test(l)) continue;
      out.set(l, (out.get(l) || 0) + 1);
    }
    return out;
  };

  const a = bag(grab(refPath));
  const b = bag(grab(OUT));
  const onlyA = [], onlyB = [];
  for (const [k, v] of a) {
    const w = b.get(k) || 0;
    if (w !== v) onlyA.push(`×${v - w}  ${k.slice(0, 120)}`);
  }
  for (const [k, v] of b) {
    const w = a.get(k) || 0;
    if (w !== v) onlyB.push(`×${v - w}  ${k.slice(0, 120)}`);
  }
  lines.push('');
  lines.push('── 一字未改校验（对比 ' + path.basename(refPath) + '）──');
  lines.push('参考行数(去空/去重后条目): ' + a.size + '，成品: ' + b.size);
  lines.push('参考有而成品缺: ' + onlyA.length);
  for (const x of onlyA.slice(0, 40)) lines.push('   - ' + x);
  lines.push('成品有而参考无: ' + onlyB.length);
  for (const x of onlyB.slice(0, 40)) lines.push('   + ' + x);
  lines.push(onlyA.length === 0 && onlyB.length === 0 ? '结果: 一致 ✓' : '结果: 有差异 ✗');
}

fs.writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
