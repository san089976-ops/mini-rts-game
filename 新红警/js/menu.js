"use strict";
/* ============ menu.js: 主菜单(地图/队伍/分组/颜色/资金/出生点) ============ */
const START_MONEY_OPTS = [5000,10000,20000,30000,50000,100000];
let menuState = {
  mapIdx: 0,
  startMoney: 10000,             // 我方开局资金(难度)
  openDrop: null,                // 当前展开的下拉: 'money' | 'group-i' | 'color-i'
  spawnIdx: [0,1,null,null],     // 每队(玩家+电脑1..3)选中的出生点下标,未选=null
  spawnTarget: 0,                // 出生点放置模式:当前操作的队伍
  playerFaction: 'allies',
  compFactions: ['soviet','soviet','soviet'],
  groups: [1,1,1],               // 电脑所在组 0=A(与玩家同盟,蓝)/1=B/2=C/3=D(敌对,红)
  colors: [6,3,2,8],             // 每队所选颜色下标(黄黑青红深红绿蓝天蓝紫)
  compCount: 1,
};

/* ============ 帮助弹层 ============ */
function openHelp(){ document.getElementById('helpOv').classList.add('show'); }
function closeHelp(){ document.getElementById('helpOv').classList.remove('show'); }

/* ============ 出生点分配辅助 ============ */
function normalizeSpawns(){
  const n=menuState.compCount+1;
  const used=new Set();
  for(let i=0;i<n;i++){
    const v=menuState.spawnIdx[i];
    if(v!==null && v>=0 && v<n && !used.has(v)){ used.add(v); }
    else menuState.spawnIdx[i]=null;
  }
  let k=0;
  for(let i=0;i<n;i++){
    if(menuState.spawnIdx[i]===null){
      while(k<n && used.has(k)) k++;
      if(k<n){ menuState.spawnIdx[i]=k; used.add(k); }
    }
  }
}

function buildGameSetup(){
  const teams=[{name:'玩家', faction:menuState.playerFaction, group:0, ai:false, color:menuState.colors[0], startMoney:menuState.startMoney}];
  for(let i=0;i<menuState.compCount;i++){
    teams.push({name:'电脑'+(i+1), faction:menuState.compFactions[i], group:menuState.groups[i], ai:true, color:menuState.colors[i+1]});
  }
  const n=teams.length;
  const spawns=SPAWN_POINTS[n];
  // 出生点:优先用已选点,重复/未选自动补剩余点
  const used=new Set();
  const assign=teams.map((t,i)=>{
    const idx=menuState.spawnIdx[i];
    if(idx!==null && idx>=0 && idx<n && !used.has(idx)){ used.add(idx); return spawns[idx]; }
    return null;
  });
  const free=[]; for(let i=0;i<n;i++) if(!used.has(i)) free.push(i);
  let fi=0;
  for(let i=0;i<teams.length;i++) if(!assign[i]){ assign[i]=spawns[free[fi]!==undefined?free[fi]:0]; fi++; }
  teams.forEach((t,i)=>t.spawn=assign[i]);
  return { map: MAPS[menuState.mapIdx], teams };
}

function selectMap(i){
  menuState.mapIdx=i;
  buildMenu(true);
}
function setCompCount(n){
  menuState.compCount=n;
  menuState.spawnTarget=Math.min(menuState.spawnTarget, n);
  normalizeSpawns();
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

function buildMenu(regen){
  if(regen){ gameSetup=buildGameSetup(); genTerrain(); }
  renderMapCards();
  renderMoneyRow();
  renderTeamRows();
  renderSpawnButtons();
  renderMenuPreview();
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
  MAPS.forEach((m,i)=>{
    const c=document.createElement('div');
    c.className='mapcard'+(i===menuState.mapIdx?' sel':'');
    c.innerHTML='<div class="mname">'+m.name+'</div><div class="mdesc">'+m.desc+'</div>';
    c.onclick=()=>selectMap(i);
    el.appendChild(c);
  });
}

function teamRowHTML(name, fac, teamIdx, compIdx){
  const row=document.createElement('div');
  row.className='trow';
  const fc=(f)=>'<button class="facBtn'+(fac===f?' sel':'')+'" onclick="setTeamFaction('+teamIdx+',\''+f+'\')">'+(f==='allies'?'盟军':'苏军')+'</button>';
  let h='<span class="tname">'+name+'</span>'+fc('allies')+fc('soviet');
  if(compIdx!==null){
    // 分组 A/B/C/D 下拉(与玩家同组=同盟,其余=敌对)
    h+='<span class="tname">分组</span>'+groupDropHTML(compIdx);
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
  const cnt=document.createElement('div');
  cnt.className='trow cntrow';
  let cntHtml='<span class="tname">队伍数</span>';
  [2,3,4].forEach(n=>{
    cntHtml+='<button class="facBtn'+(menuState.compCount===n-1?' sel':'')+'" onclick="setCompCount('+(n-1)+')">'+n+'</button>';
  });
  cnt.innerHTML=cntHtml;
  el.appendChild(cnt);
  el.appendChild(teamRowHTML('玩家', menuState.playerFaction, 0, null));
  for(let i=0;i<menuState.compCount;i++){
    el.appendChild(teamRowHTML('电脑'+(i+1), menuState.compFactions[i], i+1, i));
  }
}

function renderSpawnButtons(){
  const el=document.getElementById('spawnSel');
  if(!el) return;
  el.innerHTML='';
  const n=menuState.compCount+1;
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
  const s=cw/MAP_W;
  g.fillStyle='#0a120c'; g.fillRect(0,0,cw,ch);
  for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++){
    const t=terrain[x][y];
    g.fillStyle = t==='water' ? '#22486e' : (t==='tree' ? '#1c3a24' : '#2a4a2e');
    g.fillRect(x*s,y*s,s+0.3,s+0.3);
  }
  const n=menuState.compCount+1;
  const spawns=SPAWN_POINTS[n];
  spawns.forEach(([sx,sy],p)=>{
    const px=(sx+0.5)*s, py=(sy+0.5)*s;
    const owner=menuState.spawnIdx.indexOf(p);
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
      const s2=cw/MAP_W;
      const cx=(e.clientX-r.left)/s2, cy=(e.clientY-r.top)/s2;
      const sps=SPAWN_POINTS[menuState.compCount+1];
      let best=-1,bd=12;
      sps.forEach(([sx,sy],i)=>{ const d=Math.hypot(cx-sx-0.5,cy-sy-0.5); if(d<bd){bd=d;best=i;} });
      if(best!==-1) setSpawn(menuState.spawnTarget, best);
    });
  }
}
