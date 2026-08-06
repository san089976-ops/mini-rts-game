"use strict";
/* ============ map-editor.js: 地图编辑器逻辑 ============ */
const EDIT = {
  map: null,            // 当前编辑的地图数据
  tool: 'terrain',      // terrain / ore / building / unit / spawn / select
  mat: 'grass',         // 地形材质: grass / tree / water
  bldPick: null,        // 待放置的建筑 defName
  unitPick: null,       // 待放置的单位 type
  spawnNum: 1,          // 出生点工具: 当前编号
  sel: null,            // 选中 {kind:'building'|'unit'|'spawn', idx}
  cell: 28,             // 一格像素
  zoom: 1,
  painting: false,
  dirHandle: null,
};

const UNIT_TYPES = ['infantry','tank','harvester','mcv','airfield_car','exo','magnet','abrams','t90','destroyer','transport','bradley','b11','marder','leclerc','leopard','challenger','puma'];
const UNIT_LABEL = { infantry:'步兵', tank:'坦克', harvester:'矿车', mcv:'基地车', airfield_car:'机场建筑车', exo:'外骨骼', magnet:'磁暴', abrams:'艾布拉姆', t90:'T90', destroyer:'驱逐舰', transport:'运输艇', bradley:'布拉德利', b11:'俄制B11', marder:'黄鼠狼', leclerc:'勒克莱尔', leopard:'豹2A4', challenger:'挑战者', puma:'美洲狮' };
let cv, g, ctx, selOverlay;

function $(id){ return document.getElementById(id); }

/* ============ 新建地图 ============ */
function newMap(){
  const w = clampNum(parseInt($('mapW').value,10)||32);
  const h = clampNum(parseInt($('mapH').value,10)||24);
  $('mapW').value=w; $('mapH').value=h;
  const terrain=[];
  for(let x=0;x<w;x++){ terrain[x]=[]; for(let y=0;y<h;y++) terrain[x][y]='grass'; }
  EDIT.map = { id:'', name:'未命名地图', width:w, height:h, custom:'edited', terrain, ores:[], buildings:[], units:[], spawns:[] };
  $('mapName').value = EDIT.map.name;
  EDIT.sel=null; EDIT.bldPick=null; EDIT.unitPick=null;
  setStatus('已新建地图 '+w+'x'+h);
  setZoomForSize(w,h);
  render();
}
function clampNum(v){ return Math.max(4, Math.min(220, Math.round(v)||4)); }
function setZoomForSize(w,h){
  const maxCanvas=2600;
  const need=Math.max(w,h)*EDIT.cell;
  let z = need<=maxCanvas ? 1 : (maxCanvas/need);
  z = z>1?1:(z>0.75?0.75:(z>0.5?0.5:(z>0.25?0.25:0.125)));
  EDIT.zoom=z;
  const sel=$('zoomSel'); if(sel) sel.value=String(z);
}
function resetSel(){ EDIT.sel=null; $('propBox').classList.add('hidden'); }

