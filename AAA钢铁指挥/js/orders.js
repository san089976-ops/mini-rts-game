"use strict";
/* ============ orders.js: 指令与选择 ============ */
// 批量移动阵型:以目标点为中心生成圆环阵,避免所有单位挤向同一个坐标
// 环间距按单位碰撞箱自适应(必须 >= 碰撞箱尺寸,否则刚性碰撞会互相顶住死锁)
function formationTargets(x, y, list){
  const pts=[];
  const count=list.length;
  if(count<=1){ pts.push({x,y}); return pts; }
  let spacing=26;
  for(const u of list){ if(u){ spacing=Math.max(spacing, (u.hw||10)+(u.hh||10)+4); } }
  let placed=0, ring=0;
  while(placed<count){
    if(ring===0){
      pts.push({x,y}); placed++; ring++;
      continue;
    }
    const r=spacing*ring;
    const nSlot=Math.min(ring*6, count-placed);
    const off=(ring%2) ? Math.PI/nSlot : 0;   // 偶数环错位,让相邻环不重叠
    for(let s=0;s<nSlot;s++){
      const ang=(s/nSlot)*Math.PI*2+off;
      pts.push({ x:x+Math.cos(ang)*r, y:y+Math.sin(ang)*r });
      placed++;
    }
    ring++;
  }
  return pts;
}
function orderMove(list, x, y){
  // 目标是一艘(友方/同盟)运兵车(运输艇/步兵战车):可装载的单位改为"登车"指令
  const tgt=entityAt(x,y);
  const isLoadTarget = tgt && tgt instanceof Unit && isCarrier(tgt) && !isEnemy((list[0]||{team:tgt.team}).team, tgt.team);
  const boarders = isLoadTarget ? list.filter(u=>canBoardUnit(tgt,u) && !isEnemy(u.team,tgt.team)) : [];
  const movers = list.filter(u=>!boarders.includes(u));
  for(const u of boarders){
    u.target=null; u.order={kind:'load', transport:tgt}; u.path=null;
  }
  if(boarders.length) textPopup(tgt.x,tgt.y-18, tgt.type==='transport' ? '登艇 '+boarders.length+' 个单位' : '登车 '+boarders.length+' 个单位','#8aff8a');
  // 其余单位正常移动(运输艇/海军等),不递归避免死循环
  const targets = movers.length>1 ? formationTargets(x,y,movers) : null;
  for(let i=0;i<movers.length;i++){
    const u=movers[i];
    const tx = targets ? targets[i].x : x;
    const ty = targets ? targets[i].y : y;
    u.target=null;
    u.prevOrder=null;                 // 清掉旧指令,避免战斗后"跑回旧位置"
    u._lastMoveCmd=time;              // 记录移动指令时间:刚拉走的单位 1.5 秒内不被拉回战斗
    if(u.type==='harvester'){ u.mode='mine'; u.oreTarget=null; }
    u.order={kind:'move', x:tx, y:ty};
    const p=pathFor(u,u.x,u.y,tx,ty);
    u.path=p; u.pathIdx=0; u.repathT=1.0;
  }
}
function orderAttack(list, enemy, force){
  for(const u of list){
    if(u.def.range<=0) continue;
    u.target = enemy;                                // 关键:攻击目标必须写入 u.target(全局攻击判断都读它)
    u._lineT = RED_LINE_TIME;                        // 攻击指示红线:短暂显示后消失
    u.order={kind:'attack', target:enemy, force:!!force}; u.path=null;
  }
}
// 攻击移动:朝目标点移动,途中攻击遇到的敌人(不打断移动)
function orderAttackMove(list, x, y){
  const targets = list.length>1 ? formationTargets(x,y,list) : null;
  for(let i=0;i<list.length;i++){
    const u=list[i];
    const tx = targets ? targets[i].x : x;
    const ty = targets ? targets[i].y : y;
    u.target=null;
    u.order={kind:'move', x:tx, y:ty, x2:true};
    u.path=pathFor(u,u.x,u.y,tx,ty); u.pathIdx=0; u.repathT=1.0;
  }
}

