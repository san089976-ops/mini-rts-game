"use strict";
/* ============ path.js: 寻路(BFS) ============ */
function findPath(sx,sy,tx,ty){ return bfsPath(sx,sy,tx,ty, (cx,cy)=>!cellBlocked(cx,cy)); }
function findPathFor(u,sx,sy,tx,ty){ return bfsPath(sx,sy,tx,ty, (cx,cy)=>unitPassable(u,cx,cy)); }
function pathFor(u,sx,sy,tx,ty){ return (u.naval||u.amphib) ? findPathFor(u,sx,sy,tx,ty) : findPath(sx,sy,tx,ty); }
function bfsPath(sx,sy,tx,ty,passable){
  const scx=clamp(Math.floor(sx/TILE),0,MAP_W-1), scy=clamp(Math.floor(sy/TILE),0,MAP_H-1);
  let tcx=clamp(Math.floor(tx/TILE),0,MAP_W-1), tcy=clamp(Math.floor(ty/TILE),0,MAP_H-1);
  if(!passable(tcx,tcy)){
    // 找最近的可行格
    const q=[];
    for(let r=0;r<6 && q.length===0;r++){
      for(let x=tcx-r;x<=tcx+r;x++) for(let y=tcy-r;y<=tcy+r;y++)
        if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H && passable(x,y)) q.push([x,y]);
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
      if(!passable(nx,ny)) continue;
      closed.add(k); prev[k]={x:cur.x,y:cur.y};
      open.push({x:nx,y:ny});
    }
  }
  if(!found) return null;
  const path=[]; let cur=found;
  while(cur){ path.push({x:cur.x*TILE+TILE/2,y:cur.y*TILE+TILE/2}); if(prev[key(cur.x,cur.y)]) cur=prev[key(cur.x,cur.y)]; else break; }
  path.reverse();
  if(path.length>1) path.shift();
  return smoothPath(path, passable);
}
/* ============ 路径拉直平滑(让移动直线化、流畅) ============ */
// 把 BFS 的逐格直角阶梯航点塌缩成直线段:两点间直线可通行则跳过中间点,
// 使单位像运输艇那样直直滑向目标(带防穿墙角检查)。所有单位共用。
function smoothPath(path, passable){
  if(!path || path.length<3) return path;
  if(path.length>400) return path;   // 过长路径不做 O(n²) 拉直,避免卡顿
  const out=[path[0]];
  let i=0;
  while(i<path.length-1){
    let best=i+1;
    for(let k=i+2;k<path.length;k++){
      if(lineClear(path[i], path[k], passable)) best=k;
      else break;
    }
    out.push(path[best]);
    i=best;
  }
  return out;
}
// 判断两个航点(瓦片中心)之间的直线是否可通行(Bresenham 采样 + 对角防穿墙角)
function lineClear(a,b,passable){
  const x0=Math.floor(a.x/TILE), y0=Math.floor(a.y/TILE);
  const x1=Math.floor(b.x/TILE), y1=Math.floor(b.y/TILE);
  const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
  const sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy, x=x0, y=y0;
  let px=x, py=y, first=true;
  while(true){
    if(!passable(x,y)) return false;
    // 对角步进:两侧正交格也必须可通行,防止斜穿墙角
    if(!first){
      const pdx=x-px, pdy=y-py;
      if(pdx!==0 && pdy!==0){
        if(!passable(px+pdx, py)) return false;
        if(!passable(px, py+pdy)) return false;
      }
    }
    first=false; px=x; py=y;
    if(x===x1 && y===y1) break;
    const e2=2*err;
    if(e2>-dy){ err-=dy; x+=sx; }
    if(e2<dx){ err+=dx; y+=sy; }
  }
  return true;
}
