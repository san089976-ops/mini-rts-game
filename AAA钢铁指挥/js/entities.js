"use strict";
/* ============ entities.js: 实体类 ============ */
class Unit {
  constructor(type, team, x, y){
    this.uid = (Unit._seq = (Unit._seq||0) + 1);   // 稳定唯一ID(右侧机场飞机面板按钮定位用)
    const fac = unitFactionOf(team);
    const d = getUnitDefs(fac)[type];
    this._def = d;
    this.type = type; this.team = team;
    this.x = x; this.y = y;
    this.hp = d.hp; this.maxHp = d.hp;
    this.speed = d.speed; this.r = d.r;
    const bx = UNIT_BOX[type];
    this.hw = bx ? bx.hw : d.r*0.85;   // 碰撞箱半宽(方框)
    this.hh = bx ? bx.hh : d.r*0.85;   // 碰撞箱半高(方框)
    // 双圆组合碰撞箱(Capsule Approximation):车头/车尾各一个圆,完美包裹 2×1 车身
    this.colR = Math.min(this.hw, this.hh);                // 碰撞圆半径(≈半宽)
    this.colOff = Math.max(this.hw, this.hh) - this.colR;  // 头/尾圆圆心到中心距离(0=圆形单位)
    this.turnTarget = 0;               // 期望朝向角(applyMovement 中 lerpAngle 平滑转向)
    this.armor = d.armor;
    this.naval = !!d.naval;        // 只能在水中航行
    this.amphib = !!d.amphib;      // 陆海两栖
    this.fly = !!d.fly;            // 空军单位:飞越一切地形,移动/碰撞/渲染按飞行处理
    this.homeBase = null;          // 所属机场(生产它的建筑):用于统计停机位占用
    this.parked = false;           // 停驻在机场内(占停机位,不渲染/不参战)
    this.patrol = null;            // 盘旋中心 {x,y}(释放=机场点;右键移动=目标点)
    this._returning = false;       // 正在返回机场入住
    // 空军武器包(F16/苏35,替换原测试炸弹包):A-120c 空对空 / A-174b 空对地
    this.aa = false; this.aaUpgrading = false; this.aaProg = 0;   // A-120c 已装/安装中/进度
    this.aaAmmo = 0; this.aaCd = 0;                               // A-120c 弹舱/冷却
    this.ag = false; this.agUpgrading = false; this.agProg = 0;   // A-174b 已装/安装中/进度
    this.agAmmo = 0; this.agCd = 0;                               // A-174b 弹舱/冷却
    this.modeAA = 0; this.modeAG = 0;                             // 攻击模式:0手动/1自动/2倾泻
    this.aaScan = null; this.aaLastFire = null;                   // 雷达自动:圈内集合/单目标冷却
    this.agScan = null; this.agLastFire = null;
    this.radar = false; this.radarUpgrading = false; this.radarProg = 0;   // 雷达火控
    this.coat = false; this.coatUpgrading = false; this.coatProg = 0;     // 涂层更新
    this._mission = null;          // 出战任务: {kind:'precision', target} | {kind:'distributed', jobs:[{target,type,count,fired}]}(出击规划用)
    this._needRefuel = false;      // 任一弹舱已空,需要返场补充弹药
    this._refuelAfterMove = false; // 玩家下了移动指令:先执行指令,到位后再自动返场
    this._refuelArriveT = 0;       // 已到达新盘旋点后的计时(执行完指令的判定)
    // T84BM 专属升级模块:反应装甲(300盾/回10) + 红外干扰装置(前方120°扇形干扰敌TOW)
    this.rarm = false; this.rarmUpgrading = false; this.rarmProg = 0;   // 反应装甲模块
    this.ir = false;   this.irUpgrading  = false; this.irProg  = 0;     // 红外干扰装置
    this.irOn = true;                                                    // 红外干扰 开启/关闭
    this.irOn = true;   // 红外干扰 开启/关闭(装好后可切换)
    this.crushTrees = crushesTrees(type);   // 重型单位可碾倒树林(坦克/两栖登陆艇等)
    this.capacity = d.capacity || 0;
    this.cargoUnits = [];          // 运输艇装载的地面单位(对象引用)
    this.unloadAt = null;          // 运输艇卸载点
    this.facing = 0;
    this.turretAng = 0;        // 独立旋转炮塔角度(美洲狮等:仅攻击时转动,车体不动时负责瞄准)
    this.target = null;        // 攻击目标
    this.order = { kind:'none' };
    this.path = null; this.pathIdx = 0; this.repathT = 0;
    this.fireT = 0;
    // 速度与转向平滑:避免单位贴在一起时抖动/鬼畜
    this.vx = 0; this.vy = 0;              // 当前实际速度(像素/秒)
    this.wantVx = 0; this.wantVy = 0;      // 期望速度(来自寻路/追击)
    this.sepVx = 0; this.sepVy = 0;        // 分离力(来自同伴防挤压)
    // 反应装甲(T90):护盾 + 一次免死
    this.shield = 0; this.survivedOnce = false;
    if(type==='t90' && hasResearch(team,'reactiveArmor')) this.shield = REACTIVE_SHIELD;
    // 采矿车
    this.cargo = 0; this.mode = 'mine';
    this.oreTarget = null; this.refinery = null; this.mineT = 0;
    this.sepT = 0;
    // 挑战者坦克升级状态(0/1/2 级)
    this.upgradeLvl = 0; this.upgrading = false; this.upgradeProg = 0;
    // 反坦克导弹模块(美洲狮/黄鼠狼/布拉德利)
    this.atgm = false;              // 是否已装备反坦克导弹模块
    this.atgmUpgrading = false;     // 正在安装模块
    this.atgmProg = 0;              // 安装进度
    this.atgmReload = 0;            // 导弹装填倒计时(0=就绪)
    this.aps = false;               // 是否已安装自主防御系统(艾布拉姆专属)
    this.apsUpgrading = false;      // 正在安装 APS
    this.apsProg = 0;               // 安装进度
    this.apsOn = true;              // 自主防御 开启/关闭
    this.apsAmmo = 0;               // 反导弹弹夹剩余(上限 APS_MAX_AMMO)
    this.apsReload = 0;             // 反导弹填充倒计时(0=可直接补弹)
    this.apsEngaged = [];           // 已接战(发射过反导)的来袭导弹记录:每个新导弹只打一发
    // 上次收到玩家移动指令的时间:用于战斗脱离保护期(刚被拉动时不被拉回战斗)
    this._lastMoveCmd = -99;
    // 载具物理感渲染状态(只影响绘制偏移,不改逻辑坐标)
    this.angVel = 0;              // 当前角速度(rad/s),阻尼转向用
    this.renderOx = 0; this.renderOy = 0;   // 渲染偏移(起步/刹车俯仰 + 开火后坐力)
    this.fireRecoil = 0;          // 开火后坐力偏移量(px)
    this.surge = 0;               // 起步/刹车俯仰偏移(px)
    this._prevSp = 0;             // 上一帧速度,用于计算纵向加速度
  }
  // 该单位处在 (x,y) 且朝向为 facing 时,两个碰撞圆的中心与半径(胶囊近似)。
  // 圆形单位(colOff=0)只返回一个圆;长条单位返回车头(+facing)/车尾(-facing)两圆。
  // 结果写入单位自带缓冲 _circles 复用,避免 separateAll/resolveRigid 每帧分配对象。
  // 注意:结果只读且即刻使用,不得跨多次调用保存;不同单位缓冲互不干扰。
  circlesAt(x, y, facing){
    const c = this.colOff || 0;
    const r = this.colR;
    let buf = this._circles;
    if(!buf) buf = this._circles = [{x:0,y:0,r:0},{x:0,y:0,r:0}];
    buf[0].x = x; buf[0].y = y; buf[0].r = r;
    if(c <= 0){ buf.length = 1; return buf; }
    const fx = Math.cos(facing), fy = Math.sin(facing);
    if(buf.length < 2) buf.push({x:0,y:0,r:0});
    buf[1].x = x-fx*c; buf[1].y = y-fy*c; buf[1].r = r;
    buf.length = 2;
    return buf;
  }
  circles(){ return this.circlesAt(this.x, this.y, this.facing); }
  get alive(){ return this.hp > 0; }
  get def(){ return this._def || UNIT_DEFS[this.type]; }
  get speedEff(){ return this.speed * (this.order.kind==='retreat'?0.8:1); }
}

