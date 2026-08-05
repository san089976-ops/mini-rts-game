"use strict";
/* ============ update.js: 更新逻辑 ============ */
const spCand = [];   // 空间网格查询用共享候选数组(避免每帧分配)
function buildGrid(){
  grid = new Map();
  for(let i=0;i<units.length;i++){
    const u=units[i];
    const k=(u.x/GRID_C|0)*GRID_COLS + (u.y/GRID_C|0);
    let arr=grid.get(k); if(!arr){ arr=[]; grid.set(k,arr); }
    arr.push(i);
  }
}
function gridCollect(x, y, range){
  spCand.length=0;
  const c0x=(x-range)/GRID_C|0, c1x=(x+range)/GRID_C|0;
  const c0y=(y-range)/GRID_C|0, c1y=(y+range)/GRID_C|0;
  for(let cx=c0x;cx<=c1x;cx++) for(let cy=c0y;cy<=c1y;cy++){
    const arr=grid.get(cx*GRID_COLS+cy);
    if(arr) for(let k=0;k<arr.length;k++) spCand.push(arr[k]);
  }
  return spCand;
}
function update(dt){
  time+=dt;
  if(gameOver){ overTimer+=dt; return; }
  // 资金/电力每帧轻量刷新;按钮面板每 0.3s 重建一次,避免每帧 DOM 重建
  updateStats();
  panelT-=dt; if(panelT<=0){ panelT=0.3; updatePanel(); }
  // 每帧重建一次空间网格(单位移动前),供索敌/分离/炮塔共享
  buildGrid();
  // 每帧按队伍各算一次电力,避免 updateBuilding 里反复 O(建筑²)
  const teamPower={};
  for(const b of buildings){
    if(!b.alive) continue;
    const p=teamPower[b.team]||(teamPower[b.team]={give:0,use:0});
    p.give+=b.powerGive; p.use+=b.powerUse;
  }
  // 采矿车自动找矿/倒矿 + 单位战斗(只更新逻辑/期望速度,不直接改坐标)
  for(const u of units){ updateUnit(u, dt); }
  // 上船处理(等遍历结束再移除,避免改数组跳过元素)
  for(const u of units.slice()){ if(u._boarded) doBoard(u); }
  buildGrid();   // 上船会移除单位,重建空间网格避免下标错乱
  // 局部防挤压:计算每个单位的分离速度(不直接改坐标,由 applyMovement 统一积分)
  separateAll();
  for(const u of units){ applyMovement(u, dt); }
  // 刚性碰撞:方框重叠的位置修正(把互相重叠的单位推开;移动单位优先挤开挡路空闲单位)
  resolveRigid();
  // 建筑生产/建造/炮塔/维修
  for(const b of buildings){ updateBuilding(b, dt, teamPower); }
  // 弹体
  for(const p of projectiles){
    const d=Math.hypot(p.tx-p.x,p.ty-p.y);
    const step=p.speed*dt;
    if(d<=step){ p.dead=true; if(p.target && p.target.hp!==undefined && p.target.hp>0 && p.target.team!==p.team){ applyDamage(p.target,p.damage,p.attacker,p.proj); } }
    else { p.x+=(p.tx-p.x)/d*step; p.y+=(p.ty-p.y)/d*step; }
  }
  projectiles=projectiles.filter(p=>!p.dead);
  // 特效
  for(const e of effects){ e.life-=dt; }
  for(const e of effects){
    if(e.type==='burn' && Math.random()<dt*0.18){
      const sm=new Effect(e.x+rnd(-e.r/2,e.r/2),e.y-e.r*0.3+rnd(-4,4),'smoke',rnd(5,10)); sm.life=1.3; sm.maxLife=1.3; effects.push(sm);
    }
  }
  effects=effects.filter(e=>e.life>0);
  for(const t of texts){ t.y-=22*dt; t.life-=dt; }
  texts=texts.filter(t=>t.life>0);
  // 清理死亡单位
  units=units.filter(u=>u.hp>0);
  // 胜负判定(摧毁所有建筑获胜/战败;gameTeams 仅在开局后非空,避免主菜单误判)
  if(gameTeams.length>=2 && !gameOver){
    const pGrp = teamGroups[0];
    const pAlive = buildings.some(b=>b.team===TEAM_A && b.alive);
    const eAlive = gameTeams.some((g,ti)=> teamGroups[ti]!==pGrp && buildings.some(b=>b.team===ti && b.alive));
    if(!pAlive){ gameOver='lose'; }
    else if(!eAlive){ gameOver='win'; }
    if(gameOver){
      const ov=document.getElementById('overlay');
      ov.classList.add('show');
      document.getElementById('ovTitle').textContent = gameOver==='lose' ? '你输了' : '胜利!';
      document.getElementById('ovSub').textContent = gameOver==='lose' ? '我方所有建筑已被摧毁' : '所有敌方建筑已被摧毁';
    }
  }
}

