"use strict";
/* ============ config.js: 常量与配置 ============ */
const TILE = 32;
let MAP_W = 64, MAP_H = 48;
let W = MAP_W * TILE, H = MAP_H * TILE;
const TEAM_A = 0, TEAM_B = 1;

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
const RENDER_SCALE = 4;

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
const PROJ_NAME = { cannon:'火炮', bullet:'子弹', machinegun:'机炮' };
// 护甲类型:布甲 / 钢甲 / 铸铁甲 / 钛合金甲 / 混凝土甲 / 木甲
const ARMOR_NAME = { cloth:'布甲', steel:'钢甲', castiron:'铸铁甲', titanium:'钛合金甲', concrete:'混凝土甲', wood:'木甲' };
// 伤害修正表: 修正比 = 该护甲对某种弹丸的伤害倍率(1.0=100%)
const ARMOR_MOD = {
  cloth:    { cannon:0.8, bullet:0.8, machinegun:1.2 },
  steel:    { cannon:1.0, bullet:0.4, machinegun:0.8 },
  castiron: { cannon:1.0, bullet:0.4, machinegun:0.6 },
  titanium: { cannon:0.8, bullet:0.2, machinegun:0.4 },
  concrete: { cannon:1.0, bullet:0.4, machinegun:0.6 },
  wood:     { cannon:1.0, bullet:1.0, machinegun:1.0 },
};
function armorMod(ent, proj, attacker){
  const armor = ent && ent.armor ? ent.armor : 'wood';
  // 磁暴步兵:对布甲修正比提升至 150%
  if(attacker && attacker.type==='magnet' && armor==='cloth') return 1.5;
  const row = ARMOR_MOD[armor];
  return (row && row[proj]) || 1;
}

