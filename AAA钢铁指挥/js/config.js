"use strict";
/* ============ config.js: 常量与配置 ============ */
const TILE = 32;
let MAP_W = 64, MAP_H = 48;
let W = MAP_W * TILE, H = MAP_H * TILE;
const TEAM_A = 0, TEAM_B = 1;
// 攻击指示红线显示时长(秒):下达攻击指令后短暂显示,随后消失,不影响单位继续攻击
const RED_LINE_TIME = 1.5;

// 设置当前地图尺寸(海战图等可更大),所有 MAP_W/MAP_H/W/H 均为运行时读取
function setMapSize(w, h){
  MAP_W = w; MAP_H = h;
  W = MAP_W * TILE; H = MAP_H * TILE;
  GRID_COLS = Math.ceil(W / GRID_C);
  cam.maxX = W; cam.maxY = H;
}
// 渲染分辨率倍率:画布按"设备像素比(1.5~4)与 RENDER_SCALE 取较大值"放大,再缩回窗口显示,让画面更清晰。
// 4x 下艾布拉姆/T90 贴图在同一屏幕大小内获得 2 倍于之前的像素,细节更清晰。
// 若感到卡顿可改成 3 或 2。
const RENDER_SCALE = 2;

// 阵营:盟军(蓝)/苏军(红)。地图上盟友/自己=蓝,敌人=红;模型按各自阵营
let playerFaction = 'allies';
// 队伍分组:最多 4 组(A/B/C/D)。同组互不敌对,不同组互敌对;玩家所在组=友方(蓝)
function playerGroup(){ return teamGroups[0]; }
function teamCol(team){
  return (teamGroups[team]===playerGroup()) ? '#4f8ff0' : '#e05050';
}
function isEnemy(t1,t2){ return t1!==t2 && teamGroups[t1]!==teamGroups[t2]; }
function teamGroup(team){ return (teamGroups[team]===playerGroup()) ? 0 : 1; }

/* ============ 队伍颜色(角标用,不改变蓝/红阵营色) ============ */
const TEAM_COLORS = [
  { name:'黄色',   hex:'#ffe27a' },
  { name:'黑色',   hex:'#2a2d33' },
  { name:'青色',   hex:'#2ad4d4' },
  { name:'红色',   hex:'#e05050' },
  { name:'深红色', hex:'#8a1a1a' },
  { name:'绿色',   hex:'#5aa02a' },
  { name:'蓝色',   hex:'#4f8ff0' },
  { name:'天蓝色', hex:'#7ad0ff' },
  { name:'紫色',   hex:'#a85ae0' },
];
function teamColor(team){ return (teamColors && teamColors[team]) ? TEAM_COLORS[teamColors[team]].hex : '#9a9a9a'; }

/* ============ 弹丸 / 护甲系统 ============ */
// 弹丸类型:火炮 cannon / 子弹 bullet / 机炮 machinegun
const PROJ_NAME = { cannon:'火炮', bullet:'子弹', machinegun:'机炮', missile:'导弹' };
// 护甲类型:布甲 / 钢甲 / 铸铁甲 / 钛合金甲 / 混泥土甲 / 木甲
const ARMOR_NAME = { cloth:'布甲', steel:'钢甲', castiron:'铸铁甲', titanium:'钛合金甲', concrete:'混泥土甲', wood:'木甲' };
// 伤害修正表: 修正比 = 该护甲对某种弹丸的伤害倍率(1.0=100%)
const ARMOR_MOD = {
  cloth:    { cannon:0.8, bullet:0.8, machinegun:1.2 },
  steel:    { cannon:1.0, bullet:0.4, machinegun:0.8 },
  castiron: { cannon:1.0, bullet:0.4, machinegun:0.6 },
  titanium: { cannon:0.8, bullet:0.2, machinegun:0.4 },
  concrete: { cannon:1.0, bullet:0.4, machinegun:0.6 },
  wood:     { cannon:1.0, bullet:1.0, machinegun:1.0 },
};
// 反坦克导弹伤害修正(proj='missile' 时用):铸铁甲/钢甲 120%,钛合金 90%,布甲/木甲/混泥土甲 80%
const MISSILE_MOD = { castiron:1.2, steel:1.2, titanium:0.9, cloth:0.8, wood:0.8, concrete:0.8 };
function armorMod(ent, proj, attacker){
  const armor = ent && ent.armor ? ent.armor : 'wood';
  // 磁暴步兵:对布甲修正比提升至 150%
  if(attacker && attacker.type==='magnet' && armor==='cloth') return 1.5;
  // 建筑专属弹丸修正(如核电站/五角大楼:火炮伤害 50%)
  if(ent && ent.def && ent.def.dmgMod && ent.def.dmgMod[proj] !== undefined) return ent.def.dmgMod[proj];
  // 反坦克导弹:独立修正表
  if(proj==='missile') return MISSILE_MOD[armor] || 1;
  const row = ARMOR_MOD[armor];
  return (row && row[proj]) || 1;
}

