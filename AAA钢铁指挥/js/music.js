"use strict";
/* ============ music.js: 背景音乐(4 首循环播放) ============ */
const MUSIC_FILES = [
  'Mick-Gordon-The-Only-Thing-They-Fear-Is-You-_qmms.mp3',
  'f3dd_1430_0cce_c6fb480f9f29aa63e3c519c13a0036d1.mp3',
  'obj_wo3DlMOGwrbDjj7DisKw_58306575680_06fe_f615_0b.mp3',
  'obj_wo3DlMOGwrbDjj7DisKw_58312220665_854f_ad48_fa.mp3',
];
let musicOn = true;
let musicIdx = 0;
let musicEl = null;
function initMusic(){
  try{
    musicEl = new Audio();
    musicEl.addEventListener('ended', ()=>{
      if(!musicOn) return;
      musicIdx = (musicIdx+1) % MUSIC_FILES.length;
      musicEl.src = MUSIC_FILES[musicIdx];
      musicEl.play().catch(()=>{});
    });
  }catch(e){ musicEl = null; }
  try{ musicOn = localStorage.getItem('ra_music') !== 'off'; }catch(e){}
  try{
    const m = parseInt(localStorage.getItem('ra_music_idx'),10);
    if(!isNaN(m) && m>=0 && m<MUSIC_FILES.length) musicIdx = m;
  }catch(e){}
  updateMusicUI();
}
function playMusic(){
  if(!musicOn || !musicEl) return;
  if(musicEl.paused || musicEl.ended){
    musicEl.src = MUSIC_FILES[musicIdx % MUSIC_FILES.length];
    musicEl.play().catch(()=>{});
  }
}
function setMusic(on){
  musicOn = !!on;
  try{ localStorage.setItem('ra_music', musicOn ? 'on' : 'off'); }catch(e){}
  if(musicOn){
    if(!musicEl) initMusic();
    playMusic();
  } else if(musicEl){
    musicEl.pause();
  }
  updateMusicUI();
}
function toggleMusic(){ setMusic(!musicOn); }
// 手动选择播放哪一首(音乐1~4)
function selectMusic(i){
  if(!musicEl) initMusic();
  musicIdx = ((i % MUSIC_FILES.length) + MUSIC_FILES.length) % MUSIC_FILES.length;
  try{ localStorage.setItem('ra_music_idx', String(musicIdx)); }catch(e){}
  if(!musicOn){ musicOn = true; try{ localStorage.setItem('ra_music','on'); }catch(e){} }
  if(musicEl){
    musicEl.src = MUSIC_FILES[musicIdx];
    musicEl.play().catch(()=>{});
  }
  updateMusicUI();
}
function updateMusicUI(){
  const btns = document.querySelectorAll('[data-music-toggle]');
  for(const b of btns) b.textContent = musicOn ? '背景音乐：开' : '背景音乐：关';
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