/* ================= 进驻(中立/己方可进驻建筑) ================= */
function canGarrisonType(b, u){
  if(!b || !b.def || !u) return false;
  if(b.def.garrisonTypes && b.def.garrisonTypes.includes(u.type)) return true;
  if(b.def.tankSlot && (u.type==='tank'||u.type==='abrams'||u.type==='t90')) return true;
  return false;
}
// 是否还能进驻:中立或己方、且有对应类型的空位
function canGarrisonBuild(b, unitTeam, type){
  if(!b || !b.alive || !b.def || !b.def.garrisonCap) return false;
  if(b.team>=0 && b.team!==unitTeam) return false;
  const isInf = b.def.garrisonTypes.includes(type);
  if(isInf) return b.garrison.length < b.def.garrisonCap;
  if(b.def.tankSlot && (type==='tank'||type==='abrams'||type==='t90')) return !b.garrisonTank;
  return false;
}

/* ================= 鼠标世界坐标 ================= */
function mouseWorld(){
  return { x: mouse.x + cam.x, y: mouse.y + cam.y };
}
function entityAt(wx,wy){
  for(let i=units.length-1;i>=0;i--){ const u=units[i]; if(Math.hypot(u.x-wx,u.y-wy)<=Math.max(u.r+8, (u.hw||u.r)+4)) return u; }
  for(let i=buildings.length-1;i>=0;i--){ const b=buildings[i]; if(b.alive&&wx>=b.tx*TILE&&wy>=b.ty*TILE&&wx<(b.tx+b.w)*TILE&&wy<(b.ty+b.h)*TILE) return b; }
  return null;
}
function buildingAt(wx,wy){
  for(let i=buildings.length-1;i>=0;i--){
    const b=buildings[i];
    if(b.alive && wx>=b.tx*TILE && wy>=b.ty*TILE && wx<(b.tx+b.w)*TILE && wy<(b.ty+b.h)*TILE) return b;
  }
  return null;
}
function oreAt(wx,wy){
  let best=null,bd=48;
  for(const o of oreFields){
    if(o.amount<=0) continue;
    const d=Math.hypot(o.x-wx,o.y-wy);
    if(d<bd){ bd=d; best=o; }
  }
  return best;
}

