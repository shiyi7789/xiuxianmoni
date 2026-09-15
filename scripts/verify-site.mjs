/*
 * 站点质量检查 —— 本地起静态服务，真实抓取页面，逐条核对 SEO / 无障碍 / 性能清单
 *
 * 用法：node scripts/verify-site.mjs
 * 输出：控制台 + 工作区根目录 _site_check.txt
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(root, 'site');
const OUT = join(root, '_site_check.txt');

const L = [];
const out = s => L.push(s);
let pass = 0, fail = 0;
function ok(name, detail) { pass++; out('  OK   ' + name + (detail ? '  -> ' + detail : '')); }
function bad(name, why) { fail++; out('  FAIL ' + name + '  -> ' + why); }
function chk(name, cond, detail) { cond ? ok(name, detail) : bad(name, typeof detail === 'string' ? detail : '未通过'); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css',
  '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = normalize(join(SITE, p));
  if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) {
    const nf = join(SITE, '404.html');
    const body = existsSync(nf) ? readFileSync(nf) : Buffer.from('404');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }
  // 模拟 _headers 的缓存策略，验证时一并看响应头
  const h = { 'content-type': MIME[extname(file)] || 'application/octet-stream' };
  if (/version\.json$/.test(file)) h['cache-control'] = 'no-store, no-cache, must-revalidate';
  else if (/\.html$/.test(file)) h['cache-control'] = 'public, max-age=0, must-revalidate';
  res.writeHead(200, h);
  res.end(readFileSync(file));
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
out('本地静态服务：' + base);
out('');

/* ---------- 1. HTTP 层 ---------- */
out('=== 1. HTTP 与资源 ===');
const files = ['/', '/xiuxian.html', '/version.json', '/404.html', '/robots.txt', '/sitemap.xml'];
const bodies = {};
for (const f of files) {
  try {
    const r = await fetch(base + f);
    bodies[f] = { status: r.status, type: r.headers.get('content-type'), cc: r.headers.get('cache-control'), text: await r.text() };
    chk('GET ' + f, r.status === 200, 'HTTP ' + r.status + ' · ' + (r.headers.get('content-type') || ''));
  } catch (e) { bad('GET ' + f, e.message); }
}
chk('未知路径返回 404', (await fetch(base + '/nope-xyz')).status === 404, '404.html 已生效');
chk('version.json 禁止缓存', /no-store/.test(bodies['/version.json'].cc || ''), bodies['/version.json'].cc || '(无)');
chk('HTML 回源校验而非长缓存', /max-age=0/.test(bodies['/'].cc || ''), bodies['/'].cc || '(无)');

/* ---------- 2. 版本与实时更新链路 ---------- */
out('');
out('=== 2. 实时更新链路 ===');
let ver = null;
try { ver = JSON.parse(bodies['/version.json'].text); } catch (e) {}
chk('version.json 可解析且含 v/build/note', !!(ver && ver.v && ver.build), ver ? 'v=' + ver.v + ' build=' + ver.build : '解析失败');
const gameBuf = readFileSync(join(SITE, 'xiuxian.html'));
chk('version.json 记录的游戏大小与磁盘一致', ver && ver.gameBytes === gameBuf.length, (ver ? ver.gameBytes : '?') + ' B vs ' + gameBuf.length + ' B');
const { createHash } = await import('node:crypto');
const sha = createHash('sha256').update(gameBuf).digest('hex');
chk('version.json 记录的 sha256 与磁盘一致', ver && ver.gameSha256 === sha, (ver ? ver.gameSha256 : '?').slice(0, 12) + ' vs ' + sha.slice(0, 12));
/* 防止「改了 xiuxian.html 却忘了跑 release.mjs」——这是实时更新链路上最容易断的一环 */
const srcGame = readFileSync(join(root, 'xiuxian.html'));
const srcSha = createHash('sha256').update(srcGame).digest('hex');
chk('site 副本与 xiuxian.html 源文件一致（release.mjs 已执行）', srcSha === sha,
  srcSha === sha ? 'sha 一致' : '不一致：请先运行 node scripts/release.mjs "说明"');