class Building {
  constructor(defName, team, tx, ty){
    const d = BLD_DEFS[defName];
    this.defName = defName; this.def = d; this.team = team;
    this.tx = tx; this.ty = ty;
    this.w = d.w; this.h = d.h;
    this.x = tx*TILE + d.w*TILE/2; this.y = ty*TILE + d.h*TILE/2;
    this.hp = d.hp; this.maxHp = d.hp;
    this.constructing = true; this.progress = 0; this.buildTime = d.buildTime;
    // 中立建筑(team=-1):出生即完工,不参与建造流程
    if(team < 0){ this.constructing = false; this.progress = 0; this.hp = d.hp; }
    this.armor = d.armor;
    this.queue = []; this.spawnWait = 0;
    this.repairT = 0;         // 自动维修计时器
    this.upgraded=false; this.upgrading=false; this.upgradeProg=0;   // 战车工厂升级
    this.powerLevel=0;   // 发电厂升级等级(0~2)
    this.pwrUpgrading=false; this.pwrUpgradeProg=0;   // 发电厂升级进度
    this.lastAttackT = -9999; this.fireT = 0; this.turretTarget = null;
    this.rally = null;        // 生产集结点
    this.alive = true;
    this.garrison = [];       // 进驻的步兵(对象引用,被建筑吸收)
    this.garrisonTank = null; // 专属坦克进驻位(商业体)
    this._origTeam = null;    // 进驻前的中立/归属记录,释放时还原
    this.researching = null;  // 实验室研究项目 {id, progress}
    this.damage = (d.weapon && d.weapon.damage) || 0;   // 炮塔伤害(可被科技强化)
    if(defName==='turret' && hasResearch(team,'advTurret')){
      this.maxHp = ADV_TURRET_HP; this.hp = ADV_TURRET_HP; this.damage = ADV_TURRET_DMG;
    }
  }
  get powerGive(){ return this.constructing ? 0 : this.def.power + (this.powerLevel||0)*POWER_UPGRADE_GAIN; }
  get powerUse(){
    if(this.constructing) return 0;
    if(this.defName==='command'||this.defName==='power') return 0;
    if(this.defName==='lab') return 100;   // 实验室耗电 100
    if(this.def.garrisonCap) return 0;     // 进驻建筑不耗电
    return this.def.w*this.def.h*3;
  }
}

