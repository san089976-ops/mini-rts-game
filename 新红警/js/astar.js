"use strict";
/* ============================================================
   astar.js — A* 网格寻路 + 像素航点 (Pathfinding Module)

   三个可复用模块:
   - MapGrid        网格封装(列/行 + 自定义可通行判定 + 单位尺寸清空)
   - AStarPathfinder 8 方向 A*(二叉堆开放列表),支持单位半径清空
   - gridToPixels   网格路径 -> 连续像素坐标航点

   设计要点:
   - 坦克为 2×1 长条形,寻路时抽象为"占用中心附近若干格"的节点
     (clearR = 按碰撞半径换算的额外格数),避免为矩形旋转做膨胀运算。
   - 对不可达终点/起点自动就近吸附到可行格,保证总能给出一段可走路径。
   - 对角移动时强制检查两侧正交格,防止斜穿墙角。

   ===== 调用示例(集成进你的 Canvas 框架) =====
   // 1) 建立网格,传入自定义可通行判定
   const grid = new MapGrid(MAP_W, MAP_H, (x,y)=>!cellBlocked(x,y));
   const pf   = new AStarPathfinder(grid);
   // 2) 单位下达移动指令时寻路(unitSize 决定清空半径)
   function moveTank(tank, tx, ty){
     const gp = pf.findPath(
       Math.floor(tank.x/TILE), Math.floor(tank.y/TILE),
       Math.floor(tx/TILE),   Math.floor(ty/TILE),
       clearanceOf(tank));                 // 额外清空格数
     tank.waypoints = gridToPixels(gp);    // 网格 -> 像素航点
   }
   // 3) 每帧: 朝首个航点 seek + 平滑转向 + 双圆分离
   function gameLoop(dt, allTanks){
     for(const tank of allTanks){
       if(tank.waypoints && tank.waypoints.length){ seekWaypoint(tank, dt); }
       tank.update(dt);        // 速度积分 + lerpAngle 转向 + 静态碰撞
     }
     separateCapsules(allTanks, dt);        // 双圆与双圆距离分离力
   }
   本项目已集成: 直接用 pathFor(u,sx,sy,tx,ty) 寻路;单位自带胶囊碰撞、
   平滑转向与分离系统(见 entities.js / update.js)。
   ============================================================ */

// 最小二叉堆(开放列表用,保证 A* 在大地图上仍极快)
class MinHeap {
  constructor(){ this.h = []; }
  push(n){
    const h=this.h; h.push(n);
    let i=h.length-1;
    while(i>0){ const p=(i-1)>>1; if(h[p].f<=h[i].f) break; [h[p],h[i]]=[h[i],h[p]]; i=p; }
  }
  pop(){
    const h=this.h; if(!h.length) return null;
    const top=h[0], last=h.pop();
    if(h.length){
      h[0]=last; let i=0;
      for(;;){
        let l=i*2+1, r=l+1, best=i;
        if(l<h.length && h[l].f<h[best].f) best=l;
        if(r<h.length && h[r].f<h[best].f) best=r;
        if(best===i) break;
        [h[i],h[best]]=[h[best],h[i]]; i=best;
      }
    }
    return top;
  }
  get size(){ return this.h.length; }
}

// 地图网格封装
class MapGrid {
  constructor(cols, rows, isWalkable){
    this.cols = cols;
    this.rows = rows;
    this.isWalkable = isWalkable;   // (x,y)=>bool 该格对某单位是否可行
  }
  inBounds(x,y){ return x>=0 && y>=0 && x<this.cols && y<this.rows; }
  // 带单位尺寸(clearR 格)的可通行检查:中心格 + 周围 clearR 圈全部可行才放行
  passable(x, y, clearR = 0){
    if(!this.inBounds(x,y) || !this.isWalkable(x,y)) return false;
    if(clearR > 0){
      for(let dx=-clearR; dx<=clearR; dx++) for(let dy=-clearR; dy<=clearR; dy++){
        const nx=x+dx, ny=y+dy;
        if(!this.inBounds(nx,ny) || !this.isWalkable(nx,ny)) return false;
      }
    }
    return true;
  }
}

