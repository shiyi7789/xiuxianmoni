/*
 * 站点质量检查 —— 本地起静态服务，真实抓取页面，逐条核对 SEO / 无障碍 / 性能 / 链接清单
 *
 * 用法：node scripts/verify-site.mjs
 * 输出：控制台 + 工作区根目录 _site_check.txt
 *
 * 覆盖范围（共 11 组）：
 *   1 HTTP 与资源   2 双游戏发版链路   3 页面通用规范   4 游戏大厅
 *   5 网站声明      6 玩法详情页        7 星际裂隙本体   8 无障碍
 *   9 性能与移动端 10 站内链接巡检     11 部署配置
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(root, 'site');
const OUT = join(root, '_site_check.txt');
const HOST = 'xiuxianmoni.me';

const L = [];
const out = s => L.push(s);
let pass = 0, fail = 0;
function ok(name, detail) { pass++; out('  OK   ' + name + (detail ? '  -> ' + detail : '')); }
function bad(name, why) { fail++; out('  FAIL ' + name + '  -> ' + why); }
function chk(name, cond, detail) { cond ? ok(name, detail) : bad(name, typeof detail === 'string' && detail ? detail : '未通过'); }

const sha256 = b => createHash('sha256').update(b).digest('hex');
const sf = p => join(SITE, p);
const rd = p => readFileSync(sf(p), 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css',
  '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  /* 目录地址（如 /rogue、无尾斜杠）也要交付 dir/index.html —— Vercel / Netlify / Cloudflare
     都是这个行为；少了它，「无尾斜杠」这条路径在本地根本模拟不出来（线上正是它出的事故）。 */
  let file = normalize(join(SITE, p));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) {
    const nf = join(SITE, '404.html');
    const body = existsSync(nf) ? readFileSync(nf) : Buffer.from('404');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }
  /* 模拟 _headers / vercel.json 的缓存策略，验证时一并看响应头 */
  const h = { 'content-type': MIME[extname(file)] || 'application/octet-stream' };
  if (/version\.json$/.test(file)) h['cache-control'] = 'no-store, no-cache, must-revalidate';
  else if (/robots\.txt$|sitemap\.xml$/.test(file)) h['cache-control'] = 'public, max-age=86400';
  else h['cache-control'] = 'public, max-age=0, must-revalidate';
  res.writeHead(200, h);
  res.end(readFileSync(file));
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
out('本地静态服务：' + base);
out('');

/* ---------- 1. HTTP 层 ---------- */
out('=== 1. HTTP 与资源 ===');
const files = [
  '/', '/xiuxian.html', '/rogue/', '/rogue', '/xiuxian-info.html', '/rogue-info.html', '/notice.html',
  '/version.json', '/404.html', '/robots.txt', '/sitemap.xml',
  '/assets/site.css', '/assets/site.js',
  '/rogue/css/style.css', '/rogue/js/utils.js', '/rogue/js/audio.js',
  '/rogue/js/entities.js', '/rogue/js/upgrades.js', '/rogue/js/waves.js', '/rogue/js/game.js'
];
const bodies = {};
for (const f of files) {
  try {
    const r = await fetch(base + f);
    bodies[f] = { status: r.status, type: r.headers.get('content-type'), cc: r.headers.get('cache-control'), text: await r.text() };
    chk('GET ' + f, r.status === 200, 'HTTP ' + r.status + ' · ' + (r.headers.get('content-type') || ''));
  } catch (e) { bad('GET ' + f, e.message); }
}
chk('未知路径返回 404', (await fetch(base + '/nope-xyz')).status === 404, '404.html 已生效');
chk('版本清单禁止缓存', /no-store/.test(bodies['/version.json'].cc || ''), bodies['/version.json'].cc || '(无)');
chk('HTML 回源校验而非长缓存', /max-age=0/.test(bodies['/'].cc || ''), bodies['/'].cc || '(无)');
chk('共享资源回源校验（没有文件名哈希，不能长缓存）', /max-age=0/.test(bodies['/assets/site.css'].cc || ''), bodies['/assets/site.css'].cc || '(无)');
chk('星际裂隙资源回源校验', /max-age=0/.test(bodies['/rogue/js/game.js'].cc || ''), bodies['/rogue/js/game.js'].cc || '(无)');

/* ---------- 2. 双游戏发版链路 ---------- */
out('');
out('=== 2. 双游戏发版链路 ===');
let ver = null;
try { ver = JSON.parse(bodies['/version.json'].text); } catch (e) {}
chk('version.json 可解析且含 v/build/note', !!(ver && ver.v && ver.build), ver ? 'v=' + ver.v + ' build=' + ver.build : '解析失败');
chk('version.json 声明站点入口为 index.html', !!(ver && ver.site === 'index.html'), ver ? String(ver.site) : '');
chk('version.json 声明两款游戏', !!(ver && Array.isArray(ver.games) && ver.games.length === 2), ver && ver.games ? ver.games.map(g => g.id).join(' + ') : '缺失');
chk('version.json 保留向后兼容字段 game/gameBytes/gameSha256', !!(ver && ver.game && ver.gameBytes && ver.gameSha256), ver ? String(ver.game) : '');
const xiuxianBuf = readFileSync(sf('xiuxian.html'));
const xiuxianSha = sha256(xiuxianBuf);
chk('xiuxian 字节数与磁盘一致', ver && ver.gameBytes === xiuxianBuf.length, (ver ? ver.gameBytes : '?') + ' B vs ' + xiuxianBuf.length + ' B');
chk('xiuxian sha256 与磁盘一致', ver && ver.gameSha256 === xiuxianSha, (ver ? ver.gameSha256 : '?').slice(0, 12) + ' vs ' + xiuxianSha.slice(0, 12));