/* ============ 画布绘制 ============ */
function render(){
  const m = EDIT.map;
  if(!m) return;
  const cell = EDIT.cell*EDIT.zoom;
  cv.width = Math.max(320, m.width*cell);
  cv.height = Math.max(240, m.height*cell);
  g = ctx = cv.getContext('2d');
  // 地形
  for(let x=0;x<m.width;x++) for(let y=0;y<m.height;y++){
    const c = m.terrain[x][y];
    drawCell(x,y,c);
  }
  // 网格线
  g.strokeStyle='rgba(255,255,255,.08)'; g.lineWidth=1;
  g.beginPath();
  for(let x=0;x<=m.width;x++){ g.moveTo(x*cell+0.5,0); g.lineTo(x*cell+0.5,m.height*cell); }
  for(let y=0;y<=m.height;y++){ g.moveTo(0,y*cell+0.5); g.lineTo(m.width*cell,y*cell+0.5); }
  g.stroke();
  // 金矿
  for(const o of m.ores){
    const px=(o[0]+0.5)*cell, py=(o[1]+0.5)*cell;
    g.fillStyle='#d8b840';
    g.beginPath(); g.arc(px,py,cell*0.3,0,Math.PI*2); g.fill();
    g.fillStyle='#f4e070';
    g.beginPath(); g.arc(px-1,py-1,cell*0.14,0,Math.PI*2); g.fill();
  }
  // 建筑
  for(let i=0;i<m.buildings.length;i++){
    const b=m.buildings[i];
    const d=BLD_DEFS[b.def];
    if(!d) continue;
    const px=b.tx*cell, py=b.ty*cell, pw=d.w*cell, ph=d.h*cell;
    g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(px+2,py+2,pw,ph);
    g.fillStyle = teamHex(b.team) || d.color;
    g.fillRect(px,py,pw,ph);
    g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=1; g.strokeRect(px+0.5,py+0.5,pw-1,ph-1);
    g.fillStyle='#fff'; g.font='bold '+(cell*0.5)+'px "Microsoft YaHei"'; g.textAlign='center'; g.textBaseline='middle';
    const label = (d.w>=2&&d.h>=2) ? d.name : (d.name||d.def).charAt(0);
    g.fillText(label, px+pw/2, py+ph/2);
    if(b.team>=0) g.fillStyle='rgba(255,255,255,.85)';
    g.font='bold '+(cell*0.42)+'px sans-serif';
    g.fillText(b.team<0?'中':String(b.team+1), px+pw-cell*0.35, py+cell*0.42);
  }
  // 单位
  for(let i=0;i<m.units.length;i++){
    const u=m.units[i];
    const px=(u.x+0.5)*cell, py=(u.y+0.5)*cell;
    g.fillStyle='rgba(0,0,0,.35)'; g.beginPath(); g.arc(px+1,py+1,cell*0.34,0,Math.PI*2); g.fill();
    g.fillStyle=teamHex(u.team)||'#4f8ff0';
    g.beginPath(); g.arc(px,py,cell*0.34,0,Math.PI*2); g.fill();
    g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=1; g.stroke();
    g.fillStyle='#fff'; g.font='bold '+(cell*0.38)+'px "Microsoft YaHei"'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText((UNIT_LABEL[u.type]||u.type).charAt(0), px, py);
    g.font='bold '+(cell*0.3)+'px sans-serif';
    g.fillText(u.team<0?'中':String(u.team+1), px, py+cell*0.34);
  }
  // 出生点
  for(let i=0;i<m.spawns.length;i++){
    const s=m.spawns[i]; if(!s) continue;
    const px=(s[0]+0.5)*cell, py=(s[1]+0.5)*cell;
    g.fillStyle='rgba(0,0,0,.5)'; g.beginPath(); g.arc(px+1,py+1,cell*0.45,0,Math.PI*2); g.fill();
    g.fillStyle=teamHex(i)||'#ffffff';
    g.beginPath(); g.arc(px,py,cell*0.45,0,Math.PI*2); g.fill();
    g.strokeStyle='#fff'; g.lineWidth=2; g.stroke();
    g.fillStyle='#000'; g.font='bold '+(cell*0.5)+'px sans-serif'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(String(i+1), px+1, py+1);
    g.fillStyle='#fff'; g.fillText(String(i+1), px, py);
  }
  // 选中高亮
  if(EDIT.sel){
    g.strokeStyle='#ffe27a'; g.lineWidth=2;
    if(EDIT.sel.kind==='building'){
      const b=m.buildings[EDIT.sel.idx]; if(b){ const d=BLD_DEFS[b.def];
        g.strokeRect(b.tx*cell-2, b.ty*cell-2, d.w*cell+4, d.h*cell+4); }
    } else if(EDIT.sel.kind==='unit'){
      const u=m.units[EDIT.sel.idx]; if(u){ g.beginPath(); g.arc((u.x+0.5)*cell,(u.y+0.5)*cell,cell*0.45,0,Math.PI*2); g.stroke(); }
    } else if(EDIT.sel.kind==='spawn'){
      const s=m.spawns[EDIT.sel.idx]; if(s){ g.beginPath(); g.arc((s[0]+0.5)*cell,(s[1]+0.5)*cell,cell*0.55,0,Math.PI*2); g.stroke(); }
    }
  }
  $('mapInfo').textContent = m.width+' x '+m.height+' · 建筑'+m.buildings.length+' · 单位'+m.units.length+' · 金矿'+m.ores.length+' · 出生点'+m.spawns.length;
}
function drawCell(x,y,c){
  const cell=EDIT.cell*EDIT.zoom, px=x*cell, py=y*cell;
  if(c==='water'){
    g.fillStyle='#2a5a8a'; g.fillRect(px,py,cell,cell);
    g.fillStyle='rgba(255,255,255,.10)'; g.fillRect(px,py,cell,cell*0.35);
  } else if(c==='tree'){
    g.fillStyle='#3f8a4e'; g.fillRect(px,py,cell,cell);
    g.fillStyle='#4a3018'; g.fillRect(px+cell*0.44,py+cell*0.5,cell*0.12,cell*0.3);
    g.fillStyle='#2f7a3a'; g.beginPath(); g.arc(px+cell*0.5,py+cell*0.4,cell*0.28,0,Math.PI*2); g.fill();
  } else {
    g.fillStyle='#4a9a5a'; g.fillRect(px,py,cell,cell);
    g.fillStyle='rgba(0,0,0,.05)';
    if((x*7+y*13)%4===0) g.fillRect(px,py,cell,cell);
  }
}
function teamHex(t){
  if(t===undefined||t===null||t<0) return null;
  const c = TEAM_COLORS[t % TEAM_COLORS.length];
  return c ? c.hex : null;
}

