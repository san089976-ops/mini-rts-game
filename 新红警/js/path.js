"use strict";
/* ============ path.js: 寻路(BFS) ============ */
function findPath(sx,sy,tx,ty){
  const scx=clamp(Math.floor(sx/TILE),0,MAP_W-1), scy=clamp(Math.floor(sy/TILE),0,MAP_H-1);
  let tcx=clamp(Math.floor(tx/TILE),0,MAP_W-1), tcy=clamp(Math.floor(ty/TILE),0,MAP_H-1);
  if(cellBlocked(tcx,tcy)){
    // 找最近的可行格
    const q=[];
    for(let r=0;r<6 && q.length===0;r++){
      for(let x=tcx-r;x<=tcx+r;x++) for(let y=tcy-r;y<=tcy+r;y++)
        if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H && !cellBlocked(x,y)) q.push([x,y]);
    }
    if(!q.length) return null;
    const c=q[Math.floor(Math.random()*q.length)]; tcx=c[0]; tcy=c[1];
  }
  if(scx===tcx && scy===tcy) return null;
  const prev = {};
  const key=(x,y)=>y*MAP_W+x;
  let open=[{x:scx,y:scy}], closed=new Set(); closed.add(key(scx,scy));
  let found=null, guard=0;
  while(open.length && guard++<6000){
    const cur=open.shift();
    if(cur.x===tcx && cur.y===tcy){ found=cur; break; }
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      const nx=cur.x+dx, ny=cur.y+dy;
      if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H) continue;
      const k=key(nx,ny);
      if(closed.has(k)) continue;
      if(cellBlocked(nx,ny)) continue;
      closed.add(k); prev[k]={x:cur.x,y:cur.y};
      open.push({x:nx,y:ny});
    }
  }
  if(!found) return null;
  const path=[]; let cur=found;
  while(cur){ path.push({x:cur.x*TILE+TILE/2,y:cur.y*TILE+TILE/2}); if(prev[key(cur.x,cur.y)]) cur=prev[key(cur.x,cur.y)]; else break; }
  path.reverse();
  if(path.length>1) path.shift();
  return path;
}
