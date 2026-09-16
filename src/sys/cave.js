import { S, busy } from '../core/state.js';
import { clamp, num } from '../core/utils.js';
import { CAVE_BY_KEY, CAVE_FACILITIES, CAVE_OFFLINE_BASE, CAVE_OFFLINE_MIN_MS } from '../data/cave.js';
import { addLog, toast } from './log.js';
import { advance } from './time.js';
import { addMaterial } from './craft.js';
import { after } from '../ui/render.js';

/* =========================================================
   洞 府 —— 逻辑层
   ---------------------------------------------------------
   设计要点（改之前先读）：
   1. 五处设施：灵田（灵草）· 聚灵阵（修速+凝石）· 丹房（成丹率）
      · 器坊（成器率）· 静室（离线上限）
   2. 升级消耗灵石 + 天数（天数走 advance，与出门打怪形成节奏竞争）
   3. 离线收益由 lastTick 差值折算，上限 = 8 + 静室等级×2 小时；
      超出部分**丢弃**（不打折），这样升静室才有意义
   4. 洞府归本局（S.cave），轮回清零
   5. 老存档首次读取时 lastTick 设为当前时刻 —— **不给白嫖**
   ========================================================= */

/* ---------- 安全访问 ---------- */
export function caveEnsure(){
  if(!S) return null;
  if(!S.cave || typeof S.cave !== 'object') S.cave = { facs:{}, lastTick: Date.now() };
  if(!S.cave.facs || typeof S.cave.facs !== 'object') S.cave.facs = {};
  if(typeof S.cave.lastTick !== 'number' || S.cave.lastTick <= 0) S.cave.lastTick = Date.now();
  return S.cave;
}
export function cvFacDef(k){ return CAVE_BY_KEY[k] || null; }
export function cvFacMax(k){ const f = cvFacDef(k); return f ? f.max : 0; }

export function cvFacLv(k){
  const c = caveEnsure();
  if(!c) return 0;
  return clamp(Math.floor(Number(c.facs[k]) || 0), 0, cvFacMax(k));
}
export function cvTotalLv(){
  let n = 0;
  for(const f of CAVE_FACILITIES) n += cvFacLv(f.k);
  return n;
}
export function cvTotalMax(){
  let n = 0;
  for(const f of CAVE_FACILITIES) n += f.max;
  return n;
}

/* ---------- 升级 ---------- */
export function cvUpgradeCost(k){
  const f = cvFacDef(k);
  if(!f) return null;
  const lv = cvFacLv(k);
  if(lv >= f.max) return null;
  return f.cost(lv + 1);
}
export function cvUpgrade(k){
  if(!S) return false;
  if(busy()){ toast('此刻无暇整修洞府'); return false; }
  const f = cvFacDef(k);
  if(!f) return false;
  const lv = cvFacLv(k);
  if(lv >= f.max){ toast('此设施已至圆满'); return false; }
  const cost = f.cost(lv + 1);
  if(S.stones < cost.stones){ toast('灵石不足（需 '+num(cost.stones)+'）'); return false; }
  S.stones -= cost.stones;
  advance(cost.days);
  caveEnsure().facs[k] = lv + 1;
  addLog('你整修「'+f.n+'」，已至 '+(lv+1)+' 级——'+cvFacSummary(f, lv+1)+'。','act');
  after();
  return true;
}

/* ---------- 效果汇总 ---------- */
export function cvBonus(){
  const z = { cult:0, stone:0, herb:0, pillRate:0, gearRate:0, offlineCap:0 };
  if(!S || !S.cave) return z;
  for(const f of CAVE_FACILITIES){
    const lv = cvFacLv(f.k);
    if(!lv) continue;
    const e = f.eff(lv);
    for(const k in e) if(z[k] !== undefined) z[k] += e[k];
  }
  z.cult     = +z.cult.toFixed(1);
  z.herb     = +z.herb.toFixed(2);
  z.pillRate = +z.pillRate.toFixed(3);
  z.gearRate = +z.gearRate.toFixed(3);
  return z;
}