/* ============ 画布交互 ============ */
function tileFromEvent(ev){
  const r=cv.getBoundingClientRect();
  const cell=EDIT.cell*EDIT.zoom;
  const x=Math.floor((ev.clientX-r.left)/cell);
  const y=Math.floor((ev.clientY-r.top)/cell);
  return [x,y];
}
function paintAt(tx,ty){
  const m=EDIT.map;
  if(!m||tx<0||ty<0||tx>=m.width||ty>=m.height) return;
  if(EDIT.tool==='terrain'){ m.terrain[tx][ty]=EDIT.mat; render(); return; }
  if(EDIT.tool==='ore'){
    const i=m.ores.findIndex(o=>o[0]===tx&&o[1]===ty);
    if(i>=0) m.ores.splice(i,1); else m.ores.push([tx,ty]);
    render(); return;
  }
}
function clickCanvas(ev){
  const m=EDIT.map; if(!m) return;
  const [tx,ty]=tileFromEvent(ev);
  if(tx<0||ty<0||tx>=m.width||ty>=m.height) return;
  const cell=EDIT.cell*EDIT.zoom;
  if(EDIT.tool==='terrain'||EDIT.tool==='ore'){ paintAt(tx,ty); return; }
  // 命中检测(建筑>单位>出生点)
  const bHit = m.buildings.findIndex(b=>{ const d=BLD_DEFS[b.def]; return d && tx>=b.tx && tx<b.tx+d.w && ty>=b.ty && ty<b.ty+d.h; });
  const uHit = m.units.findIndex(u=>u.x===tx && u.y===ty);
  const sHit = m.spawns.findIndex(s=>s[0]===tx && s[1]===ty);

  if(EDIT.tool==='select'){
    if(bHit>=0){ EDIT.sel={kind:'building',idx:bHit}; }
    else if(uHit>=0){ EDIT.sel={kind:'unit',idx:uHit}; }
    else if(sHit>=0){ EDIT.sel={kind:'spawn',idx:sHit}; }
    else resetSel();
    renderProp(); render(); return;
  }
  if(EDIT.tool==='building'){
    if(bHit>=0){ EDIT.sel={kind:'building',idx:bHit}; renderProp(); render(); return; }
    const d=EDIT.bldPick&&BLD_DEFS[EDIT.bldPick];
    if(!d){ setStatus('请先在右侧选一个建筑'); return; }
    if(tx+d.w>m.width||ty+d.h>m.height){ setStatus('超出地图边界'); return; }
    // 不与已有建筑重叠
    for(const b of m.buildings){ const dd=BLD_DEFS[b.def]; if(!dd) continue;
      if(tx < b.tx+dd.w && tx+d.w > b.tx && ty < b.ty+dd.h && ty+d.h > b.ty){ setStatus('与已有建筑重叠'); return; } }
    m.buildings.push({def:EDIT.bldPick, team:-1, tx, ty});
    EDIT.sel={kind:'building',idx:m.buildings.length-1};
    setStatus('已放置建筑 '+d.name);
    renderProp(); render(); return;
  }
  if(EDIT.tool==='unit'){
    if(uHit>=0){ EDIT.sel={kind:'unit',idx:uHit}; renderProp(); render(); return; }
    if(!EDIT.unitPick){ setStatus('请先在右侧选一个单位'); return; }
    m.units.push({type:EDIT.unitPick, team:-1, x:tx, y:ty});
    EDIT.sel={kind:'unit',idx:m.units.length-1};
    setStatus('已放置单位 '+UNIT_LABEL[EDIT.unitPick]);
    renderProp(); render(); return;
  }
  if(EDIT.tool==='spawn'){
    if(sHit>=0){ EDIT.sel={kind:'spawn',idx:sHit}; renderProp(); render(); return; }
    m.spawns.push([tx,ty]);
    const sidx=m.spawns.length-1;
    autoCommandForSpawn(sidx, tx, ty);   // 出生点自动给该玩家一个建造厂
    EDIT.sel={kind:'spawn',idx:sidx};
    setStatus('已放置出生点 #'+m.spawns.length+(autoCommandForSpawn.lastPlaced?'(已自动放置其建造厂)':''));
    renderProp(); render(); return;
  }
}
/* 在出生点为中心放该玩家的建造厂(3x3);被地图占用则跳过 */
function autoCommandForSpawn(sidx, sx, sy){
  const m=EDIT.map;
  const d=BLD_DEFS['command'];
  const btx=sx-Math.floor(d.w/2), bty=sy-Math.floor(d.h/2);
  autoCommandForSpawn.lastPlaced=false;
  if(btx<0 || bty<0 || btx+d.w>m.width || bty+d.h>m.height) return;
  for(const b of m.buildings){ const dd=BLD_DEFS[b.def]; if(dd && btx < b.tx+dd.w && btx+d.w > b.tx && bty < b.ty+dd.h && bty+d.h > b.ty) return; }
  m.buildings.push({def:'command', team:sidx, tx:btx, ty:bty, _auto:true, _spawnAt:[sx,sy]});
  autoCommandForSpawn.lastPlaced=true;
}

