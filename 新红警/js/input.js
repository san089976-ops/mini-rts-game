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
    } else if(e.button===2){
      if(selling){ setSelling(false); return; }
      giveOrder();
    }
  });
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  window.addEventListener('mousemove', e=>{
    mouse.x=e.clientX; mouse.y=e.clientY;
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
    }
  });
  window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='Escape'){
    if(paused){ resumeGame(); }
    else if(placing){ placing=null; updatePanel(); }
    else if(selling){ setSelling(false); }
    else { pauseGame(); }
    return;
  }
  if(paused) return;   // 暂停时忽略其它快捷键
  if(e.code==='Space'){ e.preventDefault(); const b=buildings.find(x=>x.team===TEAM_A&&x.defName==='command'&&x.alive); if(b) centerOn(b.x,b.y); }
  if(e.code==='Tab' && !e.ctrlKey && !e.altKey && !e.metaKey){ e.preventDefault(); selectAllCombat(); }
  // E:选中基地车则展开(否则落到下方建造快捷键=战车工厂)
  if(e.code==='KeyE'){
    const mcvSel=selected.find(u=>u.type==='mcv');
    if(mcvSel){ deployMCV(mcvSel); return; }
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
    else if(act==='pwrUp') startPowerUpgrade(selBuilding);
    else if(act==='barrackUp') startBarracksUpgrade(selBuilding);
    else if(act==='research'){ if(selBuilding) startResearch(selBuilding, btn.dataset.def); }
    else if(act==='cancelprod'){ if(selBuilding) cancelProduction(selBuilding); }
    else if(act==='deploy'){ if(selected[0]) deployMCV(selected[0]); }
    else if(act==='unload'){ const t=selected.find(u=>u.type==='transport'); if(t) manualUnload(t); }
    else if(act==='selectall') selectAllCombat();
  });
}
