"use strict";
/* ============ menu.js: 主菜单(地图/队伍/分组/颜色/资金/出生点) ============ */
const START_MONEY_OPTS = [5000,10000,20000,30000,50000,100000];
let menuState = {
  mapChoice: {kind:'builtin', idx:0},          // 当前选中地图: {kind:'custom',file,id} 或 {kind:'builtin',idx}
  startMoney: 10000,             // 我方开局资金(难度)
  openDrop: null,                // 当前展开的下拉: 'money' | 'group-i' | 'color-i'
  spawnIdx: [0,1,2,3,4,5,6,7],   // 每队(最多8)选中的出生点下标,不可重复
  spawnTarget: 0,                // 出生点放置模式:当前操作的队伍
  playerFaction: 'allies',
  compFactions: ['soviet','soviet','soviet','soviet','soviet','soviet','soviet'],
  groups: [1,1,1,1,1,1,1],       // 电脑所在组 0=A(与玩家同盟,蓝)/1..3=敌对(红)
  compDiffs: ['easy','easy','easy','easy','easy','easy','easy'],  // 电脑难度
  colors: [6,3,2,8,4,1,5,7],     // 每队所选颜色下标(最多8)
  compCount: 1,                  // 内置地图可选的电脑数(总队伍=compCount+1,最大8)
};
let customMapsLoaded = false;

/* ============ 队伍数:内置地图可选 2~8;自制地图由出生点数决定(固定) ============ */
function teamCount(){
  const m=currentMap();
  if(m && m.custom==='edited' && Array.isArray(m.spawns)){
    const c = m.spawns.length;
    return (c>=2 && c<=8) ? c : 2;
  }
  return Math.max(2, Math.min(8, (menuState.compCount||0)+1));
}
function isCustomMap(){ const m=currentMap(); return !!(m && m.custom==='edited'); }
/* 让每队各占一个出生点(不可重复);空位自动补剩余点 */
function initSpawnIdx(){
  const n=teamCount();
  const spawns=getSpawns(n);
  for(let i=0;i<n;i++){
    const si=menuState.spawnIdx[i];
    if(si===null || si===undefined || si<0 || si>=spawns.length) menuState.spawnIdx[i]=null;
  }
  const seen=new Set();
  for(let i=0;i<n;i++){
    if(menuState.spawnIdx[i]!==null){
      if(seen.has(menuState.spawnIdx[i])) menuState.spawnIdx[i]=null;
      else seen.add(menuState.spawnIdx[i]);
    }
  }
  const free=[]; for(let j=0;j<spawns.length;j++) if(!seen.has(j)) free.push(j);
  let fi=0;
  for(let i=0;i<n;i++){
    if(menuState.spawnIdx[i]===null){
      menuState.spawnIdx[i] = free[fi]!==undefined ? free[fi] : (i % Math.max(1,spawns.length));
      seen.add(menuState.spawnIdx[i]);
      if(free[fi]!==undefined) fi++;
    }
  }
}

/* ============ 加载 map 文件夹的地图(map/index.js 给出文件名,逐个注入) ============ */
function loadCustomMaps(done){
  window.CUSTOM_MAPS = window.CUSTOM_MAPS || [];
  const idx = window.CUSTOM_MAPS_INDEX || [];
  if(!idx.length){ customMapsLoaded=true; if(done) done(); return; }
  let remaining = idx.length;
  for(const name of idx){
    const start = window.CUSTOM_MAPS.length;
    const s=document.createElement('script');
    s.src='map/'+name;
    s.onload=()=>{
      for(let i=start;i<window.CUSTOM_MAPS.length;i++){ const m=window.CUSTOM_MAPS[i]; if(m && !m._file) m._file=name; }
      remaining--; if(remaining<=0){ customMapsLoaded=true; if(done) done(); }
    };
    s.onerror=()=>{ remaining--; if(remaining<=0){ customMapsLoaded=true; if(done) done(); } };
    document.head.appendChild(s);
  }
}

/* ============ 模式选择页(登陆页) ============ */
function enterSkirmish(){
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  buildMenu(true);
}
function comingSoon(){
  document.getElementById('soonOv').classList.add('show');
}
function closeSoon(){
  document.getElementById('soonOv').classList.remove('show');
}

