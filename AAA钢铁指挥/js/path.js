"use strict";
/* ============ path.js: A* grid pathfinding + pixel waypoint smoothing ============ */

const PATH_CACHE_MAX = 2048;
const PATH_JOB_BUDGET_MS = 4;
let mapVersion = 0;
let pathCache = new Map();
const pathJobs = [];
const FLOW_CACHE_MAX = 24;
let flowCache = new Map();

function moveProfileOf(u){
  if(!u) return 'x';
  let s = u.naval ? 'n' : '';
  if(u.amphib) s += 'a';
  if(u.crushTrees) s += 'c';
  return s + ':' + clearanceOf(u);
}

function pathKey(u, sx, sy, tx, ty){
  return moveProfileOf(u) + ':' + mapVersion + ':' +
    ((sx/TILE)|0) + ':' + ((sy/TILE)|0) + ':' +
    ((tx/TILE)|0) + ':' + ((ty/TILE)|0);
}

function invalidatePathCache(){
  mapVersion++;
  pathCache.clear();
  flowCache.clear();
}

function resetPathCache(){
  mapVersion = 0;
  pathCache.clear();
  flowCache.clear();
  pathJobs.length = 0;
}

function queuePath(u, tx, ty, order){
  if(!u || !order) return;
  u._pendingPath = { tx:tx, ty:ty, order:order };
  if(!u._inPathQueue){
    u._inPathQueue = true;
    pathJobs.push(u);
  }
}

function processPathJobs(){
  if(!pathJobs.length) return;
  const start = performance.now();
  let i = 0;
  while(i < pathJobs.length){
    const u = pathJobs[i];
    const req = u && u._pendingPath;
    if(!u || u.hp<=0 || !req){
      if(u) u._inPathQueue = false;
      i++;
      continue;
    }
    if(u.order !== req.order){
      u._pendingPath = null;
      u._inPathQueue = false;
      i++;
      continue;
    }
    let tx = req.tx, ty = req.ty;
    if(u.order.kind==='attack'){
      if(!u.target || u.target.hp<=0){
        u._pendingPath = null;
        u._inPathQueue = false;
        i++;
        continue;
      }
      tx = u.target.x; ty = u.target.y;
    } else if(u.order.kind==='move' && (u.order.x!==req.tx || u.order.y!==req.ty)){
      u._pendingPath = null;
      u._inPathQueue = false;
      i++;
      continue;
    }
    const p = u.order.kind==='attack' ? flowPathFor(u, tx, ty) : pathFor(u, u.x, u.y, tx, ty);
    u._pendingPath = null;
    u._inPathQueue = false;
    u.repathT = 0.7;
    if(p){
      u.path = p; u.pathIdx = 0;
    } else {
      u.path = null; u.pathIdx = 0;
      u._lastPathFail = time;
    }
    i++;
    if(performance.now() - start >= PATH_JOB_BUDGET_MS) break;
  }
  if(i > 0) pathJobs.splice(0, i);
}

function findPath(sx,sy,tx,ty){ return findPathAStar(sx,sy,tx,ty,null); }
function findPathFor(u,sx,sy,tx,ty){ return findPathAStar(sx,sy,tx,ty,u); }

function pathFor(u, sx, sy, tx, ty){
  const k = pathKey(u, sx, sy, tx, ty);
  const hit = pathCache.get(k);
  if(hit){
    pathCache.delete(k);
    pathCache.set(k, hit);
    return hit.slice();
  }
  const p = findPathFor(u, sx, sy, tx, ty);
  if(p){
    if(pathCache.size >= PATH_CACHE_MAX){
      pathCache.delete(pathCache.keys().next().value);
    }
    pathCache.set(k, p);
  }
  return p;
}

// clearance: how many extra cells a unit needs around its center (2x1 tanks, etc.)
function clearanceOf(u){ return Math.max(0, Math.ceil((u.colR||0)/TILE) - 1); }

function passableFor(u){
  const base = u ? ((cx,cy)=>unitPassable(u,cx,cy)) : ((cx,cy)=>!cellBlocked(cx,cy));
  const clearR = u ? clearanceOf(u) : 0;
  return (clearR>0) ? (function(x,y){
    if(!base(x,y)) return false;
    for(let dx=-clearR;dx<=clearR;dx++) for(let dy=-clearR;dy<=clearR;dy++){
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H) return false;
      if(!base(nx,ny)) return false;
    }
    return true;
  }) : base;
}

function flowKey(u, tx, ty){
  return moveProfileOf(u) + ':' + mapVersion + ':' + ((tx/TILE)|0) + ':' + ((ty/TILE)|0);
}