// 碰撞箱(半宽/半高,大致框住各贴图;缺省 = r*0.85)。单位被化为"双圆胶囊"碰撞:
// colR = min(hw,hh) 为圆半径, colOff = max(hw,hh)-min(hw,hh) 为头/尾圆圆心距中心距离。
// 坦克为 2×1 长条形:实测贴图(img/units/tank_*_field.png 车头朝上 200x512,
// 游戏内 SPRITE_ROT 旋转后战场本体≈68x26px),故 hw=半长 34, hh=半宽 13。
const UNIT_BOX = {
  infantry:{hw:8, hh:8}, exo:{hw:9, hh:9}, magnet:{hw:9, hh:9},
  tank:{hw:34, hh:13}, mcv:{hw:36, hh:15}, harvester:{hw:24, hh:16},
  abrams:{hw:36, hh:15}, t90:{hw:34, hh:13},
  destroyer:{hw:58, hh:11}, transport:{hw:42, hh:16},
  airfield_car:{hw:32, hh:13},
  bradley:{hw:30, hh:12}, b11:{hw:28, hh:12}, marder:{hw:30, hh:12},
  leclerc:{hw:36, hh:14}, leopard:{hw:36, hh:14}, challenger:{hw:37, hh:15},
  puma:{hw:33, hh:13},
};
// 战车转向角速度(弧度/秒):朝向用 lerpAngle 平滑插值,产生履带战车转向效果,而非瞬间硬转
const TURN_RATE = 6;
// 载具阻尼转向参数:匀速旋转 + 起步/换向角加速度 + 到位前减速(履带转向感)
const TURN_MAX_SPEED = 2.6;    // 载具转向匀速(rad/s):缓慢的履带转向
const TURN_ACCEL = 20;         // 转向角加速度(rad/s²):起步/换向平滑
// 载具横移削减系数:履带车几乎不能横移,只能朝车头方向前进/倒退
const VEHICLE_LATERAL = 0.18;
// 载具转向对齐门(rad):期望方向与车头夹角超过此值时,先原地匀速转向、不做任何移动;
// 对齐后才沿车头直线开过去(移动中几乎不转弯)
const VEHICLE_ALIGN_GATE = 0.35;
// 载具渲染偏移参数:起步/刹车俯仰 + 开火后坐力(只改渲染偏移,不动逻辑坐标)
const FIRE_RECOIL = 8;        // 开火后坐力初始偏移(px)
const RECOIL_DECAY = 14;      // 后坐力恢复速率(1/s,越大回弹越快,约0.1~0.2s恢复)
// 有履带压痕的载具(除海军驱逐舰/登陆艇外的所有车辆)
const TRACK_UNITS = { tank:1, abrams:1, t90:1, harvester:1, mcv:1, airfield_car:1, bradley:1, b11:1, marder:1, leclerc:1, leopard:1, challenger:1, puma:1 };
const BASE_UNITS = {
  infantry: { name:'动员兵', hp:90, speed:74, range:72, damage:9, rof:0.9, cost:100, r:9,  build:4, armor:'cloth', proj:'bullet', desc:'低造价轻步兵,前期侦察与骚扰的主力' },
  tank:     { name:'M60', hp:330, speed:60, range:118, damage:38, rof:1.0, cost:500, r:13, build:9, armor:'castiron', proj:'cannon', desc:'盟军主战坦克,火力与装甲均衡,战场中坚' },
  harvester:{ name:'采矿车', hp:1200, speed:56, range:0, damage:0, rof:0, cost:700, r:13, build:11, capacity:500, armor:'castiron', proj:null, desc:'自动往返采集金矿并送回基地换钱,经济命脉' },
  mcv:      { name:'基地车', hp:900, speed:45, range:0, damage:0, rof:0, cost:1800, r:14, build:14, armor:'titanium', proj:null, desc:'可移动的基地核心,在空地展开(快捷键 E)后变成新的建造厂' },
  airfield_car:{ name:'机场建筑车', hp:600, speed:52, range:105, damage:15, rof:0.6, cost:1200, r:13, build:12, armor:'castiron', proj:'bullet', desc:'由升级建造厂生产的机场工程车,装有自卫机枪,可在空地展开(E)变成机场(占地2x3)' },
};
const UNIT_DEFS = BASE_UNITS; // 兼容引用
const UNIT_DEF_CACHE = {};
// 海军/两栖单位:两阵营通用
const NAVAL_UNITS = {
  destroyer: { name:'驱逐舰', hp:800, speed:56, range:118, damage:90, rof:1.2, cost:1000, r:16, build:12, armor:'castiron', proj:'cannon', naval:true, desc:'海军主力舰艇:舰炮对陆/对海火力强劲,只能在水中航行' },
  transport:{ name:'运输艇', hp:500, speed:70, range:105, damage:10, rof:0.6, cost:800, r:16, build:8, armor:'steel', proj:'bullet', amphib:true, capacity:12, desc:'两栖登陆艇:陆海通行,可装载12点地面单位' },
};
// 运输艇装载占点数: 步兵1 / 高级步兵2 / 矿车·灰熊3 / 犀牛4 / 基地车·艾布拉姆·T90 6;海军不上船
function transportCost(u){  if(!u) return 0;
  if(u.naval || u.type==='transport') return 0;
  if(u.type==='infantry') return 1;
  if(u.type==='exo' || u.type==='magnet') return 2;
  if(u.type==='harvester') return 3;
  if(u.type==='tank') return unitFactionOf(u.team)==='soviet' ? 4 : 3;
  if(u.type==='airfield_car') return 4;
  if(u.type==='mcv' || u.type==='abrams' || u.type==='t90') return 6;
  if(u.type==='bradley' || u.type==='b11' || u.type==='marder' || u.type==='leclerc' || u.type==='leopard' || u.type==='challenger' || u.type==='puma') return 6;
  return 1;
}
function usedCapacity(t){ return t.cargoUnits ? t.cargoUnits.reduce((s,c)=>s+transportCost(c),0) : 0; }
// 运兵车判定:运输艇或带"运兵舱"(carrier)的车辆(布拉德利/黄鼠狼/B11 等)
function isCarrier(u){ return !!(u && (u.type==='transport' || (u.def && u.def.carrier))); }
// 某单位能否装进某运兵车:运输艇可装任意地面单位;步兵战车只装步兵类
function canBoardUnit(carrier, u){
  if(!carrier || !u || u===carrier || u.naval || u.amphib || transportCost(u)<=0) return false;
  if(carrier.type==='transport') return true;
  return u.type==='infantry' || u.type==='exo' || u.type==='magnet';
}
/* ============ 25mm 机炮弹(步兵战车专属:贴图弹丸 + 先加速后匀速) ============ */
const IFV_TYPES = ['puma','bradley','marder','b11'];
function isIFV25(u){ return !!u && IFV_TYPES.indexOf(u.type)!==-1; }
const IFV_ACCEL = 2600;        // 弹丸加速度(px/s²):先加速后匀速,起步有劲道
const IFV_START_FACTOR = 0.25; // 弹丸初速 = 最大速度 × 该系数
const BULLET_25MM_LEN = 8;     // 25mm 弹丸渲染长度(px)
/* ============ 反坦克导弹模块(美洲狮/黄鼠狼/布拉德利) ============ */
const ATGM_TYPES = ['puma','bradley','marder'];          // 可装反坦克导弹的战车
const ATGM_COST = 150;                                   // 模块价格
const ATGM_UPGRADE_TIME = 6;                             // 模块安装耗时(秒)
const ATGM_RANGE = 180;                                  // 导弹射程
const ATGM_DAMAGE = 300;                                 // 单发伤害(单体)
const ATGM_SPEED = 210;                                  // 导弹最大速度
const ATGM_ACCEL = 1200;                                 // 导弹加速度(先加速后匀速)
const ATGM_START_FACTOR = 0.3;                           // 导弹初速 = 最大速度 × 该系数
const ATGM_RELOAD = 15;                                  // 每次装填时间(秒)
const ATGM_TURN_RATE = 3;                                // 导弹转向角速度(rad/s,稍微转弯)
const ATGM_AOE_RADIUS = 34;                              // 范围伤害半径(不要太大)
const ATGM_AOE_FACTOR = 0.5;                             // 范围伤害比例(单体满伤,其它×该系数)
const ATGM_HIT_R = 12;                                   // 命中/被挡判定半径(px)
const TOW_MISSILE_LEN = 28;                              // TOW 导弹渲染长度(px)
const SPIKE_MISSILE_LEN = 25;                            // 长钉(Spike)导弹渲染长度(px)
/* ============ 坦克炮弹(125mm 贴图,车头朝左,长18px,匀速) ============ */
const TANK_SHELL_LEN = 18;                               // 坦克炮弹渲染长度(px)
function isTankShellUnit(u){ return !!u && (u.type==='tank'||u.type==='abrams'||u.type==='t90'||u.type==='leclerc'||u.type==='leopard'||u.type==='challenger'); }
function getUnitDefs(faction){
  if(UNIT_DEF_CACHE[faction]) return UNIT_DEF_CACHE[faction];
  let defs;
  if(faction==='allies'){
    defs = {
      infantry:{ ...BASE_UNITS.infantry, name:'北约士兵', hp:230, damage:16, cost:225 },
      tank:    { ...BASE_UNITS.tank },
      harvester:{ ...BASE_UNITS.harvester },
      mcv:      { ...BASE_UNITS.mcv },
      airfield_car:{ ...BASE_UNITS.airfield_car },
      abrams:  { name:'艾布拉姆斯坦克', hp:1200, speed:62, range:122, damage:130, rof:1.1, cost:1500, r:14, build:9, armor:'titanium', proj:'cannon', desc:'盟军重型主战坦克,装甲厚重火力凶猛,需升级战车工厂' },
      exo:     { name:'外骨骼大兵', hp:330, speed:74, range:118, damage:70, rof:1.5, cost:460, r:9, build:8, armor:'steel', proj:'cannon', desc:'盟军高科技单兵:外骨骼装甲手持炮管,射程火力逼近主战坦克,需升级兵营' },
      destroyer:{ ...NAVAL_UNITS.destroyer },
      transport:{ ...NAVAL_UNITS.transport },
      bradley: { name:'布拉德利步兵战车', hp:420, speed:54, range:140, damage:25, rof:0.33, cost:700, r:12, build:10, armor:'castiron', proj:'machinegun', carrier:true, capacity:3, desc:'盟军步兵战车:机炮火力压制,可装载3名步兵,需升级战车工厂' },
      marder:  { name:'黄鼠狼步兵战车', hp:370, speed:66, range:135, damage:25, rof:0.33, cost:600, r:12, build:10, armor:'castiron', proj:'machinegun', carrier:true, capacity:6, desc:'盟军步兵战车:机动灵活,可装载6名步兵,需升级战车工厂' },
      leclerc: { name:'法制勒克莱尔', hp:1100, speed:66, range:145, damage:100, rof:0.9, cost:1350, r:14, build:14, armor:'titanium', proj:'cannon', desc:'盟军第三代主战坦克:射程火力兼备,机动优于艾布拉姆斯,需升级战车工厂' },
      leopard: { name:'豹2A4', hp:950, speed:66, range:140, damage:110, rof:0.95, cost:1200, r:14, build:14, armor:'titanium', proj:'cannon', desc:'盟军主战坦克:火力凶猛的德系战车,机动良好,需升级战车工厂' },
      challenger:{ name:'挑战者号', hp:1050, speed:56, range:140, damage:110, rof:0.95, cost:1500, r:14, build:14, armor:'titanium', proj:'cannon', upgradeable:true, desc:'盟军重型主战坦克:装甲厚重,可两次升级为挑战者2号/3号(每次+15伤害+120血),需升级战车工厂' },
      puma:     { name:'美洲狮步战车', hp:450, speed:70, range:135, damage:25, rof:0.35, cost:750, r:12, build:10, armor:'titanium', proj:'machinegun', desc:'高速轮式步战车:炮塔独立360°旋转,炮口对准射程内目标才开火,需升级战车工厂' },
    };
  } else {
    defs = {
      infantry:{ ...BASE_UNITS.infantry },
      tank:    { ...BASE_UNITS.tank, name:'T54', hp:450, damage:45, cost:650, r:14 },
      harvester:{ ...BASE_UNITS.harvester },
      mcv:      { ...BASE_UNITS.mcv },
      airfield_car:{ ...BASE_UNITS.airfield_car },
      t90:     { name:'T90坦克', hp:900, speed:72, range:116, damage:80, rof:0.9, cost:1000, r:13, build:9, armor:'titanium', proj:'cannon', desc:'苏军主战坦克,机动灵活射速快,需升级战车工厂' },
      magnet:  { name:'磁暴步兵', hp:250, speed:58, range:72, damage:110, rof:3, cost:350, r:9, build:7, armor:'steel', proj:'cannon', desc:'苏军高科技步兵:电磁手套释放闪电,对布甲伤害提升至150%,需升级兵营' },
      destroyer:{ ...NAVAL_UNITS.destroyer },
      transport:{ ...NAVAL_UNITS.transport },
      b11:     { name:'俄制B11', hp:370, speed:66, range:135, damage:25, rof:0.4, cost:580, r:12, build:10, armor:'castiron', proj:'machinegun', amphib:true, carrier:true, capacity:7, desc:'苏军两栖步兵战车:机炮压制,水陆两栖,可装载7名步兵,需升级战车工厂' },
    };
  }
  UNIT_DEF_CACHE[faction] = defs;
  return defs;
}
function unitFactionOf(team){ return teamFactions[team] || 'allies'; }
function advancedInfantryType(team){ return unitFactionOf(team)==='allies' ? 'exo' : 'magnet'; }