/* ============ 帮助弹层 ============ */
function openHelp(){ document.getElementById('helpOv').classList.add('show'); }
function closeHelp(){ document.getElementById('helpOv').classList.remove('show'); }
/* ============ 设置弹层(主菜单左上角/暂停页) ============ */
function openSettings(){ document.getElementById('settingsOv').classList.add('show'); updateMusicUI(); }
function closeSettings(){ document.getElementById('settingsOv').classList.remove('show'); }

/* ============ 出生点分配辅助 ============ */

function buildGameSetup(){
  const n = teamCount();
  const map = currentMap();
  const spawns = getSpawns(n);
  initSpawnIdx();
  // 按出生点下标给每队分配点位(不可重复)
  const used=new Set();
  const assign=[];
  for(let i=0;i<n;i++){
    const si=menuState.spawnIdx[i];
    if(si!==null && si>=0 && si<spawns.length && !used.has(si)){ assign[i]=spawns[si]; used.add(si); }
    else assign[i]=null;
  }
  const free=[]; for(let j=0;j<spawns.length;j++) if(!used.has(j)) free.push(j);
  let fi=0;
  for(let i=0;i<n;i++){
    if(!assign[i]){
      const sp = free[fi]!==undefined ? spawns[free[fi]] : (SPAWN_POINTS[n] ? SPAWN_POINTS[n][i] : null);
      assign[i] = (sp && sp[0]!==undefined) ? [sp[0], sp[1]] : [8+i*8, 8];
      if(free[fi]!==undefined) fi++;
    }
  }
  const teams=[];
  teams.push({name:'玩家', faction:menuState.playerFaction, group:0, ai:false, color:menuState.colors[0], startMoney:menuState.startMoney, spawn:assign[0]||[8,8]});
  for(let i=1;i<n;i++){
    teams.push({name:'电脑'+i, faction:menuState.compFactions[i-1], group:menuState.groups[i-1], ai:true,
      color:menuState.colors[i], diff:menuState.compDiffs[i-1], spawn:assign[i]||[8+i,8]});
  }
  return { map, teams };
}

function selectMap(i){
  menuState.mapChoice = {kind:'builtin', idx:i};
  buildMenu(true);
}
function setCompCount(n){
  menuState.compCount=n;   // n=电脑数量(总队伍=n+1,最大8)
  menuState.spawnTarget=Math.min(menuState.spawnTarget, Math.max(0,n));
  initSpawnIdx();
  buildMenu(true);
}
function setTeamFaction(i,fac){
  if(i===0) menuState.playerFaction=fac;
  else menuState.compFactions[i-1]=fac;
  buildMenu(false);
}
function setSpawnTarget(i){
  menuState.spawnTarget=i;
  buildMenu(false);
}
function setSpawn(teamIdx, pointIdx){
  // 若该点已被其它队占用,把占用的队清空
  const other=menuState.spawnIdx.indexOf(pointIdx);
  if(other!==-1 && other!==teamIdx) menuState.spawnIdx[other]=null;
  menuState.spawnIdx[teamIdx]=pointIdx;
  normalizeSpawns();
  buildMenu(false);
}
function normalizeSpawns(){
  const n=teamCount();
  const spawns=getSpawns(n);
  const used=new Set();
  for(let i=0;i<n;i++){
    const v=menuState.spawnIdx[i];
    if(v!==null && v>=0 && v<spawns.length && !used.has(v)){ used.add(v); }
    else menuState.spawnIdx[i]=null;
  }
  let k=0;
  for(let i=0;i<n;i++){
    if(menuState.spawnIdx[i]===null){
      while(k<spawns.length && used.has(k)) k++;
      if(k<spawns.length){ menuState.spawnIdx[i]=k; used.add(k); }
    }
  }
}

function buildMenu(regen){
  if(regen){ gameSetup=buildGameSetup(); genTerrain(); }
  renderMapChoice();
  renderMoneyRow();
  renderTeamRows();
  renderSpawnButtons();
  renderMenuPreview();
}

function renderMapChoice(){
  const el=document.getElementById('mapChoice');
  if(!el) return;
  const m=currentMap();
  el.textContent = (m.custom==='edited' ? '📄 ' : '内置 · ') + (m.name||'未命名');
}

function renderMoneyRow(){
  const el=document.getElementById('moneyRow');
  if(!el) return;
  el.innerHTML='<div class="setrow"><span class="tname">开局资金(我方)</span>'+moneyDropHTML()+'</div>';
}

function renderMapCards(){
  const el=document.getElementById('mapCards');
  if(!el) return;
  el.innerHTML='';
}

