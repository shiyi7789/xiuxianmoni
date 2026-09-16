# 修仙模拟器 · 文字版

一款**单文件、零依赖、纯离线**的文字修仙放置游戏，外加一个响应式落地页站点。

从炼气一层走到天道，共 **13 大境界 41 层**。打坐吐纳攒修为，冲击境界求突破，斩妖入秘境换一身法器，
再修一部**功法**——被动运转三部、主动备下两式，各带冷却与护体/冰封/灼烧/吸血之效，取舍由你。
斩妖探秘所得**材料**，还能在坊市丹房与器坊里炼成丹药、炼出法器：坊市刷不出仙品武器，但你可以反复炼。
再经营一座**洞府**——五处设施各管一条线，**关掉网页灵田与聚灵阵仍在运转**，回来收一次「闭关归来」。

- **无需注册**：进度存在浏览器 `localStorage`，不上传任何服务器
- **离线可玩**：游戏本体是一个约 261 KB 的单文件 HTML，另存即用
- **无第三方请求**：没有字体 CDN、没有统计脚本、没有广告
- **移动优先**：窄屏下页签变底部导航，道体与背包收进上滑抽屉

---

## 目录结构

```
├─ src/                      ← ★ 日常改这里（47 个 ES 模块，见「开发日志.md」）
│  ├─ core/                  ← 工具 / 状态 / 元进度 / 存档
│  ├─ data/                  ← 纯数据表（装备·境界·妖兽·秘境·成就·奇遇·功法·材料·配方·洞府）
│  ├─ sys/                   ← 玩法系统（修炼·突破·战斗·秘境·坊市·轮回·功法·材料炼制·洞府…）
│  ├─ ui/                    ← 渲染 / 弹层 / 主题 / 抽屉 / 面板
│  ├─ style/index.css        ← 全部样式与设计令牌
│  ├─ template/              ← HTML 外壳（head / body / 脚本头尾）
│  └─ manifest.json          ← 模块拼接顺序（加新模块要登记在这里）
│
├─ xiuxian.html              ← ★ 构建产物（单文件成品，**不要手改**）
├─ scripts/
│  ├─ build.mjs              ← 零依赖构建：src/ → xiuxian.html（可 `--check` 做「一字未改」校验）
│  ├─ release.mjs            ← 一键发版（内部先跑 build）
│  ├─ verify-site.mjs        ← 上线前自检（74 项 HTTP / SEO / a11y / 性能 / 部署配置）
│  └─ connect-github.ps1     ← 一键连远端仓库
│
├─ site/                     ← ★ 发布单元，各平台上线这个目录
│  ├─ index.html             ← 响应式落地页
│  ├─ xiuxian.html           ← 游戏本体副本（由发版脚本自动同步）
│  ├─ version.json           ← 版本清单（sha256 + 字节数），实时更新的触发点
│  ├─ _headers               ← 缓存与安全响应头（Cloudflare Pages / Netlify）
│  └─ 404.html / robots.txt / sitemap.xml
│
├─ regression-test.js        ← 游戏逻辑回归测试（169 项断言，固定随机种子）
├─ 开发日志.md                ← 架构决策、改动历史、给下一个 AI 的交接说明
├─ vercel.json               ← Vercel 配置（outputDirectory: site）
└─ 部署指引.md                ← 部署与「实时更新」完整指引
```

---

## 本地运行

项目零依赖、零构建**运行**，直接用浏览器打开 `site/index.html` 即可。
改代码时的流程是「改 `src/` → 构建 → 刷新浏览器」：

```bash
# 把 src/ 的模块拼回单文件 xiuxian.html（零依赖，不需要 npm install）
node scripts/build.mjs

# 若需模拟真实服务器（fetch('version.json') 在 file:// 下会被 CORS 拦），起一个静态服务
node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,s)=>{let u=decodeURIComponent(new URL(q.url,'http://x').pathname);if(u==='/')u='/index.html';const fp=p.join('site',u);f.readFile(fp,(e,d)=>{if(e){s.writeHead(404);s.end('404');return}s.writeHead(200,{'content-type':{'html':'text/html','json':'application/json','xml':'application/xml'}[fp.split('.').pop()]||'application/octet-stream'}).end(d)})}).listen(8080,()=>console.log('http://127.0.0.1:8080'))"
```