function centerOn(x,y){
  cam.x = clamp(x - viewW()/2, 0, W-viewW());
  cam.y = clamp(y - viewH()/2, 0, H-viewH());
}
function giveOrder(ctrl){
  if(placing) return;
  const mw=mouseWorld();
  const list = selected.length? selected : [];
  // 强制攻击(Ctrl+右键):对任意目标强制攻击;点空地=攻击移动
  if(ctrl){
    if(!list.length) return;
    const forceTarget = entityAt(mw.x, mw.y);
    if(forceTarget){
      orderAttack(list, forceTarget, true);
      if(list.length) textPopup(list[0].x,list[0].y-20,'强制攻击 '+(forceTarget.defName||forceTarget.def.name||forceTarget.type),'#ffb0b0');
    } else {
      orderAttackMove(list, mw.x, mw.y);
      if(list.length) textPopup(list[0].x,list[0].y-20,'攻击移动','#ffb0b0');
    }
    return;
  }
  // 选中己方生产建筑且无单位选中 -> 右键设置集结点
  // 建造厂升级后才能生产机场建筑车,未升级时不设集结点
  if(!list.length && selBuilding && selBuilding.team===TEAM_A && selBuilding.alive && !selBuilding.constructing &&
     selBuilding.def.train && selBuilding.def.train.length &&
     !(selBuilding.defName==='command' && !selBuilding.upgraded)){
    selBuilding.rally = {x:mw.x, y:mw.y};
    textPopup(mw.x,mw.y-12,'集结点已设置','#8aff8a');
    return;
  }
  if(!list.length && !selBuilding) return;
  const enemy = entityAt(mw.x, mw.y);
  // 进驻:右键中立/己方的可进驻建筑 -> 步兵/坦克进入;无可进驻单位则交给下方攻击/移动
  if(enemy && enemy instanceof Building && enemy.alive && enemy.def.garrisonCap){
    const boarders = list.filter(u=>canGarrisonBuild(enemy,u.team,u.type));
    if(boarders.length){
      for(const u of boarders){ u.target=null; u.order={kind:'garrison', target:enemy}; u.path=null; }
      const rest = list.filter(u=>!boarders.includes(u));
      if(rest.length) orderMove(rest, mw.x, mw.y);
      textPopup(enemy.x, enemy.y-18, '进驻 '+boarders.length+' 个单位', '#8aff8a');
      return;
    }
  }
  // 右键己方/同盟运兵车(运输艇/步兵战车) -> 其它地面单位登车
  if(enemy && enemy instanceof Unit && isCarrier(enemy) && !isEnemy((list[0]||{team:enemy.team}).team, enemy.team)){
    const boarders = list.filter(u=>canBoardUnit(enemy,u) && !isEnemy(u.team,enemy.team));
    const rest = list.filter(u=>u!==enemy && !boarders.includes(u));
    for(const u of boarders){ u.target=null; u.order={kind:'load', transport:enemy}; u.path=null; }
    if(rest.length) orderMove(rest, mw.x, mw.y);
    if(boarders.length) textPopup(enemy.x,enemy.y-18, enemy.type==='transport' ? '登艇 '+boarders.length+' 个单位' : '登车 '+boarders.length+' 个单位','#8aff8a');
    return;
  }
  // 运输艇:右键地面/目标 -> 移动 + 到达后卸载
  const transports = list.filter(u=>u.type==='transport');
  let remaining = list;
  if(transports.length){
    for(const t of transports){
      t.target=null;
      t.order={kind:'move', x:mw.x, y:mw.y};
      t.path=pathFor(t,t.x,t.y,mw.x,mw.y);
      t.unloadAt=null;   // 不自动卸载,玩家手动释放
    }
    remaining = list.filter(u=>u.type!=='transport');
    if(!remaining.length){
      textPopup(mw.x,mw.y-12,'移动','#8aff8a');
      return;
    }
  }
  // 采矿车特殊指令:右键矿场=采指定矿;右键己方精炼厂/建造厂=倒矿
  const harvesters = remaining.filter(u=>u.type==='harvester');
  const others = remaining.filter(u=>u.type!=='harvester');
  if(harvesters.length){
    const ore = oreAt(mw.x, mw.y);
    if(ore){
      for(const u of harvesters){
        u.target=null; u.oreTarget=ore; u.mode='mine'; u.order={kind:'mine'}; u.path=null;
      }
      if(others.length) orderMove(others, mw.x, mw.y);
      textPopup(mw.x,mw.y-12,'采集金矿','#ffe27a');
      return;
    }
    if(enemy && enemy instanceof Building && enemy.alive && enemy.team===TEAM_A && (enemy.defName==='refinery'||enemy.defName==='command')){
      for(const u of harvesters){
        u.target=null; u.refinery=enemy; u.mode='return'; u.order={kind:'return'}; u.path=null;
      }
      if(others.length) orderMove(others, mw.x, mw.y);
      textPopup(mw.x,mw.y-12,'倒矿至 '+enemy.def.name,'#ffe27a');
      return;
    }
  }
  // 攻击判定:右键点中敌人 -> 攻击并显示红线;若点击没精确命中敌人,
  // 则在点击处附近(约1.5格)找最近敌人判定为攻击,让右键攻击更可靠
  const selTeam = (remaining[0]||selBuilding||{team:0}).team;
  let atkTarget = enemy;
  if(!(atkTarget && atkTarget.alive!==false && isEnemy(selTeam, atkTarget.team))){
    let best=null, bd=48;
    for(const u of units){
      if(u.hp<=0) continue;
      const d=Math.hypot(u.x-mw.x, u.y-mw.y);
      if(d<bd && isEnemy(selTeam, u.team)){ bd=d; best=u; }
    }
    for(const b of buildings){
      if(!b.alive) continue;
      const d=Math.hypot(b.x-mw.x, b.y-mw.y);
      if(d<bd && isEnemy(selTeam, b.team)){ bd=d; best=b; }
    }
    if(best) atkTarget=best;
  }
  if(atkTarget && atkTarget.alive!==false && isEnemy(selTeam, atkTarget.team)){
    // 攻击(采矿车/运输艇不参与主动攻击)
    const attackers = remaining.filter(u=>u.type!=='harvester' && u.type!=='transport');
    orderAttack(attackers, atkTarget);
    if(attackers.length) textPopup(attackers[0].x,attackers[0].y-20,'攻击 '+(atkTarget.defName||atkTarget.def.name||atkTarget.type),'#ffb0b0');
  } else if(remaining.length){
    orderMove(remaining, mw.x, mw.y);
  }
}
function selectAllCombat(){
  selected=[]; selBuilding=null;
  for(const u of units) if(u.team===TEAM_A && u.def.range>0) selected.push(u);
  updatePanel();
}
let lastGroup={idx:0, t:0};
// 按数字键:选中对应编队(存活单位);快速连按两次=视角跳到该编队
function recallGroup(idx){
  const g=controlGroups[idx];
  if(!g || !g.length) return;
  const alive=g.filter(u=>u.hp>0 && units.includes(u));
  controlGroups[idx]=alive;
  if(!alive.length){ selected=[]; updatePanel(); return; }
  selected=alive; selBuilding=null;
  const now=performance.now();
  if(lastGroup.idx===idx && now-lastGroup.t<400){
    let cx=0,cy=0;
    for(const u of alive){ cx+=u.x; cy+=u.y; }
    centerOn(cx/alive.length, cy/alive.length);
  }
  lastGroup.idx=idx; lastGroup.t=now;
  updatePanel();
}
function clickSelect(px,py){
  const wm = worldFromScreen(px,py);
  const ent = entityAt(wm.x, wm.y);
  const add = keys['ShiftLeft']||keys['ShiftRight'];
  if(ent && (ent.team===TEAM_A || (ent instanceof Building && ent.team<0))){
    if(ent instanceof Building){
      if(!add){ selBuilding=ent; selected=[]; }
    } else {
      if(add){ if(!selected.includes(ent)) selected.push(ent); }
      else { selected=[ent]; selBuilding=null; }
    }
  } else {
    if(!add){ selected=[]; selBuilding=null; }
  }
  updatePanel();
}
function worldFromScreen(px,py){
  const r=canvas.getBoundingClientRect();
  return { x:(px-r.left)+cam.x, y:(py-r.top)+cam.y };
}
function boxSelect(x0,y0,x1,y1){
  const w0=worldFromScreen(x0,y0), w1=worldFromScreen(x1,y1);
  const minX=Math.min(w0.x,w1.x),minY=Math.min(w0.y,w1.y),maxX=Math.max(w0.x,w1.x),maxY=Math.max(w0.y,w1.y);
  if(maxX-minX<6 && maxY-minY<6){ clickSelect(x1,y1); return; }
  const add=keys['ShiftLeft']||keys['ShiftRight'];
  if(!add){ selected=[]; selBuilding=null; }
  for(const u of units){
    if(u.team!==TEAM_A) continue;
    if(u.x>=minX&&u.x<=maxX&&u.y>=minY&&u.y<=maxY && !selected.includes(u)) selected.push(u);
  }
  updatePanel();
}