function buildFlowField(u, tx, ty){
  const txg = Math.floor(tx/TILE), tyg = Math.floor(ty/TILE);
  const cols = MAP_W, rows = MAP_H, n = cols*rows;
  const passable = passableFor(u);
  let gx = txg, gy = tyg;
  if(!passable(gx,gy)){
    let alt=null;
    for(let r=0; r<6 && !alt; r++) for(let dy=-r; dy<=r && !alt; dy++) for(let dx=-r; dx<=r; dx++){
      const nx=txg+dx, ny=tyg+dy;
      if(passable(nx,ny)){ alt=[nx,ny]; break; }
    }
    if(!alt) return null;
    gx=alt[0]; gy=alt[1];
  }
  const cost = new Float64Array(n); cost.fill(1e9);
  const parent = new Int32Array(n); parent.fill(-1);
  const open = new MinHeap();
  const sk = gy*cols + gx;
  cost[sk]=0; parent[sk]=sk;
  open.push({x:gx, y:gy, f:0});
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  const dCost = [1,1,1,1,1.4142,1.4142,1.4142,1.4142];
  while(open.size){
    const cur = open.pop();
    const ck = cur.y*cols + cur.x;
    if(cur.f > cost[ck] + 0.0001) continue;
    for(let i=0;i<dirs.length;i++){
      const ddx=dirs[i][0], ddy=dirs[i][1];
      const nx=cur.x+ddx, ny=cur.y+ddy;
      if(!passable(nx,ny)) continue;
      if(ddx!==0 && ddy!==0){
        if(!passable(cur.x+ddx, cur.y) || !passable(cur.x, cur.y+ddy)) continue;
      }
      const nk=ny*cols+nx;
      const ng=cost[ck]+dCost[i];
      if(ng < cost[nk]-0.0001){
        cost[nk]=ng; parent[nk]=ck;
        open.push({x:nx, y:ny, f:ng});
      }
    }
  }
  return { parent:parent, cols:cols, rows:rows, tx:gx, ty:gy };
}

function flowPathFromField(u, field, sx, sy){
  if(!field) return null;
  const cols = field.cols, rows = field.rows;
  const passable = passableFor(u);
  let gx = Math.floor(sx/TILE), gy = Math.floor(sy/TILE);
  if(!passable(gx,gy)){
    let alt=null;
    for(let r=1; r<=3 && !alt; r++) for(let dy=-r; dy<=r && !alt; dy++) for(let dx=-r; dx<=r; dx++){
      const nx=gx+dx, ny=gy+dy;
      if(passable(nx,ny)){ alt=[nx,ny]; break; }
    }
    if(!alt) return null;
    gx=alt[0]; gy=alt[1];
  }
  const startKey = gy*cols + gx, targetKey = field.ty*cols + field.tx;
  if(field.parent[startKey]===-1) return null;
  const gp = [];
  let c = startKey, guard = 0;
  while(c !== -1){
    if(++guard > cols*rows + 8) return null;
    gp.push([c % cols, (c/cols)|0]);
    if(c === targetKey) break;
    c = field.parent[c];
  }
  if(c === -1) return null;
  const pts = gridToPixels(gp);
  if(pts.length>1) pts.shift();
  return smoothPath(pts, passable);
}

function flowPathFor(u, tx, ty){
  const k = flowKey(u, tx, ty);
  let field = flowCache.get(k);
  if(!field){
    field = buildFlowField(u, tx, ty);
    if(!field) return null;
    if(flowCache.size >= FLOW_CACHE_MAX) flowCache.delete(flowCache.keys().next().value);
    flowCache.set(k, field);
  }
  return flowPathFromField(u, field, u.x, u.y);
}

function findPathAStar(sx,sy,tx,ty,u){
  const passable = passableFor(u);
  const grid = new MapGrid(MAP_W, MAP_H, passable);
  const astar = new AStarPathfinder(grid, { allowDiagonal:true });
  const gp = astar.findPath(Math.floor(sx/TILE), Math.floor(sy/TILE),
                            Math.floor(tx/TILE), Math.floor(ty/TILE));
  if(!gp) return null;
  const pts = gridToPixels(gp);
  if(pts.length>1) pts.shift();
  return smoothPath(pts, passable);
}

// Compress the A* waypoint staircase into long straight segments when line is clear.
function smoothPath(path, passable){
  if(!path || path.length<3) return path;
  if(path.length>400) return path;
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

// Bresenham line sampling plus diagonal corner checks.
function lineClear(a,b,passable){
  const x0=Math.floor(a.x/TILE), y0=Math.floor(a.y/TILE);
  const x1=Math.floor(b.x/TILE), y1=Math.floor(b.y/TILE);
  const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
  const sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy, x=x0, y=y0;
  let px=x, py=y, first=true;
  while(true){
    if(!passable(x,y)) return false;
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
