import { audioDebug, audioHud, audioMix, audioOn, audioSetMix } from '../../audio/core.js';
import { audioPreview } from '../../audio/events.js';
import { closeModal, showModal } from '../modal.js';
import { uiKV, uiSec } from '../kit.js';

/* =========================================================
   音 频 设 置（面板）
   ---------------------------------------------------------
   四条混音 + 静音 + 逐个试听 + 实时诊断读数（见 音频设计.md §10）
   注意：滑条用 oninput（不是 onchange）——
     `regression-test.js` 会回放所有 inline onclick/change 处理器，
     而滑条处理器依赖 this.value，回放时 this 不是滑条 → 用 oninput 天然规避。
   ========================================================= */

const AU_SLIDERS = [
  ['master', '总 音 量', '一切声音的总闸'],
  ['music',  '音 乐',    '生成式自适应配乐（drone / 古琴 / 磬 / 脉冲）'],
  ['sfx',    '音 效',    '战斗、修炼、获得与界面点击（界面音随此档）'],
  ['amb',    '环 境',    '秘境风声等氛围层']
];

/* oninput 回调：只改标签，不重建面板 —— 否则拖到一半节点被换掉 */
export function auUiSet(k, v){
  const pct = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  audioSetMix(k, pct / 100);
  try{
    const el = document.getElementById('auVal-' + k);
    if(el) el.textContent = pct + '%';
  }catch(e){}
}
export function auUiMute(){ audioSetMix('mute'); openAudioPanel(); }
export function auUiPreview(k){ audioPreview(k); openAudioPanel(); }

export function openAudioPanel(){
  const m = audioMix();
  const on = audioOn();
  const g = audioDebug();

  let h = uiKV([
    ['音 效 状 态', on ? '<b>已开启</b>' : '<b class="warnc">已静音</b>'],
    ['音频引擎', g.ready ? ('运行中（' + g.state + '）') : '未启用（此环境无 Web Audio）'],
    ['当前空间', g.zone === 'cave' ? '洞窟 · 长混响' : (g.zone === 'hall' ? '居所 · 中混响' : '开阔 · 轻混响')],
    ['活动声部', g.voices.total + ' / ' + g.cap + '　<span class="muted-sm">音乐 ' + g.voices.music + '</span>']
  ]);
  h += '<div class="meta-note">混音实时生效并随存档保留。'
    + '音效全部由 Web Audio 现场合成——<b>不加载任何音频文件</b>，所以这个页面依然零外部请求。</div>';

  h += uiSec('混 音', '四档：总音量 / 音乐 / 音效 / 环境。');
  for(const [k, nm, d] of AU_SLIDERS){
    h += '<div class="kv-r" style="align-items:center">'
      + '<span class="k" style="flex:0 0 96px">' + nm + '</span>'
      + '<input type="range" min="0" max="100" step="1" value="' + Math.round(m[k] * 100) + '"'
      + ' style="flex:1 1 auto;accent-color:var(--zhu)"'
      + ' aria-label="' + nm + '"'
      + ' oninput="auUiSet(\'' + k + '\', this.value)">'
      + '<span class="v" id="auVal-' + k + '" style="flex:0 0 46px;text-align:right">' + Math.round(m[k] * 100) + '%</span>'
      + '</div>'
      + '<div class="hint-mini" style="margin:0 0 6px 0">' + d + '</div>';
  }

  h += uiSec('试 听', '点一下听听各层的音色取向。');
  h += '<div class="btnrow" style="margin-top:0">'
    + '<button class="btn btn-sm" onclick="auUiPreview(\'amb\')">环 境 · 秘 境</button>'
    + '<button class="btn btn-sm" onclick="auUiPreview(\'ui\')">界 面 · 点 击</button>'
    + '<button class="btn btn-sm" onclick="auUiPreview(\'sfx\')">获 得 · 宝 品</button>'
    + '<button class="btn btn-sm" onclick="auUiPreview(\'music\')">音 乐 · 动 机</button>'
    + '</div>';

  h += uiSec('诊 断', '开发者用：实时声部数、音乐速度与参数。');
  h += uiKV([
    ['已播放 / 丢弃', g.played + ' 次 / ' + g.dropped + ' 次'],
    ['参 数', '紧张 ' + g.params.tension.toFixed(2) + '　境界 ' + g.params.clarity.toFixed(2)
      + '　深度 ' + g.params.depth.toFixed(2) + '　气血 ' + g.params.vitality.toFixed(2)]
  ]);
  h += '<div class="btnrow">'
    + '<button class="btn btn-sm" onclick="audioHud()">开 关 开 发 者 浮 层</button>'
    + '</div>';

  const btns = [{ label: (on ? '静 音' : '开 启 音 效'), fn: auUiMute },
                { label:'关 闭', primary:true, fn: closeModal }];
  showModal('音 声 · 设 置', h, btns, 'wide', { sub: on ? '已开启' : '已静音' });
}