const UNIT_DESC = {
  b_command:'基地核心,展开后可建造各类建筑',
  b_power:'为基地供电,保证生产速度与防御设施运行',
  b_barracks:'训练步兵的营房',
  b_factory:'生产主战坦克与采矿车的战车工厂',
  b_refinery:'接收采矿车矿石并兑换成资金',
  b_turret:'固定防御碉堡,自动攻击射程内敌人',
  b_repair:'维修厂:周围两格内的己方单位每秒恢复 10 点生命(治疗光环)',
  b_dock:'水上船坞:只能建在水上,生产驱逐舰与运输艇',
  b_airfield:'展开后形成的机场建筑,占地2x3,木制护甲,可被摧毁并影响胜负',
};
const BLD_DEFS = {
  command:  { name:'建造厂',  w:3,h:3, hp:1800, cost:0, power:50, buildTime:1,  build:['power','barracks','factory','refinery','turret','repair','lab','dock'], train:['airfield_car'], color:'#5b6b7a', armor:'wood', weapon:null },
  power:    { name:'发电厂',  w:2,h:2, hp:520,  cost:100, power:50, buildTime:5,  build:[],    color:'#b06a3a', armor:'wood', weapon:null },
  barracks: { name:'兵营',    w:2,h:2, hp:460,  cost:200, power:0, buildTime:7,  train:['infantry'], color:'#5a7a4a', armor:'wood', weapon:null },
  factory:  { name:'战车工厂',w:3,h:3, hp:680,  cost:800, power:0, buildTime:14, train:['tank','harvester'], color:'#4a5a8a', armor:'wood', weapon:null },
  refinery: { name:'矿石精炼厂',w:3,h:3, hp:620, cost:600, power:0, buildTime:12, train:[],  color:'#9a8a3a', armor:'wood', weapon:null },
  turret:   { name:'碉堡',    w:1,h:1, hp:520,  cost:300, power:0, buildTime:7,  train:[],  color:'#6a6a6a', armor:'concrete', weapon:{range:160, damage:24, rof:0.75, bulletSpeed:420, proj:'machinegun'} },
  repair:   { name:'维修厂',  w:2,h:2, hp:560,  cost:500, power:0, buildTime:8,  train:[],  color:'#7a6a4a', armor:'wood', weapon:null },
  lab:      { name:'实验室',  w:2,h:2, hp:600,  cost:1000, power:0, buildTime:20, build:[],  color:'#5a5a8a', armor:'wood', weapon:null },
  dock:     { name:'船坞',    w:2,h:2, hp:720,  cost:600, power:0, buildTime:10, train:['destroyer','transport'], color:'#4a7a8a', armor:'wood', weapon:null, water:true },
  airfield: { name:'机场',    w:2,h:3, hp:750,  cost:1200, power:0, buildTime:14, build:[],  color:'#6a7a8a', armor:'wood', weapon:null },
  /* ============ 中立建筑(不可建造:不出现在任何可建列表,仅地图装饰) ============ */
  school:   { name:'学校',     w:2,h:2, hp:1000, cost:0, power:0, buildTime:0, build:[], color:'#c9b58a', armor:'concrete', weapon:null, neutral:true, garrisonCap:5, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:城市学校,占地2x2,混凝土护甲。可进驻5名步兵,进驻后归该方所有并向外射击(射程+20)' },
  hospital: { name:'医院',     w:2,h:2, hp:1200, cost:0, power:0, buildTime:0, build:[], color:'#d8a0a0', armor:'concrete', weapon:null, neutral:true, desc:'中立建筑:城市医院,占地2x2,混凝土护甲。可被摧毁,但不影响胜负' },
  house_jp1:{ name:'日式独栋别墅1', w:1,h:1, hp:500, cost:0, power:0, buildTime:0, build:[], color:'#b09a7a', armor:'wood', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:日式独栋别墅,占地1x1,木制护甲。可进驻3名步兵,进驻后归该方所有并向外射击(射程+20)' },
  house_jp2:{ name:'日式独栋别墅2', w:1,h:1, hp:500, cost:0, power:0, buildTime:0, build:[], color:'#b09a7a', armor:'wood', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:日式独栋别墅,占地1x1,木制护甲。可进驻3名步兵,进驻后归该方所有并向外射击(射程+20)' },
  house_us:{ name:'美式独栋建筑', w:1,h:1, hp:600, cost:0, power:0, buildTime:0, build:[], color:'#c0b0a0', armor:'wood', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:美式独栋住宅,占地1x1,木制护甲。可进驻3名步兵,进驻后归该方所有并向外射击(射程+20)' },
  nuclear:  { name:'核电站',   w:3,h:3, hp:2300, cost:0, power:0, buildTime:0, build:[], color:'#7a8a5a', armor:'concrete', weapon:null, neutral:true, dmgMod:{cannon:0.5}, desc:'中立建筑:核电站,占地3x3,混凝土护甲,受火炮伤害修正比为50%' },
  mall:     { name:'综合商业体', w:4,h:4, hp:4000, cost:0, power:0, buildTime:0, build:[], color:'#a09a8a', armor:'wood', weapon:null, neutral:true, garrisonCap:12, garrisonTypes:['infantry','exo','magnet'], tankSlot:1, desc:'中立建筑:综合商业体,占地4x4,木制护甲。可进驻12名步兵 + 1个专属坦克位,进驻后归该方所有并向外射击(射程+20)' },
  pentagon: { name:'五角大楼', w:4,h:4, hp:5000, cost:0, power:0, buildTime:0, build:[], color:'#9a9a8a', armor:'concrete', weapon:null, neutral:true, dmgMod:{cannon:0.5}, desc:'中立建筑:五角大楼,占地4x4,混凝土护甲,受火炮伤害修正比为50%' },
};
// 船坞可建造范围:整块落水的同时,须距离最近己方建筑 ≤ 此格数(贴近基地下海,不能乱修)
const DOCK_BUILD_RANGE = 8;
// 战车工厂升级
const FACTORY_UPGRADE_COST = 500;
const FACTORY_UPGRADE_TIME = 10;
// 建造厂升级(升1级解锁机场建筑车)
const COMMAND_UPGRADE_COST = 1000;
const COMMAND_UPGRADE_TIME = 15;
// 兵营升级(升1级解锁高级步兵)
const BARRAX_UPGRADE_COST = 250;
const BARRAX_UPGRADE_TIME = 9;
// 发电厂升级(可升2级)
const POWER_UPGRADE_COST = 100;   // 每级费用
const POWER_UPGRADE_GAIN = 25;    // 每级电力
const POWER_UPGRADE_INCOME = 1;   // 每级每秒收入
const POWER_UPGRADE_TIME = 8;     // 每级升级时间(秒)
const POWER_MAX_LEVEL = 2;
// 挑战者坦克升级(分两级,每次 +15 伤害 +120 血,8 秒)
const CHALL_UPGRADE_COST = 300;
const CHALL_UPGRADE_TIME = 8;
const CHALL_UPGRADE_DMG = 15;
const CHALL_UPGRADE_HP = 120;
const CHALL_NAMES = ['挑战者号','挑战者2号','挑战者3号'];

/* ============ 实验室 / 科技研究 ============ */
// 通用科技 base=true;阵营专属通过 faction 指定(盟军 allies / 苏军 soviet)
const RESEARCH_DEFS = {
  powerInc:  { name:'发电改进', cost:2000, time:30, base:true, desc:'每个发电站每秒收入 +1(需电厂升级 1 级以上)' },
  oreRefine: { name:'矿石精炼', cost:1000, time:60, base:true, desc:'采矿车每车矿收益翻倍' },
  advTurret: { name:'高级炮台', cost:3500, time:100, base:true, desc:'碉堡血量提升至1200,伤害提升至60' },
  depletedUranium: { name:'贫铀利用', cost:5000, time:200, base:false, faction:'allies', desc:'艾布拉姆斯受到的伤害 -10,造成的伤害 +20' },
  reactiveArmor:   { name:'反应装甲', cost:5000, time:200, base:false, faction:'soviet', desc:'T90获得300护盾(每秒恢复15),并免疫一次致命伤害' },
};
const ADV_TURRET_HP = 1200;     // 高级炮台:碉堡血量
const ADV_TURRET_DMG = 60;      // 高级炮台:碉堡伤害
const REACTIVE_SHIELD = 300;    // 反应装甲:T90护盾值
const REACTIVE_REGEN = 15;      // 反应装甲:护盾每秒恢复
// 该阵营是否已研发某科技(researches 定义于 state.js)
function hasResearch(team, id){
  return !!(researches && researches[team] && researches[team][id]);
}

/* ============ 贴图配置 ============ */
// 单位/建筑贴图映射。单位素材统一放 img/units/ 目录,以后替换单位素材直接改这个文件夹里的同名文件即可
const IMAGES = {
  infantry:'img/units/infantry.png', tank:'img/units/tank.png', harvester:'img/harvester.png',
  command:'img/command.png', power:'img/power.png', barracks:'img/barracks.png',
  factory:'img/factory.png', refinery:'img/refinery.png', turret:'img/turret.png',
  abrams:'img/units/abrams.png', t90:'img/units/t90.png',
  // 建造栏/介绍栏专属图标(战场贴图用各自 _field,互不影响)
  tank_allies:'img/tank_allies.png',       // 灰熊(M60)面板图标
  tank_soviet:'img/tank_soviet.png',       // 犀牛(T54)面板图标
  abrams_panel:'img/abrams_panel.png',     // 艾布拉姆斯面板图标
  t90_panel:'img/t90_panel.png',           // T90面板图标(战场用 img/units/t90.png)
  factory_panel:'img/factory_panel.png',   // 战车工厂面板图标
  lab:'img/lab.png',                       // 实验室面板图标(战场用 lab_field)
  repair:'img/repair.png',                 // 维修厂面板图标(战场用 repair_field)
  dock:'img/dock.png',                     // 船坞面板图标(战场用 dock_field)
  destroyer:'img/destroyer.png',           // 驱逐舰面板图标(战场用 destroyer_field)
  transport:'img/transport.jpg',           // 登陆艇面板图标(战场用 transport_field)
  // 发电站战场等级贴图(powerLevel 0/1/2),与建造栏图标 power 分开
  power0:'img/power_0.png', power1:'img/power_1.png', power2:'img/power_2.png',
  // 兵营/精炼厂战场贴图,与建造栏/解释栏图标 barracks/refinery 分开
  barracks_field:'img/barracks_field.png', refinery_field:'img/refinery_field.png',
  lab_field:'img/lab_field.png', repair_field:'img/repair_field.png',
  turret_field:'img/turret_field.png', dock_field:'img/dock_field.png',
  harvester_field:'img/harvester_field.png',   // 采矿车战场本体贴图(已顺时针90°,车头朝上)
  destroyer_field:'img/destroyer_field.png',   // 驱逐舰战场贴图(照片本就车头朝上)
  transport_field:'img/transport_field.png',   // 登陆艇战场贴图(照片本就车头朝上)
  // 步兵战场贴图(北约士兵/动员兵/外骨骼/磁暴),已去白底
  infantry_allies_field:'img/infantry_allies_field.png',   // 北约士兵(盟军步兵)
  infantry_soviet_field:'img/infantry_soviet_field.png',   // 动员兵(苏军步兵)
  exo_field:'img/exo_field.png',                           // 外骨骼大兵(盟军高级步兵)
  magnet_field:'img/magnet_field.png',                     // 磁暴步兵战场贴图(苏军高级步兵)
  magnet:'img/magnet.png',                                 // 磁暴步兵建造栏/介绍栏图标
  tank_allies_field:'img/tank_allies_field.png',  // M60(盟军,已旋转180°车头朝上)
  tank_soviet_field:'img/tank_soviet_field.png',  // T54(苏军,照片本就车头朝上)
  // 新型步兵战车/主战坦克(战场贴图与面板图标共用同一张)
  bradley:'img/units/bradley_field.png', bradley_field:'img/units/bradley_field.png',
  b11:'img/units/b11_field.png', b11_field:'img/units/b11_field.png',
  marder:'img/units/marder_field.png', marder_field:'img/units/marder_field.png',
  leclerc:'img/units/leclerc_field.png', leclerc_field:'img/units/leclerc_field.png',
  leopard:'img/units/leopard_field.png', leopard_field:'img/units/leopard_field.png',
  challenger:'img/units/challenger_field.png', challenger_field:'img/units/challenger_field.png',
  // 美洲狮步战车(车身+炮台分开两张:车身面板图标用车身图;两图均白底已挖、车头朝上)
  puma:'img/units/puma_body.png', puma_body:'img/units/puma_body.png', puma_turret:'img/units/puma_turret.png',
  bullet_25mm:'img/units/bullet_25mm.png',   // 25mm 机炮弹(步兵战车专属弹丸,已挖白底、车头朝上)
  tow_missile:'img/units/tow_missile.png',   // TOW 反坦克导弹(黄鼠狼/布拉德利,横向车头朝右)
  spike_missile:'img/units/spike_missile.png', // 长钉反坦克导弹(美洲狮,横向车头朝右)
  shell_125mm:'img/units/shell_125mm.png',   // 125mm 坦克炮弹(横向车头朝左)
  // 基地车/机场建筑车战场贴图(照片白底已处理,基地车车头朝下/机场建筑车车头朝上,SPRITE_ROT 对齐)
  mcv:'img/units/mcv_field.png',                  // 基地车面板图标(战场用同一张)
  mcv_field:'img/units/mcv_field.png',            // 基地车战场本体贴图
  airfield_car:'img/units/airfield_car_field.png',// 机场建筑车面板图标(战场用同一张)
  airfield_car_field:'img/units/airfield_car_field.png',// 机场建筑车战场本体贴图
  airfield:'img/airfield.png',                    // 机场建筑战场贴图
  goldmine:'img/goldmine.png',
  tree:'img/tree.png',                          // 树林战场背景贴图(整张压缩,未切块)
  // 中立建筑战场贴图(仅战场贴图,不出现在介绍栏/建造栏)
  school:'img/school.png', hospital:'img/hospital.png',
  house_jp1:'img/house_jp1.png', house_jp2:'img/house_jp2.png', house_us:'img/house_us.png',
  nuclear:'img/nuclear.png', mall:'img/mall.png', pentagon:'img/pentagon.png',
};

/* ============ 单位光影 / 接地渲染调参(全部可改,让坦克"置身于场景中") ============ */
// 方向性阴影偏移(px):全局光来自左上方,阴影落在右下方。偏移不宜过大,否则会"脱开车身"显得悬浮
const UNIT_SHADOW_OFFSET = { x:5, y:8 };
// 剪影 L 形投影偏移(px):用"车体贴图剪影"当阴影,相对车体只偏移一点点,露出右下角 L 形黑边
const UNIT_SHADOW_L_OFFSET = { x:4, y:6 };
// 剪影阴影不透明度(0.4~0.6 之间效果自然)
const UNIT_SHADOW_ALPHA = 0.45;
// 阴影预烘焙高斯模糊半径(px):烘焙一次,运行期直接 drawImage,零每帧滤镜开销
const UNIT_SHADOW_BLUR = 5;
// 长方形阴影的模糊半径(px):比剪影略大,让"长方体落地"的方形投影边缘更柔和
const UNIT_SHADOW_RECT_BLUR = 9;
// 接地接触阴影(AO)不透明度:车身正下方与"车体足迹"同尺寸的暗色椭圆,
// 这是让坦克"压在地面上、不悬浮"的关键——足迹多大,阴影就多大。
const UNIT_SHADOW_AO = 0.36;
// 照片单位色调对齐滤镜(等价 PixiJS ColorMatrixFilter 的 饱和度/对比度/亮度/色相):
//   saturate()   饱和度  调低让照片不那么"跳"
//   contrast()   对比度  微调
//   brightness() 亮度
//   hue-rotate() 色相   往绿草地方向微调(如 hue-rotate(3deg)),消除色温差
// 可改为 '' 完全关闭。该滤镜在加载时烘焙到离屏 Canvas,不逐帧开销。
const UNIT_TONE_FILTER = 'saturate(0.85) contrast(1.05) brightness(0.98) hue-rotate(3deg)';

/* ============ 建筑真实感渲染调参(四层结构:地基→长阴影→墙根AO→主体) ============ */
const BUILDING_PAD_EXTRA = 9;        // 层0:地基底座向外扩展(px),破除建筑直接插在草地上的生硬感
const BUILDING_PAD_ALPHA = 0.36;     // 层0:暗色泥土/碎石底座不透明度(羽化边缘)
const BUILDING_SHADOW_OFFSET = { x:15, y:20 };   // 层1:方向性长阴影偏移(光在左上方,影落右下方)
const BUILDING_SHADOW_SCALE = { x:1.08, y:1.12 }; // 层1:阴影拉伸比例(略大于建筑,像日照拉长的影子)
const BUILDING_SHADOW_ALPHA = 0.4;   // 层1:长阴影不透明度
const BUILDING_AO_HEIGHT = 6;        // 层2:墙根接触阴影(AO)高度(px),极窄
const BUILDING_AO_ALPHA = 0.42;      // 层2:墙根 AO 不透明度,把建筑"压实"在地面上

/* ============ 金矿 ============ */
const ORE_PER_TILE = 5000;   // 每格金矿储量(采完即消失)
const MIN_ORE_DIST = 14;     // 金矿堆与出生点的最小格子距离(格),避免贴脸基地
const HARVEST_SPEED = 1.5;   // 矿车采矿速度倍率
const imgs = {};
// 坦克照片已用脚本预处理:背景(纯黑/纯白)透明化 + 内容居中
// 各贴图"炮管/车头"自然朝向(图像坐标系,顺时针,+X=右),绘制时旋转对齐到单位朝向前方。
// 艾布拉姆/ T90 的炮管都在贴图左侧(向左),因此转角均为 180°(π),开火闪光画在贴图左侧即炮口。
const SPRITE_ROT = { abrams: Math.PI, t90: Math.PI, harvester: Math.PI/2, destroyer: Math.PI/2, transport: Math.PI/2, tank: Math.PI/2, infantry: -Math.PI/2, exo: -Math.PI/2, magnet: Math.PI/2, mcv: -Math.PI/2, airfield_car: Math.PI/2, bradley: Math.PI/2, marder: Math.PI/2, leclerc: Math.PI/2, leopard: Math.PI/2, challenger: Math.PI/2, b11: -Math.PI/2, puma: Math.PI/2 };
// 照片贴图额外缩放(步兵照片用 0.42,让小人贴合碰撞箱大小;步兵战车整体缩小到 0.7)
const SPRITE_SCALE = { harvester: 0.7, destroyer: 1.4, infantry: 0.42, exo: 0.42, magnet: 0.42, bradley: 0.7, marder: 0.7, b11: 0.7, puma: 0.6776 };  // puma: 0.7*0.8(缩小)*1.1*1.1(两次放大)=0.6776
const SPRITE_FRONT = { abrams:[-1,0], t90:[-1,0], harvester:[0,-1], destroyer:[0,-1], transport:[0,-1], tank:[0,-1], infantry:[0,1], exo:[0,1], magnet:[0,-1], mcv:[0,1], airfield_car:[0,-1], bradley:[0,-1], marder:[0,-1], leclerc:[0,-1], leopard:[0,-1], challenger:[0,-1], b11:[0,1] };
// 草地贴图块:由 tools/split-terrain.js 从"草地.png"切成 4x4=16 块,
// 每个草地格随机取一块平铺,提升陆地细致度
const TERRAIN_TILE_COUNT = 16;
const terrainTiles = [];
// 水域贴图块:由 tools/split-terrain.js 从"水域.png"切成 2x2=4 块,
// 每个水域格随机取一块平铺(保留上方波光动画叠加)
const WATER_TILE_COUNT = 4;
const waterTiles = [];
// 可碾树的重型单位:坦克/艾布拉姆/T90/基地车/采矿车/两栖运输艇/机场建筑车/新步兵战车主战坦克
function crushesTrees(type){
  return type==='tank' || type==='abrams' || type==='t90' || type==='mcv' || type==='harvester' || type==='transport' || type==='airfield_car' ||
         type==='bradley' || type==='b11' || type==='marder' || type==='leclerc' || type==='leopard' || type==='challenger';
}
function preloadImages(){
  for(const k in IMAGES){
    const im=new Image();
    im.onload=()=>{ imgs[k]=im; };
    im.src=IMAGES[k];
  }
  for(let i=0;i<TERRAIN_TILE_COUNT;i++){
    const im=new Image();
    im.onload=()=>{ terrainTiles[i]=im; };
    im.src='img/terrain/grass_'+String(i).padStart(2,'0')+'.png';
  }
  for(let i=0;i<WATER_TILE_COUNT;i++){
    const im=new Image();
    im.onload=()=>{ waterTiles[i]=im; };
    im.src='img/terrain/water_'+String(i).padStart(2,'0')+'.png';
  }
}

/* ===== 版本标记:用于确认浏览器加载的是最新代码(改完代码请顺手 +1) ===== */
const GAME_VERSION = 'v32';
console.log('[钢铁指挥] GAME_VERSION =', GAME_VERSION);
try{
  const vb=document.createElement('div');
  vb.id='verBadge';
  vb.textContent='版本 '+GAME_VERSION+' (新增美洲狮)';
  vb.style.cssText='position:fixed;right:10px;bottom:160px;z-index:9999;font:12px "Microsoft YaHei";color:#ffe27a;background:rgba(20,10,0,.8);padding:3px 10px;border-radius:5px;border:2px solid #ffe27a;pointer-events:none;';
  document.body.appendChild(vb);
}catch(e){}