function applyDamage(ent, dmg, attacker, proj){
  if(!ent || ent.hp===undefined || ent.hp<=0) return;
  // 贫铀利用:艾布拉姆斯造成的伤害 +20(在原有伤害计算之后)
  if(attacker && attacker instanceof Unit && attacker.type==='abrams' && hasResearch(attacker.team,'depletedUranium')) dmg += 20;
  const mod = armorMod(ent, proj, attacker);
  let final = Math.max(1, Math.round(dmg * mod));
  // 贫铀利用:艾布拉姆斯受到的伤害 -10(在原有计算受伤害数目后)
  if(ent instanceof Unit && ent.type==='abrams' && hasResearch(ent.team,'depletedUranium')) final = Math.max(1, final-10);

  const hpBefore = ent.hp;
  // 反应装甲护盾:先扣护盾,再扣血量
  let hpDmg = final;
  if(ent instanceof Unit && ent.type==='t90' && ent.shield>0){
    const absorbed=Math.min(ent.shield, final);
    ent.shield-=absorbed;
    hpDmg = final-absorbed;
  }
  if(hpDmg>0) ent.hp -= hpDmg;

  // 反应装甲:免疫一次致命伤害(仅一次)
  let negated=false;
  if(ent instanceof Unit && ent.type==='t90' && hasResearch(ent.team,'reactiveArmor') && !ent.survivedOnce && ent.hp<=0){
    ent.survivedOnce=true;
    ent.hp=hpBefore;
    negated=true;
  }
  textPopup(ent.x, ent.y-rnd(10,18), negated ? '反应装甲 免疫!' : '-'+final, negated ? '#8aff8a' : '#ffd0d0');
  if(ent instanceof Building){ ent.lastAttackT = time; }
  // 反击:被攻击的作战单位第一时间锁定攻击者
  if(ent instanceof Unit && ent.def.range>0 && attacker && isEnemy(ent.team, attacker.team) && attacker.hp>0){
    if(ent.order.kind!=='attack' || !ent.target){
      ent.prevOrder = ent.order;
      ent.order = {kind:'attack'};
      ent.target = attacker;
      ent.path = null;
    }
  }
  if(ent.hp<=0){
    if(ent instanceof Building) destroyBuilding(ent);
    else {
      shake=Math.max(shake,2);
      effects.push(new Effect(ent.x,ent.y,'explode',ent.r*2.4));
      for(let i=0;i<5;i++){ const sm=new Effect(ent.x+rnd(-8,8),ent.y+rnd(-8,8),'smoke',rnd(4,9)); sm.life=1.1; sm.maxLife=1.1; effects.push(sm); }
    }
  }
}
function destroyBuilding(ent){
  if(!ent.alive) return;
  ent.alive=false;
  markBlocked(ent,false);
  shake=Math.max(shake, Math.min(7, ent.w*ent.h*0.7));
  effects.push(new Effect(ent.x,ent.y,'explode',Math.max(ent.w,ent.h)*TILE*0.55));
  for(let i=0;i<8;i++){ const sm=new Effect(ent.x+rnd(-ent.w*TILE/2,ent.w*TILE/2),ent.y+rnd(-ent.h*TILE/2,ent.h*TILE/2),'smoke',rnd(6,12)); sm.life=1.4; sm.maxLife=1.4; effects.push(sm); }
  const burn=new Effect(ent.x,ent.y,'burn',Math.max(ent.w,ent.h)*TILE*0.5); burn.life=12; burn.maxLife=12; effects.push(burn);
  if(ent.team===TEAM_A && selected.includes(ent)) selected=selected.filter(s=>s!==ent);
  if(ent===selBuilding) selBuilding=null;
}

