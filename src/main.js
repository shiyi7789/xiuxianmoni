import { loadMeta, saveMeta } from './core/meta.js';
import { load, save } from './core/save.js';
import { newGame } from './core/state.js';
import { checkAch } from './sys/achievement.js';
import { UID } from './sys/character.js';
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
  if(!load()) newGame();
  else renderAll();
  /* 首次进入：先请玩家阅读游玩声明（点「我已知晓」后才记录） */
  if(!noticeAccepted()) showNotice();
  /* 老玩家回归：补发历史上其实已经达成的成就 */
  const got = checkAch();
  if(got.length) renderAll();
  window.addEventListener('beforeunload', () => { try{ save(); saveMeta(); }catch(e){} });
})();

