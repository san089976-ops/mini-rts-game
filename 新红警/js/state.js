"use strict";
/* ============ state.js: 全局状态与工具函数 ============ */
let canvas, ctx, mmCv, mmCtx;
let cam = { x: 0, y: 0, maxX: W, maxY: H };
let mouse = { x:0, y:0, wx:0, wy:0, down:false, downX:0, downY:0, dragging:false };
let keys = {};
let credits = [10000, 3500];
let selected = [];          // 选中的单位
let selBuilding = null;     // 选中的建筑
let placing = null;         // {def} 正在放置的建筑
let selling = false;        // 出售模式
let paused = false;         // 暂停
let units = [], buildings = [], projectiles = [], effects = [], texts = [];
let oreFields = [], blocked = [], terrain = [];   // blocked[x][y], terrain[x][y]='grass'|'tree'|'water'
let gameOver = null, overTimer = 0;
let time = 0;
let aiState = {};
let researches = {};          // 每队已研发科技: team -> {techId:true}
let controlGroups = {};       // 数字编队: digit(1-9) -> [units]
// 队伍配置(游戏开始前由主菜单生成)
let teamFactions = ['allies','soviet'];   // team -> 'allies'|'soviet'
let teamGroups = [0,1];                   // team -> 组号 0(A)/1(B)/2(C)/3(D)
let teamColors = [6,3];                   // team -> TEAM_COLORS 下标
let gameTeams = [];                       // [{name,faction,group,ai,spawn:[x,y]}]
let gameSetup = null;                     // {map:MAPS[i], teams:[...]}
let powerInfo = {};
let frameCount = 0, lastFpsT = 0, fpsEl = null;
let shake = 0;
let panelT = 0;               // 面板重建节流计时
let mmRect = null;            // 小地图屏幕矩形(缓存,resize 时刷新)
const GRID_C = 64;            // 空间网格单元尺寸(像素)
const GRID_COLS = Math.ceil(W / GRID_C);   // 网格横向单元数(用作 key 乘法)
let grid = null;              // 每帧重建的空间网格:cellKey -> [unitIndex]

/* ================= 工具 ================= */
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function rnd(a,b){ return a + Math.random()*(b-a); }
function inBounds(x,y){ return x>=0 && y>=0 && x<W && y<H; }
function cellBlocked(cx,cy){
  if(cx<0||cy<0||cx>=MAP_W||cy>=MAP_H) return true;
  return blocked[cx] && blocked[cx][cy];
}
function textPopup(x,y,str,color){ texts.push({x,y,str,color,life:1.1}); }