function updateBuilding(b, dt, teamPower){
  if(!b.alive) return;
  const p=teamPower[b.team]||{give:0,use:0};
  const shortPower = p.give>0 && p.use>p.give;
  if(b.constructing){
    b.progress += dt*(shortPower?0.5:1);
    b.hp = b.maxHp * (0.15 + 0.85*(b.progress / b.buildTime));
    if(b.progress>=b.buildTime){
      b.constructing=false; b.progress=0; b.hp=b.maxHp;
      textPopup(b.x,b.y-10,b.def.name+' 完工','#8aff8a');
      effects.push(new Effect(b.x,b.y,'ring',26));
    }
  }
  // 战车工厂升级
  if(b.defName==='factory' && b.upgrading && !b.constructing){
    b.upgradeProg += dt*(shortPower?0.5:1);
    if(b.upgradeProg >= FACTORY_UPGRADE_TIME){
      b.upgrading=false; b.upgraded=true; b.upgradeProg=0;
      textPopup(b.x,b.y-10,b.def.name+' 升级完成','#8aff8a');
      effects.push(new Effect(b.x,b.y,'ring',26));
    }
  }
  // 兵营升级
  if(b.defName==='barracks' && b.upgrading && !b.constructing){
    b.upgradeProg += dt*(shortPower?0.5:1);
    if(b.upgradeProg >= BARRAX_UPGRADE_TIME){
      b.upgrading=false; b.upgraded=true; b.upgradeProg=0;
      textPopup(b.x,b.y-10,'兵营升级完成','#8aff8a');
      effects.push(new Effect(b.x,b.y,'ring',22));
    }
  }
  // 生产队列
  if(b.queue.length && !b.constructing){
    const item=b.queue[0];
    item.progress += dt*(shortPower?0.5:1);
    const t=getUnitDefs(unitFactionOf(b.team))[item.type].build;
    if(item.progress>=t){
      const u=spawnUnitNear(item.type,b.team,b);
      if(u){ b.queue.shift(); textPopup(u.x,u.y-6,getUnitDefs(unitFactionOf(b.team))[item.type].name,'#8aff8a'); if(b.rally) moveToRally(u,b.rally); }
      else { b.spawnWait+=dt; }
    }
  }
  // 自动维修:每 1 秒扣 1 资金,恢复 10 点生命(建造中建筑不维修)
  if(!b.constructing && b.hp>0 && b.hp<b.maxHp){
    b.repairT += dt;
    if(b.repairT >= 1){
      b.repairT = 0;
      if(credits[b.team] >= 1){
        b.hp = Math.min(b.maxHp, b.hp + 10);
        credits[b.team] -= 1;
      }
    }
  }
  // 发电厂升级进度
  if(b.defName==='power' && b.pwrUpgrading && !b.constructing){
    b.pwrUpgradeProg += dt*(shortPower?0.5:1);
    if(b.pwrUpgradeProg >= POWER_UPGRADE_TIME){
      b.pwrUpgrading=false; b.pwrUpgradeProg=0; b.powerLevel++;
      textPopup(b.x,b.y-10,'发电厂升级至 Lv'+b.powerLevel,'#8aff8a');
      effects.push(new Effect(b.x,b.y,'ring',22));
    }
  }
  // 实验室研究进度
  if(b.defName==='lab' && b.researching && !b.constructing){
    b.researching.progress += dt*(shortPower?0.5:1);
    const rd=RESEARCH_DEFS[b.researching.id];
    if(b.researching.progress >= rd.time){
      const id=b.researching.id;
      b.researching=null;
      researches[b.team][id]=true;
      onResearchComplete(b.team, id);
      textPopup(b.x,b.y-10, rd.name+' 研究完成','#8aff8a');
      effects.push(new Effect(b.x,b.y,'ring',24));
      updatePanel();
    }
  }
  // 发电厂升级收入:每级每秒 +1 资金(发电改进科技:升级1级以上的电厂额外 +1/秒)
  if(b.defName==='power' && !b.constructing && b.powerLevel>0){
    let inc = b.powerLevel*POWER_UPGRADE_INCOME;
    if(hasResearch(b.team,'powerInc')) inc += 1;
    credits[b.team] += inc*dt;
  }
  if(b.hp<=0 && !b.constructing && b.alive) destroyBuilding(b);
  // 维修厂:治疗光环,占地外两格内的己方单位每秒恢复 10 生命
  if(b.defName==='repair' && !b.constructing){
    const rad = b.w*TILE/2 + TILE*2;
    for(const u of units){
      if(u.team===b.team && u.hp>0 && u.hp<u.maxHp && dist(b,u)<=rad){
        u.hp = Math.min(u.maxHp, u.hp + 10*dt);
        if(Math.random()<dt*1.5){ effects.push(new Effect(u.x+rnd(-3,3),u.y+rnd(-3,3),'ring',8)); }
      }
    }
  }
  // 炮塔自动攻击
  if(b.def.weapon){
    b.fireT-=dt;
    if(!b.turretTarget || !b.turretTarget.hp || b.turretTarget.hp<=0 || b.turretTarget.team===b.team || dist(b,b.turretTarget)>b.def.weapon.range*1.3){
      // 找目标
      b.turretTarget=null;
      if(!shortPower){
        let best=null,bd=1e9;
        const cand=gridCollect(b.x, b.y, b.def.weapon.range);
        for(let c=0;c<cand.length;c++){
          const u=units[cand[c]];
          if(u.hp<=0 || !isEnemy(b.team,u.team)) continue;
          const d=dist(b,u);
          if(d<=b.def.weapon.range && d<bd){ bd=d; best=u; }
        }
        if(best) b.turretTarget=best;
      }
    }
    if(b.turretTarget && b.fireT<=0 && !shortPower){
      b.fireT=b.def.weapon.rof;
      const w=b.def.weapon;
      projectiles.push(new Projectile(b.x,b.y-b.h*TILE/2, b.turretTarget.x,b.turretTarget.y,b.turretTarget,b.damage,b.team,w.bulletSpeed,b,w.proj));
    }
  }
}