chk('首页已内联当前版本号', bodies['/'].text.indexOf(ver ? ver.v : '@@') >= 0, ver ? ver.v : '');

/* ---------- 3. HTML 语义与 SEO ---------- */
out('');
out('=== 3. 语义 / SEO ===');
const H = bodies['/'].text;
chk('DOCTYPE 声明', /^<!DOCTYPE html>/i.test(H.trim()), '');
chk('html lang 已声明', /<html[^>]+lang="zh-CN"/.test(H), '');
chk('viewport 含 width=device-width', /<meta name="viewport"[^>]*width=device-width/.test(H), '');
chk('viewport 含 viewport-fit=cover（刘海屏）', /viewport-fit=cover/.test(H), '');
const title = (H.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
chk('<title> 长度合理（10~40 字）', title.length >= 10 && title.length <= 40, title.length + ' 字：' + title);
const desc = (H.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
chk('meta description 长度合理（40~160 字）', desc.length >= 40 && desc.length <= 160, desc.length + ' 字');
chk('rel=canonical', /<link rel="canonical"/.test(H), '');
chk('Open Graph 三件套', /og:title/.test(H) && /og:description/.test(H) && /og:image/.test(H), '');
chk('JSON-LD 结构化数据', /application\/ld\+json/.test(H) && /"@type":"VideoGame"/.test(H), 'VideoGame');
chk('theme-color 区分明暗', (H.match(/name="theme-color"/g) || []).length >= 2, 'light + dark');

const h1s = H.match(/<h1[\s>]/g) || [];
chk('恰好一个 h1', h1s.length === 1, h1s.length + ' 个');
const hs = [...H.matchAll(/<h([1-3])[\s>]/g)].map(m => +m[1]);
let skip = null;
for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skip = hs[i - 1] + ' → ' + hs[i];
chk('标题层级无跳级', !skip, skip ? '发现 ' + skip : hs.join(','));
chk('语义化分区齐全', /<header[\s>]/.test(H) && /<main[\s>]/.test(H) && /<nav[\s>]/.test(H) && /<footer[\s>]/.test(H) && /<section[\s>]/.test(H), 'header/main/nav/footer/section');

/* ---------- 4. 无障碍 ---------- */
out('');
out('=== 4. 无障碍 a11y ===');
chk('跳转链接（skip link）', /class="skip"[^>]*href="#main"/.test(H), '');
chk('图标按钮均有 aria-label', [...H.matchAll(/<button[^>]*class="icon-btn"[^>]*>/g)].every(m => /aria-label=/.test(m[0])), '');
chk('装饰性 SVG 标记 aria-hidden', /<svg[^>]*aria-hidden="true"/.test(H), '');
chk('iframe 有 title（脚本内构造）', /f\.title\s*=\s*'[^']+'/.test(H), '');
chk('外部链接带 rel=noopener', [...H.matchAll(/target="_blank"/g)].length === [...H.matchAll(/rel="noopener"/g)].length, '');
chk('FAQ 用原生 details/summary（可键盘操作）', /<details/.test(H) && /<summary/.test(H), '');
chk('保留 :focus-visible 焦点样式', /:focus-visible/.test(H), '');
chk('支持 prefers-reduced-motion', /prefers-reduced-motion/.test(H), '');
chk('所有 img 都有 alt（本页无 img）', !/<img(?![^>]*\balt=)/.test(H), '');

/* ---------- 5. 性能与移动端 ---------- */
out('');
out('=== 5. 性能 / 移动端 ===');
/* 只统计真正会发起请求的子资源；canonical / og:url 这类元信息不发起请求，不算 */
const subres = [];
subres.push(...[...H.matchAll(/\ssrc="((?:https?:)?\/\/[^"]+)"/g)].map(m => m[1]));
subres.push(...[...H.matchAll(/<link\b[^>]*rel="(?:stylesheet|preload|modulepreload|preconnect|dns-prefetch|icon|apple-touch-icon|manifest)"[^>]*href="((?:https?:)?\/\/[^"]+)"/g)].map(m => m[1]));
subres.push(...[...H.matchAll(/url\(((?:https?:)?\/\/[^)]+)\)/g)].map(m => m[1]));
chk('零第三方子资源请求', subres.length === 0, subres.length ? subres.join(', ') : '无外链资源（canonical / og 元信息不计）');
chk('无渲染阻塞外部样式/脚本', !/<link[^>]+rel="stylesheet"[^>]*href="https?:/.test(H) && !/<script[^>]+src="https?:/.test(H), '');
chk('使用 100dvh 而非仅 100vh', /100dvh/.test(H), '');
chk('calc() 运算符两侧留空格', !/calc\([^)]*[+\-*/][^ ]/.test(H.replace(/calc\([^)]*\)/g, m => m)), '');
const kb = (bodies['/'].text.length / 1024).toFixed(1);
const gkb = (bodies['/xiuxian.html'].text.length / 1024).toFixed(1);
chk('首页体积可控（< 60 KB）', bodies['/'].text.length < 60 * 1024, kb + ' KB');
chk('游戏本体单文件（< 300 KB）', bodies['/xiuxian.html'].text.length < 300 * 1024, gkb + ' KB');
chk('iframe 延迟加载（点击才加载）', /poster/.test(H) && /stage\.appendChild\(f\)/.test(H), '首屏不加载游戏');
chk('iframe 预留宽高比避免 CLS', /aspect-ratio:\s*16\/10/.test(H), '');
chk('移动端断点存在', /@media \(max-width:760px\)/.test(H) && /@media \(max-width:520px\)/.test(H), '');
chk('safe-area 安全区适配', /safe-area-inset-bottom/.test(H), '');
chk('数字等宽避免跳动', /tabular-nums/.test(H), '');

/* ---------- 6. 响应头策略 ---------- */
out('');
out('=== 6. 部署配置 ===');
const hd = existsSync(join(SITE, '_headers')) ? readFileSync(join(SITE, '_headers'), 'utf8') : '';
chk('_headers 存在（Cloudflare/Netlify）', !!hd, '');
chk('_headers 含 CSP', /Content-Security-Policy:/.test(hd), '');
chk('_headers 含 X-Content-Type-Options', /X-Content-Type-Options:\s*nosniff/.test(hd), '');
chk('_headers 对 version.json 禁缓存', /\/version\.json[\s\S]{0,120}no-store/.test(hd), '');
const vjPath = join(root, 'vercel.json');
const vj = existsSync(vjPath) ? JSON.parse(readFileSync(vjPath, 'utf8')) : null;
chk('vercel.json 可解析且含 headers', !!(vj && Array.isArray(vj.headers) && vj.headers.length), vj ? vj.headers.length + ' 组规则' : '缺失');
chk('vercel.json 声明输出目录为 site', !!(vj && vj.outputDirectory === 'site'), vj ? String(vj.outputDirectory) : '');
chk('CSP 覆盖 frame-src（内嵌试玩要用）', /frame-src 'self'/.test(hd), '');
chk('robots.txt 指向 sitemap', /Sitemap:/.test(bodies['/robots.txt'].text), '');
chk('sitemap.xml 为合法 XML 头', /^<\?xml/.test(bodies['/sitemap.xml'].text.trim()), '');
chk('404 页面已就位', /此 地 无 路/.test(bodies['/404.html'].text), '');

/* GitHub Actions 工作流：YAML 不允许用制表符缩进，且必须有 on / jobs 顶层键 */
for (const wf of ['ci.yml', 'pages.yml']) {
  const p = join(root, '.github', 'workflows', wf);
  if (!existsSync(p)) { bad('workflow ' + wf, '文件缺失'); continue; }
  const t = readFileSync(p, 'utf8');
  chk('workflow ' + wf + ' 结构合法', !/^\t/m.test(t) && /^on:/m.test(t) && /^jobs:/m.test(t),
    /^\t/m.test(t) ? '含制表符缩进（YAML 非法）' : 'on/jobs 齐备，无制表符');
}
chk('GitHub 连接脚本已就位', existsSync(join(root, 'scripts', 'connect-github.ps1')), 'scripts/connect-github.ps1');

server.close();
out('');
out('================ 汇总 ================');
out('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
writeFileSync(OUT, L.join('\n'), 'utf8');
if (fail) process.exitCode = 1;