/* ============ 地图浏览(文件列表样式,来源 map 文件夹 + 内置) ============ */
let pendingMapChoice = null;
function esc(s){ return String(s).replace(/[<>&"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
function openMapBrowser(){
  pendingMapChoice = menuState.mapChoice;
  renderMapFileList();
  document.getElementById('mapBrowser').classList.add('show');
}
function renderMapFileList(){
  const el=document.getElementById('mapFileList');
  el.innerHTML='';
  const list = window.CUSTOM_MAPS || [];
  if(!list.length){
    const p=document.createElement('div');
    p.className='mapEmpty';
    p.textContent='map 文件夹还没有地图。点「扫描 map 文件夹」读取,或打开地图编辑器绘制并保存。';
    el.appendChild(p);
  } else {
    for(const m of list){
      const row=document.createElement('div');
      row.className='mapFileRow';
      row._file = m._file;
      row._cid = m.id;
      row.innerHTML='<span class="mfIcon">📄</span><span class="mfName">'+esc(m._file || ((m.name||m.id||'未命名')+'.js'))+'</span>';
      row.onclick=()=>{
        for(const r of el.children) r.classList.remove('sel');
        row.classList.add('sel');
        pendingMapChoice={kind:'custom', file:m._file, id:m.id};
      };
      el.appendChild(row);
    }
  }
  const sep=document.createElement('div');
  sep.className='mapSep';
  sep.textContent='— 内置地图(程序生成) —';
  el.appendChild(sep);
  MAPS.forEach((m,i)=>{
    const row=document.createElement('div');
    row.className='mapFileRow';
    row._bidx=i;
    row.innerHTML='<span class="mfIcon">🗺</span><span class="mfName">内置 · '+esc(m.name)+'</span>';
    row.onclick=()=>{
      for(const r of el.children) r.classList.remove('sel');
      row.classList.add('sel');
      pendingMapChoice={kind:'builtin', idx:i};
    };
    el.appendChild(row);
  });
  // 高亮当前已选
  const cur=menuState.mapChoice;
  if(cur){
    for(const r of el.querySelectorAll('.mapFileRow')){
      if(cur.kind==='custom' && (r._file && cur.file && r._file===cur.file)){ r.classList.add('sel'); }
      else if(cur.kind==='custom' && (!cur.file || cur.file===cur.id) && r._cid===cur.id){ r.classList.add('sel'); }
      else if(cur.kind==='builtin' && r._bidx===cur.idx){ r.classList.add('sel'); }
    }
  }
}
function confirmMapChoice(){
  if(!pendingMapChoice) return;
  menuState.mapChoice = pendingMapChoice;
  pendingMapChoice=null;
  closeMapBrowser();
  buildMenu(true);
}
function closeMapBrowser(){
  pendingMapChoice=null;
  document.getElementById('mapBrowser').classList.remove('show');
}

/* ============ 扫描 map 文件夹(文件系统访问 API,Chrome/Edge) ============ */
let mapDirHandle = null;
function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open('minira_mapdb',1); r.onupgradeneeded=()=>{ r.result.createObjectStore('kv'); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function idbGet(key){ try{ const db=await idbOpen(); return await new Promise((res,rej)=>{ const tx=db.transaction('kv','readonly').objectStore('kv').get(key); tx.onsuccess=()=>res(tx.result); tx.onerror=()=>rej(tx.error); }); }catch(e){ return null; } }
async function idbSet(key,val){ try{ const db=await idbOpen(); await new Promise((res,rej)=>{ const tx=db.transaction('kv','readwrite').objectStore('kv').put(val,key); tx.onsuccess=res; tx.onerror=()=>rej(tx.error); }); }catch(e){} }
async function readMapsFromHandle(h){
  const maps=[];
  for await (const [name, fh] of h.entries()){
    if(!name.endsWith('.js') || name==='index.js') continue;
    try{
      const file=await fh.getFile();
      const text=await file.text();
      const prev=window.CUSTOM_MAPS||[];
      window.CUSTOM_MAPS=[];
      (0,eval)(text);
      const m=window.CUSTOM_MAPS && window.CUSTOM_MAPS[0];
      window.CUSTOM_MAPS=prev;
      if(m){ m._file=name; maps.push(m); }
    }catch(e){}
  }
  maps.sort((a,b)=>String(a._file).localeCompare(String(b._file)));
  return maps;
}
async function writeMapIndex(h, names){
  try{
    names=names.filter(n=>n && n.endsWith('.js') && n!=='index.js').sort();
    const fh=await h.getFileHandle('index.js',{create:true});
    const w=await fh.createWritable();
    await w.write('window.CUSTOM_MAPS_INDEX='+JSON.stringify(names)+';\n');
    await w.close();
  }catch(e){}
}
async function scanMapFolder(){
  if(!('showDirectoryPicker' in window)){ alert('当前浏览器不支持直接读取文件夹,请用 Chrome/Edge,或在地图编辑器里保存(自动生成 index.js)。'); return; }
  try{
    const h=await window.showDirectoryPicker();
    mapDirHandle=h;
    const maps=await readMapsFromHandle(h);
    if(maps.length){ window.CUSTOM_MAPS=maps; }
    else { window.CUSTOM_MAPS=[]; }
    await writeMapIndex(h, maps.map(m=>m._file));   // 顺手刷新 index.js,下次启动自动生效
    await idbSet('dirHandle', h);
    customMapsLoaded=true;
    setMenuStatus('已扫描 map 文件夹: '+maps.length+' 张地图');
    // 若当前正打开弹层则刷新列表
    if(document.getElementById('mapBrowser').classList.contains('show')){
      pendingMapChoice = menuState.mapChoice;
      renderMapFileList();
    }
    buildMenu(true);
  }catch(e){ if(e && e.name!=='AbortError') setMenuStatus('扫描失败: '+e.message); }
}
// 启动时若有已保存的文件夹句柄,自动扫描刷新(不用手动重新连接;无用户手势时可能被浏览器拒,失败则保留 index.js 的列表)
async function autoScanStored(){
  const h=await idbGet('dirHandle');
  if(!h) return;
  mapDirHandle=h;
  try{
    if(h.queryPermission && (await h.queryPermission({mode:'read'}))!=='granted'){
      if(h.requestPermission){ try{ await h.requestPermission({mode:'read'}); }catch(e){} }
    }
    const maps=await readMapsFromHandle(h);
    if(maps.length){ window.CUSTOM_MAPS=maps; }
    customMapsLoaded=true;
  }catch(e){}
  buildMenu(true);
}
function setMenuStatus(s){
  const el=document.getElementById('status');
  if(el) el.textContent=s;
}

function teamRowHTML(name, fac, teamIdx, compIdx){
  const row=document.createElement('div');
  row.className='trow';
  const fc=(f)=>'<button class="facBtn'+(fac===f?' sel':'')+'" onclick="setTeamFaction('+teamIdx+',\''+f+'\')">'+(f==='allies'?'盟军':'苏军')+'</button>';
  let h='<span class="tname">'+name+'</span>'+fc('allies')+fc('soviet');
  if(compIdx!==null){
    // 分组 A/B/C/D 下拉(与玩家同组=同盟,其余=敌对)
    h+='<span class="tname">分组</span>'+groupDropHTML(compIdx);
    // 电脑难度下拉(简单/中等/残酷,中等与残酷会研发实验室科技)
    h+='<span class="tname">难度</span>'+diffDropHTML(compIdx);
  } else {
    h+='<span class="tname" style="color:#9fd0b0">组 A(蓝)</span>';
  }
  // 颜色下拉(9种)
  h+='<span class="tname">颜色</span>'+colorDropHTML(teamIdx);
  row.innerHTML=h;
  return row;
}

/* ============ 下拉选择表(资金 / 分组 / 颜色) ============ */
function toggleDrop(key){
  menuState.openDrop = (menuState.openDrop===key) ? null : key;
  buildMenu(false);
}
function selectDrop(key, val){
  if(key==='money') menuState.startMoney=val;
  else if(key.indexOf('group-')===0) menuState.groups[parseInt(key.slice(6),10)]=val;
  else if(key.indexOf('color-')===0) menuState.colors[parseInt(key.slice(6),10)]=val;
  else if(key.indexOf('diff-')===0) menuState.compDiffs[parseInt(key.slice(5),10)]=val;
  menuState.openDrop=null;
  buildMenu(false);
}
// 点击下拉之外:只关闭状态,不立即重建(避免打断同一次点击里的其它按钮,如“开始游戏”)
document.addEventListener('click', e=>{
  if(menuState.openDrop && !(e.target.closest && e.target.closest('.dd'))){
    menuState.openDrop=null;
  }
}, true);

function moneyDropHTML(){
  const key='money';
  const open=menuState.openDrop===key;
  let list='';
  if(open){
    for(const amt of START_MONEY_OPTS){
      list+='<button class="ddOpt'+(amt===menuState.startMoney?' sel':'')+'" onclick="selectDrop(\''+key+'\','+amt+')">$'+amt.toLocaleString()+'</button>';
    }
  }
  return '<div class="dd">'
    +'<button class="ddTrig" onclick="toggleDrop(\''+key+'\')">开局资金 $'+menuState.startMoney.toLocaleString()+' <span class="ddCaret">'+(open?'▲':'▼')+'</span></button>'
    +(open?'<div class="ddList grid2">'+list+'</div>':'')
    +'</div>';
}
function groupDropHTML(compIdx){
  const key='group-'+compIdx;
  const g=menuState.groups[compIdx];
  const open=menuState.openDrop===key;
  let list='';
  if(open){
    for(let grp=0;grp<4;grp++){
      const tag=grp===0?'同盟':'敌对';
      list+='<button class="ddOpt'+(grp===g?' sel':'')+'" onclick="selectDrop(\''+key+'\','+grp+')">组 '+('ABCD'[grp])+' · '+tag+'</button>';
    }
  }
  return '<div class="dd">'
    +'<button class="ddTrig" onclick="toggleDrop(\''+key+'\')">组 '+('ABCD'[g])+' <span class="ddCaret">'+(open?'▲':'▼')+'</span></button>'
    +(open?'<div class="ddList">'+list+'</div>':'')
    +'</div>';
}
const DIFF_LABEL = { easy:'简单', medium:'中等', brutal:'残酷' };
function diffDropHTML(compIdx){
  const key='diff-'+compIdx;
  const d=menuState.compDiffs[compIdx];
  const open=menuState.openDrop===key;
  let list='';
  if(open){
    for(const v in DIFF_LABEL){
      list+='<button class="ddOpt'+(v===d?' sel':'')+'" onclick="selectDrop(\''+key+'\',\''+v+'\')">'+DIFF_LABEL[v]+'</button>';
    }
  }
  return '<div class="dd">'
    +'<button class="ddTrig" onclick="toggleDrop(\''+key+'\')">'+DIFF_LABEL[d]+' <span class="ddCaret">'+(open?'▲':'▼')+'</span></button>'
    +(open?'<div class="ddList">'+list+'</div>':'')
    +'</div>';
}
function colorDropHTML(teamIdx){
  const key='color-'+teamIdx;
  const c=menuState.colors[teamIdx];
  const open=menuState.openDrop===key;
  const cc=TEAM_COLORS[c];
  let list='';
  if(open){
    for(let i=0;i<TEAM_COLORS.length;i++){
      list+='<button class="ddOpt colorOpt'+(i===c?' sel':'')+'" onclick="selectDrop(\''+key+'\','+i+')"><i class="sw" style="background:'+TEAM_COLORS[i].hex+'"></i>'+TEAM_COLORS[i].name+'</button>';
    }
  }
  return '<div class="dd">'
    +'<button class="ddTrig" onclick="toggleDrop(\''+key+'\')"><i class="sw swsm" style="background:'+cc.hex+'"></i>'+cc.name+' <span class="ddCaret">'+(open?'▲':'▼')+'</span></button>'
    +(open?'<div class="ddList grid3">'+list+'</div>':'')
    +'</div>';
}

function renderTeamRows(){
  const el=document.getElementById('teamRows');
  if(!el) return;
  el.innerHTML='';
  const n=teamCount();
  if(isCustomMap()){
    const c=document.createElement('div');
    c.className='trow';
    c.innerHTML='<span class="tname">队伍数</span><span style="color:#ffe27a">该地图固定 '+n+' 名玩家</span>';
    el.appendChild(c);
  } else {
    const cnt=document.createElement('div');
    cnt.className='trow cntrow';
    let cntHtml='<span class="tname">队伍数</span>';
    [2,3,4,5,6,7,8].forEach(nn=>{
      cntHtml+='<button class="facBtn'+(menuState.compCount===nn-1?' sel':'')+'" onclick="setCompCount('+(nn-1)+')">'+nn+'</button>';
    });
    cnt.innerHTML=cntHtml;
    el.appendChild(cnt);
  }
  el.appendChild(teamRowHTML('玩家', menuState.playerFaction, 0, null));
  for(let i=1;i<n;i++){
    el.appendChild(teamRowHTML('电脑'+i, menuState.compFactions[i-1], i, i-1));
  }
}

function renderSpawnButtons(){
  const el=document.getElementById('spawnSel');
  if(!el) return;
  el.innerHTML='';
  const n=teamCount();
  if(isCustomMap()){
    const h=document.createElement('div');
    h.className='teamHint';
    h.textContent='该地图固定 '+n+' 名玩家 · 先点下方玩家按钮,再点预览图上的出生点圆点分配点位(不可重复)';
    el.appendChild(h);
  }
  for(let i=0;i<n;i++){
    const b=document.createElement('button');
    b.className='spawnBtn'+(menuState.spawnTarget===i?' sel':'');
    b.style.borderColor=TEAM_COLORS[menuState.colors[i]].hex;
    b.textContent=(i===0?'玩家':'电脑'+i)+((i===0||menuState.groups[i-1]===0)?'(蓝)':'(红)');
    b.onclick=()=>setSpawnTarget(i);
    el.appendChild(b);
  }
}

function renderMenuPreview(){
  const cv=document.getElementById('mapPrev');
  if(!cv) return;
  const cw=cv.width, ch=cv.height;
  const g=cv.getContext('2d');
  // 等比包含缩放:直到长或宽任一边与画板等距(正方形/竖长图也能完整显示),并居中
  const s = Math.min(cw/MAP_W, ch/MAP_H);
  const ox = (cw - MAP_W*s)/2, oy = (ch - MAP_H*s)/2;
  g.fillStyle='#0a120c'; g.fillRect(0,0,cw,ch);
  for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++){
    const t=terrain[x][y];
    g.fillStyle = t==='water' ? '#22486e' : (t==='tree' ? '#1c3a24' : '#2a4a2e');
    g.fillRect(ox+x*s, oy+y*s, s+0.4, s+0.4);
  }
  // 金矿
  g.fillStyle='#d8b840';
  for(const o of oreFields) if(o.amount>0) g.fillRect(ox+o.x*s-1.5, oy+o.y*s-1.5, 3, 3);
  const n=teamCount();
  const spawns=getSpawns(n);
  spawns.forEach(([sx,sy],p)=>{
    const px=ox+(sx+0.5)*s, py=oy+(sy+0.5)*s;
    const owner=menuState.spawnIdx.indexOf(p);   // 哪个队占了该点(-1=空闲)
    const isActive=owner===menuState.spawnTarget;
    // 底座
    g.beginPath(); g.arc(px,py,7,0,Math.PI*2);
    g.fillStyle = owner!==-1 ? TEAM_COLORS[menuState.colors[owner]].hex : 'rgba(255,255,255,.22)';
    g.fill();
    g.lineWidth = isActive ? 2.6 : 1.3;
    g.strokeStyle = isActive ? '#ffffff' : 'rgba(255,255,255,.45)';
    g.stroke();
    // 编号/标签
    g.font='bold 8px sans-serif'; g.textAlign='center';
    g.fillStyle='rgba(0,0,0,.55)'; g.fillText(owner!==-1 ? (owner===0?'玩家':'电脑'+owner) : '空闲', px+1, py+17);
    g.fillStyle = (owner!==-1 && TEAM_COLORS[menuState.colors[owner]].hex==='#2a2d33') ? '#cfd8cf' : '#dfe8df';
    g.fillText(owner!==-1 ? (owner===0?'玩家':'电脑'+owner) : '空闲', px, py+16);
    // 组标记
    const grp = owner===0 ? 0 : (owner>0 ? menuState.groups[owner-1] : -1);
    if(owner!==-1){
      g.fillStyle='rgba(0,0,0,.7)';
      g.fillRect(px-9, py-9, 18, 9);
      g.fillStyle='#fff';
      g.fillText('组'+'ABCD'[grp], px, py-2);
    }
  });
  if(!cv._bound){
    cv._bound=true;
    cv.addEventListener('click', e=>{
      const r=cv.getBoundingClientRect();
      const s2 = Math.min(cw/MAP_W, ch/MAP_H);
      const o2x = (cw - MAP_W*s2)/2, o2y = (ch - MAP_H*s2)/2;
      const cx=(e.clientX-r.left-o2x)/s2, cy=(e.clientY-r.top-o2y)/s2;
      const sps=getSpawns(teamCount());
      let best=-1,bd=12;
      sps.forEach(([sx,sy],i)=>{ const d=Math.hypot(cx-sx-0.5,cy-sy-0.5); if(d<bd){bd=d;best=i;} });
      if(best!==-1) setSpawn(menuState.spawnTarget, best);
    });
  }
}