function updateUnit(u, dt){
  u.fireT-=dt;
  u.wantVx=0; u.wantVy=0;   // 每帧重置期望速度,由下方指令逻辑重新计算
  // 反应装甲:T90 护盾每秒恢复 15(被打破后也能从 0 重新生成)
  if(u.type==='t90' && u.shield<REACTIVE_SHIELD && hasResearch(u.team,'reactiveArmor')){
    u.shield = Math.min(REACTIVE_SHIELD, u.shield + REACTIVE_REGEN*dt);
  }
  if(u.type==='harvester'){
    updateHarvester(u,dt);
  } else if(u.order.kind==='load'){
    // 登艇:走向运输艇,到达后等待上船
    const t=u.order.transport;
    if(!t || t.hp<=0 || !units.includes(t)){
      u.order={kind:'none'};
    } else {
      const d=dist(u,t);
      if(usedCapacity(t) >= t.capacity){
        u.wantVx=0; u.wantVy=0;
      } else if(d<=t.r+u.r+10){
        u._boarded=true; u.boardTo=t;
        u.order={kind:'none'}; u.path=null;
      } else {
        u.facing=Math.atan2(t.y-u.y,t.x-u.x);
        followPathTo(u,t.x,t.y,dt);
      }
    }
  } else if(u.order.kind==='move'){
    followPath(u,dt);
    // 移动射击:行进途中朝射程内敌人开火,不打断移动
    if(u.def.range>0){
      const en=findEnemyNear(u, u.def.range);
      if(en){
        u.facing=Math.atan2(en.y-u.y,en.x-u.x);
        if(u.fireT<=0){ u.fireT=u.def.rof; fireAt(u,en); }
      }
    }
    // 运输艇:不再自动卸载,由玩家手动释放(manualUnload 按钮)
  } else if(u.order.kind==='attack'){
    if(u.target && u.target.hp>0 && (dist(u,u.target) > u.def.range)){
      followPathToEntity(u, u.target, dt);
      if(Math.random()<dt*0.5){ // 偶尔重寻路
        const p=pathFor(u,u.x,u.y,u.target.x,u.target.y); if(p){ u.path=p; u.pathIdx=0; }
      }
    }
    if(u.target && u.target.hp>0 && dist(u,u.target)<=u.def.range){
      u.path=null;
      u.facing=Math.atan2(u.target.y-u.y,u.target.x-u.x);
      if(u.fireT<=0){
        u.fireT=u.def.rof;
        fireAt(u,u.target);
      }
    }
    if(!u.target || u.target.hp<=0){
      u.target=null;
      if(u.prevOrder){ u.order=u.prevOrder; u.prevOrder=null; }
      else if(u.order.x2){ u.order={kind:'move',x:u.order.x,y:u.order.y,x2:true}; }
      else u.order={kind:'none'};
    }
  } else if(u.order.kind==='none'){
    if(u.def.range>0){
      const en=findEnemyNear(u, u.def.range*1.2);
      if(en && Math.random()<dt*1.0){ u.target=en; u.order={kind:'attack'}; }
    }
  }
}
/* ============ 转向行为(Steering):分离 / 积分 ============ */
const STEER_RATE = 8;        // 转向/加减速平滑系数(越大响应越快)
const SEPARATE_STRENGTH = 300; // 分离力强度
function seekVelocity(u, tx, ty){
  const dx=tx-u.x, dy=ty-u.y;
  const d=Math.hypot(dx,dy);
  if(d<0.5) return {x:0, y:0};
  const sp=u.speedEff;
  return { x:dx/d*sp, y:dy/d*sp };
}
function arriveDist(u){ return Math.max(6, u.r*1.4); }
function finishMove(u){
  u.order={kind:'none'}; u.path=null;
  u.wantVx=0; u.wantVy=0; u.vx=0; u.vy=0;
}
function separateAll(){
  // 局部防挤压(软):按碰撞方框的最小穿透轴推开非敌对单位,不直接改坐标
  // 注意:把同伴当“软障碍”,绝不加入 A* 的静态 blocked,避免反复重寻导致抖动
  for(let i=0;i<units.length;i++){
    const u=units[i];
    u.sepVx=0; u.sepVy=0;
    const cand=gridCollect(u.x, u.y, Math.max(u.hw,u.hh)*2 + 8);
    for(let c=0;c<cand.length;c++){
      const j=cand[c];
      if(j===i) continue;
      const v=units[j];
      if(v.hp<=0 || isEnemy(u.team,v.team)) continue;   // 敌人在战斗中不做分离
      const dx=u.x-v.x, dy=u.y-v.y;
      const ox=(u.hw+v.hw)-Math.abs(dx);
      const oy=(u.hh+v.hh)-Math.abs(dy);
      if(ox<=0 || oy<=0) continue;
      const over=Math.min(ox,oy)/Math.max(1, Math.min(u.hw+v.hw, u.hh+v.hh)); // 0(刚接触)~1(完全重叠)
      const str=over*over*SEPARATE_STRENGTH;             // 二次衰减:越近推力越强
      if(ox<oy) u.sepVx += (dx>=0?1:-1)*str;             // 沿最小穿透轴推开
      else u.sepVy += (dy>=0?1:-1)*str;
    }
  }
}
/* ============ 刚性碰撞(方框):重叠的位置修正 ============ */
function boxOverlap(u,v){
  return Math.abs(u.x-v.x) < u.hw+v.hw && Math.abs(u.y-v.y) < u.hh+v.hh;
}
function tryMoveTo(u, x, y){
  return inBounds(x,y) && !uCellBlocked(u, Math.floor(x/TILE), Math.floor(y/TILE));
}
// 该位置是否与任何存活单位碰撞箱重叠(用于本地脱困找空位)
function hasUnitOverlapAt(u, x, y){
  const cand=gridCollect(x, y, Math.max(u.hw,u.hh)*2 + 12);
  for(let c=0;c<cand.length;c++){
    const v=units[cand[c]];
    if(v===u || v.hp<=0) continue;
    if(Math.abs(v.x-x) < u.hw+v.hw && Math.abs(v.y-y) < u.hh+v.hh) return true;
  }
  return false;
}
function resolveRigid(){
  // 把重叠的方框沿最小穿透轴互相推开(位置修正,迭代至收敛,每轮重建网格保证正确性)
  for(let iter=0;iter<6;iter++){
    buildGrid();
    let moved=false;
    for(let i=0;i<units.length;i++){
      const u=units[i];
      if(u.hp<=0) continue;
      const cand=gridCollect(u.x, u.y, Math.max(u.hw,u.hh)*2 + 12);
      for(let k=0;k<cand.length;k++){
        const j=cand[k];
        if(j<=i) continue;
        const v=units[j];
        if(v.hp<=0 || !boxOverlap(u,v)) continue;
        const dx=v.x-u.x, dy=v.y-u.y;
        const ox=(u.hw+v.hw)-Math.abs(dx);
        const oy=(u.hh+v.hh)-Math.abs(dy);
        let px=0, py=0;
        if(ox<oy) px=(dx>=0?1:-1)*ox;
        else py=(dy>=0?1:-1)*oy;
        // 完全重合时给一点随机抖动,避免刚性死锁
        if(px===0 && py===0){
          const a=Math.random()*Math.PI*2;
          px=Math.cos(a)*2; py=Math.sin(a)*2;
        }
        // 移动中的单位优先挤开挡路的空闲单位(空闲者多分担位移,让队列能穿行不卡死)
        const uIdle=u.order.kind==='none', vIdle=v.order.kind==='none';
        const wu = uIdle&&!vIdle ? 0.8 : (!uIdle&&vIdle ? 0.2 : 0.5);
        const wv = 1-wu;
        if(tryMoveTo(u, u.x-px*wu, u.y-py*wu)){ u.x-=px*wu; u.y-=py*wu; moved=true; }
        if(tryMoveTo(v, v.x+px*wv, v.y+py*wv)){ v.x+=px*wv; v.y+=py*wv; moved=true; }
      }
    }
    if(!moved) break;
  }
}
function applyMovement(u, dt){
  // 期望速度 = 寻路方向 + 分离力,再限制幅值不超过最大速度
  // 关键:分离力主要作用于“前进方向垂直分量”(侧向让路),
  // 前进方向分量只做有限减速——否则队列中前后车互相抵消会整群死锁
  const wx=u.wantVx, wy=u.wantVy;
  const wm=Math.hypot(wx,wy);
  let vx, vy;
  if(wm>1){
    const ux=wx/wm, uy=wy/wm;
    const px=-uy, py=ux;                      // 前进方向法向
    const sPerp = u.sepVx*px + u.sepVy*py;    // 分离→侧向分量(完整生效)
    const sPar  = u.sepVx*ux + u.sepVy*uy;    // 分离→前进分量(挡路时适度减速)
    const parSlow = sPar<0 ? Math.max(-wm*0.45, sPar) : 0;   // 最多减速45%,绝不静止
    vx = wx + px*sPerp + ux*parSlow;
    vy = wy + py*sPerp + uy*parSlow;
  } else {
    // 无前进目标(已到位/待命):被挤压时轻微推开,让先到位的单位散开腾出空间
    const s=Math.hypot(u.sepVx,u.sepVy);
    if(s>SEPARATE_STRENGTH*0.2){
      const k=Math.min(1, 60/s);      // 空闲单位被推幅度封顶 60px/s
      vx=u.sepVx*k; vy=u.sepVy*k;
    } else { vx=0; vy=0; }
  }
  const sp = u.speedEff;
  let m=Math.hypot(vx,vy);
  if(m>sp){ vx=vx/m*sp; vy=vy/m*sp; }
  // 速度平滑:向期望速度渐变(限制转向/加减速,消除单帧180°转向)
  const k = 1 - Math.exp(-STEER_RATE*dt);
  u.vx += (vx-u.vx)*k;
  u.vy += (vy-u.vy)*k;
  m=Math.hypot(u.vx,u.vy);
  if(m>sp){ u.vx=u.vx/m*sp; u.vy=u.vy/m*sp; m=sp; }
  if(m>0 && m<0.5){ u.vx=0; u.vy=0; m=0; }   // 微速清零,避免停在目标点附近漂移
  // 卡住检测 + 本地脱困:有移动意图但实际速度长期过低(被同伴/地形顶住)时,
  // 尝试向左右/后方小步移动找不重叠的空位(直接改位置),让大部队能绕行散开
  const wantSpeed=wm;
  if(wantSpeed>12 && m<wantSpeed*0.25){ u.stuckT=(u.stuckT||0)+dt; }
  else u.stuckT=0;
  if(u.stuckT>0.5){
    u.stuckT=0;
    const wm2=Math.max(1,wm);
    const fx=wx/wm2, fy=wy/wm2;
    const dirs=[[-fy,fx],[fy,-fx],[-fx,-fy]];   // 左,右,后
    for(let di=0; di<dirs.length; di++){
      const nx=u.x+dirs[di][0]*8, ny=u.y+dirs[di][1]*8;
      if(!inBounds(nx,ny) || uCellBlocked(u,Math.floor(nx/TILE),Math.floor(ny/TILE))) continue;
      if(!hasUnitOverlapAt(u,nx,ny)){
        u.x=nx; u.y=ny;
        u.vx=dirs[di][0]*sp*0.5; u.vy=dirs[di][1]*sp*0.5;
        break;
      }
    }
  }
  // 积分 + 静态障碍碰撞(滑动):同伴不是静态障碍,只靠分离推开
  const nx=u.x+u.vx*dt, ny=u.y+u.vy*dt;
  const txn=Math.floor(nx/TILE), tyn=Math.floor(ny/TILE);
  if(!uCellBlocked(u,txn,tyn)){
    u.x=nx; u.y=ny;
  } else {
    if(!uCellBlocked(u,Math.floor(nx/TILE), Math.floor(u.y/TILE))){ u.x=nx; u.vx*=0.4; }
    else u.vx=0;
    if(!uCellBlocked(u,Math.floor(u.x/TILE), Math.floor(ny/TILE))){ u.y=ny; u.vy*=0.4; }
    else u.vy=0;
  }
  u.x=clamp(u.x,u.hw,W-u.hw); u.y=clamp(u.y,u.hh,H-u.hh);
  // 朝向:由实际速度决定(攻击瞄准时保持面朝目标)
  const vm=Math.hypot(u.vx,u.vy);
  const aiming = u.order.kind==='attack' && u.target && u.target.hp>0 && dist(u,u.target)<=u.def.range;
  if(!aiming && vm>2) u.facing=Math.atan2(u.vy,u.vx);
}
function findEnemyNear(u, range){
  let best=null,bd=range;
  const cand=gridCollect(u.x, u.y, range);
  for(let c=0;c<cand.length;c++){
    const v=units[cand[c]];
    if(v.hp<=0 || !isEnemy(u.team,v.team)) continue;
    const d=dist(u,v);
    if(d<bd){ bd=d; best=v; }
  }
  if(best) return best;
  for(const b of buildings){ if(!b.alive||!isEnemy(u.team,b.team)) continue; const d=dist(u,b); if(d<range && d<bd){bd=d;best=b;} }
  return best;
}
function fireAt(u,target){
  const bolt = u.type==='magnet';
  const speed = bolt ? 1400 : (u.type==='tank'||u.type==='destroyer'?400 : (u.type==='infantry'?430: (u.type==='transport'?520:420)));
  const px=u.x+Math.cos(u.facing)*(u.r+4), py=u.y+Math.sin(u.facing)*(u.r+4);
  projectiles.push(new Projectile(px,py,target.x,target.y,target,u.def.damage,u.team,speed,u,u.def.proj));
  if(bolt){
    // 磁暴步兵:释放一段闪电特效(纯视觉,命中伤害走弹体)
    const e=new Effect(target.x,target.y,'bolt',0);
    e.sx=px; e.sy=py; e.tx=target.x; e.ty=target.y; e.life=0.16; e.maxLife=0.16;
    effects.push(e);
  }
}
function followPathToEntity(u, target, dt){
  if(!u.path || u.pathIdx>=u.path.length){
    u.repathT-=dt;
    if(u.repathT<=0 || !u.path){ u.repathT=0.7; const p=pathFor(u,u.x,u.y,target.x,target.y); if(p){u.path=p;u.pathIdx=0;} }
  }
  followPath(u,dt);
  // 路径走完但目标仍超射程 -> 立即重寻,避免停在半路干瞪眼
  if((!u.path || u.pathIdx>=u.path.length) && u.target && u.target.hp>0 && dist(u,u.target)>u.def.range){
    const p=pathFor(u,u.x,u.y,u.target.x,u.target.y); if(p){ u.path=p; u.pathIdx=0; }
  }
}
function followPath(u,dt){
  if(u.path && u.pathIdx<u.path.length){
    const wp=u.path[u.pathIdx];
    // 前方航点被静态障碍(如新建筑)堵住:移动指令重寻路,其余指令跳过该航点
    // 注意:同伴单位绝不进 blocked,不会被当作静态障碍,避免反复重寻抖动
    if(uCellBlocked(u,Math.floor(wp.x/TILE),Math.floor(wp.y/TILE))){
      if(u.order.kind==='move' && u.order.x!==undefined){
        u.repathT-=dt;
        if(u.repathT<=0){ u.repathT=0.5; const p=pathFor(u,u.x,u.y,u.order.x,u.order.y); if(p){u.path=p;u.pathIdx=0;} }
      } else {
        u.pathIdx++;
      }
      u.wantVx=0; u.wantVy=0;
      return;
    }
    const d=dist(u,wp);
    if(d<=u.speedEff*dt){
      u.pathIdx++;
      if(u.pathIdx>=u.path.length){
        if(u.order.kind==='move') finishMove(u);   // 到达(含最后一个可达航点)
        else { u.wantVx=0; u.wantVy=0; }
      }
      return;
    }
    const w=seekVelocity(u,wp.x,wp.y);
    u.wantVx=w.x; u.wantVy=w.y;
    return;
  }
  // 无路径直接走
  if(u.order.kind==='move' && u.order.x!==undefined){
    if(Math.hypot(u.order.x-u.x,u.order.y-u.y)<=arriveDist(u)){ finishMove(u); return; }
    const w=seekVelocity(u,u.order.x,u.order.y);
    u.wantVx=w.x; u.wantVy=w.y;
  } else {
    u.wantVx=0; u.wantVy=0;
  }
}
function updateHarvester(u, dt){
  if(u.order.kind!=='mine' && u.order.kind!=='return' && u.order.kind!=='move' && u.order.kind!=='none'){
    // 被命令移动则恢复采矿
    u.order={kind:'none'};
  }
  if(u.order.kind==='none'){
    u.mode='mine';
    if(u.cargo<=0) findOreTarget(u);
    else findRefinery(u);
    u.order={kind:u.mode};
  }
  if(u.order.kind==='mine'){
    if(!u.oreTarget || u.oreTarget.amount<=0){ findOreTarget(u); }
    // 此矿脉已被其它已就位的矿车开采 -> 另选矿脉,防止堵路
    if(u.oreTarget && units.some(v=>v!==u && v.type==='harvester' && v.alive && v.oreTarget===u.oreTarget && dist(v,u.oreTarget)<v.r+25)){
      findOreTarget(u);
    }
    if(u.oreTarget){
      const d=dist(u,u.oreTarget);
      if(d>u.r+12){ followPathTo(u,u.oreTarget.x,u.oreTarget.y,dt); }
      else {
        u.path=null;
        u.mineT-=dt;
        if(u.mineT<=0){ u.mineT=0.35/HARVEST_SPEED;   // 采矿速度倍率
          const take=Math.min(12, u.oreTarget.amount, u.def.capacity-u.cargo);
          u.oreTarget.amount-=take; u.cargo+=take;
          if(u.oreTarget.amount<=0) depleteMine(u.oreTarget);
          if(u.cargo>=u.def.capacity || u.oreTarget.amount<=0){
            findRefinery(u); u.mode='return'; u.order={kind:'return'};
          }
        }
      }
    } else { // 没矿了闲置
      if(Math.random()<dt) findOreTarget(u);
    }
  } else if(u.order.kind==='return'){
    if(!u.refinery || !u.refinery.alive){ findRefinery(u); }
    const target = u.refinery || buildings.find(b=>b.team===u.team&&b.defName==='command'&&b.alive);
    if(target){
      // 开到建筑旁的卸矿口(空地格子)再倒矿,不再试图进入建筑中心
      const port = dumpPort(target);
      if(port){
        const d=dist(u,port);
        if(d>u.r+14){ followPathTo(u,port.x,port.y,dt); }
        else dumpOre(u, target);
      } else {
        dumpOre(u, target);
      }
    }
  }
  if(u.order.kind==='move'){
    followPath(u,dt);
    // 顺路采点
    if(u.cargo<=0 && Math.random()<dt*0.5) findOreTarget(u);
  }
}
function dumpPort(b){  // 卸矿口:取建筑旁的空地格子,南侧优先(正对精炼厂卸矿台/建造厂车库门)
  const list=[];
  for(let dx=0;dx<b.w;dx++) list.push([b.tx+dx, b.ty+b.h]);  // 南
  for(let dx=0;dx<b.w;dx++) list.push([b.tx+dx, b.ty-1]);    // 北
  for(let dy=0;dy<b.h;dy++) list.push([b.tx+b.w, b.ty+dy]);  // 东
  for(let dy=0;dy<b.h;dy++) list.push([b.tx-1, b.ty+dy]);    // 西
  for(const [tx,ty] of list){
    if(tx>=0&&ty>=0&&tx<MAP_W&&ty<MAP_H && !blocked[tx][ty]){
      return { x:tx*TILE+TILE/2, y:ty*TILE+TILE/2 };
    }
  }
  return null;
}
function dumpOre(u, target){
  const gain=u.cargo; u.cargo=0;
  // 矿石精炼科技:矿车箱子里的矿收入翻倍
  credits[u.team]+= gain * (hasResearch(u.team,'oreRefine')?2:1);
  textPopup(target.x,target.y-10,'+$'+gain*(hasResearch(u.team,'oreRefine')?2:1),'#ffe27a');
  effects.push(new Effect(u.x,u.y,'ring',16));
  findOreTarget(u); u.mode='mine'; u.order={kind:'mine'};
}
function depleteMine(o){
  // 该格金矿采空:移除"禁建"标记,格子恢复为普通地面(单位本就能通行)
  if(o && o.tx!==undefined && oreGrid && oreGrid[o.tx]) oreGrid[o.tx][o.ty]=false;
}
function findOreTarget(u){
  // 优先选未被其它矿车开采的矿脉,避免多辆矿车挤在一起堵路
  let free=null,fd=1e9, taken=null,td=1e9;
  for(const o of oreFields){
    if(o.amount<=0) continue;
    const claimed = units.some(v=>v!==u && v.type==='harvester' && v.alive && v.oreTarget===o);
    const d=dist(u,o);
    if(claimed){ if(d<td){ td=d; taken=o; } }
    else if(d<fd){ fd=d; free=o; }
  }
  u.oreTarget = free || taken;
}
function findRefinery(u){
  let best=null,bd=1e9;
  for(const b of buildings){
    if(b.team!==u.team||!b.alive||b.defName!=='refinery') continue;
    const d=dist(u,b); if(d<bd){bd=d;best=b;}
  }
  u.refinery=best;
}
function followPathTo(u,tx,ty,dt){
  if(!u.path || u.pathIdx>=u.path.length){
    u.repathT-=dt;
    if(u.repathT<=0 || !u.path){ u.repathT=0.6; const p=pathFor(u,u.x,u.y,tx,ty); u.path=p; u.pathIdx=0; }
  }
  if(u.path && u.pathIdx<u.path.length){
    followPath(u,dt);
  }
  if(!u.path || u.pathIdx>=u.path.length){
    // 直走接近
    const d=Math.hypot(tx-u.x,ty-u.y);
    if(d>2){
      const w=seekVelocity(u,tx,ty);
      u.wantVx=w.x; u.wantVy=w.y;
    } else { u.wantVx=0; u.wantVy=0; }
  }
}
/* ============ 运输艇:上船 / 卸载 ============ */
function doBoard(u){
  const t=u.boardTo;
  u._boarded=false; u.boardTo=null;
  if(!t || t.hp<=0 || !units.includes(t)){ u.order={kind:'none'}; return; }
  if(transportCost(u) > (t.capacity - usedCapacity(t))){ u.order={kind:'none'}; return; }  // 已满,停在原地
  // 从场上移除,进入运输艇舱内(保留对象引用以便卸载时恢复属性)
  t.cargoUnits.push(u);
  units = units.filter(s=>s!==u);
  if(selected.includes(u)) selected=selected.filter(s=>s!==u);
  textPopup(t.x,t.y-18, u.def.name+' 已上船','#8aff8a');
  updatePanel();
}
function nearestLand(x,y){
  const cxc=Math.floor(x/TILE), cyc=Math.floor(y/TILE);
  for(let r=0;r<10;r++){
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
      const nx=cxc+dx, ny=cyc+dy;
      if(nx>=0&&ny>=0&&nx<MAP_W&&ny<MAP_H && !cellBlocked(nx,ny)){
        return { x:nx*TILE+TILE/2, y:ny*TILE+TILE/2 };
      }
    }
  }
  return null;
}
function unloadTransport(t, at){
  if(!t.cargoUnits || !t.cargoUnits.length) return 0;
  const atPt = at || t.unloadAt || {x:t.x, y:t.y};
  const pts=formationTargets(atPt.x, atPt.y, t.cargoUnits);
  const out=[];
  for(let i=0;i<t.cargoUnits.length;i++){
    const c=t.cargoUnits[i];
    const pt=(pts && pts[Math.min(i,pts.length-1)]) || {x:t.x,y:t.y};
    const np=nearestLand(pt.x, pt.y);
    if(np){
      const u=new Unit(c.type, t.team, np.x, np.y);
      u.hp=Math.min(u.maxHp, c.hp);
      if(u.type==='harvester'){
        u.cargo = c.cargo||0;
        if(c.mode==='return' && c.refinery){ u.mode='return'; u.refinery=c.refinery; u.order={kind:'return'}; u.path=null; }
        else { u.mode='mine'; u.oreTarget=c.oreTarget||null; u.order={kind:'mine'}; u.path=null; }
      }
      if(c.shield>0) u.shield=c.shield;
      out.push(u);
      effects.push(new Effect(u.x,u.y,'ring',18));
    }
  }
  t.cargoUnits=[];
  if(out.length) units.push(...out);
  textPopup(t.x,t.y-18,'已卸载 '+out.length+' 个单位','#8aff8a');
  updatePanel();
  return out.length;
}
// 手动卸载:玩家点按钮,在运输艇当前位置释放部队
function manualUnload(t){
  if(!t || t.type!=='transport' || !t.cargoUnits || !t.cargoUnits.length) return;
  unloadTransport(t, {x:t.x, y:t.y});
}
