"use strict";
/* ============ orders.js: 指令与选择 ============ */
// 批量移动阵型:以目标点为中心生成圆环阵,避免所有单位挤向同一个坐标
function formationTargets(x, y, count){
  const pts=[];
  if(count<=1){ pts.push({x,y}); return pts; }
  const spacing=20;
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
  const targets = list.length>1 ? formationTargets(x,y,list.length) : null;
  for(let i=0;i<list.length;i++){
    const u=list[i];
    const tx = targets ? targets[i].x : x;
    const ty = targets ? targets[i].y : y;
    u.target=null;
    if(u.type==='harvester'){ u.mode='mine'; u.oreTarget=null; }
    u.order={kind:'move', x:tx, y:ty};
    const p=findPath(u.x,u.y,tx,ty);
    u.path=p; u.pathIdx=0; u.repathT=1.0;
  }
}
function orderAttack(list, enemy){
  for(const u of list){
    if(u.def.range<=0) continue;
    u.order={kind:'attack'}; u.target=enemy; u.path=null;
  }
}

/* ================= 鼠标世界坐标 ================= */
function mouseWorld(){
  return { x: mouse.x + cam.x, y: mouse.y + cam.y };
}
function entityAt(wx,wy){
  for(let i=units.length-1;i>=0;i--){ const u=units[i]; if(Math.hypot(u.x-wx,u.y-wy)<=u.r+4) return u; }
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
  cam.x = clamp(x - canvas.clientWidth/2, 0, W-canvas.clientWidth);
  cam.y = clamp(y - canvas.clientHeight/2, 0, H-canvas.clientHeight);
}
function giveOrder(){
  if(placing) return;
  const mw=mouseWorld();
  const list = selected.length? selected : [];
  // 选中己方生产建筑且无单位选中 -> 右键设置集结点
  if(!list.length && selBuilding && selBuilding.team===TEAM_A && selBuilding.alive && !selBuilding.constructing && selBuilding.def.train && selBuilding.def.train.length){
    selBuilding.rally = {x:mw.x, y:mw.y};
    textPopup(mw.x,mw.y-12,'集结点已设置','#8aff8a');
    return;
  }
  if(!list.length && !selBuilding) return;
  const enemy = entityAt(mw.x, mw.y);
  // 采矿车特殊指令:右键矿场=采指定矿;右键己方精炼厂/建造厂=倒矿
  const harvesters = list.filter(u=>u.type==='harvester');
  const others = list.filter(u=>u.type!=='harvester');
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
  if(enemy && isEnemy(list[0]?list[0].team:selBuilding.team, enemy.team) && !(enemy instanceof Building && !enemy.alive)){
    // 攻击(采矿车不攻击)
    orderAttack(list, enemy);
    if(list.length) textPopup(list[0].x,list[0].y-20,'攻击 '+(enemy.defName||enemy.def.name||enemy.type),'#ffb0b0');
  } else if(list.length){
    orderMove(list, mw.x, mw.y);
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
  if(ent && ent.team===TEAM_A){
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
