"use strict";
/* ============ music.js: 背景音乐(4 首循环播放) ============ */
const MUSIC_FILES = [
  'Mick-Gordon-The-Only-Thing-They-Fear-Is-You-_qmms.mp3',
  'f3dd_1430_0cce_c6fb480f9f29aa63e3c519c13a0036d1.mp3',
  'obj_wo3DlMOGwrbDjj7DisKw_58306575680_06fe_f615_0b.mp3',
  'obj_wo3DlMOGwrbDjj7DisKw_58312220665_854f_ad48_fa.mp3',
];
let musicIdx = 0;
let musicEl = null;
let musicVolPct = 60;   // 滑块百分比 0~100,默认 60
let musicVolume = volumeFromPct(musicVolPct);   // 实际音量 0~1(线性+对数取中值)
function volumeFromPct(p){
  const x = Math.max(0, Math.min(100, p)) / 100;
  const logCurve = Math.log10(1 + 9*x);   // 对数段:0→0,100→1
  return (x + logCurve) / 2;   // 线性与对数取中值
}
function initMusic(){
  try{
    musicEl = new Audio();
    musicEl.addEventListener('ended', ()=>{
      musicIdx = (musicIdx+1) % MUSIC_FILES.length;
      musicEl.src = MUSIC_FILES[musicIdx];
      musicEl.volume = musicVolume;
      musicEl.play().catch(()=>{});
    });
  }catch(e){ musicEl = null; }
  try{
    const m = parseInt(localStorage.getItem('ra_music_idx'),10);
    if(!isNaN(m) && m>=0 && m<MUSIC_FILES.length) musicIdx = m;
  }catch(e){}
  try{
    const vol = parseFloat(localStorage.getItem('ra_volume'));
    if(!isNaN(vol) && vol>=0 && vol<=100){ musicVolPct = vol; musicVolume = volumeFromPct(vol); }
  }catch(e){}
  if(musicEl) musicEl.volume = musicVolume;
  updateMusicUI();
}
function playMusic(){
  if(!musicEl) return;
  musicEl.volume = musicVolume;
  if(musicEl.paused || musicEl.ended){
    musicEl.src = MUSIC_FILES[musicIdx % MUSIC_FILES.length];
    musicEl.play().catch(()=>{});
  }
}
function setMusicVolume(v){
  const pct = Math.max(0, Math.min(100, Number(v)||0));
  musicVolPct = pct;
  musicVolume = volumeFromPct(pct);
  if(musicEl) musicEl.volume = musicVolume;
  try{ localStorage.setItem('ra_volume', String(pct)); }catch(e){}
  updateMusicUI();
}
// 手动选择播放哪一首(音乐1~4)
function selectMusic(i){
  if(!musicEl) initMusic();
  musicIdx = ((i % MUSIC_FILES.length) + MUSIC_FILES.length) % MUSIC_FILES.length;
  try{ localStorage.setItem('ra_music_idx', String(musicIdx)); }catch(e){}
  if(musicEl){
    musicEl.src = MUSIC_FILES[musicIdx];
    musicEl.volume = musicVolume;
    musicEl.play().catch(()=>{});
  }
  updateMusicUI();
}
function updateMusicUI(){
  const vol = Math.round(musicVolPct);
  const slider = document.getElementById('musicVolume');
  if(slider) slider.value = String(vol);
  const volLabel = document.getElementById('musicVolLabel');
  if(volLabel) volLabel.textContent = String(vol);
  const picks = document.querySelectorAll('[data-music-pick]');
  for(const b of picks){
    const i = parseInt(b.getAttribute('data-music-pick'),10);
    if(i===musicIdx) b.classList.add('sel'); else b.classList.remove('sel');
  }
}
// 浏览器自动播放限制:首次任意点击时开播
function startMusicOnFirstClick(){
  window.removeEventListener('pointerdown', startMusicOnFirstClick);
  playMusic();
}
window.addEventListener('pointerdown', startMusicOnFirstClick);
