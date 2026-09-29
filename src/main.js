import { loadMeta, saveMeta } from './core/meta.js';
import { load, save } from './core/save.js';
import { newGame } from './core/state.js';
import { checkAch } from './sys/achievement.js';
import { UID } from './sys/character.js';
import { cvSettleOffline } from './sys/cave.js';
import { checkTitles } from './sys/titles.js';
import { audioBoot, audioSyncState } from './audio/core.js';
import { audioPlay } from './audio/events.js';
import { musicStart, musicSyncState } from './audio/music.js';
import { fbClearAll, fbInitAudio } from './ui/feedback.js';
import { cvShowOfflineReport } from './ui/panels/cave.js';
import { noticeAccepted, showNotice } from './ui/panels/notice.js';
import { renderAll } from './ui/render.js';
import { applyTheme, watchSystemTheme } from './ui/theme.js';


/* =========================================================
   启动
   ========================================================= */
(function boot(){
  UID = 900000;
  applyTheme();
  watchSystemTheme();
  loadMeta();

  /* 读档 / 新号 + 离线结算
     结算必须在 renderAll 之前——它会改灵石与材料，先算后画才能一次画对 */
  let offlineReport = null;
  if(load()){
    offlineReport = cvSettleOffline();
    renderAll();
  }else{
    newGame();
  }

  /* 首次进入：先请玩家阅读游玩声明（点「我已知晓」后才记录） */
  if(!noticeAccepted()) showNotice();
  /* 老玩家回归：补发历史上其实已经达成的成就 */
  const got = checkAch();
  /* 称号与成就共用 achAgg()，紧跟成就之后扫一次（新号也会拿到「初 学」） */
  const tGot = checkTitles();
  if(got.length || tGot.length) renderAll();
  /* 闭关归来：放在声明与成就之后，免得打断它们 */
  if(offlineReport) cvShowOfflineReport(offlineReport);

  /* 音频必须等用户先动一次手（浏览器自动播放策略）：
     解锁上下文 → 起乐 → 按当前游戏状态定音乐段与参数
     （音频引擎本身在启动时就建好了，见文件末尾；没有 AudioContext 时全程静默降级） */
  const fbWake = () => {
    fbInitAudio();
    audioSyncState();
    musicStart();
    musicSyncState();
    document.removeEventListener('click', fbWake);
    document.removeEventListener('touchstart', fbWake);
  };
  document.addEventListener('click', fbWake);
  document.addEventListener('touchstart', fbWake);

  /* 全局点击音：只挑「可点元素」发一声轻 tick（gain 压到 0.62），
     动作本身的音效由各系统自己发 —— 两层叠加才有"手感"，但绝不能盖过主音 */
  document.addEventListener('click', (e) => {
    try{
      const t = e && e.target;
      if(!t || !t.closest) return;
      const hit = t.closest('.btn,.mbtn,.card,.tab,.chip,.slot .r,.bagrow2 button,.sclose');
      if(!hit) return;
      audioPlay(hit.classList && hit.classList.contains('tab') ? 'ui.tab' : 'ui.click', { gain:0.62 });
    }catch(x){}
  }, true);

  /* 导入存档等场景：清掉残留的反馈浮层，免得盖在新档上 */
  window.__fbClearAll = fbClearAll;
  window.addEventListener('beforeunload', () => { try{ save(); saveMeta(); }catch(e){} });
})();

/* 音频引擎随启动建好（幂等；无 AudioContext 时静默降级） */
audioBoot();