然后访问 <http://127.0.0.1:8080>。

---

## 开发与验证

```bash
# 构建（src/ → xiuxian.html）
node scripts/build.mjs

# 游戏逻辑回归测试（169 项断言）
node regression-test.js xiuxian.html 回归测试结果.txt

# 站点质量自检（74 项，会本地起服务并真实抓取页面）
node scripts/verify-site.mjs
```

两套测试都必须 **0 失败** 才提交。回归测试的做法是：抽出游戏 `<script>`，用 `new Function` 注入自制 DOM/BOM 桩，
跑断言、**回放全部内联 `onclick` 处理器**，并**固定随机种子**（`XX_SEED` 环境变量可换一条随机路径）：

```bash
XX_SEED=9999 node regression-test.js xiuxian.html 回归测试结果.txt   # 复现某条随机路径
```

> 为什么不用打包器：本游戏的分发形态是「一个 HTML 文件、双击即用」。`scripts/build.mjs` 只做一件事——
> 把 `src/` 的模块按 `manifest.json` 的顺序拼回一个 `<script>` 并重新内联 CSS。构建**零依赖**，
> 不需要 `npm install`，也因此不会让 Vercel 误判成前端框架项目（详见 `开发日志.md`）。

---

## 发版流程

改完 `src/` 之后：

```bash
# 1) 构建 + 同步到站点 + 重算 sha256 写入 version.json + 回填首页版本号 + 刷 sitemap
node scripts/release.mjs "本次更新说明"

# 2) 自检
node scripts/verify-site.mjs

# 3) 推送（触发平台自动部署）
git add -A
git commit -m "release: 本次更新说明"
git push
```

> **`release.mjs` 是「实时更新」的唯一触发点。** 它内部先跑构建，再把 sha256 写进 `site/version.json`；
> 忘了跑，线上文件会更新，但已经打开页面的访客收不到升级提示。

---

## 部署

发布单元是 `site/` 目录，目标域名 **<https://xiuxianmoni.me>**（阿里云注册，DNS 在阿里云云解析）。

| 平台 | Build command | 输出 / 发布目录 | 需要备案 |
|---|---|---|---|
| Vercel（推荐） | 留空 | 已由根目录 `vercel.json` 声明 `outputDirectory: site` | 否 |
| Cloudflare Pages | 留空 | `site`（需把域名 NS 迁到 Cloudflare） | 否 |
| Netlify | 留空 | `site` | 否 |
| GitHub Pages | 见 `.github/workflows/pages.yml` | 由 Actions 打包 `site/` | 否 |
| 阿里云 OSS / CDN / ECS | — | — | **需要 ICP 备案** |

> **不需要服务器。** 本站没有后端——游戏逻辑全部在浏览器里执行，存档存在访客本机的 `localStorage`，
> 服务端零存储、零数据库。因此只需**免费静态托管**（CDN 边缘节点直接返回文件），
> 不必购买 ECS / VPS / 虚拟主机，选用海外平台时也无需 ICP 备案。
>
> 选 Vercel 的原因：根域名按 DNS 规范不能用 CNAME（RFC 1034），Vercel 提供标准 **A 记录**，
> 因此可以保留阿里云的 NS 与现有解析记录，改动最小。域名绑定的完整步骤（含 DNS 记录表、
> 备案判断、验证命令）见 [`部署指引.md`](./部署指引.md) 第 4 步。

### 「更新即实时生效」需要三段机制同时成立

1. **部署触发**：`git push` → 平台自动重新发布
2. **缓存策略**：HTML 必须 `Cache-Control: public, max-age=0, must-revalidate`；
   `version.json` 必须 `no-store`（写在 `site/_headers` 与根 `vercel.json`）
3. **前端版本探测**：落地页每 60 秒轮询 `version.json`，版本变化即弹出「发现新版本」提示条

> ⚠️ **GitHub Pages 无法自定义响应头**，其 HTML 默认缓存约 10 分钟，
> 因此更新最长会有 10 分钟延迟，机制 2 失效。要真正实时，请用 Cloudflare Pages / Vercel 连接同一仓库。

完整指引（含三条上线路径、检查清单、回滚、排错表）见 [`部署指引.md`](./部署指引.md)。

---

## 授权

仅供个人游玩与学习使用。
