"use strict";
/* ============ build.js: 建造/生产 ============ */
function canBuild(team, defName){
  const d = BLD_DEFS[defName];
  if(d.cost > credits[team]) return false;
  // 必须有一个可建造的建筑
  return buildings.some(b => b.team===team && b.alive && !b.constructing && b.def.build && b.def.build.includes(defName));
}
function canTrain(team, type){
  const d = getUnitDefs(unitFactionOf(team))[type];
  if(!d || d.cost > credits[team]) return false;
  // 高级单位:必须由已升级的战车工厂生产
  if(type==='abrams' || type==='t90' || type==='mcv'){
    return buildings.some(b => b.team===team && b.alive && !b.constructing && b.defName==='factory' && b.upgraded && !b.upgrading);
  }
  // 高级步兵:必须由已升级的兵营训练
  if(type==='exo' || type==='magnet'){
    return buildings.some(b => b.team===team && b.alive && !b.constructing && b.defName==='barracks' && b.upgraded && !b.upgrading);
  }
  return buildings.some(b => b.team===team && b.alive && !b.constructing && b.def.train && b.def.train.includes(type));
}
function advancedTankType(team){
  return unitFactionOf(team)==='allies' ? 'abrams' : 't90';
}
function startUpgrade(b){
  if(!b || b.defName!=='factory' || b.constructing || b.upgrading || b.upgraded) return;
  if(credits[b.team] < FACTORY_UPGRADE_COST){
    textPopup(b.x,b.y-20,'资金不足','#ff8080');
    return;
  }
  credits[b.team] -= FACTORY_UPGRADE_COST;
  b.upgrading = true; b.upgradeProg = 0;
  textPopup(b.x,b.y-20,'战车工厂升级中','#ffe27a');
  updatePanel();
}
function startPowerUpgrade(b){
  if(!b || b.defName!=='power' || b.constructing || b.powerLevel>=POWER_MAX_LEVEL || b.pwrUpgrading) return;
  if(credits[b.team] < POWER_UPGRADE_COST){
    textPopup(b.x,b.y-20,'资金不足','#ff8080');
    return;
  }
  credits[b.team] -= POWER_UPGRADE_COST;
  b.pwrUpgrading = true; b.pwrUpgradeProg = 0;
  textPopup(b.x,b.y-20,'发电厂升级中','#ffe27a');
  updatePanel();
}
function startBarracksUpgrade(b){
  if(!b || b.defName!=='barracks' || b.constructing || b.upgrading || b.upgraded) return;
  if(credits[b.team] < BARRAX_UPGRADE_COST){
    textPopup(b.x,b.y-20,'资金不足','#ff8080');
    return;
  }
  credits[b.team] -= BARRAX_UPGRADE_COST;
  b.upgrading = true; b.upgradeProg = 0;
  textPopup(b.x,b.y-20,'兵营升级中','#ffe27a');
  updatePanel();
}
/* ============ 实验室科技研究 ============ */
function startResearch(b, id){
  const def = RESEARCH_DEFS[id];
  if(!b || b.defName!=='lab' || b.constructing || b.researching) return;
  if(hasResearch(b.team, id)){ textPopup(b.x,b.y-20, def.name+' 已完成','#9fc0ac'); return; }
  if(credits[b.team] < def.cost){ textPopup(b.x,b.y-20,'资金不足','#ff8080'); return; }
  credits[b.team] -= def.cost;
  b.researching = { id, progress:0 };
  textPopup(b.x,b.y-20, def.name+' 研究中','#ffe27a');
  updatePanel();
}
function onResearchComplete(team, id){
  if(id==='advTurret'){
    // 高级炮台:现有碉堡血量提升至1200,伤害提升至60
    for(const b of buildings){
      if(b.team===team && b.alive && b.defName==='turret'){
        const old=b.maxHp;
        b.maxHp=ADV_TURRET_HP;
        b.hp=Math.min(b.maxHp, b.hp+(ADV_TURRET_HP-old));
        b.damage=ADV_TURRET_DMG;
      }
    }
  } else if(id==='reactiveArmor'){
    // 反应装甲:现有T90获得护盾
    for(const u of units){
      if(u.team===team && u.alive && u.type==='t90') u.shield=REACTIVE_SHIELD;
    }
  }
}
function powerOf(team){
  let give=0, use=0;
  for(const b of buildings){ if(b.team===team && b.alive){ give+=b.powerGive; use+=b.powerUse; } }
  return { give, use };
}
function placeBuilding(team, defName, tx, ty){
  const d = BLD_DEFS[defName];
  // 没有存活的建造厂就不能建造其它建筑(展开基地车不受限,因为它自己就是建造厂)
  if(defName!=='command' && !buildings.some(b=>b.team===team && b.alive && b.defName==='command')) return null;
  credits[team] -= d.cost;
  const b = new Building(defName, team, tx, ty);
  buildings.push(b);
  markBlocked(b, true);
  return b;
}
function nearestOpenCellFor(u, cx, cy, used){
  const cxc=Math.floor(cx/TILE), cyc=Math.floor(cy/TILE);
  for(let r=1;r<=16;r++){
    for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
      const nx=cxc+dx, ny=cyc+dy;
      if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H) continue;
      const k=nx*MAP_W+ny;
      if(used && used.has(k)) continue;
      if(unitPassable(u,nx,ny)){
        if(used) used.add(k);
        return { x:nx*TILE+TILE/2, y:ny*TILE+TILE/2 };
      }
    }
  }
  return null;
}
// 建筑占下格子时,把原本站在格子内的单位强制移到最近开放空格,避免卡在建筑里
function ejectUnitsFromBuilding(b){
  if(!units) return;
  const used=new Set();
  for(const u of units){
    if(u.hp<=0) continue;
    const tx=Math.floor(u.x/TILE), ty=Math.floor(u.y/TILE);
    if(tx<b.tx || tx>=b.tx+b.w || ty<b.ty || ty>=b.ty+b.h) continue;
    const p=nearestOpenCellFor(u, u.x, u.y, used);
    if(p){
      u.x=p.x; u.y=p.y;
      u.path=null; u.pathIdx=0; u.repathT=0.2;
      u.vx=0; u.vy=0;
    }
  }
}
function markBlocked(b, on){
  for(let x=b.tx;x<b.tx+b.w;x++) for(let y=b.ty;y<b.ty+b.h;y++){
    if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H){ blocked[x][y] = on; structBlocked[x][y] = on; }
  }
  if(on) ejectUnitsFromBuilding(b);
}
function canPlaceAt(tx,ty,def,team){
  if(tx<0||ty<0||tx+def.w>MAP_W||ty+def.h>MAP_H) return false;
  for(let x=tx;x<tx+def.w;x++) for(let y=ty;y<ty+def.h;y++){
    // 金矿格不能建建筑(单位仍可通行)
    if(oreGrid[x] && oreGrid[x][y]) return false;
    if(def.water){
      // 船坞:整块必须落在水上,且未被建筑占用
      if(terrain[x][y]!=='water' || structBlocked[x][y]) return false;
    } else {
      if(blocked[x][y]) return false;
    }
  }
  // 船坞:整块落水 + 距离最近己方建筑 ≤ DOCK_BUILD_RANGE 格(贴近基地下海,不能随便乱修)
  if(def.water) return nearestOwnTileDist(tx,ty,def,team) <= DOCK_BUILD_RANGE;
  // 必须贴近己方已有建筑
  for(const b of buildings){
    if(b.team!==team||!b.alive) continue;
    if(Math.abs(b.tx - tx) <= b.w+3 && Math.abs(b.ty - ty) <= b.h+3) return true;
  }
  return false;
}
// 两个矩形(格坐标)之间的切比雪夫距离:0=相交/相邻边重合
function rectTileDist(x0,y0,x1,y1, a0,b0,a1,b1){
  const dx=(x1<a0)?(a0-x1):(a1<x0?(x0-a1):0);
  const dy=(y1<b0)?(b0-y1):(b1<y0?(y0-b1):0);
  return Math.max(dx,dy);
}
// 某建筑占地矩形与"最近己方建筑"的格子距离(用于船坞贴基地建造判定)
function nearestOwnTileDist(tx,ty,def,team){
  let best=1e9;
  for(const b of buildings){
    if(b.team!==team||!b.alive) continue;
    const d=rectTileDist(tx,ty,tx+def.w,ty+def.h, b.tx,b.ty,b.tx+b.w,b.ty+b.h);
    if(d<best) best=d;
  }
  return best;
}
function canDeployAt(tx, ty){
  const d=BLD_DEFS['command'];
  if(tx<0||ty<0||tx+d.w>MAP_W||ty+d.h>MAP_H) return false;
  for(let x=tx;x<tx+d.w;x++) for(let y=ty;y<ty+d.h;y++) if(blocked[x][y] || (oreGrid[x]&&oreGrid[x][y])) return false;
  return true;
}
function deployMCV(u){
  if(!u || u.type!=='mcv' || u.hp<=0) return;
  // 建造厂占地 3x3,以其所在格为中心展开
  const tx=Math.floor(u.x/TILE)-1, ty=Math.floor(u.y/TILE)-1;
  if(!canDeployAt(tx,ty)){
    textPopup(u.x,u.y-20,'此处无法展开(需要3x3空地)','#ff8080');
    return;
  }
  const b=placeBuilding(u.team,'command',tx,ty);
  units = units.filter(s=>s!==u); // 立即移除该单位
  if(selected.includes(u)) selected=selected.filter(s=>s!==u);
  textPopup(b.x,b.y-20,'基地车已展开','#8aff8a');
  effects.push(new Effect(b.x,b.y,'ring',26));
  updatePanel();
}
function spawnUnitNear(type, team, b){
  const d=getUnitDefs(unitFactionOf(team))[type];
  // 从建筑"下方那面"出:先取正下方一行,不足再向下/左右/上方回退
  const order=[];
  for(let dx=0;dx<b.w;dx++) order.push([b.tx+dx, b.ty+b.h]);          // 底部(正下方)
  for(let dx=0;dx<b.w;dx++) order.push([b.tx+dx, b.ty+b.h+1]);        // 再下一行
  for(let dy=0;dy<b.h;dy++){ order.push([b.tx+b.w, b.ty+dy]); order.push([b.tx-1, b.ty+dy]); }  // 左右
  for(let dx=0;dx<b.w;dx++) order.push([b.tx+dx, b.ty-1]);            // 上方
  let pick=null;
  if(d.naval){
    // 驱逐舰:在候选中挑"周围水面最开阔"的格(出生在船坞/岛屿旁的开阔水面,
    // 避免挤进窄缝导致刚造出来就卡在船坞边缘)
    let bestScore=-1;
    for(const [tx,ty] of order){
      if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) continue;
      if(structBlocked[tx][ty] || terrain[tx][ty]!=='water') continue;
      let score=0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=tx+dx, ny=ty+dy;
        if(nx>=0&&ny>=0&&nx<MAP_W&&ny<MAP_H && terrain[nx][ny]==='water' && !structBlocked[nx][ny]) score++;
      }
      if(score>bestScore){ bestScore=score; pick=[tx,ty]; }
    }
  } else {
    for(const [tx,ty] of order){
      if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) continue;
      if(structBlocked[tx][ty]) continue;
      if(d.amphib){
        if(terrain[tx][ty]==='water'||terrain[tx][ty]==='grass'){ pick=[tx,ty]; break; }  // 运输艇可上岸
      } else if(!blocked[tx][ty]){ pick=[tx,ty]; break; }
    }
  }
  if(pick){
    const [tx,ty]=pick;
    const u=new Unit(type,team,tx*TILE+TILE/2,ty*TILE+TILE/2);
    u.order={kind:'none'};
    units.push(u);
    effects.push(new Effect(u.x,u.y,'ring',20));
    return u;
  }
  return null;
}
function startPlace(defName){
  if(selling) setSelling(false);
  const d=BLD_DEFS[defName];
  if(!buildings.some(b=>b.team===TEAM_A && b.alive && b.defName==='command')){
    const deadCmd=buildings.find(b=>b.team===TEAM_A && b.defName==='command');
    if(deadCmd) textPopup(deadCmd.x,deadCmd.y-20,'建造厂已被摧毁,无法建造','#ff8080');
    return;
  }
  if(credits[TEAM_A] < d.cost){
    const cmd=buildings.find(b=>b.team===TEAM_A&&b.defName==='command'&&b.alive);
    if(cmd) textPopup(cmd.x,cmd.y-20,'资金不足','#ff8080');
    return;
  }
  placing={defName:defName, def:d, team:TEAM_A};
  updatePanel();
}
function tryPlaceForPlayer(defName){
  const d=BLD_DEFS[defName];
  if(credits[TEAM_A] < d.cost){
    const cmd=buildings.find(b=>b.team===TEAM_A&&b.defName==='command'&&b.alive);
    if(cmd) textPopup(cmd.x,cmd.y-20,'资金不足','#ff8080');
    return;
  }
  const own = buildings.filter(b=>b.team===TEAM_A && b.alive);
  if(!own.length) return;
  // 随机选一个己方建筑当锚点,在它旁边找空地
  let tries=[];
  for(let trial=0; trial<80 && tries.length<24; trial++){
    const anchor = own[Math.floor(Math.random()*own.length)];
    for(let a=0;a<16;a++){
      const ang=Math.random()*Math.PI*2;
      const rr=rnd(2,5);
      const tx=Math.floor(anchor.tx + Math.cos(ang)*rr + rnd(-1,1));
      const ty=Math.floor(anchor.ty + Math.sin(ang)*rr + rnd(-1,1));
      if(canPlaceAt(tx,ty,d,TEAM_A)) tries.push([tx,ty]);
    }
  }
  if(!tries.length){
    const home=buildings.find(b=>b.team===TEAM_A&&b.defName==='command'&&b.alive);
    if(home) textPopup(home.x,home.y-20,'没有空位放置 '+d.name,'#ff8080');
    return;
  }
  const [tx,ty]=tries[Math.floor(Math.random()*tries.length)];
  placeBuilding(TEAM_A, defName, tx, ty);
  textPopup(tx*TILE+d.w*TILE/2, ty*TILE-6, d.name+' 建造中','#ffe27a');
  updatePanel();
}
function tryTrain(defName){
  const d=getUnitDefs(playerFaction)[defName];
  if(!d) return;
  let bld = null;
  // 在哪里下订单就在哪里生产:优先排入当前选中的生产建筑(多兵营/多工厂时各自独立)
  if(selBuilding && selBuilding.team===TEAM_A && selBuilding.alive && !selBuilding.constructing){
    if(canProduceIn(selBuilding, defName)) bld = selBuilding;
  }
  if(!bld) bld = prodBuildingFor(TEAM_A, defName);
  if(!bld){
    const cmd=buildings.find(b=>b.team===TEAM_A&&b.defName==='command'&&b.alive);
    if(cmd) textPopup(cmd.x,cmd.y-20,'需要 '+d.name+' 的生产建筑','#ff8080');
    return;
  }
  if(credits[TEAM_A] < d.cost){ textPopup(bld.x,bld.y-20,'资金不足','#ff8080'); return; }
  credits[TEAM_A]-=d.cost; bld.queue.push({type:defName,progress:0});
  textPopup(bld.x,bld.y-24,d.name+' 已排队 x'+bld.queue.length,'#8aff8a');
  updatePanel();
}
// 该建筑能否生产该单位
function canProduceIn(b, defName){
  if(!b || !b.alive || b.constructing) return false;
  if(defName==='abrams' || defName==='t90' || defName==='mcv'){
    return b.defName==='factory' && b.upgraded && !b.upgrading;
  }
  if(defName==='exo' || defName==='magnet'){
    return b.defName==='barracks' && b.upgraded && !b.upgrading;
  }
  return b.def.train && b.def.train.includes(defName);
}
// 查找任意能生产该单位的建筑
function prodBuildingFor(team, defName){
  return buildings.find(b=>b.team===team && canProduceIn(b, defName));
}
function moveToRally(u, rally){
  u.order={kind:'move', x:rally.x, y:rally.y};
  u.path=pathFor(u,u.x,u.y,rally.x,rally.y); u.pathIdx=0; u.repathT=1.0;
}
// 取消制造:只取消队列末尾的一个单位并 100% 返还现金
function cancelProduction(b){
  if(!b || !(b instanceof Building) || !b.alive || b.team!==TEAM_A || !b.queue.length) return false;
  const it=b.queue.pop();
  const fac=unitFactionOf(b.team);
  const d=getUnitDefs(fac)[it.type];
  const refund=d?d.cost:0;
  credits[TEAM_A]+=refund;
  textPopup(b.x,b.y-20,'取消 '+(d?d.name:'单位')+' +$'+refund,'#ffe27a');
  updatePanel();
  return true;
}
function sellBuilding(ent){
  if(!ent || !(ent instanceof Building) || !ent.alive || ent.team!==TEAM_A) return false;
  if(ent.defName==='command'){ textPopup(ent.x,ent.y-20,'建造厂不可出售','#ffb0b0'); return false; }
  const refund=Math.floor(ent.def.cost * (ent.constructing ? 0.5 : 0.75));
  credits[TEAM_A]+=refund;
  textPopup(ent.x,ent.y-20,'出售 +$'+refund,'#ffe27a');
  markBlocked(ent,false);
  ent.alive=false;
  if(selected.includes(ent)) selected=selected.filter(s=>s!==ent);
  if(selBuilding===ent) selBuilding=null;
  buildings=buildings.filter(b=>b!==ent);
  effects.push(new Effect(ent.x,ent.y,'ring',18));
  updatePanel();
  return true;
}