/* ============ 属性编辑(选中建筑/单位/出生点) ============ */
function renderProp(){
  const box=$('propBox');
  const m=EDIT.map;
  if(!EDIT.sel){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const el=$('propContent');
  const s=EDIT.sel;
  let title='';
  if(s.kind==='building'){
    const b=m.buildings[s.idx];
    if(!b){ resetSel(); return; }
    title=(BLD_DEFS[b.def]?BLD_DEFS[b.def].name:b.def)+' (占地'+(BLD_DEFS[b.def]?BLD_DEFS[b.def].w:1)+'x'+(BLD_DEFS[b.def]?BLD_DEFS[b.def].h:1)+')';
  } else if(s.kind==='unit'){
    const u=m.units[s.idx]; if(!u){ resetSel(); return; }
    title=UNIT_LABEL[u.type]||u.type;
  } else {
    const sp=m.spawns[s.idx]; if(!sp){ resetSel(); return; }
    title='出生点';
  }
  let h='<div class="propTitle">'+title+'</div>';
  h+='<div class="propRow"><span>所属玩家</span></div>';
  h+='<div class="teamBtns">';
  for(let i=1;i<=8;i++){ h+='<button class="tBtn" data-t="'+i+'">'+i+'</button>'; }
  h+='<button class="tBtn neutral" data-t="0">中立</button>';
  h+='</div>';
  h+='<div class="propBtns"><button class="delBtn" id="delSelBtn">删除</button></div>';
  el.innerHTML=h;
  const cur = s.kind==='spawn' ? (s.idx+1) : (m[s.kind==='building'?'buildings':'units'][s.idx].team+1);
  for(const b of el.querySelectorAll('.tBtn')){
    const v=parseInt(b.dataset.t,10);
    if((cur===v)||(v===0 && cur<=0)) b.classList.add('sel');
  }
}
function teamPick(v){
  const m=EDIT.map, s=EDIT.sel;
  if(!s) return;
  if(s.kind==='spawn'){
    if(v===0) return;   // 出生点不能设为中立
    // 出生点编号=在数组中的顺序(1~8);调整编号=移动到对应位置
    const newIdx=v-1;
    if(newIdx===s.idx) return;
    const arr=m.spawns.slice();
    const item=arr.splice(s.idx,1)[0];
    arr.splice(Math.min(newIdx, arr.length), 0, item);
    m.spawns=arr.filter(x=>x!==null && x!==undefined);
    EDIT.sel={kind:'spawn', idx:m.spawns.indexOf(item)};
    setStatus('出生点已移至 #'+(EDIT.sel.idx+1));
    // 该出生点对应的自动建造厂归属同步
    const sc=m.spawns[EDIT.sel.idx];
    if(sc){
      for(const b of m.buildings){ if(b._auto && b._spawnAt && b._spawnAt[0]===sc[0] && b._spawnAt[1]===sc[1]) b.team=EDIT.sel.idx; }
    }
  } else if(s.kind==='building'){
    const b=m.buildings[s.idx]; if(!b) return;
    b.team = (v===0) ? -1 : v-1;
    setStatus('建筑改为 '+(v===0?'中立':'玩家'+v));
  } else {
    const u=m.units[s.idx]; if(!u) return;
    u.team = (v===0) ? -1 : v-1;
    setStatus('单位改为 '+(v===0?'中立':'玩家'+v));
  }
  renderProp(); render();
}
function delSel(){
  const m=EDIT.map, s=EDIT.sel;
  if(!s) return;
  if(s.kind==='building') m.buildings.splice(s.idx,1);
  else if(s.kind==='unit') m.units.splice(s.idx,1);
  else if(s.kind==='spawn'){
    const sc=m.spawns[s.idx];
    if(sc) m.buildings = m.buildings.filter(b=> !(b._auto && b._spawnAt && b._spawnAt[0]===sc[0] && b._spawnAt[1]===sc[1]));
    m.spawns.splice(s.idx,1);
    while(m.spawns.length && m.spawns[m.spawns.length-1]===null) m.spawns.pop();
  }
  resetSel();
  setStatus('已删除');
  render();
}

/* ============ 保存 / 打开 ============ */
function mapJSON(){
  const m=EDIT.map;
  if(!m) return null;
  const name=(m.name||'未命名地图').trim();
  const fileBase=name.replace(/[\\/:*?"<>|]/g,'_').trim()||'map';
  m.id = fileBase;
  const obj={ id:fileBase, _file:fileBase+'.js', name, width:m.width, height:m.height, custom:'edited',
    terrain:m.terrain, ores:m.ores,
    buildings:(m.buildings||[]).map(b=>({def:b.def, team:b.team, tx:b.tx, ty:b.ty})),
    units:(m.units||[]).map(u=>({type:u.type, team:u.team, x:u.x, y:u.y})),
    spawns:(m.spawns||[]).filter(s=>s).map(s=>[s[0],s[1]]),
  };
  // 同步到内存列表,便于生成完整的 index.js
  window.CUSTOM_MAPS = window.CUSTOM_MAPS || [];
  const i=window.CUSTOM_MAPS.findIndex(x=>x && x.id===fileBase);
  if(i>=0) window.CUSTOM_MAPS[i]=obj; else window.CUSTOM_MAPS.push(obj);
  return { fileBase, obj };
}
function downloadIndex(){
  const list=window.CUSTOM_MAPS||[];
  const names=[];
  for(const m of list){ const n=(m && (m._file||((m.id||'map')+'.js'))); if(n && n!=='index.js' && !names.includes(n)) names.push(n); }
  names.sort();
  blobDownload('index.js', 'window.CUSTOM_MAPS_INDEX='+JSON.stringify(names)+';\n');
}
/* 启动时加载 map/index.js 列出的地图(Chrome/其它浏览器下载保存时,内存里就有全部地图,可生成完整 index) */
function loadFolderMaps(){
  window.CUSTOM_MAPS = window.CUSTOM_MAPS || [];
  const idx = window.CUSTOM_MAPS_INDEX || [];
  for(const n of idx){
    if(n==='index.js') continue;
    const start=window.CUSTOM_MAPS.length;
    const s=document.createElement('script');
    s.src='map/'+n;
    s.onload=()=>{ for(let i=start;i<window.CUSTOM_MAPS.length;i++){ const mm=window.CUSTOM_MAPS[i]; if(mm && !mm._file) mm._file=n; } };
    document.head.appendChild(s);
  }
}
async function connectFolder(){
  if(!('showDirectoryPicker' in window)){ setStatus('当前浏览器不支持直接连接文件夹,请用 Chrome/Edge,或用「另存为下载」'); return false; }
  try{ EDIT.dirHandle = await window.showDirectoryPicker(); setStatus('已连接地图文件夹: '+EDIT.dirHandle.name); return true; }
  catch(e){ setStatus('未连接文件夹'); return false; }
}
async function writeFile(handle, name, content){
  const fh=await handle.getFileHandle(name,{create:true});
  const w=await fh.createWritable();
  await w.write(content);
  await w.close();
}
async function rewriteIndex(){
  if(!EDIT.dirHandle) return;
  const names=[];
  for await (const [n,h] of EDIT.dirHandle.entries()){
    if(n.endsWith('.js') && n!=='index.js') names.push(n);
  }
  names.sort();
  await writeFile(EDIT.dirHandle, 'index.js', 'window.CUSTOM_MAPS_INDEX='+JSON.stringify(names)+';\n');
}
function blobDownload(name, content){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type:'text/javascript'}));
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
async function saveMap(){
  const r=mapJSON(); if(!r) return;
  const content='(window.CUSTOM_MAPS=window.CUSTOM_MAPS||[]).push('+JSON.stringify(r.obj)+');\n';
  if(EDIT.dirHandle){
    try{
      await writeFile(EDIT.dirHandle, r.fileBase+'.js', content);
      await rewriteIndex();
      setStatus('已保存: map/'+r.fileBase+'.js');
    }catch(e){ setStatus('保存失败: '+e.message); }
  } else {
    blobDownload(r.fileBase+'.js', content);
    downloadIndex();
    setStatus('已下载 '+r.fileBase+'.js 和 index.js。把两者都放入 map 文件夹(覆盖旧 index.js),游戏即可列出全部地图。');
  }
}
function downloadMap(){
  const r=mapJSON(); if(!r) return;
  blobDownload(r.fileBase+'.js', '(window.CUSTOM_MAPS=window.CUSTOM_MAPS||[]).push('+JSON.stringify(r.obj)+');\n');
  downloadIndex();
  setStatus('已下载 '+r.fileBase+'.js 和 index.js。把两者都放入 map 文件夹(覆盖旧 index.js),游戏即可列出全部地图。');
}
async function openMaps(){
  if(EDIT.dirHandle){
    try{
      const list=[];
      for await (const [n,h] of EDIT.dirHandle.entries()){
        if(n.endsWith('.js') && n!=='index.js') list.push([n,h]);
      }
      if(!list.length){ setStatus('map 文件夹里没有地图文件'); return; }
      // 逐个读取并注册
      const maps=[];
      for(const [n,h] of list){
        try{
          const file=await h.getFile();
          const text=await file.text();
          const fn=new Function('window', text+'\n;return (window.__tmp=window.CUSTOM_MAPS_LAST);');
          // 用隔离方式:直接在 window.CUSTOM_MAPS 上注册
          const prev=window.CUSTOM_MAPS||[];
          window.CUSTOM_MAPS=[];
          (0,eval)(text);
          const m=window.CUSTOM_MAPS&&window.CUSTOM_MAPS[0];
          window.CUSTOM_MAPS=prev;
          if(m){ m._file=n; maps.push(m); }
        }catch(e){ setStatus('读取 '+n+' 失败: '+e.message); }
      }
      showOpenList(maps);
      return;
    }catch(e){ setStatus('读取文件夹失败: '+e.message); }
  }
  // 回退:文件选择
  const inp=document.createElement('input');
  inp.type='file'; inp.multiple=true; inp.accept='.js';
  inp.onchange=async()=>{
    const maps=[];
    for(const f of inp.files){
      try{
        const text=await f.text();
        const prev=window.CUSTOM_MAPS||[];
        window.CUSTOM_MAPS=[];
        (0,eval)(text);
        const m=window.CUSTOM_MAPS&&window.CUSTOM_MAPS[0];
        window.CUSTOM_MAPS=prev;
        if(m){ m._file=f.name; maps.push(m); }
      }catch(e){}
    }
    showOpenList(maps);
  };
  inp.click();
}
function showOpenList(maps){
  const ov=$('openOv');
  const el=$('openList');
  el.innerHTML='';
  if(!maps.length){ el.innerHTML='<div class="mapEmpty">没有可打开的地图</div>'; }
  for(const m of maps){
    const row=document.createElement('div');
    row.className='mapFileRow';
    row.innerHTML='<span class="mfIcon">📄</span><span class="mfName">'+m.name+' <small>('+(m._file||'')+')</small></span>';
    row.onclick=()=>{ loadMapData(m); ov.classList.remove('show'); };
    el.appendChild(row);
  }
  ov.classList.add('show');
}
function loadMapData(m){
  const w=m.width||40, h=m.height||30;
  const terrain=[];
  for(let x=0;x<w;x++){ const col=(m.terrain&&m.terrain[x])||[]; terrain[x]=[]; for(let y=0;y<h;y++) terrain[x][y]=(col[y]==='tree'||col[y]==='water')?col[y]:'grass'; }
  EDIT.map={
    id:m.id||'', name:m.name||'未命名地图', width:w, height:h, custom:'edited',
    terrain,
    ores:(m.ores||[]).map(o=>[o[0],o[1]]),
    buildings:(m.buildings||[]).map(b=>({def:b.def, team:b.team===undefined?-1:b.team, tx:b.tx, ty:b.ty})),
    units:(m.units||[]).map(u=>({type:u.type, team:u.team===undefined?-1:u.team, x:u.x, y:u.y})),
    spawns:(m.spawns||[]).filter(s=>s).map(s=>[s[0],s[1]]),
  };
  $('mapName').value = EDIT.map.name;
  $('mapW').value=w; $('mapH').value=h;
  resetSel();
  setStatus('已打开: '+m.name);
  setZoomForSize(w,h);
  render();
}

/* ============ 界面搭建 ============ */
function setStatus(s){ $('status').textContent=s; }
function pickTool(t){
  EDIT.tool=t;
  for(const b of document.querySelectorAll('.toolBtn')) b.classList.toggle('sel', b.dataset.tool===t);
  if(t==='terrain') $('matBox').classList.remove('hidden'); else $('matBox').classList.add('hidden');
  if(t!=='building') EDIT.bldPick=null;
  if(t!=='unit') EDIT.unitPick=null;
  if(t!=='select') { /* 保留选择? 不选时清空选择 */ }
  refreshPickUI(); resetSel(); render();
}
function refreshPickUI(){
  for(const b of document.querySelectorAll('.pitem')) b.classList.remove('picksel');
  if(EDIT.tool==='building'&&EDIT.bldPick){
    const el=document.querySelector('.pitem[data-bld="'+EDIT.bldPick+'"]'); if(el) el.classList.add('picksel');
  }
  if(EDIT.tool==='unit'&&EDIT.unitPick){
    const el=document.querySelector('.pitem[data-unit="'+EDIT.unitPick+'"]'); if(el) el.classList.add('picksel');
  }
}
function initEditor(){
  cv=$('cv');
  // 材质
  const mats=[['grass','草地'],['tree','树林'],['water','水域']];
  const tbox=$('terrainMat');
  for(const [k,label] of mats){
    const d=document.createElement('div');
    d.className='pitem mat'+(k==='grass'?' picksel':'');
    d.dataset.mat=k;
    d.innerHTML='<span class="sw" style="background:'+{grass:'#4a9a5a',tree:'#2f6a3a',water:'#2a5a8a'}[k]+'"></span>'+label;
    d.onclick=()=>{ EDIT.mat=k; EDIT.tool='terrain'; pickTool('terrain');
      document.querySelectorAll('.pitem.mat').forEach(x=>x.classList.remove('picksel')); d.classList.add('picksel'); };
    tbox.appendChild(d);
  }
  // 建筑素材
  const bbox=$('bldPalette');
  for(const dn in BLD_DEFS){
    const d=BLD_DEFS[dn];
    const it=document.createElement('div');
    it.className='pitem';
    it.dataset.bld=dn;
    it.innerHTML='<span class="sw" style="background:'+d.color+'"></span>'+(d.neutral?('中立·'+d.name):d.name);
    it.onclick=()=>{ EDIT.bldPick=dn; EDIT.tool='building'; pickTool('building'); };
    bbox.appendChild(it);
  }
  // 单位素材
  const ubox=$('unitPalette');
  for(const t of UNIT_TYPES){
    const it=document.createElement('div');
    it.className='pitem';
    it.dataset.unit=t;
    it.innerHTML='<span class="sw" style="background:#4f8ff0"></span>'+UNIT_LABEL[t];
    it.onclick=()=>{ EDIT.unitPick=t; EDIT.tool='unit'; pickTool('unit'); };
    ubox.appendChild(it);
  }
  // 尺寸下拉(改为数字输入,见 HTML;上限 220x220)
  // 画布交互
  cv.addEventListener('pointerdown', ev=>{
    EDIT.painting=true;
    clickCanvas(ev);
  });
  // 地图名输入
  $('mapName').addEventListener('input', e=>{ if(EDIT.map) EDIT.map.name=e.target.value || '未命名地图'; });
  cv.addEventListener('pointermove', ev=>{
    if(!EDIT.painting) return;
    if(EDIT.tool==='terrain'||EDIT.tool==='ore'){ clickCanvas(ev); }
  });
  window.addEventListener('pointerup', ()=>{ EDIT.painting=false; });
  // 缩放
  $('zoomSel').addEventListener('change', e=>{ EDIT.zoom=parseFloat(e.target.value)||1; render(); });
  // 工具按钮
  for(const b of document.querySelectorAll('.toolBtn')){
    b.addEventListener('click', ()=>pickTool(b.dataset.tool));
  }
  // 属性面板委托
  $('propContent').addEventListener('click', e=>{
    const t=e.target.closest('.tBtn');
    if(t){ teamPick(parseInt(t.dataset.t,10)); return; }
    if(e.target.closest('#delSelBtn')) delSel();
  });
  // 打开弹层
  $('openOv').addEventListener('click', e=>{ if(e.target.id==='openOv') $('openOv').classList.remove('show'); });
  loadFolderMaps();
  newMap();
}
window.addEventListener('load', initEditor);
