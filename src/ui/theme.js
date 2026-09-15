export const THEME_KEY = 'xiuxian_theme_v1';
export function systemDark(){
  try{ return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  catch(e){ return false; }
}
export function savedTheme(){
  let t = null;
  try{ t = localStorage.getItem(THEME_KEY); }catch(e){}
  return (t === 'light' || t === 'dark') ? t : null;
}
export function applyTheme(){
  const t = savedTheme() || (systemDark() ? 'dark' : 'light');
  try{
    if(document.documentElement) document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
  const b = $('themeBtn');
  if(b){
    b.textContent = (t === 'dark') ? '☀' : '☾';
    b.title = (t === 'dark') ? '切到宣纸（日间）' : '切到玄墨（夜间）';
  }
  return t;
}
export function toggleTheme(){
  const next = (document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark')
    ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyTheme();
  const b = $('themeBtn');
  if(b) b.title = (next === 'dark') ? '切到宣纸（日间）' : '切到玄墨（夜间）';
}
/* 未手动选过主题时，跟随系统变化 */
export function watchSystemTheme(){
  try{
    if(!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => { if(!savedTheme()) applyTheme(); };
    if(mq.addEventListener) mq.addEventListener('change', on);
    else if(mq.addListener) mq.addListener(on);
  }catch(e){}
}