/* site/rogue 目录指纹：与 release.mjs 用同一算法复算，防止「改了源码忘了发版」 */
function walk(dir, base = dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, base, acc);
    else acc.push([p.slice(base.length + 1).split('\\').join('/'), readFileSync(p)]);
  }
  return acc;
}
const roguePairs = walk(sf('rogue'));
const rogueSha = sha256(Buffer.from(roguePairs.map(p => p[0] + ':' + sha256(p[1])).sort().join('\n'), 'utf8'));
const rogueBytes = roguePairs.reduce((n, p) => n + p[1].length, 0);
const gRogue = ver && Array.isArray(ver.games) ? ver.games.find(g => g.id === 'rogue') : null;
chk('rogue 目录指纹与磁盘一致', !!gRogue && gRogue.sha256 === rogueSha, gRogue ? gRogue.sha256.slice(0, 12) + ' vs ' + rogueSha.slice(0, 12) : '缺失');
chk('rogue 字节数与磁盘一致', !!gRogue && gRogue.bytes === rogueBytes, (gRogue ? gRogue.bytes : '?') + ' B vs ' + rogueBytes + ' B');
chk('游戏总体积已记录（两位相加）', !!ver && ver.totalGameBytes === xiuxianBuf.length + rogueBytes, ver ? ver.totalGameBytes + ' B' : '');
/* 站点副本必须等于源码：这是最容易断的一环（改了 xiuxian.html / games/ 却没有跑 release.mjs） */
const srcSha = sha256(readFileSync(join(root, 'xiuxian.html')));
chk('site/xiuxian.html 与构建产物一致（release.mjs 已执行）', srcSha === xiuxianSha,
  srcSha === xiuxianSha ? 'sha 一致' : '不一致：请先运行 node scripts/release.mjs "说明"');
