"use strict";
/* ============ input.js: 输入处理 ============ */
function setupInput(){
  mouse.edge={x:0,y:0};
  mouse.mmDown=false;
  canvas.addEventListener('mousedown', e=>{
    if(e.button===0){
      // 出售模式:点击己方建筑出售
      if(selling){
        const mw=mouseWorld();
        const b=buildingAt(mw.x,mw.y);
        if(b && b.team===TEAM_A && sellBuilding(b)) setSelling(false);
        return;
      }
      mouse.down=true; mouse.downX=e.clientX; mouse.downY=e.clientY; mouse.dragging=false;
      mouse.downOnCanvas=true;
      if(placing){
        const mw=mouseWorld();
        const d=placing.def;
        const tx=Math.floor(mw.x/TILE - d.w/2), ty=Math.floor(mw.y/TILE - d.h/2);
        if(canPlaceAt(tx,ty,d,placing.team) && credits[placing.team]>=d.cost){
          const b=placeBuilding(placing.team, placing.defName, tx, ty);
          if(b){
            textPopup(tx*TILE+d.w*TILE/2, ty*TILE-6, d.name+' 建造中', '#ffe27a');
            placing=null; updatePanel();
          } else {
            textPopup(mw.x,mw.y,'建造厂已被摧毁,无法建造', '#ff8080');
            placing=null; updatePanel();
          }
        } else if(!canPlaceAt(tx,ty,d,placing.team)){
          textPopup(mw.x,mw.y, d.water ? '船坞需建在距己方建筑8格内的水面' : '无法在此建造(需贴近己方建筑)', '#ff8080');
        } else {
          textPopup(mw.x,mw.y,'资金不足', '#ff8080');
        }
      }
    } else if(e.button===1){
      e.preventDefault();
      mouse.middleDown=true;
      mouse.midStartX=e.clientX; mouse.midStartY=e.clientY;
      mouse.midCamX=cam.x; mouse.midCamY=cam.y;
    } else if(e.button===2){
      if(selling){ setSelling(false); return; }
      giveOrder(e.ctrlKey);
    }
  });
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  window.addEventListener('mousemove', e=>{
    mouse.x=e.clientX; mouse.y=e.clientY;
    // 鼠标中键按住拖动地图
    if(mouse.middleDown){
      cam.x=clamp(mouse.midCamX - (e.clientX-mouse.midStartX), 0, W-viewW());
      cam.y=clamp(mouse.midCamY - (e.clientY-mouse.midStartY), 0, H-viewH());
    }
    if(mouse.down && !mouse.dragging && Math.hypot(e.clientX-mouse.downX,e.clientY-mouse.downY)>6) mouse.dragging=true;
    // 边缘滚动
    const m=28;
    mouse.edge={ x: e.clientX<m?-1:(e.clientX>window.innerWidth-m?1:0), y: e.clientY<m?-1:(e.clientY>window.innerHeight-m?1:0) };
  });
  window.addEventListener('mouseup', e=>{
    if(e.button===0){
      // 只有按下发生在画布上才做选择/框选,避免点 HUD 按钮后误清空选中
      if(mouse.downOnCanvas){
        if(mouse.dragging) boxSelect(mouse.downX, mouse.downY, e.clientX, e.clientY);
        else if(!placing) clickSelect(e.clientX, e.clientY);
      }
      mouse.down=false; mouse.dragging=false; mouse.downOnCanvas=false; mouse.mmDown=false;
    } else if(e.button===1){
      mouse.middleDown=false;
    }
  });
  window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='Escape'){
    if(planeMission){ airCancelMission(); }          // 先取消进行中的出击规划
    else if(paused){ resumeGame(); }
    else if(placing){ placing=null; updatePanel(); }
    else if(selling){ setSelling(false); }
    else { pauseGame(); }
    return;
  }
  if(paused) return;   // 暂停时忽略其它快捷键
  if(e.code==='Space'){ e.preventDefault(); const b=buildings.find(x=>x.team===TEAM_A&&x.defName==='command'&&x.alive); if(b) centerOn(b.x,b.y); }
  if(e.code==='Tab' && !e.ctrlKey && !e.altKey && !e.metaKey){ e.preventDefault(); selectAllCombat(); }
  // E:选中基地车展开建造厂;选中机场建筑车展开机场(否则落到下方建造快捷键=战车工厂)
  if(e.code==='KeyE'){
    const mcvSel=selected.find(u=>u.type==='mcv');
    if(mcvSel){ deployMCV(mcvSel); return; }
    const airSel=selected.find(u=>u.type==='airfield_car');
    if(airSel){ deployAirfieldCar(airSel); return; }
  }
  // QWERTYUI:直接建造建筑(发电厂/兵营/战车工厂/精炼厂/碉堡/维修厂/实验室/船坞)
  const BUILD_KEYS={ KeyQ:'power', KeyW:'barracks', KeyE:'factory', KeyR:'refinery', KeyT:'turret', KeyY:'repair', KeyU:'lab', KeyI:'dock' };
  if(BUILD_KEYS[e.code]){
    e.preventDefault();
    const dn=BUILD_KEYS[e.code];
    if(dn) startPlace(dn);
    return;
  }
  // 编队: Ctrl+1~9 给当前选中部队编队;单独按 1~9 选中对应编队(重复按 Ctrl+数字 重新编队)
  const numMatch = /^(Digit|Numpad)([1-9])$/.exec(e.code);
  if(numMatch){
    e.preventDefault();
    const idx=parseInt(numMatch[2],10);
    if(e.ctrlKey) controlGroups[idx]=selected.slice();
    else recallGroup(idx);
  }
  });
  window.addEventListener('keyup', e=>keys[e.code]=false);
  // 小地图点击(等比包含缩放,点击位置换算回世界坐标)
  function mmClickPos(ev, r){
    const mmw=mmCv.width, mmh=mmCv.height;
    const s=Math.min(mmw/W, mmh/H);
    const ox=(mmw-W*s)/2, oy=(mmh-H*s)/2;
    const cx=(ev.clientX-r.left)/r.width*mmw, cy=(ev.clientY-r.top)/r.height*mmh;
    return { x:(cx-ox)/s, y:(cy-oy)/s };
  }
  mmCv.addEventListener('mousedown', e=>{
    if(e.button!==0) return;
    e.preventDefault();
    mouse.mmDown=true;
    const r=mmRect || mmCv.getBoundingClientRect();
    const p=mmClickPos(e,r);
    centerOn(p.x, p.y);
  });
  mmCv.addEventListener('mousemove', e=>{
    if(mouse.mmDown){
      const r=mmRect || mmCv.getBoundingClientRect();
      const p=mmClickPos(e,r);
      centerOn(p.x, p.y);
    }
  });
  // 出售按钮
  document.getElementById('sellBtn').addEventListener('click', ()=>setSelling(!selling));
  // 事件委托:面板/选择信息会定时重建,监听固定容器 + 按下即触发,保证点击不丢失
  const panelEl=document.getElementById('panel');
  panelEl.addEventListener('mousedown', e=>{
    if(e.button!==0) return;
    e.preventDefault();
    const btn=e.target.closest('.btn');
    if(!btn) return;
    const act=btn.dataset.action;
    if(act==='build') startPlace(btn.dataset.def);
    else if(act==='train') tryTrain(btn.dataset.def);
    else if(act==='cancel'){ placing=null; updatePanel(); }
    else if(act==='upgrade') startUpgrade(selBuilding);
    else if(act==='cmdUp') startCommandUpgrade(selBuilding);
    else if(act==='pwrUp') startPowerUpgrade(selBuilding);
    else if(act==='barrackUp') startBarracksUpgrade(selBuilding);
    else if(act==='research'){ if(selBuilding) startResearch(selBuilding, btn.dataset.def); }
    else if(act==='cancelprod'){ if(selBuilding) cancelProduction(selBuilding); }
    else if(act==='deploy'){ const u=selected[0]; if(u){ if(u.type==='airfield_car') deployAirfieldCar(u); else deployMCV(u); } }
    else if(act==='challUpgrade'){ const u=selected[0]; if(u) startChallUpgrade(u); }
    else if(act==='atgmUp'){ const u=selected[0]; if(u) startATGMAttach(u); }
    else if(act==='aaUp'){ const u=selected[0]; if(u) startAAUpgrade(u); }
    else if(act==='agUp'){ const u=selected[0]; if(u) startAGUpgrade(u); }
    else if(act==='radarUp'){ const u=selected[0]; if(u) startRadarUpgrade(u); }
    else if(act==='coatUp'){ const u=selected[0]; if(u) startCoatUpgrade(u); }
    else if(act==='modeAA'){ const u=selected[0]; if(u && u.radar && u.aa){ u.modeAA=(u.modeAA+1)%3; textPopup(u.x,u.y-20,'1号位 '+airAAName(u)+': '+AIR_MODE_NAME[u.modeAA],'#8aff8a'); updatePanel(); } }
    else if(act==='modeAG'){ const u=selected[0]; if(u && u.radar && u.ag){ u.modeAG=(u.modeAG+1)%3; textPopup(u.x,u.y-20,'2号位 '+airAGName(u)+': '+AIR_MODE_NAME[u.modeAG],'#8aff8a'); updatePanel(); } }
    else if(act==='rarmUp'){ const u=selected[0]; if(u) startRarmUpgrade(u); }
    else if(act==='irUp'){ const u=selected[0]; if(u) startIRUpgrade(u); }
    else if(act==='irToggle'){ const u=selected[0]; if(u && u.ir){ u.irOn=!u.irOn; textPopup(u.x,u.y-20, u.irOn?'红外干扰 开启':'红外干扰 关闭', u.irOn?'#8aff8a':'#ffd0d0'); updatePanel(); } }
    else if(act==='apsUp'){ const u=selected[0]; if(u) startAPSUpgrade(u); }
    else if(act==='apsToggle'){ const u=selected[0]; if(u && u.aps){ u.apsOn=!u.apsOn; textPopup(u.x,u.y-20, u.apsOn?'自主防御 开启':'自主防御 关闭', u.apsOn?'#8aff8a':'#ffd0d0'); updatePanel(); } }
    else if(act==='release'){ if(selBuilding) releaseGarrison(selBuilding); }
    else if(act==='releaseAir'){ if(selBuilding) releaseAircraft(selBuilding); }
    else if(act==='unload'){ const t=selected.find(u=>isCarrier(u)); if(t) manualUnload(t); }
    else if(act==='selectall') selectAllCombat();
  });
}