// 碰撞箱(半宽/半高,大致框住各贴图;缺省 = r*0.85)。刚性碰撞用,单位互不重叠
// 注意:箱体偏大容易在大部队/编队里顶死,故比视觉略小一点以保持队形流动
const UNIT_BOX = {
  infantry:{hw:8, hh:8}, exo:{hw:9, hh:9}, magnet:{hw:9, hh:9},
  tank:{hw:11, hh:11}, mcv:{hw:13, hh:13}, harvester:{hw:14, hh:19},
  abrams:{hw:15, hh:15}, t90:{hw:14, hh:14},
  destroyer:{hw:16, hh:16}, transport:{hw:15, hh:15},
};
const BASE_UNITS = {
  infantry: { name:'动员兵', hp:90, speed:74, range:72, damage:9, rof:0.9, cost:100, r:9,  build:4, armor:'cloth', proj:'bullet', desc:'低造价轻步兵,前期侦察与骚扰的主力' },
  tank:     { name:'灰熊坦克', hp:330, speed:60, range:118, damage:38, rof:0.55, cost:500, r:13, build:9, armor:'castiron', proj:'cannon', desc:'中型主战坦克,火力与装甲均衡,战场中坚' },
  harvester:{ name:'采矿车', hp:1200, speed:56, range:0, damage:0, rof:0, cost:700, r:13, build:11, capacity:500, armor:'castiron', proj:null, desc:'自动往返采集金矿并送回基地换钱,经济命脉' },
  mcv:      { name:'基地车', hp:900, speed:45, range:0, damage:0, rof:0, cost:1800, r:14, build:14, armor:'titanium', proj:null, desc:'可移动的基地核心,在空地展开(快捷键 E)后变成新的建造厂' },
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
  if(u.type==='mcv' || u.type==='abrams' || u.type==='t90') return 6;
  return 1;
}
function usedCapacity(t){ return t.cargoUnits ? t.cargoUnits.reduce((s,c)=>s+transportCost(c),0) : 0; }
function getUnitDefs(faction){
  if(UNIT_DEF_CACHE[faction]) return UNIT_DEF_CACHE[faction];
  let defs;
  if(faction==='allies'){
    defs = {
      infantry:{ ...BASE_UNITS.infantry, name:'北约士兵', hp:230, damage:16, cost:225 },
      tank:    { ...BASE_UNITS.tank },
      harvester:{ ...BASE_UNITS.harvester },
      mcv:      { ...BASE_UNITS.mcv },
      abrams:  { name:'艾布拉姆斯坦克', hp:1200, speed:62, range:122, damage:130, rof:1.1, cost:1500, r:14, build:9, armor:'titanium', proj:'cannon', desc:'盟军重型主战坦克,装甲厚重火力凶猛,需升级战车工厂' },
      exo:     { name:'外骨骼大兵', hp:330, speed:74, range:118, damage:70, rof:1.5, cost:460, r:9, build:8, armor:'steel', proj:'cannon', desc:'盟军高科技单兵:外骨骼装甲手持炮管,射程火力逼近主战坦克,需升级兵营' },
      destroyer:{ ...NAVAL_UNITS.destroyer },
      transport:{ ...NAVAL_UNITS.transport },
    };
  } else {
    defs = {
      infantry:{ ...BASE_UNITS.infantry },
      tank:    { ...BASE_UNITS.tank, name:'犀牛坦克', hp:450, damage:45, cost:650, r:14 },
      harvester:{ ...BASE_UNITS.harvester },
      mcv:      { ...BASE_UNITS.mcv },
      t90:     { name:'T90坦克', hp:900, speed:72, range:116, damage:80, rof:0.9, cost:1000, r:13, build:9, armor:'titanium', proj:'cannon', desc:'苏军主战坦克,机动灵活射速快,需升级战车工厂' },
      magnet:  { name:'磁暴步兵', hp:250, speed:58, range:72, damage:110, rof:3, cost:350, r:9, build:7, armor:'steel', proj:'cannon', desc:'苏军高科技步兵:电磁手套释放闪电,对布甲伤害提升至150%,需升级兵营' },
      destroyer:{ ...NAVAL_UNITS.destroyer },
      transport:{ ...NAVAL_UNITS.transport },
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
};
const BLD_DEFS = {
  command:  { name:'建造厂',  w:3,h:3, hp:1800, cost:0, power:50, buildTime:1,  build:['power','barracks','factory','refinery','turret','repair','lab','dock'], color:'#5b6b7a', armor:'wood', weapon:null },
  power:    { name:'发电厂',  w:2,h:2, hp:520,  cost:100, power:50, buildTime:5,  build:[],    color:'#b06a3a', armor:'wood', weapon:null },
  barracks: { name:'兵营',    w:2,h:2, hp:460,  cost:200, power:0, buildTime:7,  train:['infantry'], color:'#5a7a4a', armor:'wood', weapon:null },
  factory:  { name:'战车工厂',w:3,h:3, hp:680,  cost:800, power:0, buildTime:14, train:['tank','harvester'], color:'#4a5a8a', armor:'wood', weapon:null },
  refinery: { name:'矿石精炼厂',w:3,h:3, hp:620, cost:600, power:0, buildTime:12, train:[],  color:'#9a8a3a', armor:'wood', weapon:null },
  turret:   { name:'碉堡',    w:1,h:1, hp:520,  cost:300, power:0, buildTime:7,  train:[],  color:'#6a6a6a', armor:'concrete', weapon:{range:160, damage:24, rof:0.75, bulletSpeed:420, proj:'machinegun'} },
  repair:   { name:'维修厂',  w:2,h:2, hp:560,  cost:500, power:0, buildTime:8,  train:[],  color:'#7a6a4a', armor:'wood', weapon:null },
  lab:      { name:'实验室',  w:2,h:2, hp:600,  cost:1000, power:0, buildTime:20, build:[],  color:'#5a5a8a', armor:'wood', weapon:null },
  dock:     { name:'船坞',    w:2,h:2, hp:720,  cost:600, power:0, buildTime:10, train:['destroyer','transport'], color:'#4a7a8a', armor:'wood', weapon:null, water:true },
};
// 战车工厂升级
const FACTORY_UPGRADE_COST = 500;
const FACTORY_UPGRADE_TIME = 10;
// 兵营升级(升1级解锁高级步兵)
const BARRAX_UPGRADE_COST = 250;
const BARRAX_UPGRADE_TIME = 9;
// 发电厂升级(可升2级)
const POWER_UPGRADE_COST = 100;   // 每级费用
const POWER_UPGRADE_GAIN = 25;    // 每级电力
const POWER_UPGRADE_INCOME = 1;   // 每级每秒收入
const POWER_UPGRADE_TIME = 8;     // 每级升级时间(秒)
const POWER_MAX_LEVEL = 2;

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
  infantry:'img/units/infantry.png', tank:'img/units/tank.png', harvester:'img/units/harvester.png',
  command:'img/command.png', power:'img/power.png', barracks:'img/barracks.png',
  factory:'img/factory.png', refinery:'img/refinery.png', turret:'img/turret.png',
  abrams:'img/units/abrams.png', t90:'img/units/t90.png',
  // 发电站战场等级贴图(powerLevel 0/1/2),与建造栏图标 power 分开
  power0:'img/power_0.png', power1:'img/power_1.png', power2:'img/power_2.png',
  // 兵营/精炼厂战场贴图,与建造栏/解释栏图标 barracks/refinery 分开
  barracks_field:'img/barracks_field.png', refinery_field:'img/refinery_field.png',
  lab_field:'img/lab_field.png',
  turret_field:'img/turret_field.png', dock_field:'img/dock_field.png',
  harvester_field:'img/harvester_field.png',   // 采矿车战场本体贴图(已顺时针90°,车头朝上)
  destroyer_field:'img/destroyer_field.png',   // 驱逐舰战场贴图(照片本就车头朝上)
  transport_field:'img/transport_field.png',   // 登陆艇战场贴图(照片本就车头朝上)
  tank_allies_field:'img/tank_allies_field.png',  // 灰熊坦克(盟军,已旋转180°车头朝上)
  tank_soviet_field:'img/tank_soviet_field.png',  // 犀牛坦克(苏军,照片本就车头朝上)
  goldmine:'img/goldmine.png',
};

/* ============ 金矿 ============ */
const ORE_PER_TILE = 5000;   // 每格金矿储量(采完即消失)
const MIN_ORE_DIST = 14;     // 金矿堆与出生点的最小格子距离(格),避免贴脸基地
const HARVEST_SPEED = 1.5;   // 矿车采矿速度倍率
const imgs = {};
// 坦克照片已用脚本预处理:背景(纯黑/纯白)透明化 + 内容居中
// 各贴图"炮管/车头"自然朝向(图像坐标系,顺时针,+X=右),绘制时旋转对齐到单位朝向前方。
// 艾布拉姆/ T90 的炮管都在贴图左侧(向左),因此转角均为 180°(π),开火闪光画在贴图左侧即炮口。
const SPRITE_ROT = { abrams: Math.PI, t90: Math.PI, harvester: Math.PI/2, destroyer: Math.PI/2, transport: Math.PI/2, tank: Math.PI/2 };
// 照片贴图额外缩放(采矿车默认太大缩小,驱逐舰加大)
const SPRITE_SCALE = { harvester: 0.7, destroyer: 1.4 };
// 各照片贴图"炮口/车头"在图像坐标系的方向(用于开火闪光位置)
const SPRITE_FRONT = { abrams:[-1,0], t90:[-1,0], harvester:[0,-1], destroyer:[0,-1], transport:[0,-1], tank:[0,-1] };
// 草地贴图块:由 tools/split-terrain.js 从"草地.png"切成 4x4=16 块,
// 每个草地格随机取一块平铺,提升陆地细致度
const TERRAIN_TILE_COUNT = 16;
const terrainTiles = [];
// 水域贴图块:由 tools/split-terrain.js 从"水域.png"切成 2x2=4 块,
// 每个水域格随机取一块平铺(保留上方波光动画叠加)
const WATER_TILE_COUNT = 4;
const waterTiles = [];
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
