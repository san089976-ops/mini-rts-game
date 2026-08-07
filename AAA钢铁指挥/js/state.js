"use strict";
/* ============ state.js: 全局状态与工具函数 ============ */
let canvas, ctx, mmCv, mmCtx;
// 视口尺寸(CSS 像素,画布按 RENDER_SCALE 放大后备缓冲后,逻辑尺寸仍按窗口大小)
function viewW(){ return (canvas && canvas.clientWidth) || window.innerWidth; }
function viewH(){ return (canvas && canvas.clientHeight) || (window.innerHeight||800)-150; }
let cam = { x: 0, y: 0, maxX: W, maxY: H };
let mouse = { x:0, y:0, wx:0, wy:0, down:false, downX:0, downY:0, dragging:false, middleDown:false, midStartX:0, midStartY:0, midCamX:0, midCamY:0 };
let keys = {};
let credits = [10000, 3500];
let selected = [];          // 选中的单位
let selBuilding = null;     // 选中的建筑
let placing = null;         // {def} 正在放置的建筑
let selling = false;        // 出售模式
let paused = false;         // 暂停
let units = [], buildings = [], projectiles = [], effects = [], texts = [];
let missiles = [];          // 反坦克导弹(自动制导的类单位飞行物)
let interceptors = [];      // 自主防御反导弹(拦截弹:朝来袭 TOW 导弹追踪)
let trackMarks = [];        // 履带/轮子压痕(地面残影:坦克移动时生成,随时间淡出)
let oreFields = [], blocked = [], terrain = [];   // blocked[x][y], terrain[x][y]='grass'|'tree'|'water'
let oreGrid = [];                                  // oreGrid[x][y]=true 表示该格有金矿(禁建建筑,单位可通行)
let structBlocked = [];                            // 建筑占用的格子(区分建筑与树木/水域,供海军寻路)
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
let GRID_COLS = Math.ceil(W / GRID_C);   // 网格横向单元数(用作 key 乘法,setMapSize 时更新)
let grid = null;              // 每帧重建的空间网格:cellKey -> [unitIndex]

/* ================= 工具 ================= */
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function rnd(a,b){ return a + Math.random()*(b-a); }
// 角度最短路径插值(lerpAngle):用于战车/舰艇朝向往目标角的平滑转向
function lerpAngle(a,b,t){
  let d = (b - a) % (Math.PI*2);
  if(d > Math.PI) d -= Math.PI*2;
  else if(d < -Math.PI) d += Math.PI*2;
  return a + d*Math.min(1, Math.max(0, t));
}
function inBounds(x,y){ return x>=0 && y>=0 && x<W && y<H; }
function cellBlocked(cx,cy){
  if(cx<0||cy<0||cx>=MAP_W||cy>=MAP_H) return true;
  return blocked[cx] && blocked[cx][cy];
}
function textPopup(x,y,str,color){ texts.push({x,y,str,color,life:1.1}); }