const rogueSrc = walk(join(root, 'games', 'thunder-rogue')).filter(p => !/^(test|shots)\//.test(p[0]) && p[0] !== '关卡设计文档.md');
const rogueSrcSha = sha256(Buffer.from(rogueSrc.map(p => p[0] + ':' + sha256(p[1])).sort().join('\n'), 'utf8'));
chk('site/rogue/ 与 games/thunder-rogue/ 一致（release.mjs 已执行）', rogueSrcSha === rogueSha,
  rogueSrcSha === rogueSha ? '指纹一致' : '不一致：请先运行 node scripts/release.mjs "说明"');
chk('大厅已内联当前版本号', bodies['/'].text.indexOf(ver ? ver.v : '@@') >= 0, ver ? ver.v : '');
chk('大厅已回填游戏总体积', /<b id="statBytes">\d+ KB<\/b>/.test(bodies['/'].text),
  (bodies['/'].text.match(/<b id="statBytes">([^<]*)<\/b>/) || [])[1] || '(未回填)');
chk('卡片体积数字已回填（不写死在 HTML 里）',
  /<span class="meta" id="sizeXiuxian">\d+ KB/.test(bodies['/'].text) && /<span class="meta" id="sizeRogue">\d+ KB/.test(bodies['/'].text),
  (bodies['/'].text.match(/<span class="meta" id="sizeXiuxian">([^<]*)<\/span>/) || [])[1] + ' / '
  + (bodies['/'].text.match(/<span class="meta" id="sizeRogue">([^<]*)<\/span>/) || [])[1]);

/* ---------- 3. 页面通用规范（逐页核对 4 个文案页） ----------
   游戏本体（/rogue/ 与 /xiuxian.html）不套这组检查：它们是 canvas 全屏应用，
   没有正文语义结构，也没有「跳到主要内容」的意义 —— 它们在第 7 组单独查。 */
out('');
out('=== 3. 页面通用规范 ===');
const PAGES = ['/', '/xiuxian-info.html', '/rogue-info.html', '/notice.html'];
const CSS = readFileSync(sf('assets/site.css'), 'utf8');
const SJS = readFileSync(sf('assets/site.js'), 'utf8');
for (const p of PAGES) {
  const B = bodies[p];
  if (!B) { bad('页面 ' + p, '未抓到内容'); continue; }
  const H = B.text;
  const clean = H.replace(/<!--[\s\S]*?-->/g, '');
  const tag = p === '/' ? '大厅' : p;
  chk(tag + ' · DOCTYPE', /^<!DOCTYPE html>/i.test(H.trim()), '');
  chk(tag + ' · html lang=zh-CN', /<html[^>]+lang="zh-CN"/.test(H), '');
  chk(tag + ' · viewport 含 width=device-width', /<meta name="viewport"[^>]*width=device-width/.test(H), '');
  chk(tag + ' · viewport-fit=cover（刘海屏）', /viewport-fit=cover/.test(H), '');
  const t = (H.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  chk(tag + ' · <title> 长度合理（8~45 字）', t.length >= 8 && t.length <= 45, t.length + ' 字：' + t);
  const desc = (H.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  chk(tag + ' · meta description 长度合理（40~170 字）', desc.length >= 40 && desc.length <= 170, desc.length + ' 字');
  chk(tag + ' · rel=canonical 指向真实域名', clean.indexOf('href="https://' + HOST + '/') >= 0, '');
  chk(tag + ' · Open Graph 三件套', /og:type/.test(H) && /og:title/.test(H) && /og:description/.test(H), '');
  chk(tag + ' · 恰好一个 h1', (H.match(/<h1[\s>]/g) || []).length === 1, (H.match(/<h1[\s>]/g) || []).length + ' 个');
  chk(tag + ' · 语义化分区齐全', /<header[\s>]/.test(H) && /<main[\s>]/.test(H) && /<nav[\s>]/.test(H) && /<footer[\s>]/.test(H), 'header/main/nav/footer');
  chk(tag + ' · 跳转链接（skip link）', /class="skip"[^>]*href="#main"/.test(H), '');
  chk(tag + ' · 图标按钮有 aria-label', [...H.matchAll(/<button[^>]*class="icon-btn"[^>]*>/g)].every(m => /aria-label=/.test(m[0])), '');
  chk(tag + ' · 新开窗口的链接都带 rel=noopener',
    [...H.matchAll(/target="_blank"/g)].length === [...H.matchAll(/rel="noopener"/g)].length,
    [...H.matchAll(/target="_blank"/g)].length + ' 个外链');
  chk(tag + ' · 无缺 alt 的 img', !/<img(?![^>]*\balt=)/.test(H), '');
  chk(tag + ' · 全站无 example.com 残留', !/example\.com/.test(clean), '');
  /* 零第三方请求：只统计真的会发起请求的子资源 */
  const subres = [];
  subres.push(...[...H.matchAll(/\ssrc="((?:https?:)?\/\/[^"]+)"/g)].map(m => m[1]));
  subres.push(...[...H.matchAll(/<link\b[^>]*rel="(?:stylesheet|preload|modulepreload|preconnect|dns-prefetch|icon|apple-touch-icon|manifest)"[^>]*href="((?:https?:)?\/\/[^"]+)"/g)].map(m => m[1]));
  subres.push(...[...H.matchAll(/url\(((?:https?:)?\/\/[^)]+)\)/g)].map(m => m[1]));
  chk(tag + ' · 零第三方子资源请求', subres.length === 0, subres.length ? subres.join(', ') : '无外链资源（canonical / og 元信息不计）');
}

/* 共享样式与脚本必须被关键页面引用（否则版式会瞬间垮掉） */
const linkPages = ['/', '/xiuxian-info.html', '/rogue-info.html', '/notice.html'];
chk('四个文案页都引用了共享样式', linkPages.every(p => bodies[p].text.indexOf('assets/site.css') >= 0), 'assets/site.css');
chk('四个文案页都引用了共享脚本', linkPages.every(p => bodies[p].text.indexOf('assets/site.js') >= 0), 'assets/site.js');
chk('共享样式含明暗两套令牌', /html\[data-theme="dark"\]/.test(CSS) && /:root\{/.test(CSS), '');
chk('共享样式保留 :focus-visible 焦点样式', /:focus-visible/.test(CSS), '');
chk('共享样式支持 prefers-reduced-motion', /prefers-reduced-motion/.test(CSS), '');
chk('共享样式使用 100dvh 而非仅 100vh', /100dvh/.test(CSS), '');
chk('共享样式 safe-area 安全区适配', /safe-area-inset-bottom/.test(CSS), '');
chk('共享样式数字等宽避免跳动', /tabular-nums/.test(CSS), '');
chk('共享样式 calc() 运算符两侧留空格', !/calc\([^)]*[+\-*/][^ ]/.test(CSS), '');
chk('共享脚本 iframe 延迟加载（点击才加载）', /stage\.appendChild\(f\)/.test(SJS), 'assets/site.js');
chk('共享脚本尊重 prefers-reduced-motion', /prefers-reduced-motion/.test(SJS) && /reduce/.test(SJS), '');
chk('共享脚本不发任何跨域请求', !/fetch\(['"]https?:/.test(SJS), '只轮询同源 version.json');
chk('主题在首帧前设定（避免浅色页面先闪一下深色）', linkPages.every(p => /site_theme_v1/.test(bodies[p].text)) && /site_theme_v1/.test(SJS), 'head 内联脚本 + site.js 双保险');
chk('入场动效默认不隐藏内容（site.js 挂了也不会白屏）', /html\.rv-on \.rv\{opacity:0/.test(CSS) && !/\.js \.rv\{opacity:0/.test(CSS), '由 rv-on 总闸控制');

/* ---------- 4. 游戏大厅 ---------- */
out('');
out('=== 4. 游戏大厅（菜单） ===');
const HUB = bodies['/'].text;
const HUBc = HUB.replace(/<!--[\s\S]*?-->/g, '');
chk('canonical 指向站点根', HUBc.indexOf('href="https://' + HOST + '/"') >= 0, '');
chk('JSON-LD 结构化数据（ItemList + VideoGame）', /application\/ld\+json/.test(HUB) && /"@type":"ItemList"/.test(HUB) && /"@type":"VideoGame"/.test(HUB), 'ItemList 包两款 VideoGame');
chk('JSON-LD 覆盖两款游戏', (HUB.match(/"@type":"VideoGame"/g) || []).length === 2, '2 款');
chk('theme-color 区分明暗', (HUB.match(/name="theme-color"/g) || []).length >= 2, 'light + dark');
chk('顶栏是菜单栏（nav 含 5 个以上入口）', (HUB.match(/<nav class="nav"[\s\S]*?<\/nav>/) || [''])[0].split('<a ').length - 1 >= 5,
  ((HUB.match(/<nav class="nav"[\s\S]*?<\/nav>/) || [''])[0].match(/<a /g) || []).length + ' 个入口');
chk('大厅含游戏选择锚点 #games', /<section id="games">/.test(HUB), '');
chk('大厅有两张游戏卡片', (HUB.match(/class="gcard rv"/g) || []).length === 2, '修仙模拟器 + 星际裂隙');
chk('卡片可直达修仙模拟器', /href="xiuxian\.html" data-game="xiuxian"/.test(HUB), '');
chk('卡片可直达星际裂隙', /href="rogue\/" data-game="rogue"/.test(HUB), '');
chk('两张卡片都有「玩法详情」入口', /href="xiuxian-info\.html"/.test(HUB) && /href="rogue-info\.html"/.test(HUB), '');
chk('封面为内联 SVG 且带无障碍名称', (HUB.match(/<svg viewBox="0 0 320 180" role="img" aria-label=/g) || []).length === 2, '纯 SVG，零图片请求');
chk('「上次游玩」记录用的徽标存在', (HUB.match(/class="badge" data-last hidden/g) || []).length === 2, 'site_last_game_v1');
chk('页内试玩面板存在（#try + poster + stage）', /<section id="try">/.test(HUB) && /id="poster"/.test(HUB) && /class="stage"/.test(HUB), '');
chk('页内试玩有游戏切换分段控件', (HUB.match(/data-try="/g) || []).length === 2, '修仙 / 星际裂隙');
chk('页内 iframe 预留宽高比避免 CLS', /aspect-ratio:16\/10/.test(CSS), '');
chk('移动端断点存在', /@media \(max-width:820px\)/.test(CSS) && /@media \(max-width:640px\)/.test(CSS), '');
/* 声明：大厅保留要点，完整版在 notice.html */
const promise = ['不 盈 利', '无 广 告', '不 采 集 信 息', '不 传 播 不 良 信 息', '只 供 游 玩'];
const missP = promise.filter(k => HUB.indexOf(k) < 0);
chk('大厅含站点声明五条要点', missP.length === 0, missP.length ? '缺 ' + missP.join(' / ') : promise.length + ' 条');
chk('声明有独立锚点 #notice', /<section id="notice">/.test(HUB), '');
chk('导航与页脚都能跳到声明', (HUB.match(/href="#notice"/g) || []).length + (HUB.match(/href="notice\.html"/g) || []).length >= 3,
  (HUB.match(/href="#notice"/g) || []).length + ' 处锚点 + ' + (HUB.match(/href="notice\.html"/g) || []).length + ' 处页面链接');
chk('声明含免广告 / 不采集的明确表述', /不做统计埋点/.test(HUB) && /不上传任何个人信息/.test(HUB), '');
chk('声明含作息与未成年人提示', /合理安排游戏时间/.test(HUB) && /监护人指导/.test(HUB), '');
chk('大厅给出完整声明入口', /href="notice\.html">阅 读 完 整 网 站 声 明</.test(HUB), '');
chk('大厅 FAQ 使用原生 details/summary', (HUB.match(/<summary>/g) || []).length >= 5, (HUB.match(/<summary>/g) || []).length + ' 组问答');
const kb = (HUB.length / 1024).toFixed(1);
chk('大厅体积可控（< 60 KB）', HUB.length < 60 * 1024, kb + ' KB');

/* ---------- 5. 网站声明 ---------- */
out('');
out('=== 5. 网站声明 ===');
const NOTICE = bodies['/notice.html'].text;
const clauses = [
  '一、总则与适用范围', '二、站点性质', '三、隐私与数据', '四、内容规范与未成年人保护',
  '五、知识产权', '六、免责声明', '七、健康游戏提示', '八、适用法律与争议解决',
  '九、声明的变更与生效', '十、联系方式'
];
const missC = clauses.filter(k => NOTICE.indexOf(k) < 0);
chk('声明含十节完整条款', missC.length === 0, missC.length ? '缺 ' + missC.join(' / ') : clauses.length + ' 节');
chk('声明标了生效日期与版本', /生效日期 2026-09-29/.test(NOTICE) && /版本 v1\.0/.test(NOTICE), '2026-09-29 / v1.0');
chk('声明同时覆盖两款游戏', /修仙模拟器 · 文字版/.test(NOTICE) && /星际裂隙 · ROGUE THUNDER/.test(NOTICE), '');
chk('声明说明数据只存本机', /localStorage/.test(NOTICE) && /不会上传到任何服务器/.test(NOTICE), '');
chk('声明如实交代托管平台的访问日志', /访问日志/.test(NOTICE) && /IP 地址/.test(NOTICE), '不夸大也不隐瞒');
chk('声明含知识产权与商用限制', /著作权法/.test(NOTICE) && /商业用途/.test(NOTICE), '');
chk('声明含免责与「现状」条款', /现状/.test(NOTICE) && /不可抗力/.test(NOTICE), '');
chk('声明含未成年人保护', /未成年人/.test(NOTICE) && /监护人/.test(NOTICE), '');
chk('声明含适用法律（中华人民共和国法律）', /中华人民共和国法律/.test(NOTICE), '');
chk('声明含联系方式', /github\.com\/shiyi7789\/xiuxianmoni/.test(NOTICE), '仓库 Issue 渠道');
chk('声明目录锚点全部可达', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(n => NOTICE.indexOf('href="#s' + n + '"') >= 0 && NOTICE.indexOf('id="s' + n + '"') >= 0), '10/10');

/* ---------- 6. 两个玩法详情页 ---------- */
out('');
out('=== 6. 玩法详情页 ===');
const XI = bodies['/xiuxian-info.html'].text;
const RG = bodies['/rogue-info.html'].text;
chk('修仙详情页保留原有 SEO 与结构', /ladder/.test(XI) && /id="loop"/.test(XI) && /id="faq"/.test(XI) && /id="try"/.test(XI), '境界阶梯 / 三步一轮 / FAQ / 页内试玩');
chk('修仙详情页带返回大厅入口', /class="back" href="\.\/">← 返回游戏大厅/.test(XI), '');
chk('修仙详情页保留九条并行成长线', ['修为与突破', '五品装备与流光', '妖兽与秘境', '轮回与传承', '成就与气运', '奇遇与抉择', '功法 · 悟道录', '材料 · 炼丹炼器', '洞府 · 离线收益']
  .every(k => XI.indexOf(k) >= 0), '9 张玩法卡');
chk('修仙详情页声明区已指向完整声明', /href="notice\.html">《网站声明》</.test(XI), '');
chk('肉鸽详情页含操作表', /W A S D/.test(RG) && /Space/.test(RG) && /时间畸变/.test(RG), '');
chk('肉鸽详情页含八条武器线', ['主炮', '贯穿激光', '散射炮', '追踪导弹', '环绕无人机', '电弧链', '回旋飞刃', '引力黑洞'].every(k => RG.indexOf(k) >= 0), '8/8');
chk('肉鸽详情页含敌机原型表', /<table>/.test(RG) && /裂隙核心/.test(RG) && /哨塔/.test(RG), '10 种原型');
chk('肉鸽详情页含 Boss 阶段数值', /0\.8 秒/.test(RG) && /1\.2 秒/.test(RG) && /\+55%/.test(RG), '');
chk('肉鸽详情页讲清「为什么不会莫名死亡」', /0\.45 秒/.test(RG) && /14px/.test(RG) && /0\.9 秒/.test(RG), '预警 / 震动上限 / 受击无敌');
chk('肉鸽详情页的数量口径与游戏本体一致', /<b>8<\/b> 种武器/.test(RG) && /<b>15<\/b> 项被动/.test(RG) && /<b>3<\/b> 个主动技/.test(RG),
  '8 武器 / 15 被动 / 3 主动，与 upgrades.js 的卡池一致');
chk('肉鸽详情页带返回大厅入口', /class="back" href="\.\/">← 返回游戏大厅/.test(RG), '');
chk('肉鸽详情页声明区已指向完整声明', /href="notice\.html">《网站声明》</.test(RG), '');

/* ---------- 7. 星际裂隙游戏本体 ---------- */
out('');
out('=== 7. 星际裂隙游戏本体 ===');
const RGI = bodies['/rogue/'].text;
chk('游戏页 lang=zh-CN 与竖屏 viewport', /<html lang="zh-CN">/.test(RGI) && /viewport-fit=cover/.test(RGI), '');
chk('游戏页首屏即为可玩舞台（canvas + 主菜单）', /<canvas id="cv"><\/canvas>/.test(RGI) && /id="btnStart"/.test(RGI), '');
chk('游戏页含站内声明入口', /href="\.\.\/notice\.html"/.test(RGI), '../notice.html');
chk('游戏页外链带 rel=noopener', /target="_blank" rel="noopener"/.test(RGI), '');
chk('游戏页 JSON-LD 为 VideoGame', /"@type":"VideoGame"/.test(RGI), '');
chk('游戏页有独立 favicon 与 theme-color', /rel="icon"/.test(RGI) && /name="theme-color"/.test(RGI), '');
chk('脚本按顺序拼接且不依赖打包器', ['utils', 'audio', 'entities', 'upgrades', 'waves', 'game']
  .every(n => RGI.indexOf('js/' + n + '.js') >= 0), 'utils→audio→entities→upgrades→waves→game');
chk('样式表为同源相对路径', /<link rel="stylesheet" href="css\/style\.css">/.test(RGI), 'css/style.css');
chk('游戏页自带子路径资源基准（subpathBase）', /id="subpathBase"/.test(RGI),
  '站点对外是 /rogue（无尾斜杠），没有它相对子资源会 404 成一片纯文字');
chk('游戏本体无外部子资源请求', !/<script[^>]+src="https?:/.test(RGI) && !/<link[^>]+rel="stylesheet"[^>]*href="https?:/.test(RGI) && !/<img[^>]+src="https?:/.test(RGI), '音频为程序化合成，图片为零');
chk('游戏体积可控（< 250 KB）', rogueBytes < 250 * 1024, (rogueBytes / 1024).toFixed(1) + ' KB / ' + roguePairs.length + ' 个文件');
chk('脚本按顺序拼接即可运行（无打包器、无 import）', !/^\s*import\s/m.test(roguePairs.map(p => p[1].toString()).join('\n')), '六个文件共享同一全局作用域');

/* ---------- 7.2 体积闸门与「不许内嵌素材」守卫（单文件形态的命门） ---------- */
out('');
out('=== 7.2 体积闸门 ===');
const GAMEBODY = bodies['/xiuxian.html'].text;
const GBUDGET = 400 * 1024;
chk('修仙模拟器仍是单文件（< 400 KB）', GAMEBODY.length < GBUDGET,
  (GAMEBODY.length / 1024).toFixed(1) + ' KB，余量 ' + ((GBUDGET - GAMEBODY.length) / 1024).toFixed(1) + ' KB');
/* 守卫的本意是「不许塞二进制素材把单文件撑爆」：位图 / 音频 / 视频 / 字体一律拦，
   但手写的 data:image/svg+xml 小图标（几百字节的矢量 favicon）放行。 */
const BIN_ASSET = /data:(image\/(png|jpe?g|gif|webp|avif|bmp)|audio\/|video\/|font\/)/i;
chk('修仙模拟器无内嵌二进制素材', !BIN_ASSET.test(GAMEBODY), '音频/图像均为程序化生成');
chk('星际裂隙无内嵌二进制素材', !roguePairs.some(p => BIN_ASSET.test(p[1].toString())), '音效为 WebAudio 合成');
chk('两款游戏合计不超过 700 KB', xiuxianBuf.length + rogueBytes < 700 * 1024,
  ((xiuxianBuf.length + rogueBytes) / 1024).toFixed(1) + ' KB');

/* ---------- 7.5 404 页（独立成组：不套文案页规范，因为它刻意 noindex） ---------- */
out('');
out('=== 7.5 错误页 ===');
const E404 = bodies['/404.html'].text;
chk('404 页 lang 与 viewport 正确', /lang="zh-CN"/.test(E404) && /width=device-width/.test(E404), '');
chk('404 页标记 noindex（避免被搜索引擎收录）', /name="robots" content="noindex"/.test(E404), '');
chk('404 页给出三处出口（大厅 + 两款游戏）', /href="\/"/.test(E404) && /href="\/xiuxian\.html"/.test(E404) && /href="\/rogue\/"/.test(E404), '');
chk('404 页出口为根绝对路径（它会在任意深度路径上被返回）',
  E404.match(/(?:href|src)="([^"]+)"/g).every(t => /"((https?:)?\/\/|data:|mailto:|#|\/)/.test(t)),
  '否则 /a/b/c 这种路径下按钮会再 404 一次');
chk('404 页自带明暗主题令牌', /prefers-color-scheme:dark/.test(E404) && /--zhu/.test(E404), '不闪白');
chk('404 页保留 :focus-visible', /:focus-visible/.test(E404), '');

/* ---------- 8. 站内链接巡检 ---------- */
out('');
out('=== 8. 站内链接与资源引用巡检 ===');
const CHECK_PAGES = ['/', '/404.html', '/xiuxian-info.html', '/rogue-info.html', '/notice.html', '/rogue/', '/rogue'];
let linkTotal = 0;
const broken = [];
/* 目录基准：页面若自带 subpathBase 而地址又没有尾斜杠（线上 /rogue 就是这样），
   浏览器会把基准补成「目录 + /」。这里按同一口径解析 —— 少了这一步就复现不出
   2026-09-29 那次「css/style.css 被解析到 /css/style.css → 全站一片纯文字」的事故。 */
const dirOf = (p, html) => {
  if (p.endsWith('/')) return p;
  if (/id="subpathBase"/.test(html)) return p + '/';
  return p.replace(/[^/]*$/, '');
};
for (const p of CHECK_PAGES) {
  const B = bodies[p];
  if (!B) continue;
  const dir = dirOf(p, B.text);
  for (const m of B.text.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(https?:)?\/\//.test(raw) || /^(data:|mailto:|tel:|#|javascript:)/.test(raw)) continue;
    const path = raw.split('#')[0].split('?')[0];
    if (!path) continue;
    linkTotal++;
    const target = normalize(join(SITE, dir, path));
    const file = target.endsWith('\\') || target.endsWith('/') || (existsSync(target) && statSync(target).isDirectory())
      ? join(target, 'index.html') : target;
    if (!existsSync(file)) broken.push((p === '/' ? '/index.html' : p) + ' → ' + raw);
  }
}
chk('站内链接与资源引用全部可达', broken.length === 0,
  broken.length ? '断了 ' + broken.length + ' 条：' + broken.slice(0, 5).join('；') : '共 ' + linkTotal + ' 条引用，0 条断链');
chk('sitemap 覆盖全部公开页面', ['/', '/xiuxian.html', '/rogue/', '/xiuxian-info.html', '/rogue-info.html', '/notice.html']
  .every(u => bodies['/sitemap.xml'].text.indexOf('https://' + HOST + u + '<') >= 0), '6 个 URL');
chk('sitemap 为合法 XML 头', /^<\?xml/.test(bodies['/sitemap.xml'].text.trim()), '');
chk('robots.txt 指向 sitemap', /Sitemap: https:\/\/xiuxianmoni\.me\/sitemap\.xml/.test(bodies['/robots.txt'].text), '');
chk('robots.txt 允许抓取', /User-agent: \*/.test(bodies['/robots.txt'].text) && /Allow: \//.test(bodies['/robots.txt'].text), '');
chk('404 页面已就位且给出去处', /此 地 无 路/.test(bodies['/404.html'].text) && /返 回 游 戏 大 厅/.test(bodies['/404.html'].text), '');

/* ---------- 9. 部署配置 ---------- */
out('');
out('=== 9. 部署配置 ===');
const hd = readFileSync(sf('_headers'), 'utf8');
chk('_headers 存在（换托管商时可直接沿用）', !!hd, '');
chk('_headers 含 CSP 且覆盖 frame-src', /Content-Security-Policy:/.test(hd) && /frame-src 'self'/.test(hd), '页内试玩要能内嵌');
chk('_headers 含 X-Content-Type-Options', /X-Content-Type-Options:\s*nosniff/.test(hd), '');
chk('_headers 对 version.json 禁缓存', /\/version\.json[\s\S]{0,140}no-store/.test(hd), '');
chk('_headers 覆盖 assets/ 与 rogue/', /\/assets\/\*/.test(hd) && /\/rogue\/\*/.test(hd), '');
const vj = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
chk('vercel.json 可解析且含 headers', Array.isArray(vj.headers) && vj.headers.length >= 8, vj.headers.length + ' 组规则');
chk('vercel.json 声明输出目录为 site', vj.outputDirectory === 'site', String(vj.outputDirectory));
const vsrc = vj.headers.map(r => r.source);
chk('vercel.json 覆盖新增的 4 个页面与资源目录',
  ['/assets/(.*)', '/rogue/(.*)', '/xiuxian-info.html', '/rogue-info.html', '/notice.html'].every(s => vsrc.includes(s)),
  '修复了「_headers 声明了、vercel.json 没声明」的历史遗留');
chk('vercel.json 与 _headers 都短缓存 robots/sitemap',
  vsrc.includes('/robots.txt') && vsrc.includes('/sitemap.xml') && /\/robots\.txt[\s\S]{0,120}86400/.test(hd), '两文件已对齐');
chk('vercel.json 保留全套安全响应头', ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Strict-Transport-Security', 'Content-Security-Policy']
  .every(k => JSON.stringify(vj).indexOf(k) >= 0), '6 项');
/* ⚠ 这条别改回 false。站内有「子目录 + 相对子资源」的页面（rogue/ 那 8 个文件都是相对路径引用），
   无尾斜杠的 /rogue 会让浏览器把 css/style.css 解析到上一层 → 2026-09-29 线上就是这么崩的。
   trailingSlash:true 只规范化无扩展名路径，静态文件路径不受影响（见 verify-online.mjs 的线上实测）。 */
chk('vercel.json 开启 trailingSlash（目录型页面必须落在带尾斜杠的地址上）', vj.trailingSlash === true,
  '当前 ' + String(vj.trailingSlash) + '；改成 false 会让 /rogue 的子资源 404');
/* ⚠ 这条别改回 'none'。rogue 页的 subpathBase 兜底是靠注入 <base> 实现的，而 <base> 受 base-uri 管；
   base-uri 'none' 会让浏览器「静默」丢弃它（只在 console 留一条 violation），兜底直接变摆设。
   本站是纯静态、零用户输入、且 script-src 已允许 'unsafe-inline'，收窄到 'none' 换不来实际收益。 */
{
  const cspV = (vj.headers.find(r => r.headers && r.headers.some(h => h.key === 'Content-Security-Policy')) || { headers: [] })
    .headers.find(h => h.key === 'Content-Security-Policy').value;
  chk('CSP 允许同源 <base>（base-uri 不得为 none）',
    /base-uri 'self'/.test(cspV) && /base-uri 'self'/.test(hd),
    "vercel.json 与 _headers 都必须是 base-uri 'self'；写成 'none' 会让 subpathBase 兜底被静默丢弃");
}

/* GitHub Actions 工作流：YAML 不允许用制表符缩进，且必须有 on / jobs 顶层键 */
for (const wf of ['ci.yml', 'pages.yml']) {
  const p = join(root, '.github', 'workflows', wf);
  if (!existsSync(p)) { bad('workflow ' + wf, '文件缺失'); continue; }
  const t = readFileSync(p, 'utf8');
  chk('workflow ' + wf + ' 结构合法', !/^\t/m.test(t) && /^on:/m.test(t) && /^jobs:/m.test(t),
    /^\t/m.test(t) ? '含制表符缩进（YAML 非法）' : 'on/jobs 齐备，无制表符');
}
chk('GitHub 连接脚本已就位', existsSync(join(root, 'scripts', 'connect-github.ps1')), 'scripts/connect-github.ps1');

/* ---------- 11. 版式静态守卫（本机跑不了无头浏览器，用静态分析替代「肉眼」） ----------
   无头 Edge 在本机被策略拦死（进程能起、产物为 0），所以拿不到截图。
   退而求其次：把「class 名打错 / 令牌名打错」这两类一定会破版的错误做成硬检查，
   它们能覆盖肉眼最容易漏看的那一部分。 */
out('');
out('=== 11. 版式静态守卫 ===');
const ALL_CSS = CSS + '\n' + readFileSync(sf('rogue/css/style.css'), 'utf8');

/* 11.1 HTML 里用到的 class 必须真的被定义过（拼错一个字母 = 整块样式失效）
   · xiuxian.html 排除在外：它的骨架由 JS 拼字符串生成（class="q'+qi+'" 这种），
     静态扫描只能扫到模板碎片，噪声比信号多 —— 它由第 6 组的回归测试（221 项）负责。
   · 其余页面的样式可能是页内 <style>，所以每页还要并上它自己的内联样式表。 */
const defined = new Set();
for (const m of ALL_CSS.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
const CSS_PAGES = ['/', '/404.html', '/xiuxian-info.html', '/rogue-info.html', '/notice.html', '/rogue/'];
const unknown = new Map();
for (const p of CSS_PAGES) {
  const B = bodies[p];
  if (!B) continue;
  const own = new Set(defined);
  for (const st of B.text.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    for (const m of st[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) own.add(m[1]);
  }
  for (const m of B.text.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (!c || own.has(c)) continue;
      if (!unknown.has(c)) unknown.set(c, []);
      unknown.get(c).push(p);
    }
  }
}
chk('所有 HTML class 都有对应样式定义（零孤儿 class）', unknown.size === 0,
  unknown.size ? '未定义 ' + unknown.size + ' 个：' + [...unknown.keys()].slice(0, 40).join(' / ') : '共 ' + defined.size + ' 条选择器，零孤儿 class');

/* 11.2 用到的 CSS 令牌必须被定义过（没有回退值的那些才拦） */
const tokDef = new Set();
for (const m of ALL_CSS.matchAll(/(--[\w-]+)\s*:/g)) tokDef.add(m[1]);
for (const p of CSS_PAGES) {
  const B = bodies[p];
  if (!B) continue;
  for (const st of B.text.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    for (const m of st[1].matchAll(/(--[\w-]+)\s*:/g)) tokDef.add(m[1]);
  }
}
const tokMiss = new Set();
for (const src of [ALL_CSS, ...CSS_PAGES.map(p => bodies[p] ? bodies[p].text : '')]) {
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)\s*(,?)/g)) {
    if (m[2] === ',') continue;          /* 带回退值的（如 var(--mx,50%)）由 JS 运行时写入，不算缺 */
    if (!tokDef.has(m[1])) tokMiss.add(m[1]);
  }
}
chk('所有 CSS 令牌都有定义（或带回退值）', tokMiss.size === 0,
  tokMiss.size ? '未定义 ' + [...tokMiss].slice(0, 20).join(' / ') : tokDef.size + ' 个令牌全部有着落');

/* 11.3 明暗两套令牌必须成对（少一个深色值 = 夜间出现一块浅色底） */
const lightTok = new Set();
const dkSec = CSS.slice(CSS.indexOf('html[data-theme="dark"]'));
for (const m of dkSec.matchAll(/(--[\w-]+)\s*:/g)) lightTok.add(m[1]);
const oneSided = [...lightTok].filter(t => {
  const i = CSS.indexOf(t + ':');
  return i < 0 || i >= CSS.indexOf('html[data-theme="dark"]');
});
chk('深色主题覆写的令牌都先在 :root 定义过', oneSided.length === 0,
  oneSided.length ? '只在深色里出现：' + oneSided.join(' / ') : lightTok.size + ' 个令牌在明暗两套里成对');

/* 11.4 关键版式骨架必须在位（改版时最容易丢的就是它们） */
const VITAL = ['#sky', '.gcard', '.gcover', '.gbody', '.try', '.stage', '.poster', '.statbox',
  '.promise', '.ladder', '.faq', '.upd', '.toc', '.doc', '.keys', '.tw'];
const vitalMiss = VITAL.filter(k => ALL_CSS.indexOf(k) < 0);
chk('关键版式骨架仍被定义（星空 / 卡片 / 试玩 / 声明 / 目录 / 键表）', vitalMiss.length === 0,
  vitalMiss.length ? '缺 ' + vitalMiss.join(' / ') : VITAL.length + ' 个骨架在位');
chk('大厅与详情页共用同一套令牌（换主题两边一起变）', /^:root\{/m.test(CSS) && /--zhu:/.test(CSS) && /--zi:/.test(CSS) && /--cang:/.test(CSS), '朱 / 金 / 青 / 紫 / 苍五色齐备');

/* ---------- 12. 体积汇总 ---------- */
out('');
out('=== 12. 体积汇总 ===');
out('  首屏（大厅）      : ' + (HUB.length / 1024).toFixed(1) + ' KB');
out('  共享样式 / 脚本   : ' + (CSS.length / 1024).toFixed(1) + ' KB / ' + (SJS.length / 1024).toFixed(1) + ' KB');
out('  修仙模拟器        : ' + (xiuxianBuf.length / 1024).toFixed(1) + ' KB（单文件）');
out('  星际裂隙          : ' + (rogueBytes / 1024).toFixed(1) + ' KB（' + roguePairs.length + ' 个文件）');
out('  两款游戏合计      : ' + ((xiuxianBuf.length + rogueBytes) / 1024).toFixed(1) + ' KB');

server.close();
out('');
out('================ 汇总 ================');
out('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
writeFileSync(OUT, L.join('\n'), 'utf8');
if (fail) process.exitCode = 1;