// A* 寻路器
class AStarPathfinder {
  constructor(grid, opts = {}){
    this.grid = grid;
    this.heuristic = opts.heuristic || ((ax,ay,bx,by)=>Math.hypot(bx-ax, by-ay)); // 欧氏
    this.cornerCheck = opts.cornerCheck !== false;   // 对角移动查两侧正交格,防穿墙角
  }
  // 返回网格坐标数组 [[x,y],...](含起点与终点);不可达返回 null
  findPath(sx, sy, tx, ty, clearR = 0){
    const g = this.grid;
    const ok = (x,y)=>g.passable(x,y,clearR);
    // 起点/终点被占(如建筑压住):自动就近吸附到可行格
    if(!ok(sx,sy)){
      let alt=null;
      for(let r=1; r<=3 && !alt; r++) for(let dy=-r; dy<=r && !alt; dy++) for(let dx=-r; dx<=r; dx++){
        const nx=sx+dx, ny=sy+dy;
        if(ok(nx,ny)){ alt=[nx,ny]; break; }
      }
      if(!alt) return null; sx=alt[0]; sy=alt[1];
    }
    if(!ok(tx,ty)){
      let alt=null;
      for(let r=0; r<6 && !alt; r++) for(let dy=-r; dy<=r && !alt; dy++) for(let dx=-r; dx<=r; dx++){
        const nx=tx+dx, ny=ty+dy;
        if(ok(nx,ny)){ alt=[nx,ny]; break; }
      }
      if(!alt) return null; tx=alt[0]; ty=alt[1];
    }
    if(sx===tx && sy===ty) return [[sx,sy]];
    const key = (x,y)=> y*g.cols + x;
    const h = this.heuristic;
    const open = new MinHeap();
    const gScore = new Map(), fScore = new Map(), came = new Map();
    const sk = key(sx,sy);
    gScore.set(sk, 0); fScore.set(sk, h(sx,sy,tx,ty));
    open.push({x:sx, y:sy, f:fScore.get(sk)});
    const openSet = new Set([sk]);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    const dCost = [1,1,1,1,1.4142,1.4142,1.4142,1.4142];
    let found = null;
    while(open.size){
      const cur = open.pop(); const ck = key(cur.x,cur.y);
      openSet.delete(ck);
      if(cur.x===tx && cur.y===ty){ found = cur; break; }
      for(let i=0;i<dirs.length;i++){
        const ddx = dirs[i][0], ddy = dirs[i][1];
        const nx = cur.x+ddx, ny = cur.y+ddy;
        if(!ok(nx,ny)) continue;
        // 对角步进:两侧正交格也必须可行,否则斜穿墙角
        if(this.cornerCheck && ddx!==0 && ddy!==0){
          if(!ok(cur.x+ddx, cur.y) || !ok(cur.x, cur.y+ddy)) continue;
        }
        const nk = key(nx,ny);
        const ng = gScore.get(ck) + dCost[i];
        // 注意:起点 gScore=0,不能用 `get(nk)||1e9`(0||1e9=1e9 会把起点当"未访问"而覆盖掉)
        const prevG = gScore.get(nk);
        if(ng < (prevG === undefined ? 1e9 : prevG)){
          gScore.set(nk, ng);
          const nf = ng + h(nx,ny,tx,ty);
          fScore.set(nk, nf);
          came.set(nk, [cur.x,cur.y]);
          if(!openSet.has(nk)){ open.push({x:nx,y:ny,f:nf}); openSet.add(nk); }
        }
      }
    }
    if(!found) return null;
    // 回溯重建路径(带防御性护栏:异常情况直接返回 null,绝不死循环)
    const path = []; let c = [tx,ty]; let _guard = 0;
    while(c){
      if(++_guard > (g.cols*g.rows + 8)) return null;
      path.push(c); const p = came.get(key(c[0],c[1])); c = p || null;
    }
    path.reverse();
    return path;
  }
}

// 网格路径 -> 像素航点(取每格中心,单位后续在这些航点间直线滑行)
function gridToPixels(gridPath){
  const out = [];
  for(const [x,y] of gridPath) out.push({ x:x*TILE + TILE/2, y:y*TILE + TILE/2 });
  return out;
}
