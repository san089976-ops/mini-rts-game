"use strict";
/* ============ path.js: 寻路(A* 网格寻路 + 像素航点平滑) ============ */
// 入口 pathFor(u,sx,sy,tx,ty):统一按单位可通行性寻路(坦克/车辆/步兵/海军各自判定)。
// 流程: A* 网格路径 -> gridToPixels 转像素航点 -> smoothPath() 把逐格直角阶梯
// 拉直成直线段,让所有单位像运输艇一样直线滑行。
function findPath(sx,sy,tx,ty){ return findPathAStar(sx,sy,tx,ty,null); }
function findPathFor(u,sx,sy,tx,ty){ return findPathAStar(sx,sy,tx,ty,u); }
function pathFor(u,sx,sy,tx,ty){ return findPathFor(u,sx,sy,tx,ty); }
// 单位碰撞半径 -> "额外占据格数"(半径每超一个整格多占一圈,用于 2×1 坦克等大单位)
function clearanceOf(u){ return Math.max(0, Math.ceil((u.colR||0)/TILE) - 1); }
function findPathAStar(sx,sy,tx,ty,u){
  const base = u ? ((cx,cy)=>unitPassable(u,cx,cy)) : ((cx,cy)=>!cellBlocked(cx,cy));
  const clearR = u ? clearanceOf(u) : 0;
  // 统一带清空的可通行判定:A* 的 passable 与 smoothPath 的 lineClear 共用,保证一致
  const passable = (clearR>0) ? (function(x,y){
    if(!base(x,y)) return false;
    for(let dx=-clearR;dx<=clearR;dx++) for(let dy=-clearR;dy<=clearR;dy++){
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H) return false;
      if(!base(nx,ny)) return false;
    }
    return true;
  }) : base;
  const grid = new MapGrid(MAP_W, MAP_H, passable);
  const astar = new AStarPathfinder(grid, { allowDiagonal:true });
  const gp = astar.findPath(Math.floor(sx/TILE), Math.floor(sy/TILE),
                            Math.floor(tx/TILE), Math.floor(ty/TILE));
  if(!gp) return null;
  const pts = gridToPixels(gp);
  if(pts.length>1) pts.shift();   // 去掉起点格中心(单位已在该格,直接去下一格)
  return smoothPath(pts, passable);
}
/* ============ 路径拉直平滑(让移动直线化、流畅) ============ */
// 把 A* 的逐格直角阶梯航点塌缩成直线段:两点间直线可通行则跳过中间点,
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
