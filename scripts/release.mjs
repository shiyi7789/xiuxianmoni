/*
 * 发版脚本 —— 一键把两款游戏同步进站点，并生成新的版本号
 *
 * 用法：
 *   node scripts/release.mjs "本次更新说明"
 *
 * 它做六件事：
 *   0. 先跑一次构建：src/**（多模块源码） → xiuxian.html（单文件成品）
 *      ★ 日常改的是 src/ 下的模块，不再直接手改 xiuxian.html
 *   1. 把工作区根目录的 xiuxian.html 同步到 site/xiuxian.html
 *   2. 把 games/thunder-rogue/ 同步到 site/rogue/（含删除站点里的陈旧文件）
 *   3. 计算两款游戏的字节数与 sha256，写入 site/version.json（供前端轮询比对）
 *   4. 把版本号与「游戏总体积」回填进 site/index.html 的占位
 *   5. 刷新 sitemap.xml 的 lastmod
 *
 * 之后只要 git add -A && git commit && git push，平台即会自动重新部署。
 *
 * 站点结构（site/）：
 *   index.html          游戏大厅（菜单）
 *   xiuxian.html        修仙模拟器 · 游戏本体（构建产物）
 *   rogue/              星际裂隙 · 游戏本体（多文件静态页）
 *   xiuxian-info.html   修仙模拟器 · 玩法详情（手写）
 *   rogue-info.html     星际裂隙 · 玩法详情（手写）
 *   notice.html         网站声明（手写）
 *   assets/             三页共用样式与脚本（手写）
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'xiuxian.html');
const SITE = join(root, 'site');
const GAME = join(SITE, 'xiuxian.html');
const ROGUE_SRC = join(root, 'games', 'thunder-rogue');
const ROGUE_DST = join(SITE, 'rogue');
/* 游戏源码里只发布运行需要的部分：测试脚本、截图、设计文档留在仓库，不上线 */
const ROGUE_SKIP = new Set(['test', 'shots', '关卡设计文档.md']);
const note = process.argv[2] || '例行更新';

const log = [];
const say = s => { log.push(s); };
process.on('exit', () => {
  const text = log.join('\n');
  console.log(text);
  try { writeFileSync(join(root, '_release_out.txt'), text, 'utf8'); } catch (e) {}
});

/* ---------- 工具 ---------- */
const sha256 = b => createHash('sha256').update(b).digest('hex');
const short = s => String(s).slice(0, 12);

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(base, p).split(sep).join('/');
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(rel);
  }
  return out;
}

/* 目录镜像：全量覆盖 + 删除目标端多余文件 + 清理空目录（保证站点与源码严格一致） */
function mirror(src, dst, skip) {
  const files = walk(src).filter(f => !skip.has(f.split('/')[0]));
  const added = [], removed = [];
  for (const rel of files) {
    const from = join(src, rel), to = join(dst, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    added.push(rel);
  }
  if (existsSync(dst)) {
    for (const rel of walk(dst)) {
      if (!files.includes(rel)) { unlinkSync(join(dst, rel)); removed.push(rel); }
    }
    /* 自下而上删空目录，避免留下空壳 */
    const dirs = [];
    (function collect(d) {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) { collect(p); dirs.push(p); }
      }
    })(dst);
    for (const d of dirs.reverse()) {
      try { if (readdirSync(d).length === 0) rmSync(d, { recursive: false }); } catch (e) {}
    }
  }
  return { files, added, removed };
}

/* ---------- 0) 构建：模块源码 → 单文件成品 ----------
 * ⚠ 本机沙箱禁止 Node 派生任何子进程：spawnSync 一律返回 EBUSY（连 cmd.exe 都起不来），
 *   且 stdout/stderr 全为空 —— 看上去像「构建失败但不报错」。
 *   所以构建改成同进程动态 import：build.mjs 是纯顶层脚本，import 即执行，失败时 throw。
 *   代价是不能靠退出码判断，必须 try/catch；构建输出顺手接住，别让它污染发版日志。
 */
let buildOut = '';
const origLog = console.log;
console.log = (...a) => { buildOut += a.join(' ') + '\n'; };
try {
  await import(pathToFileURL(join(root, 'scripts', 'build.mjs')).href);
} catch (err) {
  console.log = origLog;
  say('✗ 构建失败，已中止发版');
  say(String((err && err.stack) || err));
  console.log(log.join('\n'));
  writeFileSync(join(root, '_release_out.txt'), log.join('\n'), 'utf8');
  process.exit(1);
}
console.log = origLog;
say('0) 已构建 ' + (buildOut.trim().split('\n')[0] || 'xiuxian.html'));

if (!existsSync(SRC)) { say('✗ 找不到游戏源文件：' + SRC); process.exit(1); }

/* ---------- 1) 同步修仙模拟器 ---------- */
copyFileSync(SRC, GAME);
const xiuxianBuf = readFileSync(GAME);
const xiuxianSize = xiuxianBuf.length;
const xiuxianSha = sha256(xiuxianBuf);
say('1) 已同步 xiuxian.html  ' + xiuxianSize + ' B  sha256:' + short(xiuxianSha));

