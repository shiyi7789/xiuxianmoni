/*
 * 线上核验 —— 把「已经上线的那一份」与本地 site/ 逐字节对一遍
 *
 * 用法：
 *   node scripts/verify-online.mjs                      立即核验 www.xiuxianmoni.me
 *   node scripts/verify-online.mjs --wait=480000        先等部署（最多 8 分钟）再核验
 *   node scripts/verify-online.mjs --base=https://x.dev  换域名
 * 输出：控制台 + 仓库根目录 _online_check.txt
 *
 * 与 scripts/verify-site.mjs 的分工：
 *   verify-site.mjs  —— 本地起静态服务，验**源码本身**（HTTP/SEO/a11y/链接/版式/部署配置）
 *   verify-online.mjs—— 验**平台真正吐出来的那份**，只有它能发现
 *                       「推了但平台没重新部署」「CDN 缓存住旧版」「发布目录配错」这类问题
 *
 * 退出码：0 全通过 / 1 有失败（可直接当 CI 门禁）
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(root, 'site');
const OUT = join(root, '_online_check.txt');

const flag = (k, d) => {
  const hit = process.argv.find(a => a.startsWith('--' + k + '='));
  return hit ? hit.slice(k.length + 3) : d;
};
const BASE = flag('base', 'https://www.xiuxianmoni.me').replace(/\/+$/, '');
const WAIT = Math.max(0, Number(flag('wait', '0')) || 0);

const L = [];
const out = s => { L.push(s); console.log(s); };
let pass = 0, fail = 0;
const ok = (n, d) => { pass++; out('  OK   ' + n + (d ? '  -> ' + d : '')); };
const bad = (n, w) => { fail++; out('  FAIL ' + n + '  -> ' + w); };
const chk = (n, c, d) => (c ? ok(n, d) : bad(n, d || '未通过'));

const sha256 = b => createHash('sha256').update(b).digest('hex');
const read = p => readFileSync(join(SITE, p));
const bust = u => u + (u.includes('?') ? '&' : '?') + '_=' + Date.now() + Math.random().toString(36).slice(2, 8);

/* 一次性抓取：返回状态码 / 响应头 / 原始字节（fetch 会自动解压，故缓冲区即源文件字节） */
async function get(pathname) {
  const res = await fetch(bust(BASE + pathname), {
    redirect: 'follow',
    headers: { 'user-agent': 'xiuxianmoni-online-verify/1.0', 'accept-encoding': 'gzip, deflate, br' }
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, text: buf.toString('utf8') };
}

function walk(dir, base = dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, base, acc);
    else acc.push(relative(base, p).split(sep).join('/'));
  }
  return acc;
}

/* 与 release.mjs 完全同款：按路径排序后把「路径 + 单文件 sha」再哈希一次 */
const fingerprint = pairs => sha256(Buffer.from(
  pairs.map(([rel, sha]) => rel + ':' + sha).sort().join('\n'), 'utf8'));

