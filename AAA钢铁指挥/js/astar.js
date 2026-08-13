"use strict";
/* ============================================================
   astar.js — A* 网格寻路 + 像素航点 (Pathfinding Module)

   三个可复用模块:
   - MapGrid        网格封装(列/行 + 自定义可通行判定 + 单位尺寸清空)
   - AStarPathfinder 8 方向 A*(索引二叉堆开放列表 + typed array)
   - gridToPixels   网格路径 -> 连续像素坐标航点

   设计要点:
   - 坦克为 2×1 长条形,寻路时抽象为"占用中心附近若干格"的节点
     (clearR = 按碰撞半径换算的额外格数),避免为矩形旋转做膨胀运算。
   - 对不可达终点/起点自动就近吸附到可行格,保证总能给出一段可走路径。
   - 对角移动时强制检查两侧正交格,防止斜穿墙角。
   ============================================================ */

// 最小二叉堆(流场等场景仍可用对象节点)
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

// 整数索引二叉堆:A* 开放列表只存格子索引,配合 Float64Array f 使用,
// 不再为每个节点分配 {x,y,f} 对象。
class IndexMinHeap {
  constructor(f){ this.h = []; this.f = f; }
  push(idx){
    const h=this.h, f=this.f; h.push(idx);
    let i=h.length-1;
    while(i>0){
      const p=(i-1)>>1;
      if(f[h[p]] <= f[h[i]]) break;
      [h[p],h[i]]=[h[i],h[p]]; i=p;
    }
  }
  pop(){
    const h=this.h, f=this.f; if(!h.length) return -1;
    const top=h[0], last=h.pop();
    if(h.length){
      h[0]=last; let i=0;
      for(;;){
        let l=i*2+1, r=l+1, best=i;
        if(l<h.length && f[h[l]] < f[h[best]]) best=l;
        if(r<h.length && f[h[r]] < f[h[best]]) best=r;
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
    this.isWalkable = isWalkable || null;   // 兼容旧调用:函数形式 (x,y)=>bool
    this.mask = null;                        // 预生成通行掩码 Uint8Array,优先于 isWalkable
  }
  inBounds(x,y){ return x>=0 && y>=0 && x<this.cols && y<this.rows; }
  cellPassable(x,y){
    if(this.mask) return this.mask[y*this.cols + x] === 1;
    return this.isWalkable ? this.isWalkable(x,y) : false;
  }
  // 带单位尺寸(clearR 格)的可通行检查:中心格 + 周围 clearR 圈全部可行才放行
  passable(x, y, clearR = 0){
    if(!this.inBounds(x,y) || !this.cellPassable(x,y)) return false;
    if(clearR > 0){
      for(let dx=-clearR; dx<=clearR; dx++) for(let dy=-clearR; dy<=clearR; dy++){
        const nx=x+dx, ny=y+dy;
        if(!this.inBounds(nx,ny) || !this.cellPassable(nx,ny)) return false;
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
    this._n = 0;
  }
  ensureArrays(){
    const n = this.grid.cols * this.grid.rows;
    if(this._n === n) return;
    this._n = n;
    this.g = new Float64Array(n);
    this.f = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.state = new Int8Array(n);   // 0=未访问 1=开放 2=已闭合
    this.open = new IndexMinHeap(this.f);
  }
  // 返回网格坐标数组 [[x,y],...](含起点与终点);不可达返回 null
  findPath(sx, sy, tx, ty, clearR = 0){
    const g = this.grid;
    const ok = (x,y)=>g.passable(x,y,clearR);
    const cols = g.cols, rows = g.rows;
    // 起点/终点被占(如建筑压住):自动就近吸附到可行格
    if(!ok(sx,sy)){
      let alt=null;
      let bestD=1e9;
      for(let r=1; r<=Math.max(cols,rows) && r*r<=bestD; r++){
        for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++){
          if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
          const nx=sx+dx, ny=sy+dy;
          if(ok(nx,ny)){
            const d=dx*dx+dy*dy;
            if(d<bestD){ bestD=d; alt=[nx,ny]; }
          }
        }
      }
      if(!alt) return null; sx=alt[0]; sy=alt[1];
    }
    if(!ok(tx,ty)){
      let alt=null;
      let bestD=1e9;
      for(let r=0; r<=Math.max(cols,rows) && r*r<=bestD; r++){
        for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++){
          if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
          const nx=tx+dx, ny=ty+dy;
          if(ok(nx,ny)){
            const d=dx*dx+dy*dy;
            if(d<bestD){ bestD=d; alt=[nx,ny]; }
          }
        }
      }
      if(!alt) return null; tx=alt[0]; ty=alt[1];
    }
    if(sx===tx && sy===ty) return [[sx,sy]];
    this.ensureArrays();
    const n = cols*rows;
    const cost = this.g, f = this.f, parent = this.parent, state = this.state;
    const open = this.open;
    open.h.length = 0;
    state.fill(0);
    const h = this.heuristic;
    const sk = sy*cols + sx;
    cost[sk] = 0; f[sk] = h(sx,sy,tx,ty); parent[sk] = sk; state[sk] = 1;
    open.push(sk);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    const dCost = [1,1,1,1,1.4142,1.4142,1.4142,1.4142];
    let found = false;
    while(open.size){
      const ck = open.pop();
      if(ck < 0) break;
      if(state[ck] !== 1) continue;   // 已闭合或陈旧重复条目
      const cx = ck % cols, cy = (ck / cols) | 0;
      if(cx===tx && cy===ty){ found = true; break; }
      state[ck] = 2;
      for(let i=0;i<dirs.length;i++){
        const ddx = dirs[i][0], ddy = dirs[i][1];
        const nx = cx+ddx, ny = cy+ddy;
        if(!ok(nx,ny)) continue;
        // 对角步进:两侧正交格也必须可行,否则斜穿墙角
        if(this.cornerCheck && ddx!==0 && ddy!==0){
          if(!ok(cx+ddx, cy) || !ok(cx, cy+ddy)) continue;
        }
        const nk = ny*cols + nx;
        if(state[nk] === 2) continue;
        const ng = cost[ck] + dCost[i];
        const prevG = state[nk] === 0 ? 1e9 : cost[nk];
        if(ng < prevG - 0.0001){
          cost[nk] = ng; f[nk] = ng + h(nx,ny,tx,ty); parent[nk] = ck;
          if(state[nk] === 0) state[nk] = 1;
          open.push(nk);   // 已在开放集也重新入堆,弹出时用 state 跳过陈旧条目
        }
      }
    }
    if(!found) return null;
    // 回溯重建路径(带防御性护栏:异常情况直接返回 null,绝不死循环)
    const path = []; let c = ty*cols + tx; let guard = 0;
    while(c !== -1){
      if(++guard > n + 8) return null;
      path.push([c % cols, (c / cols) | 0]);
      if(c === sk) break;
      c = parent[c];
    }
    if(c !== sk) return null;
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
