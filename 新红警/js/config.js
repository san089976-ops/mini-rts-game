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
function armorMod(ent, proj, attacker){
  const armor = ent && ent.armor ? ent.armor : 'wood';
  // 磁暴步兵:对布甲修正比提升至 150%
  if(attacker && attacker.type==='magnet' && armor==='cloth') return 1.5;
  // 建筑专属弹丸修正(如核电站/五角大楼:火炮伤害 50%)
  if(ent && ent.def && ent.def.dmgMod && ent.def.dmgMod[proj] !== undefined) return ent.def.dmgMod[proj];
  const row = ARMOR_MOD[armor];
  return (row && row[proj]) || 1;
}

// 碰撞箱(半宽/半高,大致框住各贴图;缺省 = r*0.85)。单位被化为"双圆胶囊"碰撞:
// colR = min(hw,hh) 为圆半径, colOff = max(hw,hh)-min(hw,hh) 为头/尾圆圆心距中心距离。
// 坦克为 2×1 长条形:实测贴图(img/units/tank_*_field.png 车头朝上 200x512,
// 游戏内 SPRITE_ROT 旋转后战场本体≈68x26px),故 hw=半长 34, hh=半宽 13。
const UNIT_BOX = {
  infantry:{hw:8, hh:8}, exo:{hw:9, hh:9}, magnet:{hw:9, hh:9},
  tank:{hw:34, hh:13}, mcv:{hw:14, hh:14}, harvester:{hw:24, hh:16},
  abrams:{hw:36, hh:15}, t90:{hw:34, hh:13},
  destroyer:{hw:58, hh:11}, transport:{hw:42, hh:16},
};
// 战车转向角速度(弧度/秒):朝向用 lerpAngle 平滑插值,产生履带战车转向效果,而非瞬间硬转
const TURN_RATE = 6;
const BASE_UNITS = {
  infantry: { name:'动员兵', hp:90, speed:74, range:72, damage:9, rof:0.9, cost:100, r:9,  build:4, armor:'cloth', proj:'bullet', desc:'低造价轻步兵,前期侦察与骚扰的主力' },
  tank:     { name:'M60', hp:330, speed:60, range:118, damage:38, rof:0.55, cost:500, r:13, build:9, armor:'castiron', proj:'cannon', desc:'盟军主战坦克,火力与装甲均衡,战场中坚' },
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
      tank:    { ...BASE_UNITS.tank, name:'T54', hp:450, damage:45, cost:650, r:14 },
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
  /* ============ 中立建筑(不可建造:不出现在任何可建列表,仅地图装饰) ============ */
  school:   { name:'学校',     w:2,h:2, hp:1000, cost:0, power:0, buildTime:0, build:[], color:'#c9b58a', armor:'concrete', weapon:null, neutral:true, desc:'中立建筑:城市学校,占地2x2,混凝土护甲。可被摧毁,但不影响胜负' },
  hospital: { name:'医院',     w:2,h:2, hp:1200, cost:0, power:0, buildTime:0, build:[], color:'#d8a0a0', armor:'concrete', weapon:null, neutral:true, desc:'中立建筑:城市医院,占地2x2,混凝土护甲。可被摧毁,但不影响胜负' },
  house_jp1:{ name:'日式独栋别墅1', w:1,h:1, hp:500, cost:0, power:0, buildTime:0, build:[], color:'#b09a7a', armor:'wood', weapon:null, neutral:true, desc:'中立建筑:日式独栋别墅,占地1x1,木制护甲' },
  house_jp2:{ name:'日式独栋别墅2', w:1,h:1, hp:500, cost:0, power:0, buildTime:0, build:[], color:'#b09a7a', armor:'wood', weapon:null, neutral:true, desc:'中立建筑:日式独栋别墅,占地1x1,木制护甲' },
  house_us:{ name:'美式独栋建筑', w:1,h:1, hp:600, cost:0, power:0, buildTime:0, build:[], color:'#c0b0a0', armor:'wood', weapon:null, neutral:true, desc:'中立建筑:美式独栋住宅,占地1x1,木制护甲' },
  nuclear:  { name:'核电站',   w:3,h:3, hp:2300, cost:0, power:0, buildTime:0, build:[], color:'#7a8a5a', armor:'concrete', weapon:null, neutral:true, dmgMod:{cannon:0.5}, desc:'中立建筑:核电站,占地3x3,混凝土护甲,受火炮伤害修正比为50%' },
  mall:     { name:'综合商业体', w:4,h:4, hp:4000, cost:0, power:0, buildTime:0, build:[], color:'#a09a8a', armor:'wood', weapon:null, neutral:true, desc:'中立建筑:综合商业体,占地4x4,木制护甲' },
  pentagon: { name:'五角大楼', w:4,h:4, hp:5000, cost:0, power:0, buildTime:0, build:[], color:'#9a9a8a', armor:'concrete', weapon:null, neutral:true, dmgMod:{cannon:0.5}, desc:'中立建筑:五角大楼,占地4x4,混凝土护甲,受火炮伤害修正比为50%' },
};
// 船坞可建造范围:整块落水的同时,须距离最近己方建筑 ≤ 此格数(贴近基地下海,不能乱修)
const DOCK_BUILD_RANGE = 8;
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
// 剪影阴影不透明度(0.4~0.6 之间效果自然)
const UNIT_SHADOW_ALPHA = 0.45;
// 阴影预烘焙高斯模糊半径(px):烘焙一次,运行期直接 drawImage,零每帧滤镜开销
const UNIT_SHADOW_BLUR = 5;
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
const SPRITE_ROT = { abrams: Math.PI, t90: Math.PI, harvester: Math.PI/2, destroyer: Math.PI/2, transport: Math.PI/2, tank: Math.PI/2, infantry: -Math.PI/2, exo: -Math.PI/2, magnet: Math.PI/2 };
// 照片贴图额外缩放(步兵照片用 0.42,让小人贴合碰撞箱大小)
const SPRITE_SCALE = { harvester: 0.7, destroyer: 1.4, infantry: 0.42, exo: 0.42, magnet: 0.42 };
const SPRITE_FRONT = { abrams:[-1,0], t90:[-1,0], harvester:[0,-1], destroyer:[0,-1], transport:[0,-1], tank:[0,-1], infantry:[0,1], exo:[0,1], magnet:[0,-1] };
// 草地贴图块:由 tools/split-terrain.js 从"草地.png"切成 4x4=16 块,
// 每个草地格随机取一块平铺,提升陆地细致度
const TERRAIN_TILE_COUNT = 16;
const terrainTiles = [];
// 水域贴图块:由 tools/split-terrain.js 从"水域.png"切成 2x2=4 块,
// 每个水域格随机取一块平铺(保留上方波光动画叠加)
const WATER_TILE_COUNT = 4;
const waterTiles = [];
// 可碾树的重型单位:坦克/艾布拉姆/T90/基地车/采矿车/两栖运输艇
function crushesTrees(type){
  return type==='tank' || type==='abrams' || type==='t90' || type==='mcv' || type==='harvester' || type==='transport';
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
