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
  MAP_W = Math.max(4, Math.min(220, Math.round(w) || 64));
  MAP_H = Math.max(4, Math.min(220, Math.round(h) || 48));
  W = MAP_W * TILE; H = MAP_H * TILE;
  GRID_COLS = Math.ceil(W / GRID_C);
  cam.maxX = W; cam.maxY = H;
}
// 渲染分辨率倍率:画布按"设备像素比(1.5~4)与 RENDER_SCALE 取较大值"放大,再缩回窗口显示,让画面更清晰。
// 4x 下艾布拉姆/T90 贴图在同一屏幕大小内获得 2 倍于之前的像素,细节更清晰。
// 若感到卡顿可改成 3 或 2。
const RENDER_SCALE = 2;

// 阵营:美国(usa) / 欧洲(europe) / 以色列(israel) / 苏军(soviet)
let playerFaction = 'usa';
const FACTIONS = ['usa','europe','israel','soviet'];
const FACTION_NAMES = { usa:'美国', europe:'欧洲', israel:'以色列', soviet:'苏军' };
function factionName(fac){ return FACTION_NAMES[fac] || fac; }
function isSovietFac(fac){ return fac==='soviet'; }   // 苏军=独立阵营
// 西方阵营(美国/欧洲/以色列)共用的基础单位集;苏军单列
function factoryUnitsFor(fac){
  switch(fac){
    case 'usa':    return ['abrams','bradley','mcv'];
    case 'europe': return ['leclerc','leopard','challenger','marder','puma','mcv'];
    case 'israel': return ['merkava','namer','mcv'];
    default:       return ['t90','t84bm','t72','t80','b11','mcv'];   // soviet
  }
}
// 三级工厂专属坦克(usa=艾布拉姆X / soviet=T14;以色列无三级专属坦克)
function tier3UnitsFor(fac){
  if(fac==='usa') return ['abramsx'];
  if(fac==='soviet') return ['t14'];
  return [];
}
// 航母类型(usa=福特 / soviet=库兹涅佐夫;欧洲/以色列无航母)
function carrierFor(fac){
  if(fac==='usa') return 'ford';
  if(fac==='soviet') return 'kuznetsov';
  return null;
}
// 队伍分组:最多 4 组(A/B/C/D)。同组互不敌对,不同组互敌对;玩家所在组=友方(蓝)
function playerGroup(){ return teamGroups[0]; }
// 现代战术终端的关系色:玩家青蓝、同盟绿、敌军红、中立灰金。
// 队伍自己的 TEAM_COLORS 仍保留,用于区分同阵营的具体队伍角标。
const TACTICAL_COLORS = {
  player: '#39d7df',
  ally: '#73d69c',
  enemy: '#ef7068',
  neutral: '#b4a77c',
};
function tacticalTeamColor(team){
  if(team===undefined || team===null || team<0) return TACTICAL_COLORS.neutral;
  if(team===TEAM_A) return TACTICAL_COLORS.player;
  return teamGroups[team]===playerGroup() ? TACTICAL_COLORS.ally : TACTICAL_COLORS.enemy;
}
function tacticalTeamRGBA(team, alpha){
  const hex=tacticalTeamColor(team).replace('#','');
  const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function teamCol(team){
  return tacticalTeamColor(team);
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
  leopard1a5:{hw:34, hh:13}, chieftain:{hw:36, hh:15}, namer:{hw:32, hh:13},
  puma:{hw:33, hh:13},
  f16:{hw:26, hh:15}, su35:{hw:28, hh:16}, f15:{hw:32, hh:18},   // 战斗机(机场生产,机身长条形胶囊)
  f18:{hw:30, hh:18}, su35h:{hw:32, hh:18},                     // F/A-18 咆哮者(航母)/ 苏-35(机场+航母)
  littlebird:{hw:11, hh:22},                 // 小鸟直升机(机头朝上,机身长条形胶囊)
  uh60:{hw:13, hh:26},                       // UH-60 黑鹰(盟军运输直升机,载12,机头朝上)
  mi17:{hw:13, hh:26},                       // 米17(苏军运输直升机,载12,机头朝上)
  t84bm:{hw:36, hh:15},                      // T84BM(苏军重坦,车身+炮塔照片)
  t72:{hw:36, hh:15},                        // T72(苏军,可三阶升级:车身+炮塔照片)
  t62:{hw:36, hh:15},                        // T62(苏军,普通工厂直产,车身+炮塔照片)
  t80:{hw:36, hh:15},                        // T80(苏军,二级工厂产,四阶升级:车身+炮塔照片)
  merkava:{hw:36, hh:15},                    // 梅卡瓦MK4(盟军重坦,5载员运兵坦克,车身+炮塔照片)
  abramsx:{hw:36, hh:15},                    // 艾布拉姆X(盟军三级工厂重坦,车身+炮塔照片,携带弹簧刀无人机)
  t14:{hw:36, hh:15},                        // T14(苏军三级工厂重坦,车身+炮塔照片)
  drone:{hw:9, hh:9},                        // 弹簧刀无人机(艾布拉姆X释放,悬浮自爆)
  ford:{hw:60, hh:18},                       // 福特号航母(盟军,移动机场,水平朝右)
  kuznetsov:{hw:58, hh:17},                  // 库兹涅佐夫号航母(苏军,移动机场,水平朝右)
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
const TRACK_UNITS = { tank:1, abrams:1, t90:1, harvester:1, mcv:1, airfield_car:1, bradley:1, b11:1, marder:1, leclerc:1, leopard:1, challenger:1, puma:1, leopard1a5:1, chieftain:1, namer:1, t84bm:1, t72:1, t62:1, t80:1, merkava:1, abramsx:1, t14:1 };
const BASE_UNITS = {
  infantry: { name:'动员兵', hp:90, speed:74, range:72, damage:9, rof:0.9, cost:100, r:9,  build:4, armor:'cloth', proj:'bullet', desc:'低造价轻步兵,前期侦察与骚扰的主力' },
  tank:     { name:'M60', hp:330, speed:60, range:118, damage:38, rof:1.0, cost:500, r:13, build:9, armor:'castiron', proj:'cannon', desc:'盟军主战坦克,火力与装甲均衡,战场中坚;可安装 M60A3 升级包(250金,血量升至600,+22射程+27伤害并换装 M60A3 外观)' },
  harvester:{ name:'采矿车', hp:1200, speed:56, range:0, damage:0, rof:0, cost:700, r:13, build:11, capacity:500, armor:'castiron', proj:null, desc:'自动往返采集金矿并送回基地换钱,经济命脉' },
  mcv:      { name:'基地车', hp:900, speed:45, range:0, damage:0, rof:0, cost:1800, r:14, build:14, armor:'titanium', proj:null, desc:'可移动的基地核心,在空地展开(快捷键 E)后变成新的建造厂' },
  airfield_car:{ name:'机场建筑车', hp:600, speed:52, range:105, damage:15, rof:0.6, cost:1200, r:13, build:12, armor:'castiron', proj:'bullet', desc:'由升级建造厂生产的机场工程车,装有自卫机枪,可在空地展开(E)变成机场(占地2x3)' },
};
const UNIT_DEFS = BASE_UNITS; // 兼容引用
const UNIT_DEF_CACHE = {};
// 海军/两栖单位:两阵营通用
const NAVAL_UNITS = {
  destroyer: { name:'驱逐舰', hp:800, speed:56, range:142, damage:90, rof:1.2, cost:1000, r:16, build:12, armor:'castiron', proj:'cannon', naval:true, desc:'海军主力舰艇:舰炮对陆/对海火力强劲,只能在水中航行' },
  transport:{ name:'运输艇', hp:500, speed:70, range:105, damage:10, rof:0.6, cost:800, r:16, build:8, armor:'steel', proj:'bullet', amphib:true, capacity:12, desc:'两栖登陆艇:陆海通行,可装载12点地面单位' },
};
// 装载占点数:步兵类(步兵/外骨骼/磁暴)除运输艇外统一占1格;运输艇外骨骼/磁暴仍占2格。
// 矿车·灰熊3 / 犀牛4 / 基地车·艾布拉姆·T90 6;海军不上船
function transportCost(u){  if(!u) return 0;
  if(u.naval || u.type==='transport' || u.fly || u.chopper) return 0;   // 海军/运输艇/飞机/直升机不上船
  if(u.type==='infantry' || u.type==='exo' || u.type==='magnet') return 1;
  if(u.type==='harvester') return 3;
  if(u.type==='tank') return unitFactionOf(u.team)==='soviet' ? 4 : 3;
  if(u.type==='airfield_car') return 4;
  if(u.type==='mcv' || u.type==='abrams' || u.type==='t90' || u.type==='t84bm' || u.type==='t72' || u.type==='t62' || u.type==='t80' || u.type==='merkava' || u.type==='abramsx' || u.type==='t14' || u.type==='chieftain' || u.type==='namer') return 6;
  if(u.type==='bradley' || u.type==='b11' || u.type==='marder' || u.type==='leclerc' || u.type==='leopard' || u.type==='challenger' || u.type==='puma') return 6;
  if(u.type==='leopard1a5') return 4;
  return 1;
}
// 按具体载具计算占点数:除运输艇外,外骨骼/磁暴步兵与其他步兵一样只占1格
function transportCostIn(t, u){
  if(t && t.type==='transport' && (u && (u.type==='exo' || u.type==='magnet'))) return 2;
  return transportCost(u);
}
function usedCapacity(t){ return t.cargoUnits ? t.cargoUnits.reduce((s,c)=>s+transportCostIn(t,c),0) : 0; }
// 运兵车判定:运输艇或带"运兵舱"(carrier)的车辆(布拉德利/黄鼠狼/B11 等)
function isCarrier(u){ return !!(u && (u.type==='transport' || (u.def && u.def.carrier))); }
// 航母(移动机场):可生产战斗机的海军单位。用独立的 carrierShip 标记,不与运兵车 carrier 混淆
function isCarrierShip(u){ return !!(u && u.def && u.def.carrierShip); }
// 停机位容量:机场=AIRFIELD_CAPACITY(4),航母=def.slots(福特6/库兹涅佐夫4)
function airBaseCapacity(b){
  if(!b) return 0;
  if(isCarrierShip(b)) return (b.def && b.def.slots) || 0;
  if(b.defName && b.defName==='airfield') return AIRFIELD_CAPACITY;
  return 0;
}
// 母港是否存活:机场=alive 且在 buildings;航母=hp>0 且在 units
function airBaseAlive(b){
  if(!b) return false;
  if(isCarrierShip(b)) return b.hp>0 && units.includes(b);
  return b.alive && buildings.includes(b);
}
// 某单位能否装进某运兵车:运输艇可装任意地面单位;步兵战车只装步兵类
function canBoardUnit(carrier, u){
  if(!carrier || !u || u===carrier || u.naval || u.amphib || u.fly || u.chopper || transportCostIn(carrier,u)<=0) return false;
  if(carrier.type==='transport') return true;
  if(carrier.chopper && !carrier.landed) return false;   // 直升机只有降落时才能装载
  return u.type==='infantry' || u.type==='exo' || u.type==='magnet';
}
/* ============ 25mm 机炮弹(步兵战车专属:贴图弹丸 + 先加速后匀速) ============ */
const IFV_TYPES = ['puma','bradley','marder','b11','namer'];
function isIFV25(u){ return !!u && IFV_TYPES.indexOf(u.type)!==-1; }
// 独立旋转炮塔的载具(车身+炮塔结构,仿美洲狮):
// 美洲狮/艾布拉姆/T90 + 豹2A4/布拉德利/勒克莱尔/挑战者/M60/T54/B11(全部照片车身+炮塔)
function isTurretUnit(u){ return !!u && (u.type==='puma'||u.type==='abrams'||u.type==='t90'||u.type==='tank'||u.type==='bradley'||u.type==='b11'||u.type==='marder'||u.type==='leclerc'||u.type==='leopard'||u.type==='challenger'||u.type==='leopard1a5'||u.type==='chieftain'||u.type==='namer'||u.type==='t84bm'||u.type==='t72'||u.type==='t62'||u.type==='t80'||u.type==='merkava'||u.type==='abramsx'||u.type==='t14'); }
// 车身/炮塔贴图键名:tank 阵营专属(M60盟军车头朝下 / T54苏军车头朝上),其余按 type
function turretKeys(u){
  if(u.type==='tank'){
    if(unitFactionOf(u.team)==='soviet'){ const br=t54Branch(u); return [br.body, br.turret]; }   // T54 分支:升级成 T54B/T55AM 换贴图
    if(u.m60a3) return ['m60a3_body','m60a3_turret'];   // M60A3 升级后换 M60A3 外观(水平朝左)
    return ['m60_body','m60_turret'];
  }
  if(u.type==='t72'){ const lv=t72Level(u); return [lv.body, lv.turret]; }   // 升级档不同:车身/炮塔贴图随档换
  if(u.type==='t62'){ const lv=t62Level(u); return [lv.body, lv.turret]; }
  if(u.type==='t80'){ const lv=t80Level(u); return [lv.body, lv.turret]; }
  if(u.type==='t90'){ const lv=t90Level(u); return [lv.body, lv.turret]; }
  if(u.type==='abrams' && u.tusk) return ['m1a2_body','m1a2_turret'];   // 艾布拉姆装 TUSK 后换 M1A2TUSK 贴图
  return [u.type+'_body', u.type+'_turret'];
}
// 车身照片的"自然朝向"→渲染对齐角 rotOff(满足 imageFrontAngle+θ=facing):
// 车头朝上=π/2 / 车头朝下=-π/2 / 水平向左=π / 水平向右=0。tank 按阵营区分。
function unitRotOff(u){
  if(u.type==='tank') return unitFactionOf(u.team)==='soviet' ? Math.PI/2 : (u.m60a3 ? Math.PI : -Math.PI/2);   // T54 朝上 / M60 朝下 / M60A3 水平朝左
  if(u.type==='t72') return t72Level(u).rotOff;   // T72/T72BVM 车头朝下(-π/2);T72B 车头朝左(π)
  if(u.type==='t62') return t62Level(u).rotOff;
  if(u.type==='t80') return t80Level(u).rotOff;
  if(u.type==='t90') return t90Level(u).rotOff;   // T90 水平朝左(π) / T90M 车头朝上(π/2)
  if(u.type==='abrams' && u.tusk) return Math.PI/2;   // 艾布拉姆 TUSK 贴图车头朝上
  switch(u.type){
    case 'puma': case 'leclerc': case 't84bm': case 't62': case 'merkava': case 'leopard1a5': case 'namer': return Math.PI/2;   // 车头朝上
    case 'b11': return -Math.PI/2;                            // 车头朝下
    case 'abrams': case 't90': case 'bradley': case 'marder': case 'leopard': case 'challenger': case 'chieftain': return Math.PI;  // 水平向左
    default: return SPRITE_ROT[u.type] || 0;
  }
}
// 炮塔贴图"炮口/车头"方向(相对贴图中心的比例):朝上=[0,-0.5] 朝下=[0,0.5] 朝左=[-0.5,0] 朝右=[0.5,0]
function unitTip(u){
  const ro = unitRotOff(u);
  if(ro === Math.PI) return [-0.5, 0];
  if(ro === 0) return [0.5, 0];
  if(ro === Math.PI/2) return [0, -0.5];
  return [0, 0.5];
}
// 炮塔旋转中心(座圈)相对车身中心沿车头(+facing)的前移量(px,最终渲染尺寸)。负=偏车尾。
// tw = 炮塔渲染宽度(2/3 法则单位依赖它,如艾布拉姆/T90 保持原调教)。
// 各车旋转中心位置:
//   豹2A4/勒克莱尔/挑战者/M60 = 车身正中间(0)
//   T54 = 正中间向车头 4px
//   布拉德利 = 正中间偏车尾 3px
//   B11 = 正中间向车头靠近 1/3 车身长(全长 2*hw 的 1/3 ≈ 2*hw/3)
function turretRotCenter(u, tw){
  if(u.type==='t72') return t72Level(u).turretOff || 0;   // 炮塔向车头(正方向)前移量按档位
  if(u.type==='t62') return t62Level(u).turretOff || 0;
  if(u.type==='t80') return t80Level(u).turretOff || 0;
  if(u.type==='t90') return u.upgradeLvl>0 ? (t90Level(u).turretOff || 0) : (-8 + (tw||0)/6);   // 基础 T90 保持原调教, T90M 炮塔居中
  if(u.type==='abrams' && u.tusk) return 7 - 5 - 3 - 2 + 2 + 2;   // 艾布拉姆 TUSK:再向正方向(车头)移动2px → 1
  switch(u.type){
    case 'puma': return 0;
    case 'abrams': return -7 + (tw||0)/6;   // 艾布拉姆炮塔向正方向再 +3px(原 -10)
    case 't90': return -8 + (tw||0)/6;
    case 'bradley': return -3;   // 座圈位置,向车头移动 2px(原 -5)
    case 'b11': return (u.hw||28)*(2/3) - 5;   // 正中间向车头 1/3 车身长,再向车尾移 5px(原 3px)
    case 'tank': return unitFactionOf(u.team)==='soviet' ? (u.t54Branch ? 4 : -1) : 0;   // T54 炮塔偏车尾 1px;T54B/T55AM 分支向正方向 +4px / M60 正中间
    default: return 0;   // leclerc / leopard / challenger 正中间
  }
}
// 炮塔额外缩放(仅炮塔,车身不动):T54(苏军 tank)整体 0.85 后再额外 0.9 → 0.81;
// B11 炮塔 0.42;黄鼠狼炮塔 0.4
function turretScale(u){
  if(u.type==='tank') return unitFactionOf(u.team)==='soviet' ? 0.81 : 1;
  if(u.type==='b11') return 0.42;
  if(u.type==='marder') return 0.4;
  if(u.type==='t72') return u.upgradeLvl===0 ? 0.95 : 1;   // 仅基础档 T72 炮塔缩 0.95
  if(u.type==='abrams' && u.tusk) return 0.857375 * 1.3;   // M1A2TUSK 炮塔放大到现在的 1.3 倍
  if(u.type==='abrams') return 0.857375;                    // 艾布拉姆炮塔缩 0.9025×0.95(车身不动)
  if(u.type==='merkava') return 0.8 * 1.1;   // 梅卡瓦炮塔增加到现在的 1.1 倍(0.8×1.1=0.88)
  if(u.type==='t62') return t62Level(u).turretScale || 1;
  if(u.type==='t80') return t80Level(u).turretScale || 1;
  if(u.type==='t90') return t90Level(u).turretScale || 1;
  return 1;
}
// 旋转法则:炮口=贴图正方向,旋转点距炮口的距离 = 贴图长轴 × 系数 k。
//   2/3 法则 k=2/3(默认,长炮管转向不甩大圈)
//   1/2 法则 k=1/2(美洲狮/布拉德利,旋转点=贴图中心)
//   3/5 法则 k=3/5(仅 T54 苏军 tank)
// 旋转点相对贴图中心沿长轴的偏移 = (k - 1/2) × 长轴。
function turretPivotK(u){
  if(u.type==='tank') return unitFactionOf(u.team)==='soviet' ? (u.t54Branch ? 2/3 : 4/5) : 2/3;   // T54 基础 4/5,分支 T54B/T55AM 2/3 / M60 2/3
  if(u.type==='bradley' || u.type==='puma') return 1/2;   // 布拉德利/美洲狮 1/2 法则
  if(u.type==='t72') return u.upgradeLvl===0 ? 4/5 : 2/3;  // 仅基础档 T72 用 4/5 法则,其余档 2/3
  if(u.type==='t62') return t62Level(u).pivotK;
  if(u.type==='t80') return t80Level(u).pivotK;
  if(u.type==='t90') return t90Level(u).pivotK;
  if(u.type==='abrams' && u.tusk) return 3/5;   // 艾布拉姆 TUSK:3/5 法则
  return 2/3;
}
const IFV_ACCEL = 2600;        // 弹丸加速度(px/s²):先加速后匀速,起步有劲道
const IFV_START_FACTOR = 0.25; // 弹丸初速 = 最大速度 × 该系数
const BULLET_25MM_LEN = 8;     // 25mm 弹丸渲染长度(px)
/* ============ 反坦克导弹模块(美洲狮/黄鼠狼/布拉德利) ============ */
const ATGM_TYPES = ['puma','bradley','marder','namer'];          // 可装反坦克导弹的战车(雌虎=长钉)
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
/* ============ 反坦克导弹命名(布拉德利/黄鼠狼=TOW 导弹;美洲狮=长钉导弹) ============ */
function atgmMissileName(spriteType){ return spriteType==='spike' ? '长钉导弹' : 'TOW导弹'; }
function atgmTypeName(u){ return (u.type==='puma' || u.type==='namer') ? '长钉导弹' : 'TOW导弹'; }
function atgmModuleName(u){ return (u.type==='puma' || u.type==='namer') ? '长钉导弹模块' : 'TOW导弹模块'; }
/* ============ 自主防御系统(反 TOW 导弹) ============ */
const APS_TYPES = ['abrams','t72','merkava','abramsx','bradley'];   // 可装自主防御系统的单位(艾布拉姆;T72 仅 T72BVM 档可装;梅卡瓦MK4;艾布拉姆X自带;布拉德利)
const APS_COST = 500;                        // 升级价格(默认,布拉德利 150 见下)
const APS_UPGRADE_TIME = 12;                 // 安装时间(秒,默认;布拉德利 10 见下)
const APS_MAX_AMMO = 4;                      // 弹夹:最多储存 4 发反导弹(默认;布拉德利 1 发见下)
const APS_RELOAD = 16;                       // 每发反导弹填充时间(秒)
const APS_RANGE = 220;                       // 自主防御反应圈半径(px):敌 TOW 导弹"新进入"即反击一发
const APS_COUNTER_SPEED = ATGM_SPEED*2;      // 反导弹速度 = 反坦克导弹速度的一倍(2×)
const APS_COUNTER_LEN = 10;                  // 反导弹渲染长度(px,贴图用 25mm 子弹)
const APS_HIT_R = 14;                        // 反导弹命中来袭导弹的判定半径(px)
function isAPSUnit(u){ return !!u && APS_TYPES.indexOf(u.type)!==-1; }
// 自主防御按单位配置:布拉德利 = 1 发反导弹 / $150 / 10 秒;其余沿用默认(4发/$500/12秒)
function apsCostFor(u){ return u && u.type==='bradley' ? 150 : APS_COST; }
function apsUpgradeTimeFor(u){ return u && u.type==='bradley' ? 10 : APS_UPGRADE_TIME; }
function apsMaxAmmoFor(u){ return u && u.type==='bradley' ? 1 : APS_MAX_AMMO; }
/* ============ 反应装甲模块:护盾 + 每秒恢复 ============ */
// T84BM 300 盾回10 / 布拉德利 150 盾回5;价格/安装时间也按单位不同(T84BM $300/15秒,布拉德利 $150/10秒)
const RARM_COST = 300;
const RARM_UPGRADE_TIME = 15;
const RARM_TYPES = ['t84bm','bradley'];
const RARM_SHIELD = 300;                      // 默认护盾上限(T84BM)
const RARM_SHIELD_REGEN = 10;                 // 默认每秒恢复(T84BM)
function isRarmUnit(u){ return !!u && RARM_TYPES.indexOf(u.type)!==-1; }
function rarmCostFor(u){ return u && u.type==='bradley' ? 150 : RARM_COST; }
function rarmUpgradeTimeFor(u){ return u && u.type==='bradley' ? 10 : RARM_UPGRADE_TIME; }
function rarmShieldMaxFor(u){ return u && u.type==='bradley' ? 150 : RARM_SHIELD; }
function rarmShieldRegenFor(u){ return u && u.type==='bradley' ? 5 : RARM_SHIELD_REGEN; }
// 红外干扰装置:以自身为圆心、炮塔朝向为前方的 120° 扇形(半径 180),
// 敌 TOW 导弹一进入即被干扰乱飞 3 步(每步约16px)后爆炸,爆炸不分敌我;对长钉无效,我方无效
const IR_COST = 200;
const IR_UPGRADE_TIME = 15;
const IR_TYPES = ['t84bm'];
const IR_RANGE = 180;            // 干扰扇形半径(px)
const IR_ANGLE = Math.PI*2/3;    // 干扰扇形张角(120°)
const IR_STEP = 16;              // 乱飞每步距离(px)
const IR_STEPS = 3;              // 乱飞步数(满 3 步后爆炸)
function isIRUnit(u){ return !!u && IR_TYPES.indexOf(u.type)!==-1; }
/* ============ T14(苏军三级工厂重坦):反应装甲护盾 300 回 15 ============ */
const T14_SHIELD = 300;
const T14_SHIELD_REGEN = 15;
const T14_TYPES = ['t14'];
function isT14Unit(u){ return !!u && T14_TYPES.indexOf(u.type)!==-1; }
/* ============ 弹簧刀无人机(艾布拉姆X携带/释放,撞击自爆) ============ */
const DRONE_TYPES = ['drone'];
const DRONE_DAMAGE = 900;         // 自爆伤害(火炮弹丸,按护甲修正)
const DRONE_AOE_RADIUS = 30;      // 自爆范围伤害半径(px)
const DRONE_RELOAD = 20;          // 艾布拉姆X每 20 秒填装 1 发无人机
const DRONE_CONTACT_R = 6;        // 撞击判定额外余量(px)
function isDrone(u){ return !!u && DRONE_TYPES.indexOf(u.type)!==-1; }
/* ============ 艾布拉姆 TUSK 升级包:300盾回15 + 外观换 M1A2TUSK ============ */
const TUSK_COST = 350;
const TUSK_UPGRADE_TIME = 12;
const TUSK_SHIELD = 300;
const TUSK_SHIELD_REGEN = 15;
const TUSK_TYPES = ['abrams'];
function isTuskUnit(u){ return !!u && TUSK_TYPES.indexOf(u.type)!==-1; }
/* ============ 艾布拉姆 火炮升级包:+15 伤害 +15 射程 ============ */
const GUN_COST = 250;
const GUN_UPGRADE_TIME = 8;
const GUN_DMG = 15;
const GUN_RANGE = 15;
const GUN_TYPES = ['abrams'];
function isGunUnit(u){ return !!u && GUN_TYPES.indexOf(u.type)!==-1; }
/* ============ M60A3 升级包(盟军 M60 专属:250金/11秒,升级后血量600 射程+22 伤害+27,换 M60A3 外观) ============ */
const M60A3_COST = 250;
const M60A3_UPGRADE_TIME = 11;
const M60A3_HP = 270;      // 330 → 600(+270)
const M60A3_RANGE = 22;
const M60A3_DMG = 27;
// 可装单位:仅盟军 M60(type='tank' 且阵营 allies);苏军 T54 同为 type='tank' 但阵营 soviet,天然排除
function isM60A3Unit(u){ return !!u && u.type==='tank' && unitFactionOf(u.team)!=='soviet'; }
/* ============ 空军单位(机场生产:战斗机) ============ */
const AIR_TYPES = ['f16','su35','f15','f18','su35h'];        // 战斗机类型
const AIR_FACTION = { f16:['usa','europe','israel'], su35:['soviet'], f15:['usa','israel'], f18:['usa'], su35h:['soviet'] };  // 战斗机所属阵营
function airFactionOK(type, faction){ const a=AIR_FACTION[type]; return !!a && a.indexOf(faction)!==-1; }
const AIRFIELD_CAPACITY = 4;                          // 机场停机位(格,每架战斗机占1格)
const AIR_ALTITUDE = 16;                              // 飞机悬停高度(渲染向上偏移 px,逻辑坐标不变)
const AIR_SHADOW_ALPHA = 0.34;                        // 飞机地面投影不透明度(模糊椭圆)
const PLANE_PATROL_R = 48;                            // 飞机盘旋半径(px):在机场/指定点上空盘旋
/* ============ 运输直升机(机身+旋翼,落地/升空双模式):小鸟(盟)/UH-60(盟)/米17(苏) ============ */
const CHOPPER_TYPES = ['littlebird','uh60','mi17'];    // 直升机类型
function isChopper(u){ return !!u && u.chopper; }     // 用 def.chopper 标记(Unit 构造里读)
function isChopperType(type){ return CHOPPER_TYPES.indexOf(type)!==-1; }
const ROTOR_FULL_SPEED = 16;          // 旋翼全速(rad/s,渲染用,视觉转速)
const ROTOR_SPIN_UP = 2.8;            // 从停转到全速的时间(秒)= 起飞时间:先转起来才升空
const ROTOR_LAND_TIME = 0.8;          // 降落时旋翼减速到停的时间(秒)
const ROTOR_PIVOT = { x:0, y:-6 };    // 旋翼枢轴在机身贴图本地坐标中的位置(机头朝上贴图,-y=机头方向,可调)
const ROTOR_SCALE = 0.9248;           // 旋翼贴图额外缩放(相对 unitSpriteScale 公式,旋翼比机身大)
const CHOPPER_ALTITUDE = AIR_ALTITUDE;   // 悬停高度(复用飞机抬升高度)
const ROTOR_SPIN_ACCEL = ROTOR_FULL_SPEED / ROTOR_SPIN_UP;   // 起飞加速率
const ROTOR_SPIN_DECEL = ROTOR_FULL_SPEED / ROTOR_LAND_TIME; // 降落减速率
// 按机型的旋翼枢轴/缩放(默认值,浏览器里按观感微调;缺省回退小鸟)
const ROTOR_PIVOTS = { littlebird:{x:0,y:-6}, uh60:{x:0,y:-8}, mi17:{x:0,y:-12} };
const ROTOR_SCALES = { littlebird:0.9248, uh60:0.8, mi17:0.9 };
function rotorPivotFor(u){ return ROTOR_PIVOTS[u.type] || ROTOR_PIVOTS.littlebird; }
function rotorScaleFor(u){ return ROTOR_SCALES[u.type] !== undefined ? ROTOR_SCALES[u.type] : ROTOR_SCALES.littlebird; }
/* ============ 空军武器包(替换原测试炸弹包;F16/苏35 通用) ============ */
const AIR_WPN_TYPES = ['f16','su35'];                 // 可装这两种导弹包的飞机
// A-120c 空对空导弹包:只能打飞机,不能被红外干扰/APS 反导/目标挡弹
const AA_COST = 1000; const AA_UPGRADE_TIME = 15;
const AA_AMMO = 2;                                    // 弹舱容量
const AA_RANGE = 300;                                 // 空对空射程(雷达火控 +30)
const AA_DAMAGE = 200;
const AA_SPEED = 180;                                 // 飞行速度
const AA_SPRITE = 'aim120c_field'; const AA_SPRITE_LEN = 24;   // 贴图(机头朝上,长24px)
// A-174b 空对地导弹包:只能打地面/建筑
const AG_COST = 1000; const AG_UPGRADE_TIME = 15;
const AG_AMMO = 2;
const AG_RANGE = 310;
const AG_DAMAGE = 650;
const AG_SPEED = 150;
const AG_SPRITE = 'aim174b_field'; const AG_SPRITE_LEN = 28;
// 苏-35 专属导弹(与 F-16 的 A-120c/A-174b 是"不同导弹",数值完全相同):R-37m 空对空 / Kh-29 空对地
const R37M_SPRITE = 'r37m_field'; const R37M_SPRITE_LEN = 24;   // R-37m 空对空(苏35,机头朝上,长24px)
const KH29_SPRITE = 'kh29_field'; const KH29_SPRITE_LEN = 30;   // Kh-29 空对地(苏35,机头朝上,长30px)
// F-15 专用 GBU-31 垂直炸弹(占一个挂载位,每挂点 4 颗,垂直投放,火炮伤害)
const F15_HP_COUNT = 4;                            // F-15 武器挂载点数量
const GBU31_COST = 1500; const GBU31_UPGRADE_TIME = 15;   // GBU31 价格/安装时间
const GBU31_AMMO_PER_HP = 4;                       // 每个挂载位装的 GBU31 数量
const GBU31_DAMAGE = 500;                          // 单颗伤害(火炮属性,按护甲修正)
const GBU31_AOE = 50;                              // 爆炸范围半径(px)
const GBU31_DROP_CD = 0.8;                         // 两颗炸弹之间的释放间隔(秒)
const GBU31_FALL_TIME = 0.1;                       // 炸弹从投放到落地爆炸的延时(秒)
const GBU31_DROP_RANGE = GBU31_AOE + 6;            // 出击时飞机接近目标的投放距离(保证 AOE 覆盖目标)
// 挂载点已装武器数:返回 'aa'|'ag'|'gbu'|'growler' 类型的挂点数
function f15HpCount(u, kind){
  if(!u || !u.hardpoints) return 0;
  let n = 0;
  for(const hp of u.hardpoints) if(hp && !hp.upgrading && hp.kind===kind) n++;
  return n;
}
// 挂载点已装武器数:返回 'aa'|'ag'|'gbu'|'growler' 类型的挂点数
function f15AmmoCap(u, kind){
  const n = f15HpCount(u, kind);
  if(kind==='aa') return n * AA_AMMO;
  if(kind==='ag') return n * AG_AMMO;
  if(kind==='gbu') return n * GBU31_AMMO_PER_HP;
  return 0;   // 咆哮者干扰仓无弹量(被动光环)
}
// 按挂点重算 F-15/F-18/苏-35 的聚合弹量与标记(安装完成/返场补弹用);
// growler 无弹药,只派生 u.growler 布尔(任一挂点是干扰仓即生效)
function f15RecalcAmmo(u){
  if(!u || !u.hardpoints) return;
  const aaN = f15HpCount(u,'aa'), agN = f15HpCount(u,'ag'), gbuN = f15HpCount(u,'gbu');
  const grN = f15HpCount(u,'growler');
  u.aa = aaN>0; u.ag = agN>0; u.gbu = gbuN>0; u.growler = grN>0;
  u.aaAmmo = aaN * AA_AMMO;
  u.agAmmo = agN * AG_AMMO;
  u.gbuAmmo = gbuN * GBU31_AMMO_PER_HP;
}
const AIR_MISSILE_CD = 1.2;                           // 手动发射两发之间冷却(秒)
const AIR_MODE_AUTO_COOLDOWN = 2.8;                   // 雷达"自动分配"对同一单位再次发射的冷却(秒)
// 雷达火控:射程 +30;获得 1号(A-120c)/2号(A-174b) 攻击模式按键
const RADAR_COST = 2500; const RADAR_UPGRADE_TIME = 15;
const RADAR_RANGE_BONUS = 30;
const AIR_MODE_MANUAL = 0, AIR_MODE_AUTO = 1, AIR_MODE_DUMP = 2;
const AIR_MODE_NAME = ['手动','自动分配','倾泻'];
// 涂层更新:敌方对本机任何雷达式探测范围 -50(尤其空对空导弹;后续对地/对空系统也适用)
const COAT_COST = 1200; const COAT_UPGRADE_TIME = 15;
const COAT_RANGE_PENALTY = 50;
/* ============ 咆哮者干扰仓(F/A-18 专属,挂点武器):被动区域干扰光环 ============ */
// 占用 1 个武器挂载点(与 A-120c/A-174b/GBU-31 同级),仅 F/A-18 可挂。
// 升空(非停驻)时以自身为中心持续张开 320px 干扰光环,效果(只对敌方):
//   1) 圈内敌方地面反坦克导弹(TOW / 长钉)全部被打上 jammed(乱飞3步后爆炸,爆炸不分敌我);
//   2) 圈内敌方弹簧刀无人机原地自爆;
//   3) 圈内敌方单位自主防御系统(APS)失效(不再拦截导弹)。
// 对我方无任何影响;空军导弹(A-120c/R-37m 等)维持"免疫干扰"设计。
const GROWLER_TYPES = ['f18'];
const GROWLER_COST = 4500;
const GROWLER_UPGRADE_TIME = 15;
const GROWLER_JAM_RADIUS = 320;    // 干扰光环半径(px)
function isGrowlerUnit(u){ return !!u && GROWLER_TYPES.indexOf(u.type)!==-1; }
// 该位置(x,y)是否处于敌方咆哮者干扰光环内(用于压制 APS:圈内敌方 APS 失效)
function growlerJamNear(team, x, y){
  for(const v of units){
    if(!v || v.hp<=0 || !isGrowlerUnit(v) || !v.growler || v.parked) continue;
    if(!isEnemy(team, v.team)) continue;
    if(Math.hypot(v.x-x, v.y-y) <= GROWLER_JAM_RADIUS) return true;
  }
  return false;
}
// 某武器对某目标的有效射程 = 基础射程 + 己方雷达 +30 - 目标涂层 -50(涂层只作用于飞机目标)
function airMissileEffRange(u, base, target){
  let r = base + (u.radar ? RADAR_RANGE_BONUS : 0);
  if(target && target.coat) r -= COAT_RANGE_PENALTY;
  return Math.max(40, r);
}
function isAirWpnUnit(u){ return !!u && AIR_WPN_TYPES.indexOf(u.type)!==-1; }
// 出击规划: 所有占机场停机位的战斗机都开放(装雷达火控后生效;直升机不占格不算)
function isPlannablePlane(u){ return !!u && u.fly && isAircraft(u); }
// 号位短名(F22 等未来机型直接显示类型名)
function airTypeShort(u){ return u.type==='f16' ? 'F16' : u.type==='su35' ? '苏27' : u.type==='f15' ? 'F15' : u.type==='f18' ? 'F18' : u.type==='su35h' ? '苏35' : (u.def && u.def.name || u.type); }
// 苏系机(苏27/苏35)与 F16 的导弹是"不同导弹"(贴图/名字不同,数值相同):按机种选 spriteType 与显示名
function isSovietAircraft(u){ return !!u && (u.type==='su35' || u.type==='su35h'); }
function airAASpriteType(u){ return isSovietAircraft(u) ? 'r37m' : 'a120c'; }
function airAGSpriteType(u){ return isSovietAircraft(u) ? 'kh29' : 'a174b'; }
function airAAName(u){ return isSovietAircraft(u) ? 'R37m' : 'A-120c'; }
function airAGName(u){ return isSovietAircraft(u) ? 'Kh29' : 'A-174b'; }
// 垂直炸弹显示名:F15/F18 用 GBU-31,苏35 用 MK-1000(数值完全一致)
function airBombName(u){ return isSovietAircraft(u) ? 'MK-1000' : 'GBU-31'; }
// 每架飞机占用的停机位格数(目前 F16/苏35 各占 1 格;未来占多格的飞机在 def.slotCost 里写)
function planeSlotCost(type){ const d=getUnitDefs('usa')[type] || getUnitDefs('soviet')[type]; return (d && d.slotCost) || 1; }
function isAircraft(u){ return !!u && AIR_TYPES.indexOf(u.type)!==-1; }
function isAircraftType(type){ return AIR_TYPES.indexOf(type)!==-1; }
/* ============ 坦克炮弹(125mm 贴图,车头朝左,长18px,匀速) ============ */
const TANK_SHELL_LEN = 18;                               // 坦克炮弹渲染长度(px)
function isTankShellUnit(u){ return !!u && (u.type==='tank'||u.type==='abrams'||u.type==='t90'||u.type==='leclerc'||u.type==='leopard'||u.type==='challenger'||u.type==='leopard1a5'||u.type==='chieftain'||u.type==='t84bm'||u.type==='t72'||u.type==='t62'||u.type==='t80'||u.type==='merkava'||u.type==='abramsx'||u.type==='t14'); }
function getUnitDefs(faction){
  if(UNIT_DEF_CACHE[faction]) return UNIT_DEF_CACHE[faction];
  let defs;
  if(faction==='soviet'){
    defs = {
      infantry:{ ...BASE_UNITS.infantry },
      tank:    { ...BASE_UNITS.tank, name:'T54', hp:450, damage:45, cost:650, r:14 },
      harvester:{ ...BASE_UNITS.harvester },
      mcv:      { ...BASE_UNITS.mcv },
      airfield_car:{ ...BASE_UNITS.airfield_car },
        t90:     { name:'T90坦克', hp:900, speed:72, range:130, damage:80, rof:0.9, cost:1000, r:13, build:9, armor:'titanium', proj:'cannon', upgradeable:true, desc:'苏军主战坦克,机动灵活射速快,需Lv2战车工厂;可升级为T90M(伤害+30/射程+10/移速-10,获得400护盾回15每秒并自带自主防御系统)' },
      magnet:  { name:'磁暴步兵', hp:250, speed:58, range:72, damage:110, rof:3, cost:350, r:9, build:7, armor:'steel', proj:'cannon', desc:'苏军高科技步兵:电磁手套释放闪电,对布甲伤害提升至150%,需升级兵营' },
      destroyer:{ ...NAVAL_UNITS.destroyer },
      transport:{ ...NAVAL_UNITS.transport },
      kuznetsov:{ name:'库兹涅佐夫号航母', hp:7000, speed:40, range:0, damage:0, rof:0, cost:500000, r:38, build:40, armor:'titanium', proj:null, naval:true, carrierShip:true, slots:4, train:['su35','su35h'], desc:'苏军重型航母:移动机场,可在海上航行,生产苏-27 与苏-35 战斗机(4个停机位),需2级船坞建造' },
        b11:     { name:'俄制B11', hp:370, speed:66, range:135, damage:25, rof:0.4, cost:580, r:12, build:10, armor:'castiron', proj:'machinegun', amphib:true, carrier:true, capacity:7, desc:'苏军两栖步兵战车:机炮压制,水陆两栖,可装载7名步兵,需Lv2战车工厂' },
        t84bm:   { name:'T84BM', hp:1100, speed:65, range:140, damage:120, rof:1.1, cost:1500, r:14, build:12, armor:'titanium', proj:'cannon', upgradeable:true, desc:'苏军新一代主战坦克:装甲厚重火力凶猛,炮塔可独立旋转(2/3法则,座圈居中);可安装反应装甲(300盾,回10/秒)与红外干扰装置(干扰前方120°扇形内的敌TOW),需Lv2战车工厂' },
        t72:     { name:'T72', hp:600, speed:72, range:115, damage:55, rof:1.1, cost:750, r:14, build:10, armor:'castiron', proj:'cannon', upgradeable:true, desc:'苏军主战坦克:经济实用的主力战车,可两次升级为T72B(获得反应装甲护盾)与T72BVM(钛合金装甲+强盾),T72BVM还可安装自主防御系统,需Lv2战车工厂' },
      t62:     { name:'T62', hp:700, speed:70, range:115, damage:65, rof:1.1, cost:750, r:14, build:10, armor:'castiron', proj:'cannon', upgradeable:true, desc:'苏军主战坦克:火力装甲均衡,由普通战车工厂直接生产;可三次升级为T64/T64B/T64BM(逐步获得反应装甲护盾)' },
        t80:     { name:'T80', hp:1000, speed:70, range:125, damage:80, rof:1.1, cost:1000, r:14, build:10, armor:'titanium', proj:'cannon', upgradeable:true, desc:'苏军新一代主战坦克:重装甲高机动,需Lv2战车工厂;可三次升级为T80B/T80U/T80BVM(逐步获得反应装甲护盾,T80BVM自带自主防御系统)' },
      su35:    { name:'苏-27战斗机', hp:150, speed:150, range:0, damage:0, rof:0, cost:12000, r:20, build:20, armor:'castiron', proj:null, fly:true, slotCost:1, desc:'苏军空军单位:高速喷气式战斗机,悬停飞行可飞越一切地形;生产后停驻在机场,右键机场释放/返场,可安装 R-37m 空对空与 Kh-29 空对地导弹包(打空自动返场)' },
      su35h:   { name:'苏-35战斗机', hp:300, speed:160, range:0, damage:0, rof:0, cost:26500, r:22, build:17, armor:'titanium', proj:null, fly:true, slotCost:1, desc:'苏军重型多用途战斗机(F-15翻版):4个武器挂载点,每点可挂 R-37m 空对空 / Kh-29 空对地导弹包或 MK-1000 垂直炸弹(每点4颗,每0.8秒投1~2颗,500火炮伤害);可装雷达火控与隐形涂层,支持出击规划;机场与航母均可建造' },
        t14:     { name:'T14', hp:1500, speed:64, range:150, damage:220, rof:1.1, cost:4000, r:14, build:15, armor:'titanium', proj:'cannon', desc:'苏军终极主战坦克:反应装甲护盾300(每秒恢复15),自带自主防御系统(反TOW),火力凶猛的下一代主战坦克,需Lv3战车工厂' },
      mi17:    { name:'米-17', hp:150, speed:120, range:0, damage:0, rof:0, cost:1800, r:14, build:13, armor:'castiron', proj:null, fly:true, carrier:true, capacity:12, chopper:true, desc:'苏军重型运输直升机:由机场生产(不占停机位),可装载12名步兵;落地/升空双模式(起飞2.8秒),升空后只被空对空导弹攻击,落地可被地面与空对地攻击,被击毁时载员全部阵亡' },
      drone:   { name:'弹簧刀无人机', hp:50, speed:130, range:0, damage:0, rof:0, cost:0, r:8, build:0, armor:'cloth', proj:null, fly:true, desc:'艾布拉姆X携带的察打一体无人机:悬浮待命,右键敌人撞击自爆(900火炮范围伤);只有空对空导弹能打到它,不被自主防御系统反导,被击落也会自爆' },
    };
  } else {
    // 西方三阵营共用基础(美国/欧洲/以色列):北约步兵 / M60 / 外骨骼 / 通用海空军
    const west = {
      infantry:{ ...BASE_UNITS.infantry, name:'北约士兵', hp:230, damage:16, cost:225 },
      tank:    { ...BASE_UNITS.tank },
      harvester:{ ...BASE_UNITS.harvester },
      mcv:      { ...BASE_UNITS.mcv },
      airfield_car:{ ...BASE_UNITS.airfield_car },
      exo:     { name:'外骨骼大兵', hp:330, speed:74, range:118, damage:70, rof:1.5, cost:460, r:9, build:8, armor:'steel', proj:'cannon', desc:'高科技单兵:外骨骼装甲手持炮管,射程火力逼近主战坦克,需升级兵营' },
      destroyer:{ ...NAVAL_UNITS.destroyer },
      transport:{ ...NAVAL_UNITS.transport },
      f16:     { name:'F-16战斗机', hp:150, speed:150, range:0, damage:0, rof:0, cost:12000, r:20, build:20, armor:'castiron', proj:null, fly:true, slotCost:1, desc:'西方空军单位:高速喷气式战斗机,悬停飞行可飞越一切地形;生产后停驻在机场,右键机场释放/返场,可安装 A-120c 空对空与 A-174b 空对地导弹包(打空自动返场)' },
      littlebird:{ name:'小鸟直升机', hp:60, speed:100, range:0, damage:0, rof:0, cost:900, r:13, build:12, armor:'castiron', proj:null, fly:true, carrier:true, capacity:5, chopper:true, desc:'西方运输直升机:由机场生产(不占停机位),升空后只被空对空导弹攻击,降落时地面部队与空对地导弹可攻击;只有降落时能装载5名步兵,被击毁时载员全部阵亡' },
      uh60:    { name:'UH-60 黑鹰', hp:150, speed:120, range:0, damage:0, rof:0, cost:1800, r:14, build:13, armor:'castiron', proj:null, fly:true, carrier:true, capacity:12, chopper:true, desc:'西方重型运输直升机:由机场生产(不占停机位),可装载12名步兵;落地/升空双模式(起飞2.8秒),升空后只被空对空导弹攻击,落地可被地面与空对地攻击,被击毁时载员全部阵亡' },
      drone:   { name:'弹簧刀无人机', hp:50, speed:130, range:0, damage:0, rof:0, cost:0, r:8, build:0, armor:'cloth', proj:null, fly:true, desc:'艾布拉姆X携带的察打一体无人机:悬浮待命,右键敌人撞击自爆(900火炮范围伤);只有空对空导弹能打到它,不被自主防御系统反导,被击落也会自爆' },
    };
    if(faction==='usa'){
      defs = {
        ...west,
        abrams:  { name:'艾布拉姆斯坦克', hp:1200, speed:62, range:135, damage:130, rof:1.1, cost:1500, r:14, build:9, armor:'titanium', proj:'cannon', desc:'美国重型主战坦克,装甲厚重火力凶猛,需Lv2战车工厂;可安装TUSK升级包(350金,300盾回15/秒并换装M1A2TUSK外观)与火炮升级包(250金,+15伤害+15射程),还可安装自主防御系统' },
        abramsx:{ name:'艾布拉姆X', hp:1600, speed:70, range:150, damage:160, rof:0.85, cost:4500, r:14, build:15, armor:'titanium', proj:'cannon', droneSlots:1, desc:'美国终极主战坦克:自带自主防御系统,出厂携带1发弹簧刀无人机(释放后每20秒填装),右键空地/敌人可指挥无人机撞击自爆(900范围伤),需Lv3战车工厂' },
        bradley: { name:'布拉德利步兵战车', hp:420, speed:54, range:140, damage:25, rof:0.33, cost:700, r:12, build:10, armor:'castiron', proj:'machinegun', carrier:true, capacity:3, desc:'美国步兵战车:机炮火力压制,可装载3名步兵,可安装反坦克导弹(TOW)、自主防御系统(150金,1发反导弹)与反应装甲(150金,150盾回5/秒),需Lv2战车工厂' },
        f15:     { name:'F-15重型战斗机', hp:300, speed:160, range:0, damage:0, rof:0, cost:26500, r:22, build:17, armor:'titanium', proj:null, fly:true, slotCost:1, desc:'美国重型多用途战斗机:4个武器挂载点,每点可挂 A-120c 空对空 / A-174b 空对地导弹包或 GBU-31 垂直炸弹(每点4颗,每0.8秒投1~2颗,500火炮伤害);可装雷达火控与隐形涂层,支持出击规划' },
        f18:     { name:'F/A-18 咆哮者', hp:300, speed:150, range:0, damage:0, rof:0, cost:24000, r:20, build:16, armor:'castiron', proj:null, fly:true, slotCost:1, carrierOnly:true, desc:'美国舰载电子战战斗机:只能由航母(福特号)建造,4个武器挂载点(同F-15,可挂 A-120c / A-174b / GBU-31);可装雷达火控与隐形涂层,专属挂点武器"咆哮者干扰仓"($4500):升空时以自身为中心张开320px干扰光环,敌方TOW/长钉反坦克导弹被干扰乱飞自爆、敌方无人机原地自爆、敌方APS失效' },
        ford:    { name:'福特号航母', hp:10000, speed:40, range:0, damage:0, rof:0, cost:750000, r:40, build:40, armor:'titanium', proj:null, naval:true, carrierShip:true, slots:6, train:['f15','f18'], desc:'美国超级航母:移动机场,可在海上航行,生产 F-15 重型战斗机与 F/A-18 咆哮者(共6个停机位),需2级船坞建造' },
      };
    } else if(faction==='europe'){
      defs = {
        ...west,
        leopard: { name:'豹2A4', hp:950, speed:66, range:140, damage:110, rof:0.95, cost:1200, r:14, build:14, armor:'titanium', proj:'cannon', desc:'欧洲主战坦克:火力凶猛的德系战车,机动良好,需Lv2战车工厂' },
        leclerc: { name:'法制勒克莱尔', hp:1100, speed:66, range:145, damage:100, rof:0.9, cost:1350, r:14, build:14, armor:'titanium', proj:'cannon', desc:'欧洲第三代主战坦克:射程火力兼备,机动优秀,需Lv2战车工厂' },
        challenger:{ name:'挑战者号', hp:1050, speed:56, range:140, damage:110, rof:0.95, cost:1500, r:14, build:14, armor:'titanium', proj:'cannon', upgradeable:true, desc:'欧洲重型主战坦克:装甲厚重,可两次升级为挑战者2号/3号(每次+15伤害+120血),需Lv2战车工厂' },
        marder:  { name:'黄鼠狼步兵战车', hp:370, speed:66, range:135, damage:25, rof:0.33, cost:600, r:12, build:10, armor:'castiron', proj:'machinegun', carrier:true, capacity:6, desc:'欧洲步兵战车:机动灵活,可装载6名步兵,需Lv2战车工厂' },
        puma:    { name:'美洲狮步战车', hp:450, speed:70, range:135, damage:25, rof:0.35, cost:750, r:12, build:10, armor:'titanium', proj:'machinegun', desc:'欧洲高速轮式步战车:炮塔独立360°旋转,炮口对准射程内目标才开火,需Lv2战车工厂' },
        leopard1a5:{ name:'豹1A5', hp:420, speed:76, range:130, damage:80, rof:1.0, cost:800, r:13, build:12, armor:'castiron', proj:'cannon', desc:'欧洲主战坦克:机动灵活的德系战车,火力装甲均衡,新建战车工厂即可生产' },
        chieftain:{ name:'酋长坦克', hp:700, speed:60, range:125, damage:85, rof:1.1, cost:900, r:14, build:12, armor:'castiron', proj:'cannon', desc:'欧洲主战坦克:装甲厚重火力强劲,是攻防兼备的重装战车,新建战车工厂即可生产' },
      };
    } else {   // israel
      defs = {
        ...west,
        merkava:{ name:'梅卡瓦MK4', hp:900, speed:68, range:130, damage:95, rof:1.1, cost:1200, r:14, build:12, armor:'titanium', proj:'cannon', carrier:true, capacity:5, desc:'以色列重型主战坦克:可装载5名步兵,被击毁时载员全部存活;可花500安装自主防御系统,需Lv2战车工厂' },
        namer:   { name:'雌虎步兵战车', hp:800, speed:62, range:120, damage:30, rof:0.35, cost:1000, r:13, build:12, armor:'castiron', proj:'machinegun', carrier:true, capacity:6, desc:'以色列重型步兵战车:机炮压制,可装载6名步兵,可安装长钉反坦克导弹模块,需Lv2战车工厂' },
        f15:    { name:'F-15I 雷公重型战斗机', hp:300, speed:160, range:0, damage:0, rof:0, cost:26500, r:22, build:17, armor:'titanium', proj:null, fly:true, slotCost:1, desc:'以色列重型多用途战斗机:4个武器挂载点,每点可挂 A-120c 空对空 / A-174b 空对地导弹包或 GBU-31 垂直炸弹(每点4颗,每0.8秒投1~2颗,500火炮伤害);可装雷达火控与隐形涂层,支持出击规划' },
      };
    }
  }
  UNIT_DEF_CACHE[faction] = defs;
  return defs;
}
function unitFactionOf(team){ return teamFactions[team] || 'usa'; }
function advancedInfantryType(team){ return unitFactionOf(team)==='soviet' ? 'magnet' : 'exo'; }

const UNIT_DESC = {
  b_command:'基地核心,展开后可建造各类建筑',
  b_power:'为基地供电,保证生产速度与防御设施运行',
  b_barracks:'训练步兵的营房',
  b_factory:'生产主战坦克与采矿车的战车工厂',
  b_refinery:'接收采矿车矿石并兑换成资金',
  b_turret:'固定防御碉堡,自动攻击射程内敌人',
  b_repair:'维修厂:周围两格内的己方单位每秒恢复 10 点生命(治疗光环)',
  b_dock:'水上船坞:只能建在水上,生产驱逐舰与运输艇',
  b_airfield:'展开后形成的机场建筑,占地2x3,木制护甲,可被摧毁并影响胜负;生产战斗机(盟军F-16/F-15、苏军苏-27/苏-35,共4个停机位;F/A-18 只能由航母建造)',
};
const BLD_DEFS = {
  command:  { name:'建造厂',  w:3,h:3, hp:1800, cost:0, power:50, buildTime:1,  build:['power','barracks','factory','refinery','turret','repair','lab','dock'], train:['airfield_car'], color:'#5b6b7a', armor:'wood', weapon:null },
  power:    { name:'发电厂',  w:2,h:2, hp:520,  cost:100, power:50, buildTime:5,  build:[],    color:'#b06a3a', armor:'wood', weapon:null },
  barracks: { name:'兵营',    w:2,h:2, hp:460,  cost:200, power:0, buildTime:7,  train:['infantry'], color:'#5a7a4a', armor:'wood', weapon:null },
  factory:  { name:'战车工厂',w:3,h:3, hp:680,  cost:800, power:0, buildTime:14, train:['tank','t62','harvester','leopard1a5','chieftain'], color:'#4a5a8a', armor:'wood', weapon:null },
  refinery: { name:'矿石精炼厂',w:3,h:3, hp:620, cost:600, power:0, buildTime:12, train:[],  color:'#9a8a3a', armor:'wood', weapon:null },
  turret:   { name:'碉堡',    w:1,h:1, hp:520,  cost:300, power:0, buildTime:7,  train:[],  color:'#6a6a6a', armor:'concrete', weapon:{range:160, damage:21, rof:0.75, bulletSpeed:420, proj:'machinegun'} },
  repair:   { name:'维修厂',  w:2,h:2, hp:560,  cost:500, power:0, buildTime:8,  train:[],  color:'#7a6a4a', armor:'wood', weapon:null },
  lab:      { name:'实验室',  w:2,h:2, hp:600,  cost:1000, power:0, buildTime:20, build:[],  color:'#5a5a8a', armor:'wood', weapon:null },
  dock:     { name:'船坞',    w:2,h:2, hp:720,  cost:600, power:0, buildTime:10, train:['destroyer','transport','ford','kuznetsov'], color:'#4a7a8a', armor:'wood', weapon:null, water:true },
  airfield: { name:'机场',    w:2,h:3, hp:750,  cost:1200, power:0, buildTime:14, build:[], train:['f16','su35','f15','su35h','littlebird','uh60','mi17'], color:'#6a7a8a', armor:'wood', weapon:null },
  /* ============ 中立建筑(不可建造:不出现在任何可建列表,仅地图装饰) ============ */
  school:   { name:'学校',     w:2,h:2, hp:1000, cost:0, power:0, buildTime:0, build:[], color:'#c9b58a', armor:'concrete', weapon:null, neutral:true, garrisonCap:5, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:城市学校,占地2x2,混凝土护甲。可进驻5名步兵,进驻后归该方所有并向外射击(射程+20)' },
  hospital: { name:'医院',     w:2,h:2, hp:1200, cost:0, power:0, buildTime:0, build:[], color:'#d8a0a0', armor:'concrete', weapon:null, neutral:true, desc:'中立建筑:城市医院,占地2x2,混凝土护甲。可被摧毁,但不影响胜负' },
  house_jp1:{ name:'日式独栋别墅1', w:1,h:1, hp:500, cost:0, power:0, buildTime:0, build:[], color:'#b09a7a', armor:'wood', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:日式独栋别墅,占地1x1,木制护甲。可进驻3名步兵,进驻后归该方所有并向外射击(射程+20)' },
  house_jp2:{ name:'日式独栋别墅2', w:1,h:1, hp:500, cost:0, power:0, buildTime:0, build:[], color:'#b09a7a', armor:'wood', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:日式独栋别墅,占地1x1,木制护甲。可进驻3名步兵,进驻后归该方所有并向外射击(射程+20)' },
  house_us:{ name:'美式独栋建筑', w:1,h:1, hp:600, cost:0, power:0, buildTime:0, build:[], color:'#c0b0a0', armor:'wood', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], desc:'中立建筑:美式独栋住宅,占地1x1,木制护甲。可进驻3名步兵,进驻后归该方所有并向外射击(射程+20)' },
  nuclear:  { name:'核电站',   w:3,h:3, hp:2300, cost:0, power:0, buildTime:0, build:[], color:'#7a8a5a', armor:'concrete', weapon:null, neutral:true, dmgMod:{cannon:0.5}, desc:'中立建筑:核电站,占地3x3,混凝土护甲,受火炮伤害修正比为50%' },
  mall:     { name:'综合商业体', w:4,h:4, hp:4000, cost:0, power:0, buildTime:0, build:[], color:'#a09a8a', armor:'wood', weapon:null, neutral:true, garrisonCap:12, garrisonTypes:['infantry','exo','magnet'], tankSlot:1, desc:'中立建筑:综合商业体,占地4x4,木制护甲。可进驻12名步兵 + 1个专属坦克位,进驻后归该方所有并向外射击(射程+20)' },
  pentagon: { name:'五角大楼', w:4,h:4, hp:5000, cost:0, power:0, buildTime:0, build:[], color:'#9a9a8a', armor:'concrete', weapon:null, neutral:true, dmgMod:{cannon:0.5}, desc:'中立建筑:五角大楼,占地4x4,混凝土护甲,受火炮伤害修正比为50%' },
  // 中立经济建筑:进驻(被占领)后按驻军向占领方提供持续资金收入
  bank:     { name:'银行',     w:1,h:1, hp:1500, cost:0, power:0, buildTime:0, build:[], color:'#b8a86a', armor:'concrete', weapon:null, neutral:true, garrisonCap:3, garrisonTypes:['infantry','exo','magnet'], incomePerSec:50, desc:'中立建筑:银行,占地1x1,混凝土护甲。可进驻3名步兵,被占领后每秒收入50资金' },
  oilfield: { name:'油田',     w:2,h:2, hp:1500, cost:0, power:0, buildTime:0, build:[], color:'#6a6a5a', armor:'concrete', weapon:null, neutral:true, garrisonCap:6, garrisonTypes:['infantry','exo','magnet'], incomePerSec:25, desc:'中立建筑:油田,占地2x2,混凝土护甲。可进驻6名步兵,被占领后每秒收入25资金' },
  scam_park:{ name:'诈骗园区', w:2,h:2, hp:1500, cost:0, power:0, buildTime:0, build:[], color:'#8a6a7a', armor:'concrete', weapon:null, neutral:true, garrisonCap:10, garrisonTypes:['infantry','exo','magnet'], incomePerUnit:10, desc:'中立建筑:诈骗园区,占地2x2,混凝土护甲。可进驻10名步兵,被占领后每秒收入10×进驻人数资金' },
};
// 船坞可建造范围:整块落水的同时,须距离最近己方建筑 ≤ 此格数(贴近基地下海,不能乱修)
const DOCK_BUILD_RANGE = 8;
// 战车工厂升级(两次:Lv1→Lv2 解锁高级坦克,Lv2→Lv3 解锁三级坦克 T14/艾布拉姆X)
const FACTORY_UPGRADE_COST = 500;
const FACTORY_UPGRADE_TIME = 10;
const FACTORY_UPGRADE_COST2 = 1000;   // 第二次升级费用
const FACTORY_UPGRADE_TIME2 = 15;     // 第二次升级耗时(秒)
// 船坞升级(2级船坞:血量+200,解锁航母生产)
const DOCK_UPGRADE_COST = 1000;
const DOCK_UPGRADE_TIME = 15;
const DOCK_UPGRADE_HP = 200;
// 航母:可生产战斗机的海军单位(移动机场)
const CARRIER_TYPES = ['ford','kuznetsov'];
function isCarrierShipType(type){ return CARRIER_TYPES.indexOf(type)!==-1; }
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
/* ============ T72 三阶升级(T72 → T72B → T72BVM,苏军升级工厂生产) ============ */
const T72_LEVELS = [
  { name:'T72',    hp:600, damage:55, rof:1.1, range:115, speed:72, armor:'castiron', proj:'cannon', shield:0,   shieldRegen:0,   body:'t72_body',    turret:'t72_turret',    rotOff:-Math.PI/2, tip:[0,0.5],
    overall:1,   bodyScale:0.9, turretOff:0 },   // 只缩车身×0.9,炮塔回正中(向负方向移4px)
  { name:'T72B',   hp:750, damage:75, rof:1.1, range:125, speed:70, armor:'castiron', proj:'cannon', shield:100, shieldRegen:5,  body:'t72b_body',   turret:'t72b_turret',   rotOff:Math.PI,    tip:[-0.5,0],
    overall:0.9, bodyScale:1,   turretOff:6 },   // 炮塔向前+6px,再整体缩至0.9
  { name:'T72BVM', hp:850, damage:90, rof:1.1, range:135, speed:66, armor:'titanium', proj:'cannon', shield:250, shieldRegen:10, body:'t72bvm_body', turret:'t72bvm_turret', rotOff:-Math.PI/2, tip:[0,0.5],
    overall:0.9, bodyScale:1,   turretOff:4 },   // 炮塔向前+4px,再整体缩至0.9
];
const T72_UPGRADE_COST = [0, 250, 200];   // 升级到 1/2 级的价格(T72→T72B $250 / T72B→T72BVM $200)
const T72_UPGRADE_TIME = 10;              // 每次升级耗时(秒)
function t72Level(u){ return (u && T72_LEVELS[u.upgradeLvl]) || T72_LEVELS[0]; }
/* ============ T62 四阶升级(T62 → T64 → T64B → T64BM,苏军普通工厂产) ============ */
const T62_LEVELS = [
  { name:'T62',    hp:700, damage:65, rof:1.1, range:115, speed:70, armor:'castiron', proj:'cannon', shield:0,   shieldRegen:0,   body:'t62_body',   turret:'t62_turret',   rotOff:Math.PI/2, tip:[0,-0.5],
    overall:1,   bodyScale:0.9, turretOff:4, pivotK:7/10 },   // 基础 T62 保持原调教(炮塔+4px,7/10法则,车身×0.9)
  { name:'T64',    hp:700, damage:75, rof:1.1, range:125, speed:68, armor:'castiron', proj:'cannon', shield:0,   shieldRegen:0,   body:'t64_body',   turret:'t64_turret',   rotOff:Math.PI/2, tip:[0,-0.5],
    overall:1,   bodyScale:1,   turretOff:3, pivotK:2/3 },   // 炮塔向正方向+3px,2/3 法则
  { name:'T64B',   hp:700, damage:75, rof:1.1, range:125, speed:66, armor:'castiron', proj:'cannon', shield:150, shieldRegen:5,  body:'t64b_body',  turret:'t64b_turret',  rotOff:Math.PI/2, tip:[0,-0.5],
    overall:1,   bodyScale:1,   turretOff:3, pivotK:2/3 },
  { name:'T64BM',  hp:700, damage:85, rof:1.1, range:135, speed:64, armor:'castiron', proj:'cannon', shield:200, shieldRegen:10, body:'t64bm_body', turret:'t64bm_turret', rotOff:Math.PI/2, tip:[0,-0.5],
    overall:1,   bodyScale:1,   turretOff:0, pivotK:2/3 },
];
const T62_UPGRADE_COST = [0, 100, 100, 100];   // T62→T64 / T64→T64B / T64B→T64BM 每次升级均 $100
const T62_UPGRADE_TIME = 10;
function t62Level(u){ return (u && T62_LEVELS[u.upgradeLvl]) || T62_LEVELS[0]; }
/* ============ T80 四阶升级(T80 → T80B → T80U → T80BVM,苏军二级工厂产) ============ */
const T80_LEVELS = [
  { name:'T80',    hp:1000, damage:80,  rof:1.1, range:125, speed:70, armor:'titanium', proj:'cannon', shield:0,   shieldRegen:0,   body:'t80_body',    turret:'t80_turret',    rotOff:Math.PI/2, tip:[0,-0.5],
    overall:0.85, bodyScale:1,   turretOff:3, pivotK:7/10 },
  { name:'T80B',   hp:1100, damage:80,  rof:1.1, range:135, speed:68, armor:'titanium', proj:'cannon', shield:150, shieldRegen:10, body:'t80b_body',   turret:'t80b_turret',   rotOff:Math.PI/2, tip:[0,-0.5],
    overall:0.85, bodyScale:1,   turretOff:3, pivotK:7/10 },
  { name:'T80U',   hp:1100, damage:100, rof:1.1, range:145, speed:68, armor:'titanium', proj:'cannon', shield:200, shieldRegen:10, body:'t80u_body',   turret:'t80u_turret',   rotOff:Math.PI/2, tip:[0,-0.5],
    overall:0.85, bodyScale:1,   turretOff:3, pivotK:2/3 },
  { name:'T80BVM', hp:1100, damage:120, rof:1.1, range:145, speed:62, armor:'titanium', proj:'cannon', shield:350, shieldRegen:10, aps:true, body:'t80bvm_body', turret:'t80bvm_turret', rotOff:Math.PI/2, tip:[0,-0.5],
    overall:0.85, bodyScale:1,   turretOff:3, pivotK:2/3 },
];
const T80_UPGRADE_COST = [0, 300, 200, 700];   // T80→T80B $300 / T80B→T80U $200 / T80U→T80BVM $700
const T80_UPGRADE_TIME = 10;
function t80Level(u){ return (u && T80_LEVELS[u.upgradeLvl]) || T80_LEVELS[0]; }
/* ============ T90 单次升级(T90 → T90M,苏军二级工厂产) ============ */
const T90_LEVELS = [
  { name:'T90',    hp:900, damage:80, rof:0.9, range:130, speed:72, armor:'titanium', proj:'cannon', shield:0,   shieldRegen:0,   body:'t90_body',   turret:'t90_turret',   rotOff:Math.PI,   tip:[-0.5,0],
    overall:1,   bodyScale:1,   turretOff:0, pivotK:2/3 },   // 基础 T90 保持原调教(水平朝左贴图)
  { name:'T90M',   hp:900, damage:110, rof:0.9, range:140, speed:62, armor:'titanium', proj:'cannon', shield:400, shieldRegen:15, aps:true, body:'t90m_body', turret:'t90m_turret', rotOff:Math.PI/2, tip:[0,-0.5],
    overall:1,   bodyScale:1,   turretOff:0, pivotK:2/3 },   // T90M 车头朝上,炮塔居中 2/3 法则,升级自带 APS
];
const T90_UPGRADE_COST = [0, 1300];   // T90→T90M $1300
const T90_UPGRADE_TIME = 10;
function t90Level(u){ return (u && T90_LEVELS[u.upgradeLvl]) || T90_LEVELS[0]; }
/* ============ T54 双分支升级(T54 → T54B 或 T55AM,互斥一次成型,苏军 tank) ============ */
const T54_BRANCHES = {
  0: { name:'T54',   body:'t54_body',   turret:'t54_turret' },
  1: { name:'T54B',  hp:450, damage:55, range:118, speed:60, shield:100, shieldRegen:5, cost:150, body:'t54b_body',   turret:'t54b_turret' },   // T54B:伤+10,100盾回5
  2: { name:'T55AM', hp:550, damage:60, range:128, speed:70, shield:150, shieldRegen:5, cost:300, body:'t55am_body',  turret:'t55am_turret' },  // T55AM:+100血/+10射程/+15伤/+10速,150盾回5
};
const T54_UPGRADE_TIME = 8;               // 每次升级耗时(秒)
function t54Branch(u){ return T54_BRANCHES[(u && u.t54Branch) || 0] || T54_BRANCHES[0]; }
// 单位当前护盾上限(T90科技盾 / T84BM模块盾 / T72按升级档 / T54按分支)
function unitShieldMax(u){
  if(!u) return 0;
  if(u.type==='t72') return t72Level(u).shield || 0;
  if(u.type==='t62') return t62Level(u).shield || 0;
  if(u.type==='t80') return t80Level(u).shield || 0;
  if(u.type==='t90') return t90Level(u).shield || 0;
  if(u.type==='tank' && unitFactionOf(u.team)==='soviet' && u.t54Branch) return t54Branch(u).shield || 0;
  if(u.type==='abrams' && u.tusk) return TUSK_SHIELD;
  if(u.rarm) return rarmShieldMaxFor(u);
  if(u.type==='t14') return T14_SHIELD;
  return 0;
}

/* ============ 实验室 / 科技研究 ============ */
// 通用科技 base=true;阵营专属通过 faction 指定(盟军 allies / 苏军 soviet)
const RESEARCH_DEFS = {
  powerInc:  { name:'发电改进', cost:2000, time:30, base:true, desc:'每个发电站每秒收入 +1(需电厂升级 1 级以上)' },
  oreRefine: { name:'矿石精炼', cost:1000, time:60, base:true, desc:'采矿车每车矿收益翻倍' },
  advTurret: { name:'高级炮台', cost:3500, time:100, base:true, desc:'碉堡血量提升至1200,伤害提升至60' },
  depletedUranium: { name:'贫铀利用', cost:5000, time:200, base:false, faction:'usa', desc:'艾布拉姆斯受到的伤害 -10,造成的伤害 +20' },
};
const ADV_TURRET_HP = 1200;     // 高级炮台:碉堡血量
const ADV_TURRET_DMG = 60;      // 高级炮台:碉堡伤害
const REACTIVE_SHIELD = 300;    // 反应装甲:T90护盾值(旧科技,现已移除研究,保留常量兜底)
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
  // 艾布拉姆/T90 车身+炮塔(独立旋转炮塔,仿美洲狮;横向车头朝左,已挖白底)
  abrams_body:'img/units/abrams_body.png', abrams_turret:'img/units/abrams_turret.png',
  t90_body:'img/units/t90_body.png', t90_turret:'img/units/t90_turret.png',
  // 豹2A4/布拉德利/黄鼠狼/勒克莱尔/挑战者/M60/T54/B11 车身+炮塔(照片挖白底,朝向见 unitRotOff)
  leopard_body:'img/units/leopard_body.png', leopard_turret:'img/units/leopard_turret.png',
  leopard1a5:'img/units/leopard1a5_body.png', leopard1a5_body:'img/units/leopard1a5_body.png', leopard1a5_turret:'img/units/leopard1a5_turret.png',
  chieftain:'img/units/chieftain_body.png', chieftain_body:'img/units/chieftain_body.png', chieftain_turret:'img/units/chieftain_turret.png',
  namer:'img/units/namer_body.png', namer_body:'img/units/namer_body.png', namer_turret:'img/units/namer_turret.png',
  bradley_body:'img/units/bradley_body.png', bradley_turret:'img/units/bradley_turret.png',
  marder_body:'img/units/marder_body.png', marder_turret:'img/units/marder_turret.png',
  leclerc_body:'img/units/leclerc_body.png', leclerc_turret:'img/units/leclerc_turret.png',
  challenger_body:'img/units/challenger_body.png', challenger_turret:'img/units/challenger_turret.png',
  m60_body:'img/units/m60_body.png', m60_turret:'img/units/m60_turret.png',
  m60a3_body:'img/units/m60a3_body.png', m60a3_turret:'img/units/m60a3_turret.png',   // M60A3 升级后外观(水平朝左,2/3法则)
  t54_body:'img/units/t54_body.png', t54_turret:'img/units/t54_turret.png',
  b11_body:'img/units/b11_body.png', b11_turret:'img/units/b11_turret.png',
  // 建造栏/介绍栏专属图标(战场贴图用各自 _field,互不影响)
  tank_allies:'img/tank_allies.png',       // 灰熊(M60)面板图标
  tank_soviet:'img/tank_soviet.png',       // 犀牛(T54)面板图标
  abrams_panel:'img/abrams_panel.png',     // 艾布拉姆斯面板图标
  t90_panel:'img/t90_panel.png',           // T90面板图标(战场用 img/units/t90.png)
  // 建造栏/介绍栏专属图标(战场贴图用各自 _field/_body/_turret,互不影响)
  abramsx_panel:'img/abramsx_panel.png',   // 艾布拉姆X 面板图标
  leopard_panel:'img/leopard_panel.png',   // 豹2A4 面板图标
  bradley_panel:'img/bradley_panel.png',   // 布拉德利步兵战车 面板图标
  marder_panel:'img/marder_panel.png',     // 黄鼠狼步兵战车 面板图标
  leclerc_panel:'img/leclerc_panel.png',   // 勒克莱尔 面板图标
  mi17_panel:'img/mi17_panel.png',         // 米-17 面板图标
  su35_panel:'img/su35_panel.png',         // 苏-27 面板图标
  challenger_panel:'img/challenger_panel.png', // 挑战者号 面板图标
  littlebird_panel:'img/littlebird_panel.png', // 小鸟直升机 面板图标
  b11_panel:'img/b11_panel.png',           // 俄制B11 面板图标
  f16_panel:'img/f16_panel.png',           // F-16 面板图标
  f15_panel:'img/f15_panel.png',           // F-15 面板图标
  puma_panel:'img/puma_panel.png',         // 美洲狮步战车 面板图标
  t14_panel:'img/t14_panel.png',           // T14 面板图标
  t62_panel:'img/t62_panel.png',           // T62 面板图标
  t72_panel:'img/t72_panel.png',           // T72 面板图标
  t80_panel:'img/t80_panel.png',           // T80 面板图标
  t84bm_panel:'img/t84bm_panel.png',       // T84BM 面板图标
  uh60_panel:'img/uh60_panel.png',         // UH-60 黑鹰 面板图标
  mcv_panel:'img/mcv_panel.png',           // 基地车面板图标
  merkava_panel:'img/merkava_panel.png',   // 梅卡瓦MK4 面板图标
  airfield_car_panel:'img/airfield_car_panel.png', // 机场建造车面板图标
  ford_panel:'img/units/ford_field.png',       // 福特号航母 面板图标(战场用同一张)
  kuznetsov_panel:'img/units/kuznetsov_field.png', // 库兹涅佐夫号航母 面板图标(战场用同一张)
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
  ford_field:'img/units/ford_field.png',           // 福特号航母战场贴图(水平朝右)
  kuznetsov_field:'img/units/kuznetsov_field.png', // 库兹涅佐夫号航母战场贴图(水平朝右)
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
  // T72 三阶坦克(车身+炮塔分档贴图,升级档不同换图):面板图标用基础 T72 车身
  t72:'img/units/t72_body.png', t72_body:'img/units/t72_body.png', t72_turret:'img/units/t72_turret.png',
  t72b_body:'img/units/t72b_body.png', t72b_turret:'img/units/t72b_turret.png',
  t72bvm_body:'img/units/t72bvm_body.png', t72bvm_turret:'img/units/t72bvm_turret.png',
  // T54 双分支升级贴图(T54B / T55AM)
  t54b_body:'img/units/t54b_body.png', t54b_turret:'img/units/t54b_turret.png',
  t55am_body:'img/units/t55am_body.png', t55am_turret:'img/units/t55am_turret.png',
  // T62(苏军,普通工厂直产):面板图标用车身
  t62:'img/units/t62_body.png', t62_body:'img/units/t62_body.png', t62_turret:'img/units/t62_turret.png',
  // T62 升级链:T64 / T64B / T64BM(车身+炮塔照片,车头朝上)
  t64_body:'img/units/t64_body.png', t64_turret:'img/units/t64_turret.png',
  t64b_body:'img/units/t64b_body.png', t64b_turret:'img/units/t64b_turret.png',
  t64bm_body:'img/units/t64bm_body.png', t64bm_turret:'img/units/t64bm_turret.png',
  // T80 四阶升级(车身+炮塔照片,车头朝上):面板图标用基础 T80 车身
  t80:'img/units/t80_body.png', t80_body:'img/units/t80_body.png', t80_turret:'img/units/t80_turret.png',
  t80b_body:'img/units/t80b_body.png', t80b_turret:'img/units/t80b_turret.png',
  t80u_body:'img/units/t80u_body.png', t80u_turret:'img/units/t80u_turret.png',
  t80bvm_body:'img/units/t80bvm_body.png', t80bvm_turret:'img/units/t80bvm_turret.png',
  // T90 升级:T90M(车身+炮塔照片,车头朝上)
  t90m_body:'img/units/t90m_body.png', t90m_turret:'img/units/t90m_turret.png',
  // 预留贴图(暂未加单位):M1A2TUSK / 梅卡瓦MK4(车身+炮塔照片,车头朝上)
  m1a2_body:'img/units/m1a2_body.png', m1a2_turret:'img/units/m1a2_turret.png',
  merkava:'img/units/merkava_body.png', merkava_body:'img/units/merkava_body.png', merkava_turret:'img/units/merkava_turret.png',
  bullet_25mm:'img/units/bullet_25mm.png',   // 25mm 机炮弹(步兵战车专属弹丸,已挖白底、车头朝上)
  tow_missile:'img/units/tow_missile.png',   // TOW 反坦克导弹(黄鼠狼/布拉德利,横向车头朝右)
  spike_missile:'img/units/spike_missile.png', // 长钉反坦克导弹(美洲狮,横向车头朝右)
  shell_125mm:'img/units/shell_125mm.png',   // 125mm 坦克炮弹(横向车头朝左)
  aim120c_field:'img/units/aim120c_field.png', // A-120c 空对空导弹(F16,机头朝上,渲染长24px)
  aim174b_field:'img/units/aim174b_field.png', // A-174b 空对地导弹(F16,机头朝上,渲染长28px)
  r37m_field:'img/units/r37m_field.png',       // R-37m 空对空导弹(苏35,机头朝上,渲染长24px)
  kh29_field:'img/units/kh29_field.png',       // Kh-29 空对地导弹(苏35,机头朝上,渲染长30px)
  // 基地车/机场建筑车战场贴图(照片白底已处理,基地车车头朝下/机场建筑车车头朝上,SPRITE_ROT 对齐)
  mcv:'img/units/mcv_field.png',                  // 基地车面板图标(战场用同一张)
  mcv_field:'img/units/mcv_field.png',            // 基地车战场本体贴图
  airfield_car:'img/units/airfield_car_field.png',// 机场建筑车面板图标(战场用同一张)
  airfield_car_field:'img/units/airfield_car_field.png',// 机场建筑车战场本体贴图
  airfield:'img/airfield.png',                    // 机场建筑战场贴图
  // T84BM 车身+炮塔(照片挖白底,车头朝上,炮塔座圈居中 2/3 法则)
  t84bm:'img/units/t84bm_body.png', t84bm_body:'img/units/t84bm_body.png',
  t84bm_turret:'img/units/t84bm_turret.png',
  // 三级工厂新坦克(照片挖白底,车头朝上):面板图标用车身
  abramsx:'img/units/abramsx_body.png', abramsx_body:'img/units/abramsx_body.png', abramsx_turret:'img/units/abramsx_turret.png',
  t14:'img/units/t14_body.png', t14_body:'img/units/t14_body.png', t14_turret:'img/units/t14_turret.png',
  // 弹簧刀无人机(照片挖白底,朝上):面板图标与战场贴图共用
  drone:'img/units/drone.png',
  // 战斗机(照片挖白底,机头朝上):面板图标与战场贴图共用同一张
  f16:'img/units/f16_field.png', f16_field:'img/units/f16_field.png',      // F-16(盟军)
  su35:'img/units/su35_field.png', su35_field:'img/units/su35_field.png',  // 苏-27(苏军)
  f15:'img/units/f15_field.png', f15_field:'img/units/f15_field.png',      // F-15(盟军重型战斗机)
  f18:'img/units/f18_field.png', f18_field:'img/units/f18_field.png',      // F/A-18 咆哮者(盟军,航母建造,水平朝左)
  su35h:'img/units/su35h_field.png', su35h_field:'img/units/su35h_field.png',  // 苏-35(苏军重型,机场+航母,朝上)
  // 小鸟直升机(机身+旋翼两张照片,均挖白底、机身朝上):面板图标用机身
  littlebird:'img/units/littlebird_body.png', littlebird_body:'img/units/littlebird_body.png',
  littlebird_rotor:'img/units/littlebird_rotor.png',
  // UH-60 黑鹰(盟军)/ 米17(苏军):机身+旋翼两张照片,机身朝上,面板图标用机身
  uh60:'img/units/uh60_body.png', uh60_body:'img/units/uh60_body.png', uh60_rotor:'img/units/uh60_rotor.png',
  mi17:'img/units/mi17_body.png', mi17_body:'img/units/mi17_body.png', mi17_rotor:'img/units/mi17_rotor.png',
  goldmine:'img/goldmine.png',
  tree:'img/tree.png',                          // 树林战场背景贴图(整张压缩,未切块)
  // 中立建筑战场贴图(仅战场贴图,不出现在介绍栏/建造栏)
  school:'img/school.png', hospital:'img/hospital.png',
  house_jp1:'img/house_jp1.png', house_jp2:'img/house_jp2.png', house_us:'img/house_us.png',
  nuclear:'img/nuclear.png', mall:'img/mall.png', pentagon:'img/pentagon.png',
  bank:'img/bank.png', oilfield:'img/oilfield.png', scam_park:'img/scam_park.png',
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
// 贴图预缓存进度(供加载屏使用):preloadImages 更新,总数为图片总数
let preloadTotal = 0, preloadDone = 0;
// 坦克照片已用脚本预处理:背景(纯黑/纯白)透明化 + 内容居中
// 各贴图"炮管/车头"自然朝向(图像坐标系,顺时针,+X=右),绘制时旋转对齐到单位朝向前方。
// 艾布拉姆/ T90 的炮管都在贴图左侧(向左),因此转角均为 180°(π),开火闪光画在贴图左侧即炮口。
const SPRITE_ROT = { abrams: Math.PI, t90: Math.PI, harvester: Math.PI/2, destroyer: Math.PI/2, transport: Math.PI/2, tank: Math.PI/2, infantry: -Math.PI/2, exo: -Math.PI/2, magnet: Math.PI/2, mcv: -Math.PI/2, airfield_car: Math.PI/2, bradley: Math.PI/2, marder: Math.PI/2, leclerc: Math.PI/2, leopard: Math.PI/2, challenger: Math.PI/2, leopard1a5: Math.PI/2, chieftain: Math.PI, namer: Math.PI/2, b11: -Math.PI/2, puma: Math.PI/2, f16: Math.PI/2, su35: Math.PI/2, f15: Math.PI/2, f18: Math.PI, su35h: Math.PI/2, t84bm: Math.PI/2, t72: -Math.PI/2, t62: Math.PI/2, t80: Math.PI/2, merkava: Math.PI/2, littlebird: Math.PI/2, abramsx: Math.PI/2, t14: Math.PI/2, drone: Math.PI/2, uh60: Math.PI/2, mi17: Math.PI/2, ford: 0, kuznetsov: 0 };
// 照片贴图额外缩放(步兵照片用 0.42,让小人贴合碰撞箱大小;步兵战车整体缩小到 0.7)
// 注意:布拉德利/B11/勒克莱尔/豹2A4/挑战者/M60/T54 已改为"车身+独立炮塔"结构,
// 此缩放作用于"车身+炮塔"整体;若只想缩车身不动炮塔,用下面的 SPRITE_BODY_SCALE。
// 实际整体缩放请用 unitSpriteScale(u)(tank 按阵营区分:M60 0.85 / T54 0.765)。
const SPRITE_SCALE = { harvester: 0.7, destroyer: 1.4, infantry: 0.42, exo: 0.42, magnet: 0.42, bradley: 0.68, marder: 0.72, b11: 0.648, puma: 0.6776, abrams: 0.8, t90: 0.8, tank: 0.85, leclerc: 0.765, leopard: 0.765, challenger: 0.765, leopard1a5: 0.8, chieftain: 0.8, namer: 0.72, f16: 0.5859375, su35: 0.5859375, f15: 0.498046875, f18: 0.5, su35h: 0.498046875, t84bm: 0.8, t72: 0.8, t62: 0.68, t80: 0.8, merkava: 0.8, littlebird: 0.7, abramsx: 0.96, t14: 0.96, drone: 0.6, uh60: 0.75, mi17: 0.9, ford: 0.72, kuznetsov: 0.72 };
// 仅车身照片缩放(炮塔保持原大,二者相乘=实际车身大小):M60/T54 车身额外 0.85;T84BM 车身 0.9
const SPRITE_BODY_SCALE = { tank: 0.85, t84bm: 0.9, t62: 0.9, abramsx: 0.85, t14: 0.85 };   // T62 仅车身再缩 0.9(炮塔不动);T14/艾布拉姆X 车身缩 0.85
// 仅车身额外缩放(t72 按档位:基础档车身×0.9,T72B/BVM 车身不单独缩)
function unitBodyScale(u){
  if(u.type==='t72') return t72Level(u).bodyScale || 1;
  if(u.type==='t62') return t62Level(u).bodyScale || 1;
  if(u.type==='t80') return t80Level(u).bodyScale || 1;
  if(u.type==='t90') return t90Level(u).bodyScale || 1;
  return SPRITE_BODY_SCALE[u.type] || 1;
}
// 整体缩放(车身+炮塔):tank 按阵营区分,M60(盟军)=0.85,T54(苏军)=0.85×0.9=0.765;
// t72 按档位整体缩(基础档×1,T72B/BVM ×0.9);其余直接用 SPRITE_SCALE。
function unitSpriteScale(u){
  if(u.type==='tank') return unitFactionOf(u.team)==='soviet' ? 0.765 : 0.85;
  if(u.type==='t72') return (SPRITE_SCALE.t72||1) * t72Level(u).overall;
  if(u.type==='t62') return (SPRITE_SCALE.t62||1) * t62Level(u).overall;
  if(u.type==='t80') return (SPRITE_SCALE.t80||1) * t80Level(u).overall;
  if(u.type==='t90') return (SPRITE_SCALE.t90||1) * t90Level(u).overall;
  if(u.type==='abrams' && u.tusk) return SPRITE_SCALE.abrams||0.8;   // TUSK 贴图与原艾布拉姆同缩放
  return SPRITE_SCALE[u.type] || 1;
}
const SPRITE_FRONT = { abrams:[-1,0], t90:[-1,0], harvester:[0,-1], destroyer:[0,-1], transport:[0,-1], tank:[0,-1], infantry:[0,1], exo:[0,1], magnet:[0,-1], mcv:[0,1], airfield_car:[0,-1], bradley:[0,-1], marder:[0,-1], leclerc:[0,-1], leopard:[0,-1], challenger:[0,-1], leopard1a5:[0,-1], chieftain:[-1,0], namer:[0,-1], b11:[0,1], f16:[0,-1], su35:[0,-1], f15:[0,-1], f18:[-1,0], su35h:[0,-1], t84bm:[0,-1], t72:[0,1], t62:[0,-1], t80:[0,-1], merkava:[0,-1], littlebird:[0,-1], abramsx:[0,-1], t14:[0,-1], drone:[0,-1], uh60:[0,-1], mi17:[0,-1], ford:[1,0], kuznetsov:[1,0] };
// 草地贴图块:由 tools/split-terrain.js 从"草地.png"切成 4x4=16 块,
// 每个草地格随机取一块平铺,提升陆地细致度
const TERRAIN_TILE_COUNT = 16;
const terrainTiles = [];
// 水域贴图块:由 tools/split-terrain.js 从"水域.png"切成 2x2=4 块,
// 每个水域格随机取一块平铺(保留上方波光动画叠加)
const WATER_TILE_COUNT = 4;
const waterTiles = [];
// 水域过渡(海岸线)贴图:陆地格邻水时,按"水在陆地格的方向"选一张(陆地+水缘)。
// 键=水方向(n/nw/ne/e/sw/se/s/w);角(nw/ne/sw/se)各 2 个变体随机选一个。
const COAST_DIRS = ['n','ne','e','se','s','sw','w','nw'];
const coastTiles = {};   // dir -> [Image,...]
// 邻水方向增量(地图生成平滑/渲染选择共用)
const COAST_NEIGH = { n:[0,-1], ne:[1,-1], e:[1,0], se:[1,1], s:[0,1], sw:[-1,1], w:[-1,0], nw:[-1,-1] };
// 各过渡图的"水足迹":边图=整边含两角;角图=单角(渲染选图/突出判定共用)
const COAST_FOOT = {
  n:['n','ne','nw'], ne:['ne'], e:['e','ne','se'], se:['se'],
  s:['s','se','sw'], sw:['sw'], w:['w','nw','sw'], nw:['nw'],
};
// 统计某格 8 邻域的水方向数组(越界按非水处理)
function coastWaterDirs(x, y){
  const water=[];
  for(const dir of COAST_DIRS){
    const d=COAST_NEIGH[dir];
    const nx=x+d[0], ny=y+d[1];
    if(nx>=0&&ny>=0&&nx<MAP_W&&ny<MAP_H && terrain[nx][ny]==='water') water.push(dir);
  }
  return water;
}
// 是否"向水内突出":没有任何一张过渡图能盖全其所有邻水方向(单图盖不全 → 会出纯草地补丁)
function isCoastProtruding(x, y){
  const water=coastWaterDirs(x,y);
  if(!water.length) return false;
  for(const dir of COAST_DIRS){
    const foot=COAST_FOOT[dir];
    let ok=true;
    for(const d of water){ if(!foot.includes(d)){ ok=false; break; } }
    if(ok) return false;
  }
  return true;
}
// 可碾树的重型单位:坦克/艾布拉姆/T90/基地车/采矿车/两栖运输艇/机场建筑车/新步兵战车主战坦克
function crushesTrees(type){
  return type==='tank' || type==='abrams' || type==='t90' || type==='mcv' || type==='harvester' || type==='transport' || type==='airfield_car' ||
         type==='bradley' || type==='b11' || type==='marder' || type==='leclerc' || type==='leopard' || type==='challenger' || type==='leopard1a5' || type==='chieftain' || type==='namer' || type==='t84bm' || type==='t72' || type==='t62' || type==='t80' || type==='merkava' || type==='abramsx' || type==='t14';
}
function preloadImages(onProgress){
  // 预缓存全部贴图:返回 Promise,全部加载完成(或失败容错)后 resolve。
  // onProgress(done,total) 可用于加载进度条。缺失图片走 onerror 不阻塞(回退程序化)。
  const tasks=[];
  for(const k in IMAGES) tasks.push({key:k, src:IMAGES[k]});
  for(let i=0;i<TERRAIN_TILE_COUNT;i++) tasks.push({terrain:i, src:'img/terrain/grass_'+String(i).padStart(2,'0')+'.png'});
  for(let i=0;i<WATER_TILE_COUNT;i++) tasks.push({water:i, src:'img/terrain/water_'+String(i).padStart(2,'0')+'.png'});
  // 水域过渡图:coast_v2_<dir>[1].png(水在陆地格的方向;角有变体;v2=180°旋转修正版)
  for(const dir of COAST_DIRS){
    tasks.push({coast:dir, variant:0, src:'img/terrain/coast_v2_'+dir+'.png'});
    tasks.push({coast:dir, variant:1, src:'img/terrain/coast_v2_'+dir+'1.png'});
  }
  preloadTotal=tasks.length; preloadDone=0;
  return new Promise(resolve=>{
    let left=tasks.length;
    const count=()=>{ left--; preloadDone++; if(onProgress) onProgress(preloadDone, preloadTotal); if(left<=0) resolve(); };
    for(const t of tasks){
      const im=new Image();
      im.onload=()=>{
        if(t.key!==undefined) imgs[t.key]=im;
        else if(t.terrain!==undefined) terrainTiles[t.terrain]=im;
        else if(t.water!==undefined) waterTiles[t.water]=im;
        else if(t.coast!==undefined){ if(!coastTiles[t.coast]) coastTiles[t.coast]=[]; coastTiles[t.coast][t.variant]=im; }
        count();
      };
      im.onerror=count;   // 加载失败的图片计入完成但不写入缓存(游戏里回退程序化绘制)
      im.src=t.src;
    }
  });
}

/* ===== 版本标记:用于确认浏览器加载的是最新代码(改完代码请顺手 +1) ===== */
const GAME_VERSION = '1.8.39';
console.log('[钢铁指挥] GAME_VERSION =', GAME_VERSION);
try{
  const vb=document.createElement('div');
  vb.id='verBadge';
  vb.textContent='版本 '+GAME_VERSION;
  vb.style.cssText='position:fixed;right:10px;bottom:160px;z-index:9999;font:12px "Microsoft YaHei";color:#ffe27a;background:rgba(20,10,0,.8);padding:3px 10px;border-radius:5px;border:2px solid #ffe27a;pointer-events:none;';
  document.body.appendChild(vb);
}catch(e){}
