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
    this.armor = d.armor;
    this.naval = !!d.naval;        // 只能在水中航行
    this.amphib = !!d.amphib;      // 陆海两栖
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
    // 反应装甲(T90):护盾 + 一次免死
    this.shield = 0; this.survivedOnce = false;
    if(type==='t90' && hasResearch(team,'reactiveArmor')) this.shield = REACTIVE_SHIELD;
    // 采矿车
    this.cargo = 0; this.mode = 'mine';
    this.oreTarget = null; this.refinery = null; this.mineT = 0;
    this.sepT = 0;
  }
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
    this.armor = d.armor;
    this.queue = []; this.spawnWait = 0;
    this.repairT = 0;         // 自动维修计时器
    this.upgraded=false; this.upgrading=false; this.upgradeProg=0;   // 战车工厂升级
    this.powerLevel=0;   // 发电厂升级等级(0~2)
    this.pwrUpgrading=false; this.pwrUpgradeProg=0;   // 发电厂升级进度
    this.lastAttackT = -9999; this.fireT = 0; this.turretTarget = null;
    this.rally = null;        // 生产集结点
    this.alive = true;
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
