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
  processPathJobs();
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
  // 进驻建筑处理
  for(const u of units.slice()){ if(u._garrisoning) doGarrison(u); }
  buildGrid();   // 上船/进驻会移除单位,重建空间网格避免下标错乱
  arbitrateFlow();   // 方向仲裁:交叉/对头冲突时高优先级先走,低优先级倒车让行
  // 局部防挤压:计算每个单位的分离速度(不直接改坐标,由 applyMovement 统一积分)
  separateAll();
  for(const u of units){ applyMovement(u, dt); }
  updateTrackMarks(dt);
  for(const u of units) crushTreesUnder(u);   // 重型单位碾倒所经树木
  resolveRigid();
  for(const u of units) resolveStuckAfterRigid(u, dt);   // 单位互锁脱困(位移检测)
  // 建筑生产/建造/炮塔/维修
  for(const b of buildings){ updateBuilding(b, dt, teamPower); }
  // 弹体
  for(const p of projectiles){
    const d=Math.hypot(p.tx-p.x,p.ty-p.y);
    const step=p.speed*dt;
    if(d<=step){ p.dead=true; if(p.target && p.target.hp!==undefined && p.target.hp>0 && (p.target.team!==p.team || p.force)){ applyDamage(p.target,p.damage,p.attacker,p.proj); } }
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
  if(effects.length>350) effects.splice(0, effects.length-350);   // 防粒子/残影无限堆积
  // 履带压痕:随时间淡出,并限制数量(丢弃最旧的)
  for(const m of trackMarks) m.life-=dt;
  if(trackMarks.length>300) trackMarks.splice(0, trackMarks.length-300);
  trackMarks=trackMarks.filter(m=>m.life>0);
  for(const t of texts){ t.y-=22*dt; t.life-=dt; }
  texts=texts.filter(t=>t.life>0);
  // 清理死亡单位
  units=units.filter(u=>u.hp>0);
  // 同步清理选中列表:死亡单位若还留在 selected,会继续画出它的移动线/信息
  if(selected.length && selected.some(u=>!units.includes(u))) selected=selected.filter(u=>units.includes(u));
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
  // 受击反应(灵活、不牵制):空闲单位立刻锁定攻击者迎战;而已有
  // 移动/撤退/采集等指令的单位不被强制拉入战斗——它会一边按原指令走,
  // 一边对射程内的敌人顺路开火(见 updateUnit 的 move 分支移动射击),撤退时照样能走掉。
  // 例外:AI 的"边走边打"(move+x2) 仍会被拉入战斗,保持电脑进攻强度。
  if(ent instanceof Unit && ent.def.range>0 && attacker && isEnemy(ent.team, attacker.team) && attacker.hp>0){
    const k = ent.order ? ent.order.kind : 'none';
    const isAttackMove = k==='move' && ent.order.x2;
    const commanded = (k==='move' && !isAttackMove) || k==='retreat' || k==='load' || k==='mine' || k==='return';
    // 刚被玩家下过移动指令的单位:短时间(1.5s)内不被拉回战斗,保证能脱离
    const freshMove = time - (ent._lastMoveCmd||-99) < 1.5;
    if(!commanded && !freshMove){
      if(k!=='attack' || !ent.target){
        ent.prevOrder = ent.order;
        ent.order = {kind:'attack', auto:true};   // 自动还击:记起点,不无限追
        ent._homeX = ent.x; ent._homeY = ent.y;
        ent.target = attacker;
        ent.path = null;
      }
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
  // 建造厂升级
  if(b.defName==='command' && b.upgrading && !b.constructing){
    b.upgradeProg += dt*(shortPower?0.5:1);
    if(b.upgradeProg >= COMMAND_UPGRADE_TIME){
      b.upgrading=false; b.upgraded=true; b.upgradeProg=0;
      textPopup(b.x,b.y-10,'建造厂升级完成','#8aff8a');
      effects.push(new Effect(b.x,b.y,'ring',26));
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
  // 自动维修:每 1 秒扣 1 资金,恢复 10 点生命
  if(b.hp>0 && b.hp<b.maxHp){
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
  // 进驻建筑自动向外射击(用进驻单位武器,射程+20)
  if((b.garrison && b.garrison.length) || b.garrisonTank) updateGarrisonAttack(b, dt);
}

function updateUnit(u, dt){
  u.fireT-=dt;
  if(u._lineT>0) u._lineT-=dt;   // 攻击指示红线倒计时
  u.wantVx=0; u.wantVy=0;   // 每帧重置期望速度,由下方指令逻辑重新计算
  // 反应装甲:T90 护盾每秒恢复 15(被打破后也能从 0 重新生成)
  if(u.type==='t90' && u.shield<REACTIVE_SHIELD && hasResearch(u.team,'reactiveArmor')){
    u.shield = Math.min(REACTIVE_SHIELD, u.shield + REACTIVE_REGEN*dt);
  }
  // 挑战者坦克升级进度(不占用移动/战斗)
  if(u.type==='challenger' && u.upgrading){
    u.upgradeProg += dt;
    if(u.upgradeProg >= CHALL_UPGRADE_TIME){
      u.upgrading=false; u.upgradeProg=0;
      u.upgradeLvl++;
      u.maxHp += CHALL_UPGRADE_HP;
      u.hp = Math.min(u.maxHp, u.hp + CHALL_UPGRADE_HP);
      // 克隆 def,避免污染共享缓存:伤害+15,名字改为挑战者2号/3号
      u._def = Object.assign({}, u._def, {
        damage: (u._def.damage||0) + CHALL_UPGRADE_DMG,
        name: CHALL_NAMES[u.upgradeLvl],
      });
      textPopup(u.x,u.y-20, CHALL_NAMES[u.upgradeLvl]+' 升级完成','#8aff8a');
      effects.push(new Effect(u.x,u.y,'ring',22));
      updatePanel();
    }
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
        u.turnTarget=Math.atan2(t.y-u.y,t.x-u.x);
        followPathTo(u,t.x,t.y,dt);
      }
    }
  } else if(u.order.kind==='garrison'){
    // 进驻:走向建筑,到达后吸收进建筑(自动归属)
    const b=u.order.target;
    if(!b || !b.alive || !canGarrisonBuild(b, u.team, u.type)){
      u.order={kind:'none'};
    } else {
      const d=dist(u,b);
      const reach = Math.max(b.w,b.h)*TILE/2 + u.r + 10;
      if(d<=reach){
        u._garrisoning=true; u.garrisonTo=b;
        u.order={kind:'none'}; u.path=null;
      } else {
        u.turnTarget=Math.atan2(b.y-u.y,b.x-u.x);
        followPathTo(u, b.x, b.y, dt);
      }
    }
  } else if(u.order.kind==='move'){
    followPath(u,dt);
    // 移动射击:行进途中朝射程内敌人开火,不打断移动
    if(u.def.range>0){
      const en=findEnemyNear(u, u.def.range);
      if(en){
        u.turnTarget=Math.atan2(en.y-u.y,en.x-u.x);
        if(u.fireT<=0){ u.fireT=u.def.rof; fireAt(u,en); }
      }
    }
    // 运输艇:不再自动卸载,由玩家手动释放(manualUnload 按钮)
  } else if(u.order.kind==='attack'){
    // 点击攻击 = 寻路向目标推进;一旦进入射程就持续锁定目标开火(移动中也打),
    // 到位后停下原地输出;目标跑远就继续追击。不会"走到附近却不开火"。
    const at=u.target;
    if(at && at.hp>0){
      // 自动防御:目标逃出"起始位置 + 射程×2.2"就放弃追击回防,避免无限缠斗;
      // 手动攻击(右键)不受此限制,会一直追击到底。
      if(u.order.auto && u._homeX!==undefined &&
         Math.hypot(at.x-u._homeX, at.y-u._homeY) > u.def.range*2.2){
        u.target=null; u.order={kind:'none'}; u.path=null;
      } else {
        const d=dist(u,at);
        // 到位距离:停在自己射程边缘即可打到目标(刚好能开火的距离)
        const stopD = u.def.range;
        if(d > stopD){
          followPathToEntity(u, at, dt);   // 没到位:寻路向目标推进
        } else {
          u.path=null;                     // 到位:停止移动
        }
        if(d <= u.def.range){              // 进入射程就持续向目标开火
          u.turnTarget=Math.atan2(at.y-u.y, at.x-u.x);
          if(u.fireT<=0){ u.fireT=u.def.rof; fireAt(u,at); }
        }
      }
    }
    if(!at || at.hp<=0){
      u.target=null;
      if(u.prevOrder){ u.order=u.prevOrder; u.prevOrder=null; }
      else if(u.order.x2){ u.order={kind:'move',x:u.order.x,y:u.order.y,x2:true}; }
      else u.order={kind:'none'};
      u._homeX=undefined;
    }
  } else if(u.order.kind==='none'){
    // 空闲单位主动防御:敌人进入感知范围就自动开火迎战。
    // 记录起始位置,目标逃远会放弃追击(不无限缠斗);
    // 刚下过移动/撤退指令的单位 1.5s 内不会被拉回战斗,保证听从指挥。
    if(u.def.range>0 && time - (u._lastMoveCmd||-99) >= 1.5){
      const en=findEnemyNear(u, u.def.range*1.3);
      if(en && Math.random()<dt*2){
        u._homeX=u.x; u._homeY=u.y;
        u.target=en; u.order={kind:'attack', auto:true};
      }
    }
  }
}
/* ============ 单位互锁脱困(位移检测) ============ */
// 有移动意图但 0.4s 内实际位移极小——比如两辆坦克顶在一起,速度被分离/刚性修正
// 抵消(velocity 很高但位置原地发抖),此时 velocity 检测的 stuckT 不会触发。
// 做法:侧向/后方滑出找不重叠空位,绕开挡路同伴。不做旋转(非静态障碍卡死)。
function resolveStuckAfterRigid(u, dt){
  if(u.hp<=0) return;
  if(u._rotInPlace){ u._srT=0; u._srRef=null; return; }   // 正在原地转向,不算卡死
  const wantSpeed = Math.hypot(u.wantVx, u.wantVy);
  const hasIntent = u.order && (u.order.kind==='move'||u.order.kind==='attack') && wantSpeed>12;
  if(!hasIntent){ u._srT=0; u._srRef=null; return; }
  if(!u._srRef){
    const wp = (u.path && u.path[u.pathIdx]) || null;
    u._srRef = {x:u.x, y:u.y, wpD: wp ? Math.hypot(wp.x-u.x, wp.y-u.y) : 1e9};
  }
  u._srT = (u._srT||0) + dt;
  if(u._srT < 0.4) return;
  const d = Math.hypot(u.x-u._srRef.x, u.y-u._srRef.y);
  const ok = d >= wantSpeed*0.4*0.4;   // 0.4s 内位移 <40% 期望 → 卡死
  // 环绕航点卡死:离当前航点很近但距离一直没缩小(两车争同一个中间航点,互相顶住绕圈)
  const wp = (u.path && u.path[u.pathIdx]) || null;
  let wpStuck = false;
  if(wp && u._srRef.wpD < 110){
    const dNow = Math.hypot(wp.x-u.x, wp.y-u.y);
    if(dNow < 110 && dNow > u._srRef.wpD - 5) wpStuck = true;   // 0.4s 内没有在靠近航点
  }
  u._srT = 0; u._srRef = null;
  if(wpStuck){
    // 跳过当前被同伴占据的航点,向下一航点进发
    u.pathIdx++;
    if(u.path && u.pathIdx>=u.path.length){
      if(u.order.kind==='move'){ finishMove(u); return; }
      // 攻击指令不清除,只清路径并继续走下面的横向滑出,
      // 同时记失败时间做寻路退避,避免在原地反复算 A* 转圈
      u.path=null; u.wantVx=0; u.wantVy=0;
      u._lastPathFail = time;
    } else {
      return;
    }
  }
  if(ok) return;
  // 卡死:沿垂直于前进方向(左右)或向后,逐档距离找不重叠空位。
  // 改为"小幅位移 + 逃生速度"平滑滑出,不再瞬间瞬移(避免抽搐/漂浮)。
  const fx = u.wantVx/wantSpeed, fy = u.wantVy/wantSpeed;
  const dirs = [[-fy,fx],[fy,-fx],[-fx,-fy]];
  for(const [dx,dy] of dirs){
    for(const dist of [14, 26, 40]){
      const nx = u.x + dx*dist, ny = u.y + dy*dist;
      if(!inBounds(nx,ny) || uBodyBlocked(u,nx,ny)) continue;
      if(hasUnitOverlapAt(u,nx,ny)) continue;
      u.x += dx*4; u.y += dy*4;
      u._escapeT = 0.35; u._escapeAng = Math.atan2(dy,dx);   // 逃生速度平滑滑出
      return;
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
/* ============ 方向仲裁(交叉/对头冲突) ============ */
// 单位在窄道/交叉口互相顶住时,给每次移动指令分配随机优先级:
// 冲突范围内优先级最高的单位先走,其余原地等待;等待还会向后传播,
// 避免后面的同队单位把等待者顶回死锁点。
function flowDir(u){
  if(!u || !u.order) return null;
  if(u.order.kind==='attack' && u.target && u.target.hp>0){
    const d=Math.hypot(u.target.x-u.x,u.target.y-u.y);
    if(d<1) return null;
    return {x:(u.target.x-u.x)/d, y:(u.target.y-u.y)/d};
  }
  if(u.order.kind==='move' && u.order.x!==undefined){
    const d=Math.hypot(u.order.x-u.x,u.order.y-u.y);
    if(d<1) return null;
    return {x:(u.order.x-u.x)/d, y:(u.order.y-u.y)/d};
  }
  const m=Math.hypot(u.wantVx,u.wantVy);
  return m>1 ? {x:u.wantVx/m, y:u.wantVy/m} : null;
}
function flowPriority(u){
  if(u._flowTX!==u.order.x || u._flowTY!==u.order.y){
    u._flow=Math.random();
    u._flowTX=u.order.x; u._flowTY=u.order.y;
  }
  return u._flow;
}
function arbitrateFlow(){
  const moveKind = k => k==='move' || k==='attack';
  for(const u of units){
    if(!moveKind(u.order.kind)) continue;
    const du=flowDir(u); if(!du) continue;
    const cand=gridCollect(u.x, u.y, 110);
    for(let c=0;c<cand.length;c++){
      const v=units[cand[c]];
      if(v===u || v.hp<=0 || !moveKind(v.order.kind)) continue;
      const dv=flowDir(v); if(!dv) continue;
      if(du.x*dv.x + du.y*dv.y > 0.2) continue;   // 同向,不冲突
      if(dist(u,v) > 110) continue;
      const csU=u.circles(), csV=v.circles();
      let near=false;
      for(const A of csU) for(const B of csV){
        if(Math.hypot(A.x-B.x, A.y-B.y) < A.r+B.r+48){ near=true; break; }
      }
      if(!near) continue;
      if(flowPriority(v) > flowPriority(u)){
        // 低优先级倒车:沿自己前进方向的反方向持续后退让行,
        // 即使暂时脱离冲突也继续退满 0.9 秒,避免刚退开又折返顶回
        u._backing = {t:0.9, dir:{x:-du.x, y:-du.y}};
        break;
      }
    }
  }
  // 后退向后传播:正后方有后退者时,自己也跟着后退,避免把后退者顶回死锁点
  let changed=true, guard=0;
  while(changed && guard++<units.length){
    changed=false;
    for(const u of units){
      if(u._backing || !moveKind(u.order.kind)) continue;
      const du=flowDir(u); if(!du) continue;
      const cand=gridCollect(u.x, u.y, 70);
      for(let c=0;c<cand.length;c++){
        const v=units[cand[c]];
        if(v===u || v.hp<=0 || !v._backing) continue;
        const dx=v.x-u.x, dy=v.y-u.y;
        const d=Math.hypot(dx,dy);
        if(d>60) continue;
        if(du.x*(dx/d) + du.y*(dy/d) > 0.7){ u._backing={t:v._backing.t, dir:v._backing.dir}; changed=true; break; }
      }
    }
  }
}
function separateAll(){
  // 局部防挤压(软):按"双圆胶囊"碰撞圆两两距离检测计算排斥力,不直接改坐标
  // 两辆坦克(或单位)靠近重叠时,按圆的重叠量产生平滑推力,互相推开:
  // 海量坦克挤在一起时绝不穿模、不抖动、不卡墙。
  for(let i=0;i<units.length;i++){
    const u=units[i];
    u.sepVx=0; u.sepVy=0;
    const cand=gridCollect(u.x, u.y, Math.max(u.hw,u.hh)*2 + 16);
    const csU = u.circles();
    for(let c=0;c<cand.length;c++){
      const j=cand[c];
      if(j===i) continue;
      const v=units[j];
      if(v.hp<=0 || isEnemy(u.team,v.team)) continue;   // 敌人在战斗中不做分离
      const csV = v.circles();
      // 双圆 × 双圆:车头/车尾圆之间两两做距离检测
      for(let a=0;a<csU.length;a++) for(let b=0;b<csV.length;b++){
        const A=csU[a], B=csV[b];
        const dx=A.x-B.x, dy=A.y-B.y;
        const d=Math.hypot(dx,dy)||0.0001;
        const min=A.r+B.r;
        if(d>=min) continue;
        const over=(min-d)/min;             // 0(刚接触)~1(完全重叠)
        const str=over*over*SEPARATE_STRENGTH;   // 二次衰减:越近推力越强
        u.sepVx += (dx/d)*str;              // 沿两圆心连线把 u 推开
        u.sepVy += (dy/d)*str;
      }
    }
  }
}
/* ============ 刚性碰撞(双圆胶囊):重叠的位置修正 ============ */
// 双圆胶囊 vs 双圆胶囊:两两(车头/车尾)圆检测,取穿透最深的圆对,沿其圆心连线推开
function capsuleOverlap(u,v){
  const csA=u.circles(), csB=v.circles();
  let deepest=null, deepPen=0;
  for(const A of csA) for(const B of csB){
    const dx=B.x-A.x, dy=B.y-A.y;
    const d=Math.hypot(dx,dy)||0.0001;
    const min=A.r+B.r;
    if(d<min){
      const pen=min-d;
      if(pen>deepPen){ deepPen=pen; deepest={x:dx/d, y:dy/d}; }
    }
  }
  return deepest ? { axis:deepest, pen:deepPen } : null;
}
function tryMoveTo(u, x, y){
  if(!inBounds(x,y)) return false;
  // 胶囊两圆所在格都必须可通行(防车身斜插进障碍/水面)
  const cs=u.circlesAt(x,y,u.facing);
  for(const c of cs){
    if(uCellBlocked(u, Math.floor(c.x/TILE), Math.floor(c.y/TILE))) return false;
  }
  return true;
}
// 该位置是否与任何存活单位碰撞圆重叠(用于本地脱困找空位)
function hasUnitOverlapAt(u, x, y){
  const cand=gridCollect(x, y, Math.max(u.hw,u.hh)*2 + 16);
  const csA=u.circlesAt(x,y,u.facing);
  for(let c=0;c<cand.length;c++){
    const v=units[cand[c]];
    if(v===u || v.hp<=0) continue;
    const csB=v.circles();
    for(const A of csA) for(const B of csB){
      if(Math.hypot(A.x-B.x,A.y-B.y) < A.r+B.r) return true;
    }
  }
  return false;
}
function resolveRigid(){
  // 把重叠的胶囊沿最深穿透圆的圆心连线互相推开(位置修正,迭代至收敛,每轮重建网格)
  for(let iter=0;iter<4;iter++){
    buildGrid();
    let moved=false;
    for(let i=0;i<units.length;i++){
      const u=units[i];
      if(u.hp<=0) continue;
      const cand=gridCollect(u.x, u.y, Math.max(u.hw,u.hh)*2 + 16);
      for(let k=0;k<cand.length;k++){
        const j=cand[k];
        if(j<=i) continue;
        const v=units[j];
        if(v.hp<=0) continue;
        const ov=capsuleOverlap(u,v);
        if(!ov) continue;
        let px=ov.axis.x*ov.pen, py=ov.axis.y*ov.pen;
        // 完全重合时给一点随机抖动,避免刚性死锁
        if(px===0 && py===0){
          const a=Math.random()*Math.PI*2;
          px=Math.cos(a)*2; py=Math.sin(a)*2;
        }
        // 移动中的单位挤开挡路的空闲单位,但空闲单位不会"轻飘飘"被推走:
        // 推挤分配强烈偏向移动者(0.35/0.65),让停着的载具沉重、不易被撞开
        const uIdle=u.order.kind==='none', vIdle=v.order.kind==='none';
        const wu = uIdle&&!vIdle ? 0.35 : (!uIdle&&vIdle ? 0.65 : 0.5);
        const wv = 1-wu;
        if(tryMoveTo(u, u.x-px*wu, u.y-py*wu)){ u.x-=px*wu; u.y-=py*wu; moved=true; }
        if(tryMoveTo(v, v.x+px*wv, v.y+py*wv)){ v.x+=px*wv; v.y+=py*wv; moved=true; }
      }
    }
    if(!moved) break;
  }
}
/* ============ 载具阻尼转向 + 渲染物理(起步/刹车/后坐力) ============ */
// 载具转向:匀速旋转(带起步/换向角加速度与到位前减速)。
// 关键:到位判定用"环形最短角差",正确处理跨 -π/π 的 180° 掉头,
// 绝不会把目标误判为"已越过"而瞬间转向。
function dampedTurn(u, target, dt){
  let delta = target - u.facing;
  delta = ((delta + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI;   // 最短转角 [-π, π]
  const abs = Math.abs(delta);
  if(abs < 0.008){ u.facing = target; u.angVel = 0; return target; }
  const maxV = TURN_MAX_SPEED;
  const dir = delta > 0 ? 1 : -1;
  // 期望角速度:匀速;最后 0.4rad 线性减速,避免到位硬停
  let want = dir * maxV;
  if(abs < 0.4) want = dir * maxV * (abs/0.4);
  // 以固定角加速度逼近(起步加速 / 换向减速)
  const dv = want - u.angVel;
  u.angVel += Math.sign(dv) * Math.min(TURN_ACCEL*dt, Math.abs(dv));
  if(Math.abs(u.angVel) > maxV) u.angVel = Math.sign(u.angVel)*maxV;
  // 环形到位判定:检查下一帧角度与目标的最短角差,而非线性比较
  const next = u.facing + u.angVel*dt;
  let nd = target - next;
  nd = ((nd + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI;
  if(Math.abs(nd) < 0.012){
    u.facing = target; u.angVel = 0; return target;
  }
  u.facing = next;
  if(u.facing > Math.PI) u.facing -= Math.PI*2;
  if(u.facing < -Math.PI) u.facing += Math.PI*2;
  return u.facing;
}
// 载具渲染物理:起步/刹车俯仰 + 开火后坐力。只改渲染偏移,不动逻辑坐标 (x,y)。
function updateRenderPhysics(u, dt){
  const sp = Math.hypot(u.vx, u.vy);
  const a = (sp - (u._prevSp||0)) / Math.max(dt, 0.001);   // 纵向加速度(px/s²)
  u._prevSp = sp;
  // 起步加速:车身向后微仰;急刹:向前微倾(按加速度,正=后仰)
  const leanTarget = clamp(-a*0.02, -2.4, 2.4);
  u.surge += (leanTarget - u.surge) * Math.min(1, 10*dt);
  // 开火后坐力:指数衰减回零(约0.1~0.2s恢复)
  u.fireRecoil *= Math.exp(-RECOIL_DECAY*dt);
  const fx = Math.cos(u.facing), fy = Math.sin(u.facing);
  const off = u.surge + u.fireRecoil;   // 纵向位移(沿 -facing = 向后)
  u.renderOx = -fx*off;
  u.renderOy = -fy*off;
}
function applyMovement(u, dt){
  // 期望速度 = 寻路方向 + 分离力,再限制幅值不超过最大速度
  // 关键:分离力主要作用于“前进方向垂直分量”(侧向让路),
  // 前进方向分量只做有限减速——否则队列中前后车互相抵消会整群死锁
  const sp = u.speedEff;
  const isVehicle = u.hw > u.hh && !u.naval;   // 履带/长条形载具(海军除外)
  // 让行:卡住滑开后暂停片刻,打破双向车流对称死锁(随机时差分先后)
  if(u._yieldT>0){
    u._yieldT -= dt;
    u.wantVx=0; u.wantVy=0;
  }
  // 方向仲裁倒车:低优先级单位持续后退让高优先级单位先走
  if(u._backing && u._backing.t>0){
    u._backing.t -= dt;
    u.wantVx = u._backing.dir.x*sp*0.6;
    u.wantVy = u._backing.dir.y*sp*0.6;
  }
  // 旋转脱困后的"短暂逃生":朝逃生方向直线滑出,不被寻路期望方向拉回卡死
  if(u._escapeT>0){
    u._escapeT -= dt;
    u.wantVx = Math.cos(u._escapeAng)*sp;
    u.wantVy = Math.sin(u._escapeAng)*sp;
  }
  const wx0=u.wantVx, wy0=u.wantVy;
  const wm0=Math.hypot(wx0,wy0);
  // 载具转向对齐门:期望方向与车头夹角超过阈值时,先原地匀速转向、不做任何移动;
  // 对齐后才只保留沿车头的直线前进分量(移动中几乎不转弯)。
  // 逃生/倒车让行等应急移动不受此限制。
  let wx=wx0, wy=wy0, wm=wm0;
  u._rotInPlace = false;
  if(isVehicle && wm0>1 && !(u._escapeT>0) && !(u._backing && u._backing.t>0)){
    const mDir=Math.atan2(wy0, wx0);
    let ad=mDir-u.facing;
    ad=((ad+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
    if(Math.abs(ad)>VEHICLE_ALIGN_GATE){
      wx=0; wy=0; wm=0;                     // 未对齐:原地旋转,不移动
      u._rotInPlace = true;
    } else {
      const fx2=Math.cos(u.facing), fy2=Math.sin(u.facing);
      const fwd=Math.max(0, wx0*fx2+wy0*fy2);   // 沿车头前进分量
      wx=fx2*fwd; wy=fy2*fwd; wm=Math.hypot(wx,wy);   // 对齐后:直线前进
    }
  }
  let vx, vy;
  if(wm>1){
    const ux=wx/wm, uy=wy/wm;
    const px=-uy, py=ux;                      // 前进方向法向
    const sPerp = u.sepVx*px + u.sepVy*py;    // 分离→侧向分量
    const sPar  = u.sepVx*ux + u.sepVy*uy;    // 分离→前进分量(挡路时适度减速)
    // 侧向分量封顶:最多占速度的 55%,避免被同伴"推着绕圈"(两辆坦克顶在一起
    // 原地转圈/垂直震荡的根因)。前进分量只做有限减速(最多45%),绝不静止。
    const sPerpC = Math.max(-sp*0.55, Math.min(sp*0.55, sPerp));
    const parSlow = sPar<0 ? Math.max(-wm*0.45, sPar) : 0;
    vx = wx + px*sPerpC + ux*parSlow;
    vy = wy + py*sPerpC + uy*parSlow;
  } else {
    // 无前进目标(已到位/待命):被挤压时轻微推开,让先到位的单位散开腾出空间
    const s=Math.hypot(u.sepVx,u.sepVy);
    if(s>SEPARATE_STRENGTH*0.2){
      const k=Math.min(1, 15/s);      // 空闲单位被推幅度封顶 15px/s(更沉,几乎不漂)
      vx=u.sepVx*k; vy=u.sepVy*k;
    } else { vx=0; vy=0; }
  }
  // 履带载具几乎不能横移:把速度分解为"沿车头/垂直车头",削减横移分量,
  // 让坦克"先转向(匀速)再沿车头前进/倒退",而不是被指令拉着横着飘
  if(isVehicle){
    const m0=Math.hypot(vx,vy);
    if(m0>1){
      const fx2=Math.cos(u.facing), fy2=Math.sin(u.facing);
      const fwd = vx*fx2 + vy*fy2;                  // 沿车头分量(前=正)
      const lat = vx*(-fy2) + vy*fx2;               // 垂直车头分量
      vx = fx2*fwd + (-fy2)*(lat*VEHICLE_LATERAL);
      vy = fy2*fwd + fx2*(lat*VEHICLE_LATERAL);
    }
  }
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
  // 1) 先向左右/后方小步移动找不重叠的空位;2) 还不行就"旋转脱困"——
  //    在期望朝向附近搜一个能让胶囊两圆都落在可通行格上的角度,转到该朝向滑出。
  //    (解决长车身斜贴在水/陆边缘、建筑边缘、船坞边缘卡死的问题)
  const wantSpeed=wm;
  if(wantSpeed>12 && m<wantSpeed*0.25){ u.stuckT=(u.stuckT||0)+dt; }
  else u.stuckT=0;
  if(u.stuckT>0.5){
    u.stuckT=0;
    const wm2=Math.max(1,wm);
    const fx=wx/wm2, fy=wy/wm2;
    const dirs=[[-fy,fx],[fy,-fx],[-fx,-fy]];   // 左,右,后
    let escaped=false;
    for(let di=0; di<dirs.length; di++){
      const nx=u.x+dirs[di][0]*8, ny=u.y+dirs[di][1]*8;
      if(!inBounds(nx,ny) || uBodyBlocked(u,nx,ny)) continue;
      if(!hasUnitOverlapAt(u,nx,ny)){
        u.x += dirs[di][0]*3; u.y += dirs[di][1]*3;   // 小幅位移,避免瞬移抽搐
        u.vx=dirs[di][0]*sp*0.5; u.vy=dirs[di][1]*sp*0.5;
        u._escapeT = 0.4; u._escapeAng = Math.atan2(dirs[di][1], dirs[di][0]);   // 逃生速度平滑滑出
        u._yieldT = 0.3 + Math.random()*0.4;
        escaped=true;
        break;
      }
    }
    if(!escaped && uBodyBlocked(u, u.x, u.y)){
      // 旋转脱困:仅当被地形/水域/建筑等"静态障碍"真正卡住时才触发
      // (纯被同伴挤压交给分离系统,避免两辆坦克原地转圈)
      const wantAng = Math.atan2(fy, fx);   // fx/fy = 归一化期望方向
      const STEPS = [0, 1, -1, 2, -2, 3, -3, 6];   // ×30° 的偏移档
      for(const s of STEPS){
        const ang = wantAng + s*(Math.PI/6);
        if(uBodyBlocked(u, u.x, u.y, ang)) continue;   // 该朝向下车身仍在障碍里
        // 朝该朝向小幅滑出一段,确认能真正动起来
        const cx = u.x + Math.cos(ang)*10, cy = u.y + Math.sin(ang)*10;
        if(uBodyBlocked(u, cx, cy, ang)) continue;
        if(hasUnitOverlapAt(u, cx, cy)) continue;
        // 平滑转到脱困朝向(快速但非瞬移,避免战斗/贴边时 facing 突然抽搐)
        u.facing = lerpAngle(u.facing, ang, Math.min(1, 26*dt));
        u.angVel = 0;
        u.vx = Math.cos(ang)*sp*0.5; u.vy = Math.sin(ang)*sp*0.5;
        u.turnTarget = ang;
        // 短暂逃生:约 0.6 秒内保持朝该方向直线滑出,清开障碍后再回归正常寻路
        u._escapeT = 0.6; u._escapeAng = ang;
        escaped = true;
        break;
      }
    }
  }
  // 积分 + 静态障碍碰撞(滑动):检查胶囊两圆所在格,防止长车身斜插进障碍/水面
  const nx=u.x+u.vx*dt, ny=u.y+u.vy*dt;
  if(!uBodyBlocked(u,nx,ny)){
    u.x=nx; u.y=ny;
  } else {
    if(!uBodyBlocked(u,nx,u.y)){ u.x=nx; u.vx*=0.4; }
    else u.vx=0;
    if(!uBodyBlocked(u,u.x,ny)){ u.y=ny; u.vy*=0.4; }
    else u.vy=0;
  }
  u.x=clamp(u.x,u.hw,W-u.hw); u.y=clamp(u.y,u.hh,H-u.hh);
  // 朝向:向目标方向角做 lerpAngle 平滑插值,产生真实的履带战车转向效果,而非瞬间硬转
  const aiming = u.order.kind==='attack' && u.target && u.target.hp>0 && dist(u,u.target)<=u.def.range;
  let tgt = u.facing;
  if(aiming){
    // 攻击瞄准:朝当前目标方向平滑转过去
    tgt = (u.turnTarget !== undefined) ? u.turnTarget : Math.atan2(u.target.y-u.y, u.target.x-u.x);
  } else {
    const wm = Math.hypot(u.wantVx, u.wantVy);
    if(wm > 2){
      tgt = Math.atan2(u.wantVy, u.wantVx);          // 有寻路意图:朝前进方向转
    } else if(u.order.kind==='attack' && u.target){
      tgt = (u.turnTarget !== undefined) ? u.turnTarget : Math.atan2(u.target.y-u.y, u.target.x-u.x);  // 追击途中朝目标
    }
    // 空闲/移动到位:保持当前朝向,不再回弹到上次战斗残留的 turnTarget 角度
  }
  // 朝向:载具用匀速阻尼转向,步兵等圆形单位保持快速 lerp
  if(isVehicle){
    u.facing = dampedTurn(u, tgt, dt);
  } else {
    u.facing = lerpAngle(u.facing, tgt, TURN_RATE*dt);
    // 归一化到 [-π,π],避免慢速连续转向时 facing 无限累积(渲染按 facing 旋转,累积=转圈圈)
    if(u.facing > Math.PI || u.facing < -Math.PI){
      u.facing = ((u.facing + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI;
    }
  }
  // 载具渲染物理:起步/刹车俯仰 + 开火后坐力
  if(isVehicle) updateRenderPhysics(u, dt);
}
/* ============ 履带/轮子接地细节:压痕 + 扬尘 ============ */
// 移动中的履带车辆按"走过的距离"生成压痕,并在较快时扬起尘土
function updateTrackMarks(dt){
  for(const u of units){
    if(u.hp<=0) continue;
    if(!TRACK_UNITS[u.type]) continue;   // 仅履带载具留痕
    const sp=Math.hypot(u.vx,u.vy);
    if(sp<18) continue;
    u._trackD = (u._trackD||0) + sp*dt;
    if(u._trackD > 34){ u._trackD = 0; spawnTrackMark(u); }
    // 扬尘:速度较快时从车尾两侧喷出淡黄尘土
    if(sp>40 && Math.random()<dt*3){
      const fx=Math.cos(u.facing), fy=Math.sin(u.facing);
      const nx=-fy, ny=fx;
      const e=new Effect(u.x - fx*(u.hw||10)*0.7 + nx*rnd(-u.hh,u.hh),
                         u.y - fy*(u.hw||10)*0.7 + ny*rnd(-u.hh,u.hh), 'dust', rnd(2.5,4.5));
      e.life=0.6; e.maxLife=0.6; effects.push(e);
    }
  }
}
function spawnTrackMark(u){
  const fx=Math.cos(u.facing), fy=Math.sin(u.facing);
  const px=-fx, py=-fy;                 // 车尾方向
  const nx=-fy, ny=fx;                  // 车体横向(右)
  const halfW=(u.hh||8)*0.7;
  const back=(u.hw||12)*0.55;
  for(const s of [-1,1]){               // 左右两条履带各留一道压痕
    trackMarks.push({
      x: u.x + px*back + nx*halfW*s,
      y: u.y + py*back + ny*halfW*s,
      a: u.facing,
      w: Math.max(3,(u.hh||8)*0.5),
      l: 5,
      life: 5, maxLife: 5,
    });
  }
}
/* ============ 树木可碾倒(坦克/两栖登陆艇) ============ */
// 重型单位碾过树林:检查其碰撞圆所在格是否有站立的树,有则碾倒
function crushTreesUnder(u){
  if(!u || !u.crushTrees || u.hp<=0) return;
  const cs = u.circles();
  for(const c of cs){
    const tx=Math.floor(c.x/TILE), ty=Math.floor(c.y/TILE);
    if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) continue;
    if(terrain[tx][ty]!=='tree') continue;
    crushTree(tx, ty, u);
  }
}
// 碾倒一棵树:该格恢复草地(可通行),播放"倒下动画 + 尘土",并留一段断木残迹
function crushTree(tx, ty, u){
  terrain[tx][ty] = 'grass';
  blocked[tx][ty] = false;
  invalidatePathCache();
  const cx = tx*TILE + TILE/2, cy = ty*TILE + TILE/2;
  // 倒下动画:用整张树林贴图,从竖直缓缓倒向水平(0.5s)
  const tile = imgs['tree'] || null;
  const dir = u ? u.facing + rnd(-1.2, 1.2) : rnd(-Math.PI, Math.PI);
  const e = new Effect(cx, cy, 'treefall', TILE/2);
  e.img = tile; e.dir = dir; e.life = 0.5; e.maxLife = 0.5;
  effects.push(e);
  // 尘土:树根部扬起几团尘土
  for(let i=0;i<6;i++){
    const d = new Effect(cx + rnd(-9,9), cy + rnd(-2,6), 'dust', rnd(3,6.5));
    d.life = 0.75; d.maxLife = 0.75; effects.push(d);
  }
  // 断木残迹:约 18 秒后淡出
  const log = new Effect(cx, cy, 'treelog', TILE/2);
  log.dir = dir; log.life = 18; log.maxLife = 18;
  effects.push(log);
}
// 该位置是否撞到静态障碍/水域(胶囊两圆所在格任一被挡即算撞)。facing 可选:用于"旋转脱困"检查
function uBodyBlocked(u, x, y, facing){
  if(!inBounds(x,y)) return true;
  const cs=u.circlesAt(x,y, facing!==undefined ? facing : u.facing);
  for(const c of cs){
    const tcx=Math.floor(c.x/TILE), tcy=Math.floor(c.y/TILE);
    if(uCellBlocked(u,tcx,tcy)) return true;
  }
  return false;
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
  for(const b of buildings){ if(!b.alive || b.team<0 || !isEnemy(u.team,b.team)) continue; const d=dist(u,b); if(d<range && d<bd){bd=d;best=b;} }
  return best;
}
function fireAt(u,target){
  const bolt = u.type==='magnet';
  const speed = bolt ? 1400 : (u.type==='tank'||u.type==='destroyer'?400 : (u.type==='infantry'?430: (u.type==='transport'?520:420)));
  const px=u.x+Math.cos(u.facing)*(u.r+4), py=u.y+Math.sin(u.facing)*(u.r+4);
  const pr=new Projectile(px,py,target.x,target.y,target,u.def.damage,u.team,speed,u,u.def.proj);
  pr.force = !!(u.order && u.order.force);   // 强制攻击:可命中任意目标(含己方)
  projectiles.push(pr);
  if(u.hw > u.hh && !u.naval) u.fireRecoil = FIRE_RECOIL;   // 载具开火后坐力(车身反向震动)
  if(bolt){
    // 磁暴步兵:释放一段闪电特效(纯视觉,命中伤害走弹体)
    const e=new Effect(target.x,target.y,'bolt',0);
    e.sx=px; e.sy=py; e.tx=target.x; e.ty=target.y; e.life=0.16; e.maxLife=0.16;
    effects.push(e);
  }
}
// pathfinding retry backoff: avoid per-frame A* spin when stuck
function pathRetryReady(u){
  return u._lastPathFail===undefined || (time - u._lastPathFail) > 0.7;
}
function followPathToEntity(u, target, dt){
  if((!u.path || u.pathIdx>=u.path.length) && !u._pendingPath){
    u.repathT-=dt;
    if((u.repathT<=0 || !u.path) && pathRetryReady(u)){
      u.repathT=0.7;
      queuePath(u, target.x, target.y, u.order);
    }
  }
  followPath(u,dt);
  // 路径走完但目标还没到位 -> 立即重寻,避免停在半路干瞪眼。
  // 到位距离取一个比射程更小的值,保证推进途中路径走完都会立刻重寻,不会僵停。
  const chaseD = Math.max(24, u.r + 12);
  if((!u.path || u.pathIdx>=u.path.length) && !u._pendingPath && u.target && u.target.hp>0 && dist(u,u.target)>chaseD && pathRetryReady(u)){
    queuePath(u, target.x, target.y, u.order);
    u.repathT = 0.7;
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
    // 到航点判定带容差(arriveDist):两辆车共用一个中间航点时不必精确踩到格中心,
    // 到附近就切下一航点,避免在同一个点上互相顶住原地转圈
    if(d<=Math.max(arriveDist(u), u.speedEff*dt)){
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
  } else if(u.order.kind==='attack' && u.target && u.target.hp>0){
    const w=seekVelocity(u,u.target.x,u.target.y);
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
    // 此矿脉已被其它"已停在矿点开采"的矿车占用 -> 持续2秒仍未腾开才换矿,
    // 换不到空闲矿时冷却1秒再试,避免两辆矿车互相赶走反复横跳
    const occupied = u.oreTarget && units.some(v=>v!==u && v.type==='harvester' && v.alive &&
      v.oreTarget===u.oreTarget && v.order.kind==='mine' && dist(v,u.oreTarget)<=v.r+8);
    if(occupied){
      u._mineSwitchCd=(u._mineSwitchCd||0)+dt;
      if(u._mineSwitchCd>=2){
        const old=u.oreTarget;
        findOreTarget(u);
        if(u.oreTarget!==old) u._mineSwitchCd=0; else u._mineSwitchCd=-1;
      }
    } else {
      if((u._mineSwitchCd||0)<0) u._mineSwitchCd+=dt; else u._mineSwitchCd=0;
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
      // 倒矿:优先把车头贴到建筑"下方那条面",接触下方即可直接倒矿;
      // 下方出口被堵时,退回任意可停靠的卸矿口(dumpPort)。
      const faceY=(target.ty+target.h)*TILE;        // 建筑下方边线(像素)
      const stopX=target.x, stopY=faceY+u.hh;       // 车头顶住下方面的停车位中心
      const scx=Math.floor(stopX/TILE), scy=Math.floor(stopY/TILE);
      const bottomFree = scx>=0&&scy>=0&&scx<MAP_W&&scy<MAP_H && !blocked[scx][scy] && !structBlocked[scx][scy];
      if(bottomFree){
        const d=Math.hypot(u.x-stopX, u.y-stopY);
        if(d>u.r+6) followPathTo(u,stopX,stopY,dt);
        else dumpOre(u, target);
      } else {
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
    if((u.repathT<=0 || !u.path) && pathRetryReady(u)){
      u.repathT=0.6;
      const p=pathFor(u,u.x,u.y,tx,ty);
      u.path=p; u.pathIdx=0;
      if(!p) u._lastPathFail = time;
    }
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
/* ============ 进驻建筑(中立房屋/商业体):进驻 / 释放 / 射击 ============ */
function doGarrison(u){
  const b=u.garrisonTo;
  u._garrisoning=false; u.garrisonTo=null;
  if(!b || !b.alive || !canGarrisonBuild(b, u.team, u.type)){ u.order={kind:'none'}; return; }
  if(b.def.garrisonTypes.includes(u.type)) b.garrison.push(u);
  else b.garrisonTank=u;
  if(b._origTeam===null) b._origTeam = (b.team<0 ? -1 : b.team);
  b.team = u.team;   // 进驻后自动归属该方
  units = units.filter(s=>s!==u);
  if(selected.includes(u)) selected=selected.filter(s=>s!==u);
  textPopup(b.x,b.y-20, u.def.name+' 已进驻','#8aff8a');
  updatePanel();
}
function garrisonUnitCount(b){
  return (b.garrison ? b.garrison.length : 0) + (b.garrisonTank ? 1 : 0);
}
function releaseGarrison(b){
  if(!b || !(b instanceof Building) || !b.alive) return 0;
  const team = b.team;
  const all = b.garrison.slice();
  if(b.garrisonTank) all.push(b.garrisonTank);
  const pts = formationTargets(b.x, b.y, all.length ? all : [{}]);
  const out=[];
  for(let i=0;i<all.length;i++){
    const c=all[i];
    const pt=(pts && pts[Math.min(i,pts.length-1)]) || {x:b.x,y:b.y};
    const np=nearestLand(pt.x, pt.y);
    if(np){
      const u=new Unit(c.type, team, np.x, np.y);
      u.hp=Math.min(u.maxHp, c.hp);
      if(c.shield>0) u.shield=c.shield;
      out.push(u);
      effects.push(new Effect(u.x,u.y,'ring',18));
    }
  }
  b.garrison=[];
  b.garrisonTank=null;
  if(out.length) units.push(...out);
  if(b._origTeam!==null) b.team = b._origTeam;   // 释放后变回原样(中立)
  b._origTeam=null;
  textPopup(b.x,b.y-18,'已释放 '+out.length+' 个单位','#8aff8a');
  updatePanel();
  return out.length;
}
function projSpeedFor(type){
  if(type==='magnet') return 1400;
  if(type==='tank'||type==='destroyer') return 400;
  if(type==='infantry') return 430;
  if(type==='transport') return 520;
  return 420;
}
// 进驻建筑自动向外射击:用进驻单位的武器,射程=该单位射程+20
function updateGarrisonAttack(b, dt){
  b.fireT -= dt;
  let range=0;
  for(const uu of b.garrison) if(uu && uu.def) range=Math.max(range, uu.def.range);
  if(b.garrisonTank && b.garrisonTank.def) range=Math.max(range, b.garrisonTank.def.range);
  range += 20;
  if(!b.turretTarget || !b.turretTarget.hp || b.turretTarget.hp<=0 || !isEnemy(b.team,b.turretTarget.team) || dist(b,b.turretTarget)>range*1.3){
    b.turretTarget=null;
    let best=null,bd=1e9;
    const cand=gridCollect(b.x, b.y, range);
    for(let c=0;c<cand.length;c++){
      const u=units[cand[c]];
      if(u.hp<=0 || !isEnemy(b.team,u.team)) continue;
      const d=dist(b,u);
      if(d<=range && d<bd){ bd=d; best=u; }
    }
    b.turretTarget=best;
  }
  if(b.turretTarget && b.fireT<=0){
    b.fireT=0.4;   // 进驻单位齐射间隔
    const tt=b.turretTarget;
    for(const uu of b.garrison){
      if(!uu || !uu.def) continue;
      if(dist(b,tt) <= uu.def.range+20){
        projectiles.push(new Projectile(b.x,b.y-b.h*TILE/2, tt.x,tt.y, tt, uu.def.damage, b.team, projSpeedFor(uu.type), uu, uu.def.proj));
      }
    }
    if(b.garrisonTank && b.garrisonTank.def && dist(b,tt)<=b.garrisonTank.def.range+20){
      projectiles.push(new Projectile(b.x,b.y-b.h*TILE/2, tt.x,tt.y, tt, b.garrisonTank.def.damage, b.team, projSpeedFor(b.garrisonTank.type), b.garrisonTank, b.garrisonTank.def.proj));
    }
  }
}
function doBoard(u){
  const t=u.boardTo;
  u._boarded=false; u.boardTo=null;
  if(!t || t.hp<=0 || !units.includes(t)){ u.order={kind:'none'}; return; }
  if(transportCost(u) > (t.capacity - usedCapacity(t))){ u.order={kind:'none'}; return; }  // 已满,停在原地
  // 从场上移除,进入运输艇舱内(保留对象引用以便卸载时恢复属性)
  t.cargoUnits.push(u);
  units = units.filter(s=>s!==u);
  if(selected.includes(u)) selected=selected.filter(s=>s!==u);
  textPopup(t.x,t.y-18, u.def.name+' 已'+(t.type==='transport'?'上船':'登车'),'#8aff8a');
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
      if(t._aiTransport) u._aiUnloaded = true;   // 标记:AI 运输艇卸载的部队,抢滩后不再重新装船
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
// 手动卸载:玩家点按钮,在运兵车当前位置释放部队
function manualUnload(t){
  if(!t || !isCarrier(t) || !t.cargoUnits || !t.cargoUnits.length) return;
  unloadTransport(t, {x:t.x, y:t.y});
}
