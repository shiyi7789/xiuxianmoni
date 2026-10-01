/* =========================================================
   icons.js — 内联 SVG 图标集（v3.3）
   ---------------------------------------------------------
   为什么要有这个文件：
   之前界面上的"图标"全是 Unicode 字符（⚡ 🔥 ☢ 🛡 ❄ ☣ …）。问题在于
   ⚡🔥☣☀ 在 Android / iOS 会被渲染成**彩色 emoji**，在 Windows 上又是单色字形
   —— 同一个界面在三台设备上像三个游戏。这是最容易被感知到的"拼凑感"。

   约定：
   1) 全部 24×24 视框、线性描边（stroke-width 1.75）、currentColor 上色
   2) 只提供两种东西：`SVG_ICONS`（名字 → 路径）与 `svgIcon()` / `iconHtml()`
   3) 零外部请求（不引图标字体、不引 img）
   4) 新增图标只改这一个文件；渲染方一律走 iconHtml()，不要在别处拼 <svg>

   ⚠ 本文件是经典 <script>，与其它模块共用全局作用域 → 顶层标识符必须全局唯一。
   ========================================================= */
'use strict';

const SVG_ICON_SIZE = 20;

/* 只存"内部绘制"，外层 <svg> 由 svgIcon() 统一包 —— 保证线宽/端点/填充策略一致 */
const SVG_ICONS = {
  /* ---------- 八条武器线 ---------- */
  main:    '<path d="M12 21V6"/><path d="M7 11l5-6 5 6"/><path d="M9.5 21h5"/>',
  laser:   '<path d="M12 3v14"/><path d="M8 20h8"/><path d="M9.5 6h5"/>',
  spread:  '<path d="M12 21V9"/><path d="M12 9L6 3M12 9l6-6M12 9L4.5 6.5M12 9l7.5-2.5"/>',
  missile: '<path d="M12 21V7"/><path d="M8.5 10.5L12 3l3.5 7.5"/><path d="M9 17l-2.5 3M15 17l2.5 3"/>',
  drone:   '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9" ry="4.5"/>',
  arc:     '<path d="M13 2.5L5.5 13H11l-1 8.5L18.5 11H13z"/>',
  boomer:  '<path d="M4.5 5l6 14 3.5-6.5 5.5 5"/>',
  black:   '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>',

  /* ---------- 卡牌类别（卡面按 tag 出图，取代 52 个字符图标） ---------- */
  tag_weapon:  '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  tag_passive: '<path d="M12 3l7 3v6c0 5-3 7.5-7 9-4-1.5-7-4-7-9V6z"/>',
  tag_trigger: '<path d="M12 3v18M3 12h18M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>',
  tag_cost:    '<path d="M12 3l7 4.5v9L12 21l-7-4.5v-9z"/><path d="M12 9v6"/>',
  tag_util:    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.4 5.4l2 2M16.6 16.6l2 2M18.6 5.4l-2 2M7.4 16.6l-2 2"/>',
  tag_build:   '<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>',
  tag_rhythm:  '<path d="M2.5 12h3.5l2-6 3.5 12 2.5-6h7"/>',
  tag_elem:    '<path d="M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',
  tag_active:  '<path d="M7 4.5l12 7.5-12 7.5z"/>',
  tag_evo:     '<path d="M12 2.5l3 5.5 6 1.5-4.2 4.3 1 6.2-5.8-3-5.8 3 1-6.2L3 9.5l6-1.5z"/>',

  /* ---------- 五个主动/技能入口 ---------- */
  dash:  '<path d="M4.5 5.5l6.5 6.5-6.5 6.5"/><path d="M13 5.5L19.5 12 13 18.5"/>',
  bomb:  '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  slow:  '<path d="M7 3h10M7 21h10"/><path d="M7 3c0 4.5 5 5.5 5 9s-5 4.5-5 9"/><path d="M17 3c0 4.5-5 5.5-5 9s5 4.5 5 9"/>',
  phase: '<path d="M12 2.5l8 4.8v9.4l-8 4.8-8-4.8V7.3z"/><circle cx="12" cy="12" r="2.2"/>',
  lance: '<path d="M12 2.5v15"/><path d="M12 21.5l-3-4.5h6z"/><path d="M8 5.5h8"/>',

  /* ---------- 机库三条升级线 ---------- */
  line_hull:   '<path d="M12 3l7 3v6c0 5-3 7.5-7 9-4-1.5-7-4-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  line_fire:   '<path d="M12 21V7"/><path d="M7.5 11.5L12 6l4.5 5.5"/><path d="M7.5 16.5L12 11l4.5 5.5"/>',
  line_engine: '<path d="M3.5 12h9"/><path d="M9 7.5l4.5 4.5L9 16.5"/><path d="M16.5 7.5v9M20 9v6"/>',

  /* ---------- 界面构件 ---------- */
  menu:     '<path d="M4 7h16M4 12h16M4 17h16"/>',
  codex:    '<path d="M5 4.5A2 2 0 017 2.5h12v19H7a2 2 0 01-2-2z"/><path d="M9 7h6M9 11h6"/>',
  settings: '<path d="M3.5 7h9M17 7h3.5M3.5 17h4M11.5 17h9"/><circle cx="14.5" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',

  /* ---------- 六元素（原来是 ⚡❄🔥☣◉☀，其中 4 个会变彩色 emoji） ---------- */
  elem_thunder: '<path d="M13 2.5L5.5 13H11l-1 8.5L18.5 11H13z"/>',
  elem_ice:     '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8"/>',
  elem_fire:    '<path d="M12 2.5s4.5 4.5 4.5 9a4.5 4.5 0 11-9 0c0-2.6 1.6-4.6 2.6-6.2.9 1.6 1.9 1.6 1.9-.2z"/>',
  elem_toxin:   '<path d="M12 2.5s6 6.8 6 11a6 6 0 11-12 0c0-4.2 6-11 6-11z"/><circle cx="12" cy="14" r="1.8"/>',
  elem_void:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
  elem_light:   '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1"/>',
};

