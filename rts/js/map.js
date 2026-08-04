"use strict";
/* ============ map.js: 地图生成 ============ */
function genTerrain(){
  terrain=[]; blocked=[]; structBlocked=[]; oreFields=[]; oreGrid=[];
  const m = gameSetup ? gameSetup.map : MAPS[0];
  setMapSize(m.width || 64, m.height || 48);   // 按地图定制尺寸(海战图更大)
  for(let x=0;x<MAP_W;x++){ terrain[x]=[]; blocked[x]=[]; structBlocked[x]=[]; for(let y=0;y<MAP_H;y++){ terrain[x][y]='grass'; blocked[x][y]=false; structBlocked[x][y]=false; } }
  const nTeams = gameSetup ? gameSetup.teams.length : 2;
  if(m.custom==='naval'){
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
  // 保证所有出生点周边畅通
  const spawns = getSpawns(nTeams);
  for(const [sx,sy] of spawns){ clearZone(sx, sy, m.clearW, m.clearH); }
  // 金矿:每格 5000,以"金矿堆"形式生成——找离出生点较远的簇心,再在其周围聚成一撮
  if(m.custom!=='naval'){
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
function clearZone(cx,cy,w,h){
  for(let x=cx-w;x<=cx+w;x++) for(let y=cy-h;y<=cy+h;y++){
    if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H){ blocked[x][y]=false; structBlocked[x][y]=false; terrain[x][y]='grass'; }
  }
}
/* ============ 通行性(海军/两栖) ============ */
function cellIsWater(cx,cy){ return cx>=0&&cy>=0&&cx<MAP_W&&cy<MAP_H && terrain[cx][cy]==='water'; }
// 某单位能否站上某格: 建筑占格全部不可通过;树不可通过;水域仅海军/两栖可过;陆地驱逐舰不可上岸
function unitPassable(u, cx, cy){
  if(cx<0||cy<0||cx>=MAP_W||cy>=MAP_H) return false;
  if(structBlocked[cx][cy]) return false;
  const t=terrain[cx][cy];
  if(t==='tree') return false;
  if(t==='water') return !!(u.naval||u.amphib);
  return !u.naval;
}
function uCellBlocked(u, cx, cy){
  if(u.naval||u.amphib) return !unitPassable(u,cx,cy);
  return cellBlocked(cx,cy);
}
