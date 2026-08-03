"use strict";
/* ============ map.js: 地图生成 ============ */
function genTerrain(){
  terrain=[]; blocked=[]; oreFields=[];
  for(let x=0;x<MAP_W;x++){ terrain[x]=[]; blocked[x]=[]; for(let y=0;y<MAP_H;y++){ terrain[x][y]='grass'; blocked[x][y]=false; } }
  const m = gameSetup ? gameSetup.map : MAPS[0];
  const nTeams = gameSetup ? gameSetup.teams.length : 2;
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
  // 保证所有出生点周边畅通
  const spawns = SPAWN_POINTS[nTeams] || SPAWN_POINTS[2];
  for(const [sx,sy] of spawns){ clearZone(sx, sy, m.clearW, m.clearH); }
  // 矿脉
  const mkOre = (cx,cy)=>{
    const amount=Math.floor(rnd(1600,2600)*3);   // 3倍耐采集
    const patch={ x:cx*TILE+TILE/2, y:cy*TILE+TILE/2, amount, max:amount, r:TILE*1.5 };
    oreFields.push(patch);
  };
  for(let i=0;i<m.ore;i++){ mkOre(Math.floor(rnd(6,MAP_W-6)), Math.floor(rnd(6,MAP_H-6))); }
}
function clearZone(cx,cy,w,h){
  for(let x=cx-w;x<=cx+w;x++) for(let y=cy-h;y<=cy+h;y++){
    if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H){ blocked[x][y]=false; terrain[x][y]='grass'; }
  }
}