/* ---------- 离线结算 ---------- */
/* 可累积时长上限（小时） */
export function cvOfflineCapHours(){ return CAVE_OFFLINE_BASE + cvBonus().offlineCap; }
export function cvOfflineCapMs(){ return cvOfflineCapHours() * 3600 * 1000; }

/* 返回 null（无需结算）或一份 report。调用方负责弹面板。 */
export function cvSettleOffline(){
  const c = caveEnsure();
  if(!c || !S) return null;
  const now = Date.now();
  const elapsed = now - c.lastTick;
  c.lastTick = now;                                  /* 先写回，无论是否结算都不重复计入 */
  if(!(elapsed >= CAVE_OFFLINE_MIN_MS)) return null; /* 短于 1 分钟（含时钟回拨）不算 */

  const capMs = cvOfflineCapMs();
  const usedMs = Math.min(elapsed, capMs);
  const capped = elapsed > capMs;
  const hours = usedMs / 3600000;

  const b = cvBonus();
  const report = { elapsedMs: elapsed, hours, capped, herb:0, stone:0 };

  if(b.herb > 0){
    report.herb = Math.floor(b.herb * hours);
    if(report.herb > 0) addMaterial('lingcao', report.herb);
  }
  if(b.stone > 0){
    report.stone = Math.floor(b.stone * hours);
    if(report.stone > 0){
      S.stones += report.stone;
      if(S.stat) S.stat.stones = (S.stat.stones||0) + report.stone;
    }
  }
  if(report.herb === 0 && report.stone === 0) return null;
  return report;
}

/* ---------- 文案 ---------- */
export function cvFacSummary(f, lv){
  if(!lv) return '未 建';
  const e = f.eff(lv);
  const parts = [];
  if(e.herb)       parts.push('灵草 '+e.herb.toFixed(2)+' /时');
  if(e.stone)      parts.push('灵石 '+e.stone+' /时');
  if(e.cult)       parts.push('修速 +'+e.cult+'%');
  if(e.pillRate)   parts.push('成丹 +'+Math.round(e.pillRate*100)+'%');
  if(e.gearRate)   parts.push('成器 +'+Math.round(e.gearRate*100)+'%');
  if(e.offlineCap) parts.push('离线上限 +'+e.offlineCap+' 时');
  return parts.join(' · ');
}
export function cvFacName(k){ const f = cvFacDef(k); return f ? f.n : k; }

export function cvFmtDuration(ms){
  const mins = Math.floor(ms / 60000);
  if(mins < 60) return mins + ' 分';
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if(hh < 24) return hh + ' 时 ' + mm + ' 分';
  return Math.floor(hh / 24) + ' 日 ' + (hh % 24) + ' 时';
}

/* ---------- 存档进出 ---------- */
export function cvSanitize(d){
  const out = { facs:{}, lastTick: Date.now() };
  if(!d || typeof d !== 'object') return out;
  const src = (d.facs && typeof d.facs === 'object') ? d.facs : {};
  for(const f of CAVE_FACILITIES){
    const v = Math.floor(Number(src[f.k]) || 0);
    if(v > 0) out.facs[f.k] = clamp(v, 0, f.max);
  }
  /* 未来的时间戳一律丢弃（系统时钟被改时 now - lastTick 会变负数） */
  if(typeof d.lastTick === 'number' && d.lastTick > 0 && d.lastTick <= Date.now() + 86400000){
    out.lastTick = d.lastTick;
  }
  return out;
}

/* 存档输出：lastTick 打上「此刻」，使离线时长 = 从最后活跃到下次打开的间隔。
   若沿用旧值，玩家在线挂机数小时后刷新也会算成离线收益 —— 这是可刷的漏洞。 */
export function cvSnapshot(){
  const c = caveEnsure();
  if(!c) return { facs:{}, lastTick: Date.now() };
  return { facs: Object.assign({}, c.facs), lastTick: Date.now() };
}
