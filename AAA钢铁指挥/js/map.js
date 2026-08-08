"use strict";
/* ============ map.js: 地图生成 ============ */
function genTerrain(){
  terrain=[]; blocked=[]; structBlocked=[]; oreFields=[]; oreGrid=[];
  const m = gameSetup ? gameSetup.map : (currentMap() || MAPS[0]);
  setMapSize(m.width || 64, m.height || 48);   // 按地图定制尺寸(海战图更大)
  for(let x=0;x<MAP_W;x++){ terrain[x]=[]; blocked[x]=[]; structBlocked[x]=[]; for(let y=0;y<MAP_H;y++){ terrain[x][y]='grass'; blocked[x][y]=false; structBlocked[x][y]=false; } }
  const nTeams = gameSetup ? gameSetup.teams.length : 2;
  if(m.custom==='edited'){
    // 自制地图:地形/金矿直接来自保存的数据
    loadEditedMap(m);
  } else if(m.custom==='naval'){
    genNavalTerrain(m);
  } else {
    // 随机水塘与树丛(障碍)
    for(let i=0;i<m.clusters;i++){
      const cx=Math.floor(rnd(6,MAP_W-6)), cy=Math.floor(rnd(6,MAP_H-6));
      const rad=Math.floor(rnd(2,5));
      const isWater=Math.random()<m.waterProb;
      for(let x=cx-rad;x<=cx+rad;x++) for(let y=cy-rad;y<=cy+rad;y++){
        if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H && Math.hypot(x-cx,y-cy)<=rad)
          if(Math.random()<m.treeProb){ terrain[x][y]=isWater?'water':'tree'; blocked[x][y]=true; }
      }
    }
  }
  // 保证所有出生点周边畅通(自制地图用较小清空半径,保留设计师布置)
  const spawns = getSpawns(nTeams);
  const cw = (m.custom==='edited') ? 2 : (m.clearW || 0);
  const ch = (m.custom==='edited') ? 2 : (m.clearH || 0);
  for(const [sx,sy] of spawns){ clearZone(sx, sy, cw, ch); }
  // 自然生成地图(标准/海战图):出生点清空之后平滑海岸线——把"向水内突出"的陆地格改为水,
  // 保证每处海岸都有单张过渡图覆盖(不会出现纯草地补丁)。手工地图不处理,保留现状。
  if(m.custom!=='edited') smoothCoastline();
  // 金矿:非海战图/非自制地图时随机生成;自制地图的矿来自数据
  if(m.custom!=='naval' && m.custom!=='edited'){
    const spawns = getSpawns(nTeams);
    const clusterN = Math.max(1, Math.round(m.ore/3));   // 金矿堆数量(每堆约3格)
    let placed=0;
    // 找一个离所有出生点都够远的草地格当簇心(多留3格余量,保证堆内每格都不贴脸)
    for(let ci=0; ci<clusterN && placed<m.ore; ci++){
      let cx=-1, cy=-1;
      for(let a=0;a<200 && cx<0;a++){
        const tx=Math.floor(rnd(4,MAP_W-4)), ty=Math.floor(rnd(4,MAP_H-4));
        if(terrain[tx][ty]!=='grass') continue;
        let near=false;
        for(const [sx,sy] of spawns){ if(Math.hypot(tx-sx, ty-sy) < MIN_ORE_DIST+3){ near=true; break; } }
        if(near) continue;
        cx=tx; cy=ty;
      }
      if(cx<0) break;
      placed += addGoldCluster(cx, cy, Math.min(3, m.ore-placed));
    }
  }
  // 中立建筑(城市装饰):随机铺几座,不可建造、可查看详情(自制地图由设计师自己摆)
  if(m.custom!=='edited') placeNeutralBuildings();
  terrainVersion++;   // 地形渲染缓存版本 +1:全量重建地形缓存(碾树走瓦片局部修补,不动此版本)
}
/* ============ 开局兜底:有出生点但该队没有建造厂时,在出生点自动补一个(出生点即建造厂中心) ============ */
function ensureTeamCommands(){
  for(let i=0;i<gameTeams.length;i++){
    if(buildings.some(b=>b.team===i && b.alive && b.defName==='command')) continue;
    const sp = gameTeams[i] && gameTeams[i].spawn;
    if(!sp || sp[0]===undefined) continue;
    const tx=sp[0]-1, ty=sp[1]-1;
    if(!canDeployAt(tx,ty)) continue;
    const b=new Building('command', i, tx, ty);
    b.constructing=false; b.progress=0; b.hp=b.maxHp;
    buildings.push(b);
    markBlocked(b,true);
  }
}
/* ============ 自制地图:按保存的数据加载地形/金矿 ============ */
function loadEditedMap(m){
  const t = m.terrain || [];
  for(let x=0;x<MAP_W;x++){
    const col = t[x] || [];
    for(let y=0;y<MAP_H;y++){
      const c = col[y] || 'grass';
      terrain[x][y] = (c==='tree'||c==='water') ? c : 'grass';
      blocked[x][y] = (c==='tree'||c==='water');
    }
  }
  if(Array.isArray(m.ores)) for(const o of m.ores){
    if(Array.isArray(o) && o.length>=2 && o[0]>=0 && o[1]>=0 && o[0]<MAP_W && o[1]<MAP_H) addGoldMine(o[0],o[1]);
  }
}
/* ============ 自制地图:开局放置建筑/单位(队伍数不足的跳过,中立=team -1) ============ */
function placeMapEntities(m){
  for(const bb of (m.buildings||[])){
    if(!bb || !BLD_DEFS[bb.def]) continue;
    const team = (bb.team===undefined || bb.team===null) ? -1 : bb.team;
    if(team>=0 && team>=gameTeams.length) continue;
    const b = new Building(bb.def, team, bb.tx, bb.ty);
    b.constructing=false; b.progress=0; b.hp=b.maxHp;   // 地图上预置的建筑直接完工
    buildings.push(b);
    markBlocked(b, true);
  }
  for(const uu of (m.units||[])){
    if(!uu) continue;
    const KNOWN={infantry:1,tank:1,harvester:1,mcv:1,airfield_car:1,exo:1,magnet:1,abrams:1,t90:1,destroyer:1,transport:1,bradley:1,b11:1,marder:1,leclerc:1,leopard:1,challenger:1,puma:1,f16:1,su35:1,t84bm:1,t72:1,t62:1};
    if(!KNOWN[uu.type]) continue;
    const team = (uu.team===undefined || uu.team===null) ? -1 : uu.team;
    if(team>=0 && team>=gameTeams.length) continue;
    const u = new Unit(uu.type, team, uu.x*TILE + TILE/2, uu.y*TILE + TILE/2);
    u.order={kind:'none'};
    units.push(u);
  }
}
/* ============ 中立建筑(随机铺到地图上,供查看/摧毁) ============ */
const NEUTRAL_BUILDINGS = ['school','hospital','house_jp1','house_jp2','house_us','nuclear','mall','pentagon'];
function placeNeutralBuildings(){
  if(gameSetup && gameSetup.map && gameSetup.map.custom==='naval') return;  // 海战图岛小,不铺市区
  const nTeams = gameSetup ? gameSetup.teams.length : 2;
  const spawns = getSpawns(nTeams);
  const picks = NEUTRAL_BUILDINGS.slice().sort(()=>Math.random()-0.5);
  const count = 4 + Math.floor(Math.random()*3);   // 每局随机 4~6 座
  let placed = 0;
  for(const dn of picks){
    if(placed >= count) break;
    const d = BLD_DEFS[dn];
    let ok=false, tx=-1, ty=-1;
    for(let a=0; a<200 && !ok; a++){
      tx = Math.floor(rnd(3, MAP_W-d.w-3)); ty = Math.floor(rnd(3, MAP_H-d.h-3));
      ok = true;
      // 整块草地、无矿、无建筑占用
      for(let x=tx; x<tx+d.w; x++) for(let y=ty; y<ty+d.h; y++){
        if(terrain[x][y]!=='grass' || blocked[x][y] || structBlocked[x][y] || (oreGrid[x]&&oreGrid[x][y])){ ok=false; break; }
      }
      if(!ok) continue;
      // 离所有出生点足够远(避免贴脸基地)
      for(const [sx,sy] of spawns){
        if(Math.abs(tx-sx) < 20 && Math.abs(ty-sy) < 20){ ok=false; break; }
      }
    }
    if(!ok) continue;
    const b = new Building(dn, -1, tx, ty);
    b.constructing=false; b.progress=0; b.hp=b.maxHp;
    buildings.push(b);
    markBlocked(b, true);
    placed++;
  }
}
/* ============ 金矿(单格,每格 ORE_PER_TILE,采完即消失) ============ */
function addGoldMine(tx,ty){
  oreFields.push({ x:tx*TILE+TILE/2, y:ty*TILE+TILE/2, tx, ty, amount:ORE_PER_TILE, max:ORE_PER_TILE });
  if(!oreGrid[tx]) oreGrid[tx]=[];
  oreGrid[tx][ty]=true;
}
// 以(cx,cy)为中心聚成一撮金矿(先贴中心9宫格,再就近随机补足),返回实际放置数
function addGoldCluster(cx, cy, n){
  const dirs=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0],[0,2],[0,-2]];
  let placed=0;
  for(const [dx,dy] of dirs){
    if(placed>=n) break;
    const tx=cx+dx, ty=cy+dy;
    if(tx>=0&&ty>=0&&tx<MAP_W&&ty<MAP_H && terrain[tx][ty]==='grass' && !(oreGrid[tx]&&oreGrid[tx][ty])){
      addGoldMine(tx,ty); placed++;
    }
  }
  for(let a=0;a<100 && placed<n;a++){
    const tx=cx+Math.floor(rnd(-2.5,2.5)), ty=cy+Math.floor(rnd(-2.5,2.5));
    if(tx>=0&&ty>=0&&tx<MAP_W&&ty<MAP_H && terrain[tx][ty]==='grass' && !(oreGrid[tx]&&oreGrid[tx][ty])){
      addGoldMine(tx,ty); placed++;
    }
  }
  return placed;
}
/* ============ 海战图:四岛环海 ============ */
function genNavalTerrain(m){
  // 全海
  for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++){ terrain[x][y]='water'; blocked[x][y]=true; structBlocked[x][y]=false; }
  const islands = m.islands || [[20,15],[60,15],[20,41],[60,41]];
  for(const [cx,cy] of islands){
    // 岛体(带噪声的不规则形状)
    for(let x=cx-14;x<=cx+14;x++) for(let y=cy-14;y<=cy+14;y++){
      if(x<0||y<0||x>=MAP_W||y>=MAP_H) continue;
      const d=Math.hypot(x-cx,y-cy);
      const noise=Math.sin(x*0.8+y*0.4)*0.9+Math.cos(x*0.4-y*0.7)*0.9;
      if(d<9.5+noise*0.5){
        terrain[x][y]='grass'; blocked[x][y]=false;
      }
    }
    // 海岸树林(防御带,出生点区域会被清空)
    for(let x=cx-14;x<=cx+14;x++) for(let y=cy-14;y<=cy+14;y++){
      if(x<0||y<0||x>=MAP_W||y>=MAP_H) continue;
      const d=Math.hypot(x-cx,y-cy);
      if(terrain[x][y]==='grass' && d>6 && d<9.8 && Math.random()<0.6){
        terrain[x][y]='tree'; blocked[x][y]=true;
      }
    }
    // 岛内金矿:每岛一撮金矿堆,放在离岛中心较远的环带草地(避免贴脸基地)
    let ox=-1, oy=-1;
    for(let a=0;a<60 && ox<0;a++){
      const ang=Math.random()*Math.PI*2;
      const rr=rnd(6,9);
      const px=Math.floor(cx+Math.cos(ang)*rr), py=Math.floor(cy+Math.sin(ang)*rr);
      if(px>=1&&py>=1&&px<MAP_W-1&&py<MAP_H-1 && terrain[px][py]==='grass'){ ox=px; oy=py; }
    }
    if(ox>=0) addGoldCluster(ox, oy, 3);
  }
}
/* ============ 自然地图海岸平滑:迭代淹没"向水内突出"的陆地格(收敛到无突出) ============ */
function smoothCoastline(){
  let guard=0;
  while(guard++ < 8000){
    let changed=false;
    const flood=[];
    for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++){
      if(terrain[x][y]!=='grass') continue;
      if(isCoastProtruding(x,y)) flood.push([x,y]);
    }
    for(const [x,y] of flood){
      terrain[x][y]='water'; blocked[x][y]=true; structBlocked[x][y]=false;
      changed=true;
    }
    if(!changed) break;
  }
}
function clearZone(cx,cy,w,h){
  for(let x=cx-w;x<=cx+w;x++) for(let y=cy-h;y<=cy+h;y++){
    if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H){ blocked[x][y]=false; structBlocked[x][y]=false; terrain[x][y]='grass'; }
  }
}
/* ============ 通行性(海军/两栖) ============ */
function cellIsWater(cx,cy){ return cx>=0&&cy>=0&&cx<MAP_W&&cy<MAP_H && terrain[cx][cy]==='water'; }
// 某单位能否站上某格: 建筑占格全部不可通过;水域仅海军/两栖可过;陆地驱逐舰不可上岸;
// 树林对重型单位(坦克/两栖登陆艇等)可通行(会被碾倒),其余单位仍被树挡住。
function unitPassable(u, cx, cy){
  if(cx<0||cy<0||cx>=MAP_W||cy>=MAP_H) return false;
  if(u && u.fly) return true;   // 空军:飞越水面/树林/建筑(不碾树、不受阻挡)
  if(structBlocked[cx][cy]) return false;
  const t=terrain[cx][cy];
  if(t==='tree') return !!(u && u.crushTrees);
  if(t==='water') return !!(u.naval||u.amphib);
  return !u.naval;
}
// 统一用单位可通行判定(重型单位碾树、海军/两栖走水都由 unitPassable 分流)
function uCellBlocked(u, cx, cy){ return !unitPassable(u, cx, cy); }
