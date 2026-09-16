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

const read = p => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');   /* 容忍 Windows 编辑器写入的 BOM */
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
/* 剥掉 import：支持跨行写法，并容忍 CRLF（Windows 编辑器/git autocrlf 会带来 \r）
   import { a, b } from './x.js';     ← 常见
   import {\n a, b\n} from './x.js';  ← 多行也要剥（曾经漏过，构建后残留 import 直接语法错误） */
const stripImports = body => body.replace(/^[ \t]*import\b[\s\S]*?\bfrom\s+['"][^'"]*['"];?[ \t]*\r?$/gm, '');

const stripExports = body => body
  .replace(/^export\s+(?=(?:async\s+)?function\s|const\s|let\s|var\s)/gm, '');

const SEP = m => `/* ── ${m} ─${'─'.repeat(Math.max(4, 60 - m.length))} */`;

const chunks = [];
const missing = [];
for (const mod of manifest.order) {
  const file = path.join(SRC, mod);
  if (!fs.existsSync(file)) { missing.push(mod); continue; }
  const raw = read(file);
  /* 命名空间 / 默认导入在本构建里必然失效：整行会被剥掉，而用法（CR.xxx / X.xxx）留在代码里，
     于是构建能过、运行到那条路径才炸。这里直接在构建期拦下。 */
  const bad = raw.match(/^[ \t]*import\s+(\*\s+as\s+(\w+)|(\w+)\s*,?\s*\{?)/m);
  if (bad) {
    const hint = /\*/.test(bad[1]) ? '命名空间导入（import * as）' : '默认导入（import X from）';
    throw new Error(mod + ' 使用了' + hint + '，单文件构建无法支持：\n'
      + '   ' + bad[0].trim() + '\n'
      + '   → 改为具名导入：import { a, b } from \'...\'');
  }
  let body = stripExports(stripImports(raw))
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  chunks.push({ mod, body });
}
if (missing.length) throw new Error('清单里的模块不存在：' + missing.join(', '));

/* ---------- 2.5 硬守卫：顶层标识符不得重名 ----------
   构建后所有模块同处一个作用域，顶层 `const X` 重名会直接 SyntaxError，
   而 `function X` 重名只会**静默覆盖**（表现成「点了没反应 / 扣钱不生效」），
   两者都必须拦下。曾经 ui/panels/codex.js 的 TIER_NAME 撞上 data/monsters.js。 */
{
  const owner = new Map();   /* 顶层名 → [模块] */
  const declRe = /^(?:export\s+)?(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)|(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm;
  for (const { mod, body } of chunks) {
    declRe.lastIndex = 0;
    let m;
    while ((m = declRe.exec(body))) {
      const name = m[1] || m[2] || m[3];
      if (!owner.has(name)) owner.set(name, []);
      owner.get(name).push(mod);
    }
  }
  const dup = [...owner.entries()].filter(([, mods]) => mods.length > 1);
  if (dup.length) {
    throw new Error('顶层标识符重名（构建后同作用域会冲突）：\n'
      + dup.map(([n, mods]) => '  ' + n + '  ←  ' + mods.join('  &  ')).join('\n')
      + '\n  → 改名（UI 侧建议加前缀，如 gfUi* / crUi* / cvUi* / cdUi*），或改为局部 const');
  }
}

/* ---------- 3. 拼装 ---------- */
let js = openPart.replace(/\s+$/, '');
for (const { mod, body } of chunks) js += '\n\n' + SEP(mod) + '\n\n' + body;
js += '\n';

/* ---------- 3.5 硬守卫：成品里不允许再有 import / export ----------
   单文件是经典 <script>，残留 ESM 语法会直接 SyntaxError（曾经因为跨行 import 漏剥而炸） */
const leftover = js.split('\n')
  .map((l, i) => ({ l, i }))
  .filter(x => /^\s*(import|export)\s/.test(x.l) && !/^\s*(\/\/|\*)/.test(x.l));
if (leftover.length) {
  throw new Error('成品仍含 ESM 语法，模块未剥干净：\n'
    + leftover.slice(0, 6).map(x => '  第 ' + (x.i + 1) + ' 行：' + x.l.trim().slice(0, 90)).join('\n'));
}

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
