/* =========================================================
   修仙模拟器 · 文字版
   ========================================================= */

/* ---------------- 基础工具 ---------------- */
export const $ = s => document.getElementById(s);
export const ri = (a,b) => a + Math.floor(Math.random()*(b-a+1));
export const rf = (a,b) => a + Math.random()*(b-a);
export const pick = a => a[Math.floor(Math.random()*a.length)];
export const chance = p => Math.random()*100 < p;
export const clamp = (v,a,b) => v<a?a:(v>b?b:v);

export function num(n){
  n = Math.floor(n);
  if(n < 10000) return String(n);
  if(n < 1e8) return (n/1e4).toFixed(n<1e5?2:1).replace(/\.0+$/,'') + '万';
  return (n/1e8).toFixed(2).replace(/\.0+$/,'') + '亿';
}
