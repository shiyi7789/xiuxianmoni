/*
 * 发版脚本 —— 一键把游戏同步进站点，并生成新的版本号
 *
 * 用法：
 *   node scripts/release.mjs "本次更新说明"
 *
 * 它做三件事：
 *   1. 把工作区根目录的 xiuxian.html 同步到 site/xiuxian.html
 *   2. 计算 sha256 与字节数，写入 site/version.json（供前端轮询比对）
 *   3. 把版本号回填进 site/index.html 的页脚占位，并刷新 sitemap 的 lastmod
 *
 * 之后只要 git add -A && git commit && git push，平台即会自动重新部署。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(root, 'xiuxian.html');
const SITE = join(root, 'site');
const GAME = join(SITE, 'xiuxian.html');
const note = process.argv[2] || '例行更新';

const log = [];
const say = s => { log.push(s); };
process.on('exit', () => {
  const text = log.join('\n');
  console.log(text);
  try {
    writeFileSync(join(root, '_release_out.txt'), text, 'utf8');
  } catch (e) {}
});

if (!existsSync(SRC)) { say('✗ 找不到游戏源文件：' + SRC); process.exit(1); }

/* 1) 同步游戏本体 */
copyFileSync(SRC, GAME);
const buf  = readFileSync(GAME);
const size = buf.length;
const sha  = createHash('sha256').update(buf).digest('hex');
say('1) 已同步 xiuxian.html  ' + size + ' B  sha256:' + sha.slice(0, 12));

/* 2) 生成版本号并写 version.json */
const d = new Date();
const p = n => String(n).padStart(2, '0');
const v     = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
const build = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;

const ver = {
  v,
  build,
  game: 'xiuxian.html',
  gameBytes: size,
  gameSha256: sha,
  note,
  time: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('Z', '+08:00')
};
writeFileSync(join(SITE, 'version.json'), JSON.stringify(ver, null, 2) + '\n', 'utf8');
say('2) 已写入 version.json  v=' + v + '  build=' + build);

/* 3) 回填首页页脚版本号 */
const idxPath = join(SITE, 'index.html');
let idx = readFileSync(idxPath, 'utf8');
const before = idx;
idx = idx.replace(/(<span id="verText"[^>]*>)[^<]*(<\/span>)/, '$1' + v + '$2');
if (idx !== before) {
  writeFileSync(idxPath, idx, 'utf8');
  say('3) 已回填 index.html 页脚版本号 → ' + v);
} else {
  say('3) ⚠ index.html 未找到 verText 占位，跳过回填');
}

/* 4) 刷新 sitemap 的 lastmod */
const smPath = join(SITE, 'sitemap.xml');
if (existsSync(smPath)) {
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  let sm = readFileSync(smPath, 'utf8');
  sm = sm.replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod>' + day + '</lastmod>');
  writeFileSync(smPath, sm, 'utf8');
  say('4) 已刷新 sitemap.xml lastmod → ' + day);
}

say('');
say('✓ 发版完成。接下来：');
say('    git add -A && git commit -m "release ' + v + '：' + note + '" && git push');
say('    平台（Cloudflare Pages / Vercel / Netlify）会自动重新部署，约 10~30 秒上线。');
say('    已打开页面的访客会在下一次轮询（≤60 秒）收到「发现新版本」提示。');
