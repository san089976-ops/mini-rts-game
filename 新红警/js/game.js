"use strict";
/* ============ game.js: 游戏流程与主循环 ============ */
function setupGame(){
  units=[]; buildings=[]; projectiles=[]; effects=[]; texts=[]; selected=[]; selBuilding=null; placing=null;
  trackMarks=[];
  paused=false;
  if(selling) setSelling(false);
  keys={};
  mouse.down=false; mouse.dragging=false; mouse.downOnCanvas=false; mouse.mmDown=false;
  document.getElementById('pauseOv').classList.remove('show');
  gameOver=null; overTimer=0; time=0;
  document.getElementById('overlay').classList.remove('show');
  // 同步队伍数组与资金
  teamFactions = gameTeams.map(t=>t.faction);
  teamGroups = gameTeams.map(t=>t.group);
  teamColors = gameTeams.map(t=>t.color!==undefined ? t.color : (t.group===0?6:3));
  playerFaction = teamFactions[0];
  credits = gameTeams.map((t,i)=> i===0 ? ((t.startMoney!==undefined ? t.startMoney : 10000)) : 3500);
  researches = {};
  for(let i=0;i<gameTeams.length;i++) researches[i] = {};
  controlGroups = {};   // 每局清空数字编队
  genTerrain();
  // 布置所有队伍:自制地图按保存的数据放建筑/单位;其余地图出生点上方空地生成初始单位
  if(gameSetup.map.custom==='edited'){
    placeMapEntities(gameSetup.map);
  } else {
    for(let i=0;i<gameTeams.length;i++){
      const [bx,by] = gameTeams[i].spawn;
      placeBuilding(i,'command',bx,by);
      if(i===0) placeBuilding(i,'power',bx+3,by-1);
      units.push(new Unit('infantry',i,bx*TILE+TILE/2,(by-1)*TILE+TILE/2));
      units.push(new Unit('infantry',i,(bx+1)*TILE+TILE/2,(by-1)*TILE+TILE/2));
      units.push(new Unit('harvester',i,(bx+2)*TILE+TILE/2,(by-1)*TILE+TILE/2));
    }
  }
  // 兜底:有出生点但该队没有建造厂时自动补一个
  ensureTeamCommands();
  initAI();
  updatePanel();
  const [bx0,by0] = gameTeams[0].spawn;
  centerOn(bx0*TILE, by0*TILE);
}
function restartGame(){
  document.getElementById('overlay').classList.remove('show');
  setupGame();
}
function startGame(){
  gameSetup = buildGameSetup();
  gameTeams = gameSetup.teams;
  document.getElementById('menu').classList.add('hidden');
  setupGame();
}
function showMenu(){
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

/* ================= 主循环 ================= */
function resize(){
  const rs = Math.max(window.devicePixelRatio || 1, RENDER_SCALE);
  const cw = window.innerWidth, ch = window.innerHeight - 150;
  canvas.width = cw * rs; canvas.height = ch * rs;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(rs, 0, 0, rs, 0, 0);
  cam.x=clamp(cam.x,0,W-cw); cam.y=clamp(cam.y,0,H-ch);
  if(mmCv) mmRect=mmCv.getBoundingClientRect();
}
function frame(ts){
  const dt=Math.min(0.05,(ts-(frame.last||ts))/1000);
  frame.last=ts;
  frameCount++;
  if(ts-lastFpsT>=500 && fpsEl){ fpsEl.textContent=(frameCount*1000/(ts-lastFpsT))|0; frameCount=0; lastFpsT=ts; }
  if(paused){ render(); requestAnimationFrame(frame); return; }   // 暂停:只保留画面,逻辑冻结
  // 相机控制
  const pan=560;
  let mx=0,my=0;
  if(keys['KeyA']||keys['ArrowLeft']) mx=-1;
  if(keys['KeyD']||keys['ArrowRight']) mx=1;
  if(keys['KeyW']||keys['ArrowUp']) my=-1;
  if(keys['KeyS']||keys['ArrowDown']) my=1;
  if(mx===0 && mouse.edge) mx=mouse.edge.x;
  if(my===0 && mouse.edge) my=mouse.edge.y;
  cam.x=clamp(cam.x+mx*pan*dt,0,W-viewW());
  cam.y=clamp(cam.y+my*pan*dt,0,H-viewH());
  if(aiState && !gameOver){
    for(let t=1;t<gameTeams.length;t++){
      if(gameTeams[t].ai) updateAI(dt, t);
    }
  }
  update(dt);
  if(shake>0.05) shake*=Math.pow(0.001,dt); else shake=0;
  render();
  requestAnimationFrame(frame);
}
function pauseGame(){
  if(gameOver || !buildings.length) return;
  paused=true;
  document.getElementById('pauseOv').classList.add('show');
}
function resumeGame(){
  paused=false;
  document.getElementById('pauseOv').classList.remove('show');
}
function quitToMenu(){
  paused=true;   // 冻结后台逻辑,避免隐藏的战场上继续运行
  document.getElementById('pauseOv').classList.remove('show');
  showMenu();
}

window.addEventListener('error', e=>{
  const ov=document.getElementById('overlay');
  ov.classList.add('show');
  document.getElementById('ovTitle').textContent='出错啦';
  document.getElementById('ovSub').style.fontSize='14px';
  document.getElementById('ovSub').style.whiteSpace='pre-wrap';
  document.getElementById('ovSub').textContent=String((e.message||'')+' @'+(e.lineno||'?')+':'+(e.colno||'?')+' '+String(e.filename||''));
});
/* ================= 启动 ================= */
window.addEventListener('load',()=>{
  canvas=document.getElementById('main');
  ctx=canvas.getContext('2d');
  mmCv=document.getElementById('minimap');
  mmCtx=mmCv.getContext('2d');
  fpsEl=document.getElementById('fps');
  preloadImages();
  initMusic();               // 背景音乐(4 首循环,可在设置里关)
  resize();
  window.addEventListener('resize',resize);
  setupInput();
  buildMenu(true);         // 生成菜单:地图/队伍/预览(内部会生成地图)
  loadCustomMaps(()=>buildMenu(true));   // 加载 map/index.js 列出的自制地图后刷新地图列表
  autoScanStored();                       // 若有已保存的 map 文件夹句柄,自动扫描刷新(尽力而为)
  requestAnimationFrame(frame);
});