class Projectile {
  constructor(x,y,tx,ty,target,damage,team,speed,attacker,proj){
    this.x=x; this.y=y; this.tx=tx; this.ty=ty; this.target=target;
    this.damage=damage; this.team=team; this.speed=speed; this.attacker=attacker;
    this.proj=proj;
    this.dead=false;
  }
}
/* ============ 反坦克导弹:自动制导的"类单位"飞行物 ============ */
class Missile {
  constructor(x, y, target, team, attacker, spriteType){
    this.x=x; this.y=y;
    this.target=target;      // 制导目标(单位/建筑)
    this.team=team; this.attacker=attacker;
    this.spriteType=spriteType;        // 'tow' | 'spike' | 'a120c'(F16空对空) | 'a174b'(F16空对地) | 'r37m'(苏35空对空) | 'kh29'(苏35空对地)
    this.air=false;                    // 空军导弹(A-120c/A-174b):不可被红外干扰/APS反导/目标挡弹
    this.speed=ATGM_SPEED*ATGM_START_FACTOR;   // 先加速
    this.maxSpeed=ATGM_SPEED;
    this.accel=ATGM_ACCEL;
    this.ang=Math.atan2(target.y-y, target.x-x);   // 当前朝向(稍微转弯逼近)
    this.travelled=0;
    this.maxRange=ATGM_RANGE;
    this.damage=ATGM_DAMAGE;
    this.explodeR=ATGM_AOE_RADIUS;
    this.dead=false;
  }
  get alive(){ return !this.dead; }
}
/* ============ 自主防御反导弹(拦截弹):朝来袭的 TOW 导弹追踪,命中即摧毁 ============ */
class Interceptor {
  constructor(x, y, targetMissile, team){
    this.x=x; this.y=y;
    this.targetMissile=targetMissile;   // 目标:来袭的 TOW 导弹(missiles 里的对象)
    this.team=team;
    this.speed=APS_COUNTER_SPEED*0.4;   // 初速(先加速后匀速)
    this.maxSpeed=APS_COUNTER_SPEED;
    this.accel=ATGM_ACCEL;
    this.ang=Math.atan2(targetMissile.y-y, targetMissile.x-x);
    this.travelled=0;
    this.maxRange=APS_RANGE+60;
    this.dead=false;
  }
  get alive(){ return !this.dead; }
}
class Effect { constructor(x,y,type,r){ this.x=x;this.y=y;this.type=type;this.r=r;this.life=0.45;this.maxLife=0.45; } }