/* ---------- 2) 同步星际裂隙（多文件） ---------- */
if (!existsSync(ROGUE_SRC)) { say('✗ 找不到肉鸽游戏源码目录：' + ROGUE_SRC); process.exit(1); }
const rg = mirror(ROGUE_SRC, ROGUE_DST, ROGUE_SKIP);
const rogueBufs = rg.files.map(rel => [rel, readFileSync(join(ROGUE_DST, rel))]);
const rogueSize = rogueBufs.reduce((n, p) => n + p[1].length, 0);
/* 目录指纹：按路径排序后把「路径 + 单文件 sha」再哈希一次，保证可复现、与文件顺序无关 */
const rogueSha = sha256(Buffer.from(rogueBufs
  .map(p => p[0] + ':' + sha256(p[1]))
  .sort()
  .join('\n'), 'utf8'));
say('2) 已同步 rogue/  ' + rg.files.length + ' 个文件 / ' + rogueSize + ' B  指纹 sha256:' + short(rogueSha)
  + (rg.removed.length ? '（清理陈旧文件 ' + rg.removed.length + ' 个）' : ''));

/* ---------- 3) 生成版本号并写 version.json ---------- */
const d = new Date();
const p = n => String(n).padStart(2, '0');
const v = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
const build = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
const totalBytes = xiuxianSize + rogueSize;

const ver = {
  v,
  build,
  site: 'index.html',
  /* 向后兼容字段：旧版首页的轮询与旧自检脚本仍读 game / gameBytes / gameSha256 */
  game: 'xiuxian.html',
  gameBytes: xiuxianSize,
  gameSha256: xiuxianSha,
  totalGameBytes: totalBytes,
  games: [
    { id: 'xiuxian', name: '修仙模拟器 · 文字版', path: 'xiuxian.html', bytes: xiuxianSize, sha256: xiuxianSha, files: 1 },
    { id: 'rogue', name: '星际裂隙 · ROGUE THUNDER', path: 'rogue/', bytes: rogueSize, sha256: rogueSha, files: rg.files.length }
  ],
  note,
  time: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('Z', '+08:00')
};
writeFileSync(join(SITE, 'version.json'), JSON.stringify(ver, null, 2) + '\n', 'utf8');
say('3) 已写入 version.json  v=' + v + '  build=' + build + '  游戏总体积=' + totalBytes + ' B');

/* ---------- 4) 回填首页占位：页脚版本号 + 体积数字 ---------- */
const idxPath = join(SITE, 'index.html');
if (existsSync(idxPath)) {
  let idx = readFileSync(idxPath, 'utf8');
  const before = idx;
  const kbX = Math.round(xiuxianSize / 1024);
  const kbR = Math.round(rogueSize / 1024);
  idx = idx.replace(/(<span id="verText"[^>]*>)[^<]*(<\/span>)/, '$1' + v + '$2');
  idx = idx.replace(/(<b id="statBytes">)[^<]*(<\/b>)/, '$1' + (kbX + kbR) + ' KB$2');
  idx = idx.replace(/(<span class="meta" id="sizeXiuxian">)[^<]*(<\/span>)/, '$1' + kbX + ' KB · 单文件$2');
  idx = idx.replace(/(<span class="meta" id="sizeRogue">)[^<]*(<\/span>)/, '$1' + kbR + ' KB · 竖屏 9:16$2');
  if (idx !== before) {
    writeFileSync(idxPath, idx, 'utf8');
    say('4) 已回填 index.html：版本号 → ' + v + '　总体积 → ' + (kbX + kbR) + ' KB　卡片体积 → ' + kbX + ' / ' + kbR + ' KB');
  } else {
    say('4) ⚠ index.html 未找到 verText / statBytes / size* 占位，跳过回填');
  }
} else {
  say('4) ⚠ 找不到 site/index.html，跳过回填');
}

/* ---------- 5) 刷新 sitemap 的 lastmod ---------- */
const smPath = join(SITE, 'sitemap.xml');
if (existsSync(smPath)) {
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  let sm = readFileSync(smPath, 'utf8');
  const n = (sm.match(/<lastmod>/g) || []).length;
  sm = sm.replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod>' + day + '</lastmod>');
  writeFileSync(smPath, sm, 'utf8');
  say('5) 已刷新 sitemap.xml 的 ' + n + ' 处 lastmod → ' + day);
}

/* ---------- 汇总 ---------- */
const pages = walk(SITE).filter(f => f.endsWith('.html'));
say('');
say('✓ 发版完成。站点现有页面 ' + pages.length + ' 个：' + pages.sort().join('、'));
say('   接下来：git add -A && git commit -F <UTF-8 消息文件> && git push');
say('   平台（Vercel）会自动重新部署，约 10~60 秒上线；已打开的页面会在下一次轮询（≤60 秒）收到提示。');