/** 生成一个内联 SVG 图标。name 未登记时返回空串（调用方用 iconHtml 兜底） */
function svgIcon(name, size, cls) {
  const body = SVG_ICONS[name];
  if (!body) return '';
  const s = size || SVG_ICON_SIZE;
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" width="' + s + '" height="' + s +
    '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"' +
    ' aria-hidden="true" focusable="false">' + body + '</svg>';
}

/** 有图标就出图标；没有就原样吐回文字 —— 让"还没换完的字符"优雅降级而不是变空白 */
function iconHtml(name, size, cls) {
  const s = svgIcon(name, size, cls);
  return s || String(name == null ? '' : name);
}

/* 卡牌类别 → 图标。60 张卡的旧字符图标里有 12 个是真 emoji（🛡☢⚡❤️🍀🎯💥📈🔪🧲🚀⏱），
   与其画 52 个一次性图标，不如按 tag 归一成 9 个 —— 顺带让卡面能被"扫"而不是被"读"。 */
const TAG_ICON_KEY = {
  '武器': 'tag_weapon', '被动': 'tag_passive', '触发': 'tag_trigger', '代价': 'tag_cost',
  '功能': 'tag_util', '构筑': 'tag_build', '节奏': 'tag_rhythm', '元素': 'tag_elem', '主动': 'tag_active',
  '进化': 'tag_evo',
};
/** 武器卡用武器自己的图标（id 形如 w_laser），其余按 tag 出图 */
function cardIconName(u) {
  if (!u) return '';
  const id = u.id || '';
  if (id.indexOf('w_') === 0 && SVG_ICONS[id.slice(2)]) return id.slice(2);
  return TAG_ICON_KEY[u.tag] || 'tag_util';
}
function cardIconHtml(u, size) { return svgIcon(cardIconName(u), size || 22); }

/** 把页面上 [data-icon] 占位的元素填成真 SVG。
    icons.js 在 <body> 末尾加载，此时静态 DOM 已解析完毕；无头测试环境里
    querySelectorAll 返回空数组，这里自然变成空操作。 */
function hydrateIcons(root) {
  const scope = root || document;
  if (!scope || !scope.querySelectorAll) return;
  const list = scope.querySelectorAll('[data-icon]');
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    const html = svgIcon(el.getAttribute('data-icon'), Number(el.getAttribute('data-icon-size')) || SVG_ICON_SIZE);
    if (html) el.innerHTML = html;
  }
}
hydrateIcons();
