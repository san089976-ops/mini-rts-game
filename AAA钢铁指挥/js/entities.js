"use strict";
/* ============ entities.js: 实体类 ============ */
class Unit {
  constructor(type, team, x, y){
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
    this.crushTrees = crushesTrees(type);   // 重型单位可碾倒树林(坦克/两栖登陆艇等)
    this.capacity = d.capacity || 0;
    this.cargoUnits = [];          // 运输艇装载的地面单位(对象引用)
    this.unloadAt = null;          // 运输艇卸载点
    this.facing = 0;
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
  circlesAt(x, y, facing){
    const c = this.colOff || 0;
    if(c <= 0) return [{x, y, r:this.colR}];
    const fx = Math.cos(facing), fy = Math.sin(facing);
    return [{ x:x+fx*c, y:y+fy*c, r:this.colR }, { x:x-fx*c, y:y-fy*c, r:this.colR }];
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
class Effect { constructor(x,y,type,r){ this.x=x;this.y=y;this.type=type;this.r=r;this.life=0.45;this.maxLife=0.45; } }