const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  out('线上核验  BASE=' + BASE);
  out('本地基准  site/version.json');
  out('');

  const ver = JSON.parse(read('version.json').toString('utf8'));
  out('本地版本  v=' + ver.v + '  build=' + ver.build + '  游戏总体积=' + ver.totalGameBytes + ' B');
  out('');

  /* ---------- 0) 连通与部署等待 ---------- */
  out('[0] 连通与部署');
  let live = null;
  const t0 = Date.now();
  for (;;) {
    try { live = JSON.parse((await get('/version.json')).text); } catch { live = null; }
    if (live && live.v === ver.v) break;
    if (Date.now() - t0 >= WAIT) break;
    const left = Math.ceil((WAIT - (Date.now() - t0)) / 1000);
    console.log('  ..   线上 v=' + (live ? live.v : '<抓不到>') + '，继续等待部署（剩余 ' + left + 's）');
    await wait(10000);
  }
  chk('线上可达并返回版本信息', !!live, live ? 'v=' + live.v : 'GET /version.json 失败或不是 JSON');
  if (!live) { out(''); out('✗ 线上不可达，后续检查无法进行'); finish(1); return; }

  /* ---------- 1) 版本一致性 ---------- */
  out('');
  out('[1] 版本与声明');
  chk('线上 v 与本地一致', live.v === ver.v, '线上 ' + live.v + ' / 本地 ' + ver.v);
  const gl = live.games || [], gt = ver.games || [];
  chk('游戏条目数量一致', gl.length === gt.length, '线上 ' + gl.length + ' / 本地 ' + gt.length);
  for (const a of gt) {
    const b = gl.find(x => x.id === a.id);
    if (!b) { bad('条目 ' + a.id + ' 存在', '线上缺失'); continue; }
    chk('条目 ' + a.id + ' 字节数一致', a.bytes === b.bytes, a.bytes + ' B');
    chk('条目 ' + a.id + ' sha256 一致', a.sha256 === b.sha256, String(b.sha256).slice(0, 12));
  }

  /* ---------- 2) 字节级比对 ---------- */
  out('');
  out('[2] 游戏本体逐字节');
  const xi = await get('/xiuxian.html');
  chk('/xiuxian.html 200', xi.status === 200, 'HTTP ' + xi.status);
  const xiSha = sha256(xi.buf);
  chk('/xiuxian.html 实测 sha256 = 本地', xiSha === sha256(read('xiuxian.html')), xiSha.slice(0, 12));
  chk('/xiuxian.html 实测 sha256 = 线上声明', xiSha === live.gameSha256, String(live.gameSha256).slice(0, 12));
  chk('/xiuxian.html 实测字节数 = 线上声明', xi.buf.length === live.gameBytes, xi.buf.length + ' B');

  const rogueRels = walk(join(SITE, 'rogue'));
  const pairs = [];
  let rogueBad = 0;
  for (const rel of rogueRels) {
    const localBuf = read('rogue/' + rel);
    const r = await get('/rogue/' + rel);
    const s = sha256(r.buf);
    pairs.push([rel, s]);
    if (r.status !== 200 || s !== sha256(localBuf)) { rogueBad++; bad('rogue/' + rel + ' 一致', 'HTTP ' + r.status + ' sha ' + s.slice(0, 12)); }
  }
  const rogueSha = fingerprint(pairs);
  chk('rogue/ 共 ' + rogueRels.length + ' 个文件全部一致', rogueBad === 0, rogueBad ? rogueBad + ' 个不一致' : '逐个 sha256 比对通过');
  chk('rogue/ 目录指纹 = 本地声明', rogueSha === (gt.find(x => x.id === 'rogue') || {}).sha256, rogueSha.slice(0, 12));
  chk('rogue/ 目录指纹 = 线上声明', rogueSha === (gl.find(x => x.id === 'rogue') || {}).sha256, rogueSha.slice(0, 12));

  /* ---------- 3) 缓存与安全响应头 ---------- */
  out('');
  out('[3] 缓存与安全响应头');
  const htmlCC = xi.headers.get('cache-control') || '';
  chk('HTML 缓存头 = public, max-age=0, must-revalidate', /public.*max-age=0.*must-revalidate/.test(htmlCC), htmlCC);
  const vh = (await get('/version.json')).headers;
  const vCC = vh.get('cache-control') || '';
  chk('version.json 缓存头 = no-store', /no-store/.test(vCC), vCC);
  const csp = xi.headers.get('content-security-policy') || '';
  chk('CSP 存在且限制 default-src', /default-src/.test(csp), csp ? csp.slice(0, 42) + '…' : '缺失');
  chk('X-Content-Type-Options: nosniff', xi.headers.get('x-content-type-options') === 'nosniff', String(xi.headers.get('x-content-type-options')));
  chk('X-Frame-Options 已设置', !!xi.headers.get('x-frame-options'), String(xi.headers.get('x-frame-options')));
  const cssH = (await get('/assets/site.css')).headers;
  chk('assets/ 缓存头不写死长缓存', !/max-age=[1-9]/.test(cssH.get('cache-control') || ''), String(cssH.get('cache-control')));

  /* ---------- 4) 页面与资源可达 ---------- */
  out('');
  out('[4] 页面与资源');
  const pages = [
    ['/', 'text/html'],
    ['/notice.html', 'text/html'],
    ['/xiuxian-info.html', 'text/html'],
    ['/rogue-info.html', 'text/html'],
    ['/rogue/index.html', 'text/html'],
    ['/assets/site.css', 'text/css'],
    ['/assets/site.js', 'javascript'],
    ['/robots.txt', 'text/plain'],
    ['/sitemap.xml', 'xml']
  ];
  for (const [p, type] of pages) {
    const r = await get(p);
    const ct = r.headers.get('content-type') || '';
    chk('GET ' + p, r.status === 200 && ct.includes(type), 'HTTP ' + r.status + ' · ' + ct.split(';')[0]);
  }

  /* ---------- 5) 错误页 ---------- */
  out('');
  out('[5] 错误页');
  const nf = await get('/__verify-online-missing-' + Date.now());
  chk('未知路径返回 404（不是 200 落地页）', nf.status === 404, 'HTTP ' + nf.status);

  /* ---------- 6) 落地页版本号回填 ---------- */
  out('');
  out('[6] 落地页回填');
  const idx = (await get('/')).text;
  chk('首页含当前版本号 ' + ver.v, idx.includes(ver.v), '页脚版本号占位已回填');
  chk('首页含双游戏卡片体积占位', /id="sizeXiuxian"/.test(idx) && /id="sizeRogue"/.test(idx), '');

  finish(fail === 0 ? 0 : 1);
}

function finish(code) {
  out('');
  out(code === 0
    ? '✓ 线上核验通过：' + pass + ' 项全部通过，线上与本地产出逐字节一致'
    : '✗ 线上核验未通过：' + pass + ' 通过 / ' + fail + ' 失败');
  try { writeFileSync(OUT, L.join('\n') + '\n', 'utf8'); } catch (e) { /* 只读环境忽略 */ }
  process.exit(code);
}

main().catch(err => {
  out('');
  out('✗ 核验中断：' + String((err && err.stack) || err));
  finish(1);
});
