"use strict";
/* ============ ai.js: 电脑对手(每支电脑队伍独立运行) ============
   发展脚本(按时间线):
   阶段0  (0~10秒)   造 2 座发电厂,保证电力
   阶段1  (10~40秒)  造兵营,训练步兵至 5 名
   阶段2  (40~70秒)  造战车工厂,训练主战坦克至 4 辆 + 第2辆采矿车
   阶段3  (70~100秒) 造精炼厂 + 1 座碉堡防守基地
   阶段4  (100秒后)  补第2座战车工厂,坦克增至 6 辆,持续扩军
   进攻:兵力≥3 且计时到/基地受袭时,派主力进攻敌方基地;每波间隔约 30~40 秒
   防守:基地建筑被攻击时全军回防
================================================ */
function initAI(){
  aiState = {};
  for(let t=0;t<gameTeams.length;t++){
    if(gameTeams[t].ai){
      const diff = gameTeams[t].diff || 'easy';   // easy简单 / medium中等 / brutal残酷
      // 中等/残酷:建造计划中加入实验室,用于研发科技
      const plan = ['power','power','barracks','factory','refinery'];
      if(diff!=='easy') plan.push('lab');
      plan.push('turret');
      aiState[t] = {
        diff: diff,
        plan: plan,
        trainTargets: { infantry: 5, tank: 0, harvester: 2 },
        attackT: 45, idleB: 0,
        lastBaseX: 0, lastBaseY: 0,
        queueDepth: diff==='brutal' ? 3 : 2,
        advTank: advancedTankType(t),
        advInf: advancedInfantryType(t),
        built: {},
      };
    }
  }
}
function aiPlaceBuilding(team, defName){
  const d=BLD_DEFS[defName];
  if(credits[team] < d.cost) return false;
  const home = buildings.find(b=>b.team===team && b.defName==='command' && b.alive);
  if(!home) return false;
  const tries=[];
  outer:
  for(let r=3;r<=16;r+=2){
    for(let a=0;a<40;a++){
      const ang=Math.random()*Math.PI*2;
      const tx=Math.floor(home.tx + Math.cos(ang)*r + rnd(-2,2));
      const ty=Math.floor(home.ty + Math.sin(ang)*r + rnd(-2,2));
      if(canPlaceAt(tx,ty,d,team)){ tries.push([tx,ty]); if(tries.length>=24) break outer; }
    }
  }
  if(!tries.length) return false;
  const [tx,ty]=tries[Math.floor(Math.random()*tries.length)];
  placeBuilding(team, defName, tx, ty);
  const st=aiState[team];
  st.idleB=0;
  st.built[defName]=true;
  if(st.buildingCounts){
    const tc=st.buildingCounts[team] || (st.buildingCounts[team]={});
    tc[defName]=(tc[defName]||0)+1;
  }
  return true;
}
function aiHas(team, defName){
  const st=aiState[team];
  const c=st && st.buildingCounts && st.buildingCounts[team];
  if(c) return !!c[defName];
  return buildings.some(b=>b.team===team && b.defName===defName && b.alive);
}
function aiCount(team, defName){
  const st=aiState[team];
  const c=st && st.buildingCounts && st.buildingCounts[team];
  if(c) return c[defName]||0;
  return buildings.filter(b=>b.team===team && b.defName===defName && b.alive).length;
}
function refreshAIStats(team){
  const st=aiState[team];
  const buildingCounts = st.buildingCounts = {};
  const unitCounts = st.unitCounts = {};
  const queuedCounts = st.queuedCounts = {};
  st.combat = [];
  st.myBase = null;
  st.lastAttackT = -9999;
  let enemyCommand=null, enemyFallback=null, enemyFallbackD=1e9, playerCommand=null;
  for(const b of buildings){
    if(!b.alive) continue;
    if(b.team<0) continue;   // 中立建筑不算敌方基地目标
    const tc = buildingCounts[b.team] || (buildingCounts[b.team]={});
    tc[b.defName]=(tc[b.defName]||0)+1;
    if(b.team===team){
      if(b.defName==='command' && !st.myBase) st.myBase=b;
      if(b.lastAttackT>st.lastAttackT) st.lastAttackT=b.lastAttackT;
    }
    if(b.defName==='command' && b.team===TEAM_A && b.alive) playerCommand=b;
    if(b.team!==team && isEnemy(team,b.team)){
      if(b.defName==='command' && !enemyCommand) enemyCommand=b;
      const bx=st.myBase ? st.myBase.x : (st.lastBaseX!==undefined ? st.lastBaseX : W/2);
      const by=st.myBase ? st.myBase.y : (st.lastBaseY!==undefined ? st.lastBaseY : H/2);
      const d=Math.hypot(b.x-bx,b.y-by);
      if(d<enemyFallbackD){ enemyFallbackD=d; enemyFallback=b; }
    }
  }
  st.enemyBase = enemyCommand || enemyFallback;
  if(playerCommand && isEnemy(team,TEAM_A)) st.enemyBase=playerCommand;
  for(const u of units){
    if(u.hp<=0) continue;
    const uc = unitCounts[u.team] || (unitCounts[u.team]={});
    uc[u.type]=(uc[u.type]||0)+1;
    if(u.team===team && u.def.range>0 && u.type!=='harvester') st.combat.push(u);
  }
  for(const b of buildings){
    if(b.team!==team || !b.alive || !b.queue) continue;
    for(const q of b.queue) queuedCounts[q.type]=(queuedCounts[q.type]||0)+1;
  }
}
function updateAI(dt, team){
  const st=aiState[team];
  if(!st) return;
  refreshAIStats(team);
  const myBase = st.myBase;
  if(myBase){ st.lastBaseX=myBase.x; st.lastBaseY=myBase.y; }
  if(gameOver) return;
  const defs = st.unitDefs = getUnitDefs(unitFactionOf(team));
  const adv = st.advTank;
  const aInf = st.advInf;

  // 经济:基础收入 + 随时间增长 + 矿车收入(按难度加成:中等1.6x / 残酷2.3x)
  let inc = 12 + Math.min(38, time*0.35);
  if(st.diff==='medium') inc *= 1.6;
  else if(st.diff==='brutal') inc *= 2.3;
  credits[team] += dt * inc;

  // 生产目标随进度提升(残酷更强)
  const nFactory = aiCount(team,'factory');
  st.trainTargets.tank = nFactory>=2 ? 6 : (aiHas(team,'factory') ? 4 : 0);
  st.trainTargets.harvester = 2;
  st.trainTargets.infantry = time<50 ? 5 : 6;
  if(st.diff==='brutal'){
    st.trainTargets.tank = nFactory>=2 ? 9 : (aiHas(team,'factory') ? 5 : 0);
    st.trainTargets.infantry = 8;
  }

  // === 海战图专属:建船坞出驱逐舰 ===
  const isNaval = gameSetup && gameSetup.map && gameSetup.map.custom==='naval';
  if(isNaval){
    if(time>45 && !aiHas(team,'dock') && credits[team]>500) aiPlaceBuilding(team,'dock');
    st.trainTargets.destroyer = aiHas(team,'dock') ? 2 : 0;
    st.trainTargets.transport = aiHas(team,'dock') ? 2 : 0;
  }

  // === 中等/残酷:实验室科技研究(先经济后防御,再阵营专属) ===
  if(st.diff!=='easy'){
    // 实验室耗电 100,补一座发电厂保证电力
    if(time>40 && aiCount(team,'power')<3 && credits[team]>150) aiPlaceBuilding(team,'power');
    if(time>55 && !aiHas(team,'lab') && credits[team]>900) aiPlaceBuilding(team,'lab');
    const lab = buildings.find(b=>b.team===team && b.defName==='lab' && b.alive && !b.constructing && !b.researching);
    if(lab && credits[team]>=800){
      const order = ['oreRefine','advTurret','depletedUranium','reactiveArmor'];
      for(const id of order){
        const rd = RESEARCH_DEFS[id];
        if(!rd) continue;
        if(rd.faction && rd.faction!==unitFactionOf(team)) continue;   // 阵营专属过滤
        if(hasResearch(team,id)) continue;
        if(credits[team] >= rd.cost){ startResearch(lab, id); break; }
      }
    }
  }

  // === 发展路径:按计划建建筑 ===
  if(st.plan.length){
    const next=st.plan[0];
    const have=aiCount(team, next);
    const need = next==='power' ? 2 : 1;
    if(have >= need){ st.plan.shift(); }
    else if(canBuild(team, next)){
      if(!aiPlaceBuilding(team, next)){
        st.idleB += dt;
        if(st.idleB>6 && credits[team]>=100 && !aiHas(team,'power')) aiPlaceBuilding(team,'power');
      }
    }
  }
  // === 时间驱动的补建/扩建 ===
  if(time>30 && !aiHas(team,'refinery') && credits[team]>300) aiPlaceBuilding(team,'refinery');
  if(time>60 && !aiHas(team,'turret') && credits[team]>250) aiPlaceBuilding(team,'turret');
  if(time>90 && nFactory<2 && credits[team]>800) aiPlaceBuilding(team,'factory');
  if(time>120 && aiCount(team,'turret')<2 && credits[team]>250) aiPlaceBuilding(team,'turret');
  // 建筑被摧毁时重建
  if(!aiHas(team,'barracks') && credits[team]>150) aiPlaceBuilding(team,'barracks');
  if(!aiHas(team,'factory') && credits[team]>400) aiPlaceBuilding(team,'factory');
  if(!aiHas(team,'power') && credits[team]>100) aiPlaceBuilding(team,'power');
  if(st.built.refinery && !aiHas(team,'refinery') && credits[team]>300) aiPlaceBuilding(team,'refinery');
  if(st.built.turret && aiCount(team,'turret')<2 && credits[team]>250) aiPlaceBuilding(team,'turret');

  // === 训练 ===
  for(const b of buildings){
    if(b.team!==team||!b.alive||b.constructing) continue;
    if(b.queue.length>=st.queueDepth || !b.def.train) continue;
      for(const t of b.def.train){
        const cur=(st.unitCounts[team] ? (st.unitCounts[team][t]||0) : 0)+(st.queuedCounts[t]||0);
        if(cur < (st.trainTargets[t]||0) && canTrain(team,t)){
          credits[team]-=defs[t].cost;
          b.queue.push({type:t,progress:0});
          st.queuedCounts[t]=(st.queuedCounts[t]||0)+1;
          break;
        }
      }
  }

  // === 战车工厂升级与高级坦克 ===
  if(time>75){
    const fac = buildings.find(b=>b.team===team && b.defName==='factory' && b.alive && !b.constructing && !b.upgraded && !b.upgrading);
    if(fac && credits[team]>=FACTORY_UPGRADE_COST) startUpgrade(fac);
  }
  // 高级坦克:挑队列最短的已升级工厂,分散生产
  let upFac=null, bestQ=1e9;
  for(const b of buildings){
    if(b.team===team && b.defName==='factory' && b.alive && !b.constructing && b.upgraded && !b.upgrading){
      if(b.queue.length<bestQ){ bestQ=b.queue.length; upFac=b; }
    }
  }
  if(upFac && bestQ<st.queueDepth && canTrain(team, adv)){
    const cur=(st.unitCounts[team] ? (st.unitCounts[team][adv]||0) : 0)+(st.queuedCounts[adv]||0);
    if(cur < 2){
      credits[team]-=defs[adv].cost;
      upFac.queue.push({type:adv,progress:0});
      st.queuedCounts[adv]=(st.queuedCounts[adv]||0)+1;
    }
  }

  // === 兵营升级与高级步兵 ===
  if(time>70){
    const bar = buildings.find(b=>b.team===team && b.defName==='barracks' && b.alive && !b.constructing && !b.upgraded && !b.upgrading);
    if(bar && credits[team]>=BARRAX_UPGRADE_COST) startBarracksUpgrade(bar);
  }
  if(time>90){
    const upBar = buildings.find(b=>b.team===team && b.defName==='barracks' && b.alive && !b.constructing && b.upgraded && !b.upgrading);
    if(upBar && upBar.queue.length<st.queueDepth && canTrain(team, aInf)){
      const cur=(st.unitCounts[team] ? (st.unitCounts[team][aInf]||0) : 0)+(st.queuedCounts[aInf]||0);
      if(cur < 2){
        credits[team]-=defs[aInf].cost;
        upBar.queue.push({type:aInf,progress:0});
        st.queuedCounts[aInf]=(st.queuedCounts[aInf]||0)+1;
      }
    }
  }

  // === 进攻 / 防守 ===
  st.attackT -= dt;
  const combat = st.combat;
  // 敌方阵营的建造厂(优先玩家)
  const enemyBase = st.enemyBase;
  const attacked = time - st.lastAttackT < 8;
  if(isNaval){
    // 海战图:陆地单位过不了水,改由运输艇抢滩登陆,驱逐舰护航
    updateNavalAI(team, st, enemyBase, dt);
  } else {
    const minCombat = st.diff==='brutal' ? 2 : 3;   // 残酷兵力更少就开打
    const wantAttack = enemyBase && combat.length>=minCombat && (st.attackT<=0 || attacked);
    if(wantAttack){
      const target = attacked ? {x:st.lastBaseX,y:st.lastBaseY} : {x:enemyBase.x,y:enemyBase.y};
      const orderU=[];
      for(const u of combat){ if(u.order.kind!=='attack' || Math.random()<0.5) orderU.push(u); }
      if(orderU.length>=2){
        orderMove(orderU, target.x, target.y);
        // x2=true 表示打完路上遭遇的敌人后继续赶往目标地点
        for(const u of orderU) u.order.x2 = true;
        st.attackT = st.diff==='brutal' ? rnd(18,26) : (st.diff==='medium' ? rnd(24,33) : rnd(28,40));
      }
    }
  }
}
/* ============ 海战图:运输艇抢滩进攻 ============ */
// 陆地单位过不了水,由运输艇装船 -> 驶向敌方基地 -> 抵岸卸载 -> 地面部队进攻,
// 驱逐舰护航/压制。每次重新集结间隔 2 秒,避免每帧全图寻路。
function updateNavalAI(team, st, enemyBase, dt){
  if(!enemyBase) return;
  const tx=enemyBase.x, ty=enemyBase.y;
  const minCombat = st.diff==='brutal' ? 2 : 3;
  const transports = units.filter(u=>u.team===team && u.type==='transport' && u.hp>0);
  // 1) 装船:待命的空运输艇接收未登陆的地面战斗单位
  if(st.combat.length>=minCombat){
    for(const tr of transports){
      if(tr.cargoUnits.length>0 || tr._aiSail) continue;
      const need = tr.capacity - usedCapacity(tr);
      if(need<=0) continue;
      const riders = units.filter(u=>u.team===team && u.hp>0 && !u.naval && u.type!=='harvester' &&
        transportCost(u)>0 && !u._aiUnloaded && u.order.kind!=='load');
      let loaded=0;
      for(const r of riders){
        if(loaded>=need) break;
        r.target=null; r.order={kind:'load', transport:tr}; r.path=null;
        loaded+=transportCost(r);
      }
      if(loaded>0){ tr._aiTransport=true; tr._aiLoadT=0; }
    }
  }
  // 2) 航行 + 登陆
  for(const tr of transports){
    if(tr.cargoUnits.length>0 && !tr._aiSail){
      // 等已分配的乘客上齐或超时再出发,避免把小队拆散
      tr._aiLoadT=(tr._aiLoadT||0)+dt;
      const waiting = units.some(u=>u.team===team && u.order.kind==='load' && u.order.transport===tr);
      const full = usedCapacity(tr)>=tr.capacity;
      if(full || (!waiting && tr._aiLoadT>1) || tr._aiLoadT>4) tr._aiSail=true;
    }
    if(tr._aiSail && tr.cargoUnits.length>0){
      if(tr.order.kind!=='move' || tr.order.x!==tx || tr.order.y!==ty){
        tr.order={kind:'move', x:tx, y:ty};
        tr.path=pathFor(tr,tr.x,tr.y,tx,ty); tr.pathIdx=0; tr.repathT=1;
      }
      if(dist(tr,enemyBase)<=TILE*8){
        unloadTransport(tr, {x:tr.x, y:tr.y});
        tr._aiSail=true;   // 卸完立即返航,避免在敌岛岸边重新接客
      }
    } else if(tr._aiSail && tr.cargoUnits.length===0){
      // 卸完返航,回船坞再接下一批
      const home = buildings.find(b=>b.team===team && b.defName==='dock' && b.alive);
      if(home){
        if(tr.order.kind!=='move' || tr.order.x!==home.x || tr.order.y!==home.y){
          tr.order={kind:'move', x:home.x, y:home.y};
          tr.path=pathFor(tr,tr.x,tr.y,home.x,home.y); tr.pathIdx=0; tr.repathT=1;
        }
        if(dist(tr,home)<=TILE*6){ tr._aiSail=false; tr.order={kind:'none'}; tr.path=null; }
      }
    }
  }
  // 3) 已登陆部队与驱逐舰定期重新集结进攻(2 秒一次,避免每帧全图寻路)
  st._navalMoveT=(st._navalMoveT||0)-dt;
  if(st._navalMoveT<=0){
    const landed = units.filter(u=>u.team===team && u.hp>0 && !u.naval && u._aiUnloaded && u.def.range>0);
    if(landed.length){
      orderMove(landed, tx, ty);
      for(const u of landed) u.order.x2=true;
    }
    const navy = units.filter(u=>u.team===team && u.hp>0 && u.naval);
    if(navy.length){
      orderMove(navy, tx, ty);
      for(const u of navy) u.order.x2=true;
    }
    st._navalMoveT=2;
  }
}
