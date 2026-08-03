"use strict";
/* ============ render.js: 渲染 ============ */
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  const shx=(Math.random()-0.5)*shake, shy=(Math.random()-0.5)*shake;
  ctx.translate(-cam.x+shx,-cam.y+shy);
  drawTerrain();
  drawCloudShadows();
  drawOre();
  for(const b of buildings) drawBuilding(b);
  for(const u of units) drawUnit(u);
  drawProjectiles();
  drawEffects();
  drawTexts();
  drawSel();
  drawPlacing();
  drawSelling();
  ctx.restore();
  drawHudOverlay();
  drawMinimap();
}
function tileVariation(x,y){ return ((x*374761393 + y*668265263) >>> 0) % 1000; }
function drawTerrain(){
  const x0=Math.max(0,Math.floor(cam.x/TILE)-1), x1=Math.min(MAP_W,Math.ceil((cam.x+canvas.width)/TILE)+1);
  const y0=Math.max(0,Math.floor(cam.y/TILE)-1), y1=Math.min(MAP_H,Math.ceil((cam.y+canvas.height)/TILE)+1);
  for(let x=x0;x<x1;x++) for(let y=y0;y<y1;y++){
    const px=x*TILE, py=y*TILE;
    const v=tileVariation(x,y);
    const t=terrain[x][y];
    if(t==='water'){
      ctx.fillStyle='#2a5a8a'; ctx.fillRect(px,py,TILE,TILE);
      ctx.fillStyle='#2f6396'; ctx.fillRect(px,py,TILE,TILE*0.5);
      const wv=Math.sin(time*1.8+x*0.7+y*0.5)*0.5+0.5;
      ctx.fillStyle='rgba(180,220,255,'+(0.10+0.14*wv)+')';
      ctx.fillRect(px+4, py+7, TILE-8, 2.5);
      ctx.fillStyle='rgba(180,220,255,'+(0.05+0.10*wv)+')';
      ctx.fillRect(px+6, py+19, TILE-12, 2);
      ctx.fillStyle='rgba(255,255,255,.06)';
      ctx.fillRect(px,py+26,TILE,3);
    } else if(t==='tree'){
      ctx.fillStyle=((x+y)%2===0)?'#4a9a5a':'#3f8a4e'; ctx.fillRect(px,py,TILE,TILE);
      const cx=px+16, cy=py+16;
      ctx.fillStyle='#4a3018'; ctx.fillRect(cx-2,cy+2,5,9);
      ctx.fillStyle='#2f7a3a'; ctx.beginPath(); ctx.arc(cx,cy-2,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3f8f4e'; ctx.beginPath(); ctx.arc(cx-4,cy-6,6.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#347f42'; ctx.beginPath(); ctx.arc(cx+4,cy-5,6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(cx-3,cy-8,3,0,Math.PI*2); ctx.fill();
    } else {
      // 草地
      const base=(x+y)%2===0?'#4a9a5a':'#3f8a4e';
      ctx.fillStyle=base; ctx.fillRect(px,py,TILE,TILE);
      if(v%5===0){ ctx.fillStyle='rgba(0,0,0,.05)'; ctx.fillRect(px,py,TILE,TILE); }
      else if(v%7===0){ ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(px,py,TILE,TILE); }
      // 装饰
      const d=v%100;
      if(d<14){ // 草丛
        ctx.strokeStyle='#2f7a3a'; ctx.lineWidth=1.2;
        const gx=px+(v%28)+3, gy=py+10+((v>>2)%14);
        ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(gx-3,gy-6);
        ctx.moveTo(gx,gy); ctx.lineTo(gx+1,gy-7);
        ctx.moveTo(gx,gy); ctx.lineTo(gx+4,gy-5);
        ctx.stroke();
      } else if(d<18){ // 小花
        const fx=px+(v%28)+6, fy=py+14+((v>>3)%12);
        ctx.fillStyle='#e8e8e8'; ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ffe27a'; ctx.beginPath(); ctx.arc(fx,fy,0.9,0,Math.PI*2); ctx.fill();
      } else if(d>=97){ // 石头
        ctx.fillStyle='#6a7468'; ctx.beginPath(); ctx.ellipse(px+16,py+18,5,3.5,0.3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#7d8778'; ctx.beginPath(); ctx.ellipse(px+14,py+17,2.5,1.6,0.3,0,Math.PI*2); ctx.fill();
      }
    }
  }
  // 基地圈
  for(const b of buildings){ if(b.alive && b.defName==='command'){ drawOwnZone(b); } }
}
function drawOwnZone(b){
  ctx.strokeStyle = teamGroup(b.team)===0?'rgba(120,255,160,.12)':'rgba(255,120,120,.12)';
  ctx.lineWidth=8;
  ctx.strokeRect(b.x-160, b.y-160, 320, 320);
  ctx.lineWidth=1;
}
function drawCloudShadows(){
  const off=time*7;
  const clouds=[
    {x:300+off, y:280, r:240},
    {x:1350-off, y:820, r:280},
    {x:900+off*0.6, y:1250, r:210},
    {x:1700+off*0.4, y:400, r:200},
  ];
  ctx.save();
  ctx.globalCompositeOperation='multiply';
  for(const cl of clouds){
    const g=ctx.createRadialGradient(cl.x,cl.y,20,cl.x,cl.y,cl.r);
    g.addColorStop(0,'rgba(20,30,25,.28)');
    g.addColorStop(1,'rgba(20,30,25,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cl.x,cl.y,cl.r,cl.r*0.55,0,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawOre(){
  for(const o of oreFields){
    if(o.amount<=0) continue;
    const pct=o.amount/o.max;
    const r=o.r*Math.max(0.45, pct);
    const cx=o.x, cy=o.y;
    // 柔光
    const grd=ctx.createRadialGradient(cx,cy,2,cx,cy,r*1.7);
    grd.addColorStop(0,'rgba(255,226,120,.32)');
    grd.addColorStop(1,'rgba(255,226,120,0)');
    ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r*1.7,0,Math.PI*2); ctx.fill();
    // 金矿堆(小晶体)
    for(let i=0;i<10;i++){
      const a=i/10*Math.PI*2;
      const dx=cx+Math.cos(a)*r*0.5, dy=cy+Math.sin(a)*r*0.5;
      const s=r*0.17;
      ctx.fillStyle=(i%2===0)?'#e8c84a':'#d3ad38';
      ctx.beginPath(); ctx.moveTo(dx,dy-s); ctx.lineTo(dx+s*0.72,dy+s*0.6); ctx.lineTo(dx-s*0.72,dy+s*0.6); ctx.closePath(); ctx.fill();
    }
    // 中央大矿晶
    ctx.fillStyle='#f4e070';
    ctx.beginPath(); ctx.moveTo(cx,cy-r*0.85); ctx.lineTo(cx+r*0.5,cy+1); ctx.lineTo(cx-r*0.5,cy+1); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(cx,cy-r*0.85); ctx.lineTo(cx+r*0.15,cy-r*0.1); ctx.lineTo(cx-r*0.1,cy-r*0.2); ctx.closePath(); ctx.fill();
    // 闪烁
    const tw=(Math.sin(time*3+o.x*0.05+o.y*0.07)*0.5+0.5);
    ctx.fillStyle='rgba(255,255,255,'+(0.22*tw+0.06)+')';
    ctx.beginPath(); ctx.arc(cx+Math.sin(o.x+time)*r*0.3, cy+Math.cos(o.y+time)*r*0.3, 2+tw*2, 0, Math.PI*2); ctx.fill();
  }
}
function drawBuilding(b){
  if(!b.alive) return;
  const x=b.tx*TILE, y=b.ty*TILE, w=b.w*TILE, h=b.h*TILE;
  const tc=teamCol(b.team);
  const cx=b.x, cy=b.y;
  // 阴影
  ctx.fillStyle='rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(cx+4, cy+h*0.5+5, w*0.55, h*0.55, 0, 0, Math.PI*2); ctx.fill();
  // 水泥基座
  ctx.fillStyle='#585d63'; ctx.fillRect(x-3,y-3,w+6,h+6);
  ctx.fillStyle='#4c5156'; ctx.fillRect(x-3,y-3,w+6,5);
  ctx.fillStyle='#4c5156'; ctx.fillRect(x-3,y+h-2,w+6,5);
  // 墙体
  ctx.fillStyle='#333a42'; ctx.fillRect(x,y,w,h);
  // 屋顶面板
  ctx.fillStyle=b.def.color; ctx.fillRect(x+3,y+3,w-6,h-6);
  // 屋顶分格线
  ctx.strokeStyle='rgba(0,0,0,.15)'; ctx.lineWidth=1;
  const seg=Math.max(2,b.w*2);
  for(let i=1;i<seg;i++){ ctx.beginPath(); ctx.moveTo(x+i*w/seg,y+3); ctx.lineTo(x+i*w/seg,y+h-3); ctx.stroke(); }
  // 屋顶边框 + 队色
  ctx.strokeStyle=tc; ctx.lineWidth=2.5; ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);
  ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=1; ctx.strokeRect(x+9,y+9,w-18,h-18);
  ctx.fillStyle='rgba(0,0,0,.16)';
  ctx.fillRect(x+6,y+6,9,9); ctx.fillRect(x+w-15,y+6,9,9);
  ctx.fillRect(x+6,y+h-15,9,9); ctx.fillRect(x+w-15,y+h-15,9,9);
  // 立体倒角(顶/左亮,底/右暗)
  ctx.fillStyle='rgba(255,255,255,.13)'; ctx.fillRect(x+3,y+3,w-6,2.5);
  ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(x+3,y+3,2.5,h-6);
  ctx.fillStyle='rgba(0,0,0,.22)'; ctx.fillRect(x+3,y+h-5.5,w-6,2.5);
  ctx.fillStyle='rgba(0,0,0,.15)'; ctx.fillRect(x+w-5.5,y+3,2.5,h-6);
  // 窗户(两排)
  ctx.fillStyle='rgba(170,210,230,.5)';
  const wc=b.w*2-1;
  for(let i=1;i<=wc;i++){
    const wx=x+7+i*(w-14)/(wc+1);
    ctx.fillRect(wx, y+h*0.36, 4, 4);
    ctx.fillRect(wx, y+h*0.64, 4, 4);
  }

  if(b.defName==='command'){
    // 雷达三脚架
    ctx.strokeStyle='#5a6a5a'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(cx-9, cy-1); ctx.lineTo(cx-5, cy-10);
    ctx.moveTo(cx+9, cy-1); ctx.lineTo(cx+5, cy-10);
    ctx.moveTo(cx, cy-1); ctx.lineTo(cx, cy-10);
    ctx.stroke();
    // 旋转雷达
    const ang=time*0.8;
    ctx.save(); ctx.translate(cx, cy-10);
    ctx.fillStyle='#1c2024'; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#6a7a6a'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='rgba(140,255,180,.9)';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,12,ang,ang+1.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#eee'; ctx.beginPath(); ctx.arc(0,0,1.8,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // 天线
    ctx.strokeStyle='#8a9a8a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+w*0.18, y+4); ctx.lineTo(x+w*0.18, y-6); ctx.stroke();
    ctx.fillStyle='#ff5555'; ctx.beginPath(); ctx.arc(x+w*0.18, y-8, 2.5, 0, Math.PI*2); ctx.fill();
    // 车库大门(MCV出口)
    ctx.fillStyle='#20242a'; ctx.fillRect(cx-16, y+h-16, 32, 12);
    ctx.strokeStyle='#3a4148'; ctx.strokeRect(cx-16, y+h-16, 32, 12);
    for(let i=0;i<3;i++){ ctx.fillStyle='#2a2f35'; ctx.fillRect(cx-16, y+h-14+i*4, 32, 2); }
  } else if(b.defName==='power'){
    // 供电时发光
    const p=powerOf(b.team);
    if(p.give>0 && p.give>=p.use){
      ctx.fillStyle='rgba(255,226,122,.18)'; ctx.fillRect(x+3,y+3,w-6,h-6);
    }
    // 两侧散热片
    ctx.fillStyle='rgba(0,0,0,.25)';
    for(let i=0;i<4;i++){ ctx.fillRect(x+4, y+6+i*5, 4, 2); ctx.fillRect(x+w-8, y+6+i*5, 4, 2); }
    // 电池组
    ctx.fillStyle='#ffe27a'; ctx.fillRect(cx-8, cy-11, 16, 22);
    ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.strokeRect(cx-8, cy-11, 16, 22);
    ctx.fillStyle='#8a4a2a'; ctx.fillRect(cx-8, cy-7, 16, 3);
    ctx.fillStyle='#b06a3a'; ctx.fillRect(cx-8, cy+1, 16, 3);
    ctx.fillStyle='#5a2a1a';
    ctx.fillRect(cx-5, cy-9, 3, 5); ctx.fillRect(cx+2, cy-9, 3, 5);
    // 闪电标识
    ctx.fillStyle='#222'; ctx.beginPath();
    ctx.moveTo(cx+1,cy-4); ctx.lineTo(cx-2,cy+1); ctx.lineTo(cx-0.5,cy+1); ctx.lineTo(cx-2,cy+5); ctx.lineTo(cx+3,cy-1); ctx.lineTo(cx+1,cy-1); ctx.lineTo(cx+3,cy-4); ctx.closePath(); ctx.fill();
    // 高压警示
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(x+3, y+h-8, w-6, 3);
    ctx.fillStyle='rgba(255,220,120,.25)'; ctx.fillRect(x+3, y+h-5, w-6, 2);
    // 升级等级标记(金色方块)
    if(b.powerLevel>0){
      ctx.fillStyle='#ffe27a';
      for(let i=0;i<POWER_MAX_LEVEL;i++){
        if(i<b.powerLevel){ ctx.fillRect(cx-6+i*7, y+4, 5, 5); }
        else { ctx.fillStyle='rgba(255,226,122,.25)'; ctx.fillRect(cx-6+i*7, y+4, 5, 5); ctx.fillStyle='#ffe27a'; }
      }
    }
  } else if(b.defName==='barracks'){
    // 双开门
    ctx.fillStyle='#20242a'; ctx.fillRect(cx-8, y+h*0.34, 16, h*0.66-4);
    ctx.strokeStyle='#3a4148'; ctx.strokeRect(cx-8, y+h*0.34, 16, h*0.66-4);
    ctx.fillStyle='#2a2f35'; ctx.fillRect(cx-1, y+h*0.34, 2, h*0.66-4);
    // 门牌
    ctx.fillStyle='#dfe8e0'; ctx.fillRect(cx-9, y+h*0.2, 18, 5);
    ctx.fillStyle=tc; ctx.fillRect(cx-9, y+h*0.2, 18, 2);
    // 屋顶通风
    ctx.fillStyle='#4a5250'; ctx.fillRect(cx-4, y+5, 8, 4);
    // 旗帜
    ctx.strokeStyle='#9aa5a0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x+8, y+h-4); ctx.lineTo(x+8, y+4); ctx.stroke();
    ctx.fillStyle=tc;
    ctx.beginPath(); ctx.moveTo(x+8, y+4); ctx.lineTo(x+23, y+8); ctx.lineTo(x+8, y+13); ctx.closePath(); ctx.fill();
  } else if(b.defName==='factory'){
    // 屋顶排气管
    ctx.fillStyle='#6a6f6a'; ctx.fillRect(cx-5, y+2, 10, 6);
    ctx.fillStyle='#4a4f4a'; ctx.fillRect(cx-5, y+2, 10, 2);
    // 卷帘门
    ctx.fillStyle='#14181c'; ctx.fillRect(cx-14, y+h-20, 28, 14);
    ctx.strokeStyle='#3a4148'; ctx.strokeRect(cx-14, y+h-20, 28, 14);
    for(let i=0;i<5;i++){ ctx.fillStyle='#2a2f35'; ctx.fillRect(cx-14, y+h-18+i*3, 28, 1.5); }
    // 门前轨道线
    ctx.strokeStyle='rgba(120,255,160,.25)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx-19,y+h-2); ctx.lineTo(cx+19,y+h-2); ctx.stroke();
    // 吊臂
    ctx.strokeStyle='#6a756f'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x+w*0.26, y+h*0.34); ctx.lineTo(x+w*0.55, y+5); ctx.stroke();
    ctx.fillStyle='#222'; ctx.fillRect(x+w*0.55-4, y+2, 9, 7);
    ctx.fillStyle='#666'; ctx.fillRect(x+w*0.55-1, y+2, 2, 13);
    ctx.fillStyle='#888'; ctx.fillRect(x+w*0.55-2.5, y+15, 5, 2);
    // 已升级标志(金色星标)
    if(b.upgraded){
      ctx.save(); ctx.translate(x+w-12, y+12);
      ctx.fillStyle='#ffd24a';
      ctx.beginPath();
      for(let i=0;i<5;i++){ const a=-Math.PI/2+i*2*Math.PI/5, a2=a+Math.PI/5;
        ctx.lineTo(Math.cos(a)*6,Math.sin(a)*6); ctx.lineTo(Math.cos(a2)*2.6,Math.sin(a2)*2.6); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(120,80,0,.6)'; ctx.lineWidth=1; ctx.stroke();
      ctx.restore();
    }
  } else if(b.defName==='refinery'){
    // 卸矿台
    ctx.fillStyle='#20242a'; ctx.fillRect(cx-10, y+h-14, 20, 9);
    ctx.fillStyle='#2a2f35'; ctx.fillRect(cx-10, y+h-14, 20, 2);
    // 矿仓
    ctx.fillStyle='#8a7a2a'; ctx.fillRect(cx-16, cy-8, 15, 13);
    ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.strokeRect(cx-16, cy-8, 15, 13);
    ctx.fillStyle='#e8c84a';
    ctx.beginPath(); ctx.arc(cx-8.5, cy-11, 9, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#9a8a3a'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#f4e070';
    ctx.beginPath(); ctx.moveTo(cx-8.5,cy-11); ctx.lineTo(cx-5,cy-6); ctx.lineTo(cx-12,cy-6); ctx.closePath(); ctx.fill();
    // 输送带
    ctx.fillStyle='#555'; ctx.fillRect(cx-5, cy-3, 24, 5);
    ctx.fillStyle='#222'; ctx.fillRect(cx-5, cy-3, 24, 2);
    // 落料口
    ctx.fillStyle='#333'; ctx.fillRect(cx+17, cy-1, 6, 7);
    ctx.fillStyle='#222'; ctx.fillRect(cx+17, cy-1, 6, 2);
  } else if(b.defName==='turret'){
    // 混凝土底座
    ctx.fillStyle='#6a7070'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#4c5156'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#555b5b'; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI*2); ctx.fill();
    // 沙袋
    ctx.fillStyle='#9a8a5a';
    ctx.beginPath(); ctx.arc(cx-13, cy-4, 2.6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+13, cy-4, 2.6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx-11, cy+7, 2.6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+11, cy+7, 2.6, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(cx-13, cy-4, 2.6, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+13, cy-4, 2.6, 0, Math.PI*2); ctx.stroke();
    // 旋转炮塔
    const a=b.turretTarget?Math.atan2(b.turretTarget.y-cy, b.turretTarget.x-cx):(Math.sin(time*1.5)*0.6);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
    ctx.fillStyle='#1c2024'; ctx.fillRect(0,-5,13,10);
    ctx.beginPath(); ctx.arc(3,0,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2f343a'; ctx.fillRect(8,-2.5,10,5);
    ctx.fillStyle='#444'; ctx.fillRect(15,-1.5,4,3);
    // 开火闪光
    if(b.fireT>0 && b.fireT>=b.def.weapon.rof-0.12){
      ctx.fillStyle='rgba(255,220,120,.9)';
      ctx.beginPath(); ctx.arc(19,0,3.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(19,0,1.8,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
    // 队标
    ctx.fillStyle=tc; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
  } else if(b.defName==='repair'){
    // 维修站招牌(绿色十字)
    ctx.fillStyle='#2a2f35'; ctx.fillRect(cx-9, y+4, 18, 14);
    ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.strokeRect(cx-9, y+4, 18, 14);
    ctx.fillStyle='#7ae87a';
    ctx.fillRect(cx-2.5, y+6, 5, 10);
    ctx.fillRect(cx-5, y+8.5, 10, 5);
    // 液压维修平台
    ctx.fillStyle='#4a4f4a'; ctx.fillRect(cx-12, y+h-11, 24, 4);
    ctx.fillStyle='#2a2f2a'; ctx.fillRect(cx-8, y+h-7, 16, 3);
    // 维修吊臂
    ctx.strokeStyle='#6a756f'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x+w*0.25, y+h*0.35); ctx.lineTo(x+w*0.5, y+6); ctx.stroke();
    ctx.fillStyle='#222'; ctx.fillRect(x+w*0.5-3, y+3, 7, 5);
  }
  // 维修厂治疗光环(脉动绿圈)
  if(b.defName==='repair' && !b.constructing){
    const pul=0.5+0.5*Math.sin(time*3);
    const rad=b.w*TILE/2+TILE*2;
    const g=ctx.createRadialGradient(cx,cy,rad*0.35,cx,cy,rad);
    g.addColorStop(0,'rgba(120,255,160,'+(0.12+0.10*pul)+')');
    g.addColorStop(1,'rgba(120,255,160,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(120,255,160,'+(0.22+0.20*pul)+')'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.stroke();
  }
  // 集结点标记
  if(b.rally){
    const rx=b.rally.x, ry=b.rally.y;
    if(b===selBuilding){
      ctx.strokeStyle='rgba(120,255,160,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);
      ctx.beginPath(); ctx.moveTo(cx, cy+h*0.5); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle='#dfe8e0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(rx,ry-9); ctx.lineTo(rx,ry+4); ctx.stroke();
    ctx.fillStyle=tc;
    ctx.beginPath(); ctx.moveTo(rx,ry-9); ctx.lineTo(rx+8,ry-6); ctx.lineTo(rx,ry-3); ctx.closePath(); ctx.fill();
  }
  // 名字
  ctx.textAlign='center';
  ctx.font='10px "Microsoft YaHei"';
  ctx.fillStyle='rgba(0,0,0,.65)';
  ctx.fillText(b.def.name, cx, y+h+13);
  ctx.fillStyle='#dfe8e0';
  ctx.fillText(b.def.name, cx, y+h+12);
  // HP条
  drawHPBar(x+2, y+2, w-4, b.hp/b.maxHp, b.constructing);
  // 建造进度条
  if(b.constructing){
    // 全息投影 + 扫描线
    ctx.fillStyle='rgba(120,200,255,.13)'; ctx.fillRect(x+2,y+2,w-4,h-4);
    const scan=((time*34)%(h+22))-10;
    ctx.fillStyle='rgba(160,220,255,.4)'; ctx.fillRect(x+2, y+2+scan, w-4, 3);
    // 动态脚手架
    const tg=(time*1.3)%1;
    ctx.strokeStyle='rgba(170,190,180,'+(0.3+0.25*tg)+')'; ctx.lineWidth=2;
    ctx.strokeRect(x+2,y+2,w-4,h-4);
    ctx.beginPath();
    ctx.moveTo(x+2,y+2); ctx.lineTo(x+w-2,y+h-2);
    ctx.moveTo(x+w-2,y+2); ctx.lineTo(x+2,y+h-2);
    ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x+4,y+5,w-8,7);
    ctx.fillStyle='#ffe27a'; ctx.fillRect(x+4,y+5,(w-8)*clamp(b.progress/b.buildTime,0,1),7);
    ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(x+4,y+5,(w-8)*clamp(b.progress/b.buildTime,0,1),2);
  }
  // 战车工厂升级进度
  if(b.upgrading){
    ctx.fillStyle='rgba(255,226,122,.14)'; ctx.fillRect(x+2,y+2,w-4,h-4);
    const pct=clamp(b.upgradeProg/FACTORY_UPGRADE_TIME,0,1);
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x+4,y+5,w-8,7);
    ctx.fillStyle='#ffd24a'; ctx.fillRect(x+4,y+5,(w-8)*pct,7);
    ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(x+4,y+5,(w-8)*pct,2);
  }
  // 发电厂升级进度
  if(b.pwrUpgrading){
    ctx.fillStyle='rgba(255,226,122,.14)'; ctx.fillRect(x+2,y+2,w-4,h-4);
    const pct=clamp(b.pwrUpgradeProg/POWER_UPGRADE_TIME,0,1);
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x+4,y+5,w-8,7);
    ctx.fillStyle='#ffd24a'; ctx.fillRect(x+4,y+5,(w-8)*pct,7);
    ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(x+4,y+5,(w-8)*pct,2);
  }
  // 生产队列
  if(b.queue.length){
    let qx=x+4;
    for(const it of b.queue){
      ctx.fillStyle='#14181c'; ctx.fillRect(qx, y-17, 15, 15);
      ctx.strokeStyle='#3a4a42'; ctx.strokeRect(qx, y-17, 15, 15);
      ctx.fillStyle='#ffe27a'; ctx.font='10px sans-serif';
      ctx.fillText(getUnitDefs(unitFactionOf(b.team))[it.type].name[0], qx+7.5, y-5);
      qx+=18;
    }
  }
  // 队伍颜色角标(右上角小方块,区分同阵营的不同队伍)
  ctx.fillStyle=teamColor(b.team);
  ctx.fillRect(x+w-11, y+8, 8, 8);
  ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
  ctx.strokeRect(x+w-11.5, y+7.5, 9, 9);
}
function drawHPBar(cx, y, w, pct, isConstruct){
  if(pct>1)pct=1; if(pct<0)pct=0;
  ctx.fillStyle='rgba(0,0,0,.85)'; ctx.fillRect(cx-1,y-1,w+2,7);
  ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(cx,y,w,5);
  const col=isConstruct?'#ffe27a':(pct>0.5?'#4fdc7a':(pct>0.25?'#ffcf3a':'#ff5555'));
  ctx.fillStyle=col; ctx.fillRect(cx,y,w*pct,5);
  ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(cx,y,w*pct,1.5);
}
function drawUnit(u){
  const d=u.def;
  const tc=teamCol(u.team);
  ctx.save();
  ctx.translate(u.x,u.y);
  // 阴影
  ctx.fillStyle='rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(2,3,u.r+2,u.r+1,0,0,Math.PI*2); ctx.fill();
  // 队色底圈
  ctx.strokeStyle='rgba('+(teamGroup(u.team)===0?'120,255,160':'255,140,120')+',.35)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(0,0,u.r+2,0,Math.PI*2); ctx.stroke();
  // 反应装甲护盾环
  if(u.shield>0){
    ctx.strokeStyle='rgba(80,180,255,.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,0,u.r+4,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='rgba(80,180,255,.08)';
    ctx.beginPath(); ctx.arc(0,0,u.r+4,0,Math.PI*2); ctx.fill();
  }
  if(u.type==='tank'||u.type==='abrams'||u.type==='t90'){
    const heavy = unitFactionOf(u.team)==='soviet';
    ctx.rotate(u.facing);
    if(u.type==='abrams'){
      // ===== M1A2 艾布拉姆斯(正俯视,车头朝 +X · 沙漠黄) =====
      const R=u.r*1.25;   // 体型放大
      const Hw=0.70*R;      // 履带外缘半宽
      const tbd=0.32*R;     // 履带厚度
      const xb=1.18*R, xf=1.12*R;   // 车尾/车头
      const to=(time*45)%5, wa=time*3;
      // 履带
      ctx.fillStyle='#20242a';
      ctx.fillRect(-xb, -Hw, xb+xf, tbd);
      ctx.fillRect(-xb,  Hw-tbd, xb+xf, tbd);
      ctx.fillStyle='#3a4046';
      for(let i=-xb+3;i<xf-3;i+=4){ ctx.fillRect(i-to, -Hw, 2.2, tbd); ctx.fillRect(i-to, Hw-tbd, 2.2, tbd); }
      // 负重轮(辐条旋转)
      ctx.fillStyle='#2b2f35';
      for(let i=-xb+4;i<xf-4;i+=5){
        for(const s of [-1,1]){
          const cy = s>0 ? Hw-tbd/2 : -(Hw-tbd/2);
          ctx.beginPath(); ctx.arc(i,cy,2.6,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#555'; ctx.lineWidth=0.8;
          ctx.beginPath(); ctx.moveTo(i-Math.cos(wa)*1.9, cy-Math.sin(wa)*1.9); ctx.lineTo(i+Math.cos(wa)*1.9, cy+Math.sin(wa)*1.9); ctx.stroke();
        }
      }
      // 分段式侧裙板
      ctx.fillStyle='#a08260';
      ctx.fillRect(-xb+2, -Hw+1, xb+xf-4, tbd-2);
      ctx.fillRect(-xb+2,  Hw-tbd+1, xb+xf-4, tbd-2);
      ctx.fillStyle='#8a7050';
      for(let i=-xb+7;i<xf-4;i+=7){ ctx.fillRect(i, -Hw+1, 1.6, tbd-2); ctx.fillRect(i, Hw-tbd+1, 1.6, tbd-2); }
      // 车体
      const Hy=0.40*R;
      ctx.fillStyle='#c4a678';
      ctx.fillRect(-xb+2, -Hy, xb+xf-2, Hy*2);
      ctx.fillStyle='#d2b48c';
      ctx.fillRect(-xb+2, -Hy, xb+xf-2, Hy);
      ctx.fillStyle='rgba(255,255,255,.10)'; ctx.fillRect(-xb+2, -Hy, xb+xf-2, 2);
      ctx.fillStyle='rgba(0,0,0,.18)'; ctx.fillRect(-xb+2, Hy-2, xb+xf-2, 2);
      // 前部楔形首上装甲
      ctx.fillStyle='#d8bc94';
      ctx.beginPath();
      ctx.moveTo(xf-0.30*R, -Hy);
      ctx.lineTo(xf+0.04*R, -0.16*R);
      ctx.lineTo(xf+0.04*R, 0.16*R);
      ctx.lineTo(xf-0.30*R, Hy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.18)';
      ctx.beginPath();
      ctx.moveTo(xf-0.30*R, -Hy);
      ctx.lineTo(xf+0.04*R, -0.16*R);
      ctx.lineTo(xf+0.04*R, -0.05*R);
      ctx.lineTo(xf-0.30*R, -0.34*R);
      ctx.closePath(); ctx.fill();
      // 车尾防尘排气栅格
      ctx.fillStyle='#5c4a38';
      ctx.fillRect(-xb+2, -0.20*R, 0.30*R, 0.40*R);
      ctx.fillStyle='rgba(0,0,0,.30)';
      for(let i=0;i<3;i++) ctx.fillRect(-xb+5+i*3.4, -0.16*R, 1.6, 0.32*R);
      // 炮塔(前窄后宽六边形)
      const tf=0.40*R, tm=-0.52*R, tb2=-0.88*R;
      const wf=0.36*R, wm=0.58*R, wb2=0.52*R;
      ctx.fillStyle='#cbb088';
      ctx.beginPath();
      ctx.moveTo(tf, -wf);
      ctx.lineTo(tm, -wm);
      ctx.lineTo(tb2, -wb2);
      ctx.lineTo(tb2, wb2);
      ctx.lineTo(tm, wm);
      ctx.lineTo(tf, wf);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#8a6a48'; ctx.lineWidth=1.2; ctx.stroke();
      // 炮塔正面菱形/楔形装甲
      ctx.fillStyle='#d8bc94';
      ctx.beginPath();
      ctx.moveTo(tf, -wf);
      ctx.lineTo(tf+0.12*R, 0);
      ctx.lineTo(tf, wf);
      ctx.lineTo(tf-0.30*R, wf-0.06*R);
      ctx.lineTo(tf-0.30*R, -(wf-0.06*R));
      ctx.closePath(); ctx.fill();
      // 炮塔侧面斜角高光/阴影
      ctx.fillStyle='rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(tf,-wf); ctx.lineTo(tm,-wm); ctx.lineTo(tm,-wm+0.22*R); ctx.lineTo(tf,-wf+0.26*R); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.15)';
      ctx.beginPath(); ctx.moveTo(tf,wf); ctx.lineTo(tm,wm); ctx.lineTo(tm,wm-0.20*R); ctx.lineTo(tf,wf-0.24*R); ctx.closePath(); ctx.fill();
      // 尾部弹药尾舱(带栅格)
      ctx.fillStyle='#b59a72';
      ctx.fillRect(tb2, -0.54*R, 0.34*R, 1.08*R);
      ctx.strokeStyle='#8a6a48'; ctx.lineWidth=1;
      ctx.strokeRect(tb2, -0.54*R, 0.34*R, 1.08*R);
      ctx.strokeStyle='rgba(0,0,0,.25)';
      for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(tb2+1, -0.54*R+i*0.27*R); ctx.lineTo(tb2+0.34*R-1, -0.54*R+i*0.27*R); ctx.stroke(); }
      // 车长/炮手双舱盖
      ctx.fillStyle='#8a7050';
      ctx.beginPath(); ctx.arc(-0.16*R, -0.32*R, 2.6, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0.04*R, 0.30*R, 2.4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // 队标
      ctx.fillStyle=tc; ctx.beginPath(); ctx.arc(0.12*R, 0, 2.2, 0, Math.PI*2); ctx.fill();
      // 120mm 主炮(带抽烟装置,加长炮管)
      ctx.fillStyle='#4a3c2d';
      ctx.fillRect(tf-0.06*R, -0.15*R, 1.35*R, 0.30*R);
      ctx.fillStyle='#3a2f22';
      ctx.fillRect(tf+0.48*R, -0.19*R, 0.15*R, 0.38*R);   // 抽烟装置膨胀节
      ctx.fillStyle='#554634';
      ctx.fillRect(tf+0.63*R, -0.15*R, 0.28*R, 0.30*R);
      ctx.fillStyle='#20242a';
      ctx.fillRect(tf+1.18*R, -0.17*R, 0.10*R, 0.34*R);   // 炮口制退器
      if(u.fireT>u.def.rof-0.1 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(tf+1.36*R,0,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(tf+1.36*R,0,2,0,Math.PI*2); ctx.fill();
      }
    } else if(u.type==='t90'){
      // ===== T90(正俯视,车头朝 +X · 橄榄绿) =====
      const R=u.r*1.25;   // 体型放大
      const Hw=0.66*R;
      const tbd=0.30*R;
      const xb=1.02*R, xf=1.0*R;
      const to=(time*45)%5, wa=time*3;
      // 履带(更紧凑)
      ctx.fillStyle='#1c1f1a';
      ctx.fillRect(-xb, -Hw, xb+xf, tbd);
      ctx.fillRect(-xb,  Hw-tbd, xb+xf, tbd);
      ctx.fillStyle='#33372f';
      for(let i=-xb+3;i<xf-3;i+=4){ ctx.fillRect(i-to, -Hw, 2.2, tbd); ctx.fillRect(i-to, Hw-tbd, 2.2, tbd); }
      // 负重轮
      ctx.fillStyle='#242820';
      for(let i=-xb+3;i<xf-3;i+=5){
        for(const s of [-1,1]){
          const cy = s>0 ? Hw-tbd/2 : -(Hw-tbd/2);
          ctx.beginPath(); ctx.arc(i,cy,2.5,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#4a4f42'; ctx.lineWidth=0.8;
          ctx.beginPath(); ctx.moveTo(i-Math.cos(wa)*1.8, cy-Math.sin(wa)*1.8); ctx.lineTo(i+Math.cos(wa)*1.8, cy+Math.sin(wa)*1.8); ctx.stroke();
        }
      }
      // 车体(紧凑,长宽比约1.5:1)
      const Hy=0.40*R;
      ctx.fillStyle='#4b5320';
      ctx.fillRect(-xb+1, -Hy, xb+xf-1, Hy*2);
      ctx.fillStyle='#5a6226';
      ctx.fillRect(-xb+1, -Hy, xb+xf-1, Hy);
      ctx.fillStyle='rgba(255,255,255,.10)'; ctx.fillRect(-xb+1, -Hy, xb+xf-1, 2);
      ctx.fillStyle='rgba(0,0,0,.18)'; ctx.fillRect(-xb+1, Hy-2, xb+xf-1, 2);
      // 车体前部 V 型挡水板
      ctx.fillStyle='#3b4119';
      ctx.beginPath();
      ctx.moveTo(xf-0.40*R, -Hy);
      ctx.lineTo(xf+0.03*R, -0.20*R);
      ctx.lineTo(xf+0.03*R, 0.20*R);
      ctx.lineTo(xf-0.40*R, Hy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#2e3314'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(xf-0.34*R, -0.38*R); ctx.lineTo(xf+0.03*R, 0); ctx.lineTo(xf-0.34*R, 0.38*R); ctx.stroke();
      // 首上矩形 ERA 反应装甲
      ctx.fillStyle='#3b4119';
      ctx.fillRect(-0.55*R, -Hy+1, 0.42*R, Hy-2);
      ctx.fillRect(-0.55*R, 1, 0.42*R, Hy-2);
      ctx.strokeStyle='rgba(0,0,0,.30)'; ctx.lineWidth=1;
      ctx.strokeRect(-0.55*R, -Hy+1, 0.42*R, Hy-2);
      ctx.strokeRect(-0.55*R, 1, 0.42*R, Hy-2);
      // 车尾格栅
      ctx.fillStyle='#2e3314';
      ctx.fillRect(-xb+1, -0.18*R, 0.26*R, 0.36*R);
      ctx.fillStyle='rgba(0,0,0,.3)';
      for(let i=0;i<3;i++) ctx.fillRect(-xb+4+i*2.8, -0.14*R, 1.4, 0.28*R);
      // 炮塔(扁圆铸造感)
      const tf=0.44*R, tm=-0.46*R;
      const wf=0.40*R, wm=0.56*R;
      ctx.fillStyle='#565e26';
      ctx.beginPath();
      ctx.moveTo(tf+0.08*R, -wf);
      ctx.quadraticCurveTo(tm+0.24*R, -wm-0.10*R, tm, -wm);
      ctx.quadraticCurveTo(tm-0.14*R, 0, tm, wm);
      ctx.quadraticCurveTo(tm+0.24*R, wm+0.10*R, tf+0.08*R, wf);
      ctx.quadraticCurveTo(tf-0.16*R, 0, tf+0.08*R, -wf);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#3a4018'; ctx.lineWidth=1.2; ctx.stroke();
      // 炮塔正面两侧契形 ERA 块(V 字排列)
      ctx.fillStyle='#3b4119';
      ctx.beginPath();
      ctx.moveTo(tf+0.04*R, -0.02*R);
      ctx.lineTo(tf+0.12*R, -wf);
      ctx.lineTo(tf-0.32*R, -wm+0.26*R);
      ctx.lineTo(tf-0.20*R, -0.02*R);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tf+0.04*R, 0.02*R);
      ctx.lineTo(tf+0.12*R, wf);
      ctx.lineTo(tf-0.32*R, wm-0.26*R);
      ctx.lineTo(tf-0.20*R, 0.02*R);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.30)';
      ctx.beginPath(); ctx.moveTo(tf-0.28*R, -wm+0.24*R); ctx.lineTo(tf+0.12*R, -wf); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tf-0.28*R, wm-0.24*R); ctx.lineTo(tf+0.12*R, wf); ctx.stroke();
      // Shtora-1 红帘(炮塔前侧两灯)
      ctx.fillStyle='#8a2020';
      ctx.beginPath(); ctx.arc(tf-0.02*R, -wm+0.20*R, 2.0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(tf-0.02*R,  wm-0.20*R, 2.0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,120,120,.8)';
      ctx.beginPath(); ctx.arc(tf-0.02*R, -wm+0.20*R, 1.0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(tf-0.02*R,  wm-0.20*R, 1.0, 0, Math.PI*2); ctx.fill();
      // 炮塔顶高光
      ctx.fillStyle='rgba(255,255,255,.10)';
      ctx.beginPath(); ctx.arc(-0.08*R, -0.12*R, 0.30*R, 0.6, 2.4); ctx.lineTo(-0.08*R, -0.12*R); ctx.closePath(); ctx.fill();
      // 车长机枪 + 备用履带(炮塔后)
      ctx.fillStyle='#2e3314';
      ctx.fillRect(tm+0.06*R, -wm+0.12*R, 0.30*R, 0.30*R);
      ctx.fillStyle='#3b4119';
      ctx.fillRect(tm+0.09*R, -wm+0.18*R, 0.24*R, 0.18*R);
      ctx.strokeStyle='#6a7228'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(tm+0.20*R, -wm+0.12*R); ctx.lineTo(tm+0.20*R, -wm-0.16*R); ctx.stroke();
      ctx.beginPath(); ctx.arc(tm+0.20*R, -wm-0.18*R, 1.4, 0, Math.PI*2); ctx.stroke();
      // 队标
      ctx.fillStyle=tc; ctx.beginPath(); ctx.arc(0.06*R, 0.06*R, 2.2, 0, Math.PI*2); ctx.fill();
      // 125mm 主炮(热套筒 + 抽烟装置)
      ctx.fillStyle='#2c3020';
      ctx.fillRect(tf-0.06*R, -0.13*R, 1.18*R, 0.26*R);
      ctx.fillStyle='#3b4119';
      ctx.fillRect(tf+0.10*R, -0.17*R, 0.22*R, 0.34*R);   // 热套筒节
      ctx.fillStyle='#3f4522';
      ctx.fillRect(tf+0.58*R, -0.17*R, 0.17*R, 0.34*R);   // 抽烟装置
      ctx.fillStyle='#1a1d14';
      ctx.fillRect(tf+1.06*R, -0.15*R, 0.10*R, 0.30*R);   // 炮口
      if(u.fireT>u.def.rof-0.1 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(tf+1.24*R,0,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(tf+1.24*R,0,2,0,Math.PI*2); ctx.fill();
      }
    } else {
      const trackOff = (time*45)%5;
      const L=-u.r, R=u.r;
      // 履带主体
      ctx.fillStyle='#16181c'; ctx.fillRect(L, -u.r*0.95, R*2, u.r*0.5);
      ctx.fillRect(L, u.r*0.45, R*2, u.r*0.5);
      // 负重轮
      ctx.fillStyle='#333a42';
      for(let i=L+3;i<=R-3;i+=4){
        ctx.beginPath(); ctx.arc(i,-u.r*0.7,2.2,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(i,u.r*0.7,2.2,0,Math.PI*2); ctx.fill();
      }
      // 履带节(动画)
      ctx.fillStyle='#3a3f45';
      for(let i=L+3;i<R;i+=5){ ctx.fillRect(i-trackOff, -u.r*0.95, 2.5, u.r*0.5); ctx.fillRect(i-trackOff, u.r*0.45, 2.5, u.r*0.5); }

      if(heavy){
        // ===== 犀牛坦克(苏军 · 重型) =====
        ctx.fillStyle='#3e4a38'; ctx.fillRect(L+1, -u.r*0.55, R*2-2, u.r*1.1);
        ctx.strokeStyle='#222'; ctx.lineWidth=1.2; ctx.strokeRect(L+1, -u.r*0.55, R*2-2, u.r*1.1);
        // 楔形厚前装甲
        ctx.fillStyle='#333d2e';
        ctx.beginPath(); ctx.moveTo(R-2,-u.r*0.55); ctx.lineTo(R+5,-u.r*0.24); ctx.lineTo(R+5,u.r*0.24); ctx.lineTo(R-2,u.r*0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.10)';
        ctx.beginPath(); ctx.moveTo(R-2,-u.r*0.55); ctx.lineTo(R+5,-u.r*0.24); ctx.lineTo(R+5,-u.r*0.12); ctx.lineTo(R-2,-u.r*0.4); ctx.closePath(); ctx.fill();
        // 反应装甲块(ERA)
        ctx.fillStyle='#4a5640';
        ctx.fillRect(L+4,-u.r*0.4,4,6); ctx.fillRect(L+9,-u.r*0.4,4,6); ctx.fillRect(L+14,-u.r*0.4,4,6);
        ctx.fillRect(L+4,u.r*0.4-6,4,6); ctx.fillRect(L+9,u.r*0.4-6,4,6);
        ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(L+1,-u.r*0.55,R*2-2,2.5);
        // 引擎格栅
        ctx.fillStyle='rgba(0,0,0,.4)';
        for(let i=0;i<3;i++){ ctx.fillRect(L+4+i*4,-u.r*0.42,2,3.5); }
        // 炮塔座圈 + 重型炮塔
        ctx.fillStyle='#23272c'; ctx.beginPath(); ctx.arc(0,-1,8.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#4d5942'; ctx.beginPath(); ctx.arc(0,-2,8,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#222'; ctx.lineWidth=1; ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(-2.5,-5,2.5,0,Math.PI*2); ctx.fill();
        // 红星
        ctx.save(); ctx.translate(2,-1);
        ctx.fillStyle='#c03030'; ctx.beginPath();
        for(let i=0;i<5;i++){ const a=-Math.PI/2+i*2*Math.PI/5, a2=a+Math.PI/5;
          ctx.lineTo(Math.cos(a)*3.6,Math.sin(a)*3.6); ctx.lineTo(Math.cos(a2)*1.6,Math.sin(a2)*1.6); }
        ctx.closePath(); ctx.fill(); ctx.restore();
        // 舱盖
        ctx.fillStyle='#2f343a'; ctx.beginPath(); ctx.ellipse(3,-4,2.2,1.6,0.3,0,Math.PI*2); ctx.fill();
        // 天线
        ctx.strokeStyle='#9a9a8a'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-3,0); ctx.lineTo(-6,-u.r); ctx.stroke();
        ctx.fillStyle='#ff5555'; ctx.beginPath(); ctx.arc(-6,-u.r,1.5,0,Math.PI*2); ctx.fill();
        // 主炮(更粗)
        ctx.fillStyle='#2c3036'; ctx.fillRect(R-6,-3,13,6);
        ctx.fillStyle='#3c434b'; ctx.fillRect(R-6,-3,3,6);
        ctx.fillStyle='#1e2226'; ctx.fillRect(R+5,-3.5,3.5,7);
        if(u.fireT>u.def.rof-0.1 && u.target){
          ctx.fillStyle='rgba(255,220,120,.9)';
          ctx.beginPath(); ctx.arc(R+9,0,4,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.7)';
          ctx.beginPath(); ctx.arc(R+9,0,2,0,Math.PI*2); ctx.fill();
        }
      } else {
        // ===== 灰熊坦克(盟军 · 中型) =====
        ctx.fillStyle='#464d55'; ctx.fillRect(L+1, -u.r*0.55, R*2-2, u.r*1.1);
        ctx.strokeStyle='#222'; ctx.lineWidth=1.2; ctx.strokeRect(L+1, -u.r*0.55, R*2-2, u.r*1.1);
        ctx.fillStyle='#3c434b';
        ctx.beginPath(); ctx.moveTo(R-2,-u.r*0.55); ctx.lineTo(R+4,-u.r*0.28); ctx.lineTo(R+4,u.r*0.28); ctx.lineTo(R-2,u.r*0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.12)';
        ctx.beginPath(); ctx.moveTo(R-2,-u.r*0.55); ctx.lineTo(R+4,-u.r*0.28); ctx.lineTo(R+4,-u.r*0.14); ctx.lineTo(R-2,-u.r*0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(L+1, -u.r*0.55, R*2-2, 2.5);
        ctx.fillStyle='rgba(0,0,0,.4)';
        for(let i=0;i<3;i++){ ctx.fillRect(L+4+i*4, -u.r*0.42, 2, 3.5); }
        ctx.fillStyle='#3a4048'; ctx.fillRect(L-3,-3,3,6);
        ctx.fillStyle='rgba(0,0,0,.2)'; ctx.fillRect(L-3,3,3,1);
        ctx.fillStyle='#23272c'; ctx.beginPath(); ctx.arc(0,-1,7.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#525a63'; ctx.beginPath(); ctx.arc(0,-2,6.8,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#222'; ctx.lineWidth=1; ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-2,-4.5,2.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(2,-1,3.6,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=tc; ctx.beginPath(); ctx.arc(2,-1,2.7,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#2f343a'; ctx.beginPath(); ctx.ellipse(2,-4,2.2,1.6,0.3,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#9a9a8a'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-3,0); ctx.lineTo(-6,-u.r); ctx.stroke();
        ctx.fillStyle='#ff5555'; ctx.beginPath(); ctx.arc(-6,-u.r,1.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#2c3036'; ctx.fillRect(R-5,-2.5,12,5);
        ctx.fillStyle='#3c434b'; ctx.fillRect(R-5,-2.5,3,5);
        ctx.fillStyle='#1e2226'; ctx.fillRect(R+5,-3,3,6);
        if(u.fireT>u.def.rof-0.1 && u.target){
          ctx.fillStyle='rgba(255,220,120,.9)';
          ctx.beginPath(); ctx.arc(R+9,0,3.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.7)';
          ctx.beginPath(); ctx.arc(R+9,0,1.8,0,Math.PI*2); ctx.fill();
        }
      }
    }
  } else if(u.type==='harvester'){
    const wheelA = time*3;
    ctx.rotate(u.facing);
    // 车斗
    ctx.fillStyle='#9a8a2a'; ctx.fillRect(-u.r+1,-u.r+2,u.r*2-2,u.r*2-4);
    ctx.strokeStyle='#4a401a'; ctx.lineWidth=1.5; ctx.strokeRect(-u.r+1,-u.r+2,u.r*2-2,u.r*2-4);
    ctx.fillStyle='rgba(255,255,255,.1)'; ctx.fillRect(-u.r+1,-u.r+2,u.r*2-2,3);
    // 车斗铆钉
    ctx.fillStyle='rgba(0,0,0,.25)';
    for(let i=0;i<4;i++){ ctx.fillRect(-u.r+6+i*6, u.r-2, 2, 2); }
    // 斗内矿石
    const pct=u.cargo/u.def.capacity;
    ctx.fillStyle='#e8c84a'; ctx.fillRect(-u.r+3, -u.r+4, (u.r*2-6)*pct, u.r*2-8);
    ctx.fillStyle='#8a7a2a'; ctx.fillRect(-u.r+3, -u.r+4, (u.r*2-6)*pct, 2);
    // 驾驶室
    ctx.fillStyle='#3f4a55'; ctx.fillRect(-u.r-1,-u.r,8,u.r*2);
    ctx.fillStyle='#9cc0e0'; ctx.fillRect(-u.r, -u.r+2, 4, u.r*2-4);
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(-u.r, -u.r+2, 1.5, 3);
    // 侧阴影
    ctx.fillStyle='rgba(0,0,0,.12)'; ctx.fillRect(u.r-2,-u.r+2,2,u.r*2-4);
    // 轮子(旋转辐条)
    const wheels=[[-u.r+2,-u.r+4],[-u.r+2,u.r-4],[u.r-4,-u.r+4],[u.r-4,u.r-4]];
    for(const [wx,wy] of wheels){
      ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(wx,wy,3,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#555'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(wx-Math.cos(wheelA)*2.5,wy-Math.sin(wheelA)*2.5); ctx.lineTo(wx+Math.cos(wheelA)*2.5,wy+Math.sin(wheelA)*2.5); ctx.stroke();
    }
  } else if(u.type==='mcv'){
    // ===== 基地车(MCV):可展开的移动基地核心 =====
    const trackA=time*3;
    const L=-u.r, R=u.r;
    ctx.rotate(u.facing);
    // 履带
    ctx.fillStyle='#16181c'; ctx.fillRect(L, -u.r*0.9, R*2, u.r*0.5);
    ctx.fillStyle='#3a3f45'; ctx.fillRect(L, -u.r*0.9, R*2, u.r*0.12);
    ctx.fillStyle='#16181c'; ctx.fillRect(L, u.r*0.4, R*2, u.r*0.5);
    ctx.fillStyle='#3a3f45'; ctx.fillRect(L, u.r*0.4, R*2, u.r*0.12);
    // 负重轮(旋转辐条)
    for(let i=L+3;i<=R-3;i+=4){
      ctx.fillStyle='#333a42'; ctx.beginPath(); ctx.arc(i,-u.r*0.65,2.2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#333a42'; ctx.beginPath(); ctx.arc(i,u.r*0.65,2.2,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#555'; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(i-Math.cos(trackA)*1.6, -u.r*0.65-Math.sin(trackA)*1.6); ctx.lineTo(i+Math.cos(trackA)*1.6, -u.r*0.65+Math.sin(trackA)*1.6); ctx.stroke();
    }
    // 车体
    ctx.fillStyle='#46523f'; ctx.fillRect(L+2, -u.r*0.5, R*2-4, u.r*1.0);
    ctx.strokeStyle='#222'; ctx.lineWidth=1.2; ctx.strokeRect(L+2, -u.r*0.5, R*2-4, u.r*1.0);
    ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(L+2, -u.r*0.5, R*2-4, 3);
    // 上层折叠建筑模块
    ctx.fillStyle='#5b6b7a'; ctx.fillRect(-u.r+3, -u.r*0.78, u.r*2-6, u.r*0.5);
    ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.strokeRect(-u.r+3, -u.r*0.78, u.r*2-6, u.r*0.5);
    ctx.fillStyle=tc; ctx.fillRect(-u.r+5, -u.r*0.72, u.r*2-10, 3);
    // 折叠吊臂(施工塔吊)
    ctx.strokeStyle='#8a9a8a'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(-3, -u.r*0.4); ctx.lineTo(2, -u.r*1.0); ctx.lineTo(9, -u.r*1.0); ctx.stroke();
    ctx.fillStyle='#1c2024'; ctx.fillRect(3, -u.r*1.06, 8, 4);
    ctx.strokeStyle='#ffd24a'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(3, -u.r*1.06); ctx.lineTo(11, -u.r*1.06); ctx.stroke();
    // 天线
    ctx.strokeStyle='#9a9a8a'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-5, -u.r*0.2); ctx.lineTo(-8, -u.r*0.7); ctx.stroke();
    ctx.fillStyle='#ff5555'; ctx.beginPath(); ctx.arc(-8, -u.r*0.75, 1.6, 0, Math.PI*2); ctx.fill();
  } else {
    // 步兵(面向行进/射击方向,分阵营建模)
    const fac = unitFactionOf(u.team);
    ctx.rotate(u.facing);
    const step=Math.sin(time*9)*(u.order.kind==='move'?2.5:0);
    // 双脚
    ctx.fillStyle='#1c1c1c';
    ctx.fillRect(-3+step, u.r-3, 3, 3.5);
    ctx.fillRect(1-step, u.r-3, 3, 3.5);
    // 双腿
    ctx.fillStyle='#2a2f2a';
    ctx.fillRect(-2.5+step*0.5, u.r-8, 3, 6);
    ctx.fillRect(1.5-step*0.5, u.r-8, 3, 6);
    if(u.type==='exo'){
      // ===== 外骨骼大兵(盟军 · 高科技外骨骼 + 手持炮管) =====
      ctx.fillStyle='#3a4148'; ctx.fillRect(-2.5+step, u.r-5, 3, 4.5); ctx.fillRect(1.5-step, u.r-5, 3, 4.5);
      // 外骨骼躯干
      ctx.fillStyle='#4a5560'; ctx.fillRect(-4,-4,8,10);
      ctx.strokeStyle='#222'; ctx.lineWidth=1; ctx.strokeRect(-4,-4,8,10);
      ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fillRect(-4,-4,8,2);
      // 关节与管线
      ctx.strokeStyle='#8a95a0'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-3,-1); ctx.lineTo(3,-1); ctx.stroke();
      ctx.fillStyle='#2a2f35'; ctx.fillRect(-3,-3.5,6,2);
      // 背包装甲
      ctx.fillStyle='#3a4148'; ctx.fillRect(-7,-3,4,7);
      ctx.strokeStyle='#222'; ctx.strokeRect(-7,-3,4,7);
      ctx.fillStyle='#5a6a78'; ctx.fillRect(-7,-1,4,2);
      // 手持炮管(前向)
      ctx.fillStyle='#6a747e'; ctx.fillRect(0,-1.2,15,2.8);
      ctx.fillStyle='#4a525c'; ctx.fillRect(9,-2.2,6,4);
      ctx.fillStyle='#222'; ctx.fillRect(13,-1.5,1.5,3);
      ctx.fillStyle='#8a95a0'; ctx.fillRect(14,-1.5,2,3);
      if(u.fireT>u.def.rof-0.15 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(16.5,0,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(16.5,0,1.5,0,Math.PI*2); ctx.fill();
      }
      // 头盔(带目镜)
      ctx.fillStyle='#2a2f35'; ctx.beginPath(); ctx.arc(0,-4.5,3.4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#7ad0ff'; ctx.fillRect(-2.5,-5.5,5,1.5);
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(-1,-5.5,1,0,Math.PI*2); ctx.fill();
      // 队标
      ctx.fillStyle=tc; ctx.fillRect(-2,4,4,2);
    } else if(u.type==='magnet'){
      // ===== 磁暴步兵(苏军 · 钢制装甲 + 电磁手套) =====
      ctx.fillStyle='#4a5055'; ctx.fillRect(-3+step, u.r-4, 3.5, 4); ctx.fillRect(1-step, u.r-4, 3.5, 4);
      // 钢制躯干甲
      ctx.fillStyle='#6a7278'; ctx.fillRect(-4,-4,9,10);
      ctx.strokeStyle='#222'; ctx.lineWidth=1; ctx.strokeRect(-4,-4,9,10);
      ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(-4,-4,9,2);
      ctx.strokeStyle='#4a5055'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-4,1); ctx.lineTo(5,1); ctx.stroke();
      // 胸甲红星
      ctx.save(); ctx.translate(0,-1);
      ctx.fillStyle='#c03030'; ctx.beginPath();
      for(let i=0;i<5;i++){ const a=-Math.PI/2+i*2*Math.PI/5, a2=a+Math.PI/5;
        ctx.lineTo(Math.cos(a)*2.8,Math.sin(a)*2.8); ctx.lineTo(Math.cos(a2)*1.2,Math.sin(a2)*1.2); }
      ctx.closePath(); ctx.fill(); ctx.restore();
      // 背包装甲 + 能源灯
      ctx.fillStyle='#4a5055'; ctx.fillRect(-8,-3,4,8);
      ctx.strokeStyle='#222'; ctx.strokeRect(-8,-3,4,8);
      ctx.fillStyle='#7ad0ff'; ctx.fillRect(-7,-1,2,2);
      // 电磁手套(双手发光圆环)
      const ga=0.5+0.5*Math.sin(time*8);
      for(const hx of [2.5,-2.5]){
        ctx.fillStyle='#3a4a55'; ctx.beginPath(); ctx.arc(hx,3.5,2.6,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(120,220,255,'+(0.5+0.4*ga)+')'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.arc(hx,3.5,2.6,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='rgba(140,230,255,.7)'; ctx.beginPath(); ctx.arc(hx,3.5,1.2,0,Math.PI*2); ctx.fill();
      }
      // 开火瞬间双手间电弧
      if(u.fireT>u.def.rof-0.3 && u.target){
        ctx.strokeStyle='rgba(150,220,255,.9)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-2.5,3.5);
        for(let i=1;i<5;i++) ctx.lineTo(-2.5+i*1.25+(Math.random()-0.5)*3, 3.5+(Math.random()-0.5)*5);
        ctx.stroke();
      }
      // 钢盔(带红星)
      ctx.fillStyle='#5a6066'; ctx.beginPath(); ctx.arc(0,-5,3.6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#c03030'; ctx.fillRect(-1.5,-6.5,3,1.4);
      // 队标
      ctx.fillStyle=tc; ctx.fillRect(-2,4.5,4,2);
    } else if(fac==='allies'){
      // ===== 北约士兵(盟军 · 现代战术装束) =====
      ctx.fillStyle=tc; ctx.beginPath(); ctx.ellipse(0,0,u.r,u.r*0.9,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#123'; ctx.lineWidth=1.2; ctx.stroke();
      // 战术背心
      ctx.fillStyle='#24302c'; ctx.fillRect(-3,-5,6,9);
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(-2,-5); ctx.lineTo(2,4); ctx.stroke();
      // 突击步枪(带瞄准镜)
      ctx.fillStyle='#3a3228';
      ctx.fillRect(0,-1.5,13,3);
      ctx.fillRect(2,1,2,3);
      ctx.fillStyle='#555'; ctx.fillRect(9,-0.5,2,3.5);
      ctx.fillStyle='#222'; ctx.fillRect(5,-2.4,4,1);
      ctx.fillStyle='#2a2a2a'; ctx.fillRect(0,-1.5,3,3);
      if(u.fireT>u.def.rof-0.12 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(14,0,2.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(14,0,1.2,0,Math.PI*2); ctx.fill();
      }
      // 脸
      ctx.fillStyle='#e0b080'; ctx.beginPath(); ctx.arc(0,-4,3,0,Math.PI*2); ctx.fill();
      // 现代头盔(圆盔 + 夜视仪支架)
      ctx.fillStyle='#4a5a52'; ctx.beginPath(); ctx.arc(-1,-5,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#5f7268'; ctx.fillRect(-5,-6,8,1.5);
      ctx.fillStyle='#2f3a34'; ctx.fillRect(-3,-7,2.5,1.5);
      ctx.fillStyle='rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-3,-6.3,1.6,0,Math.PI*2); ctx.fill();
    } else {
      // ===== 动员兵(苏军 · 经典红军装束) =====
      ctx.fillStyle='#5f7a4a'; ctx.beginPath(); ctx.ellipse(0,0,u.r,u.r*0.9,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#123'; ctx.lineWidth=1.2; ctx.stroke();
      // 腰带
      ctx.fillStyle='#4a5a3a'; ctx.fillRect(-3,-2,6,3);
      ctx.strokeStyle='rgba(0,0,0,.3)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(-2,-5); ctx.lineTo(2,4); ctx.stroke();
      // 步枪(带刺刀)
      ctx.fillStyle='#4a3a28';
      ctx.fillRect(0,-1.5,12,3);
      ctx.fillRect(2,1,2,3);
      ctx.fillStyle='#8a9a8a'; ctx.fillRect(11,-0.7,3,1);
      ctx.fillStyle='#55422e'; ctx.fillRect(0,-1.5,3,3);
      if(u.fireT>u.def.rof-0.12 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(15,0,2.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(15,0,1.2,0,Math.PI*2); ctx.fill();
      }
      // 脸
      ctx.fillStyle='#e0b080'; ctx.beginPath(); ctx.arc(0,-4,3,0,Math.PI*2); ctx.fill();
      // 大檐帽
      ctx.fillStyle='#3f5238'; ctx.beginPath(); ctx.arc(-1,-5,4.2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#2f3f2c'; ctx.fillRect(-5.5,-6.2,9,1.8);
      ctx.fillStyle='#c03030'; ctx.fillRect(-1.5,-6.8,3,1.4);
    }
  }
  ctx.restore();
  // HP条
  if(u.hp<u.maxHp){ drawHPBar(u.x-u.r, u.y-u.r-8, u.r*2, u.hp/u.maxHp,false); }
  // 反应装甲护盾条(血条上方)
  if(u.shield>0){
    ctx.fillStyle='rgba(0,0,0,.85)'; ctx.fillRect(u.x-u.r, u.y-u.r-12, u.r*2, 3);
    ctx.fillStyle='#4fb8ff';
    ctx.fillRect(u.x-u.r, u.y-u.r-12, u.r*2*Math.min(1, u.shield/REACTIVE_SHIELD), 3);
  }
  // 队伍颜色角标(右下角小方块,区分同阵营的不同队伍)
  ctx.fillStyle=teamColor(u.team);
  ctx.fillRect(u.x+u.r*0.6, u.y+u.r+1, 7, 7);
  ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
  ctx.strokeRect(u.x+u.r*0.6-0.5, u.y+u.r+0.5, 8, 8);
}
function drawProjectiles(){
  for(const p of projectiles){
    const dx=p.tx-p.x, dy=p.ty-p.y; const d=Math.hypot(dx,dy)||1;
    // 拖尾
    ctx.strokeStyle=teamGroup(p.team)===0?'rgba(255,224,138,.45)':'rgba(255,128,128,.45)';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x-dx/d*8, p.y-dy/d*8); ctx.stroke();
    // 弹头
    ctx.fillStyle=teamGroup(p.team)===0?'#ffe08a':'#ff8080';
    ctx.beginPath(); ctx.arc(p.x,p.y,2.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.arc(p.x-1,p.y-1,1,0,Math.PI*2); ctx.fill();
  }
}
function drawEffects(){
  for(const e of effects){
    const k=clamp(e.life/e.maxLife,0,1);
    if(e.type==='explode'){
      // 白闪
      ctx.fillStyle='rgba(255,255,255,'+(0.65*k)+')';
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*0.5*k+3,0,Math.PI*2); ctx.fill();
      // 火球
      ctx.fillStyle='rgba(255,'+Math.floor(140+115*k)+',60,'+(0.55*k)+')';
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*0.6*k+2,0,Math.PI*2); ctx.fill();
      // 冲击环
      ctx.strokeStyle='rgba(255,'+(150+100*k)+',90,'+(0.85*k)+')';
      ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(1.15-0.65*k),0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*0.5*(1.1-k),0,Math.PI*2); ctx.stroke();
    } else if(e.type==='smoke'){
      const sy=e.y-(1-k)*16;
      ctx.fillStyle='rgba(90,95,95,'+(0.30*k)+')';
      ctx.beginPath(); ctx.arc(e.x, sy, e.r*(1.2-k*0.3), 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(45,47,47,'+(0.15*k)+')';
      ctx.beginPath(); ctx.arc(e.x-2, sy+2, e.r*0.8, 0, Math.PI*2); ctx.fill();
    } else if(e.type==='burn'){
      ctx.fillStyle='rgba(28,24,18,'+(0.55*k)+')';
      ctx.beginPath(); ctx.ellipse(e.x,e.y,e.r,e.r*0.6,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(20,18,14,'+(0.3*k)+')';
      ctx.beginPath(); ctx.ellipse(e.x,e.y,e.r*0.7,e.r*0.4,0,0,Math.PI*2); ctx.fill();
    } else if(e.type==='ring'){
      ctx.strokeStyle='rgba(140,255,180,'+k+')';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(1-k),0,Math.PI*2); ctx.stroke();
    } else if(e.type==='bolt'){
      // 磁暴步兵闪电:起点->终点曲折电链
      const seg=7;
      const pts=[];
      for(let i=0;i<=seg;i++){
        const t=i/seg;
        const jx=(i>0&&i<seg)?(Math.random()-0.5)*13:0;
        const jy=(i>0&&i<seg)?(Math.random()-0.5)*13:0;
        pts.push([e.sx+(e.tx-e.sx)*t+jx, e.sy+(e.ty-e.sy)*t+jy]);
      }
      ctx.save();
      ctx.lineCap='round';
      ctx.strokeStyle='rgba(120,200,255,'+(0.40*k)+')'; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.stroke();
      ctx.strokeStyle='rgba(215,240,255,'+(0.9*k)+')'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.stroke();
      ctx.fillStyle='rgba(150,220,255,'+(0.8*k)+')';
      ctx.beginPath(); ctx.arc(e.tx,e.ty,4+3*k,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,'+(0.9*k)+')';
      ctx.beginPath(); ctx.arc(e.tx,e.ty,1.8,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}
function drawTexts(){
  ctx.font='bold 12px "Microsoft YaHei"';
  ctx.textAlign='center';
  ctx.lineJoin='round';
  for(const t of texts){
    const a=clamp(t.life/0.4,0,1);
    ctx.globalAlpha=a;
    ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.65)'; ctx.strokeText(t.str, t.x, t.y);
    ctx.fillStyle=t.color; ctx.fillText(t.str, t.x, t.y);
    ctx.globalAlpha=1;
  }
}
function drawSel(){
  for(const u of selected){
    ctx.strokeStyle='#8aff8a'; ctx.lineWidth=2;
    ctx.setLineDash([6,5]); ctx.lineDashOffset=-time*22;
    ctx.beginPath(); ctx.arc(u.x,u.y,u.r+4,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(140,255,170,.35)';
    ctx.beginPath(); ctx.arc(u.x,u.y,u.r+4,0,Math.PI*2); ctx.fill();
  }
  if(selBuilding && selBuilding.alive){
    const pul=0.5+0.5*Math.sin(time*6);
    ctx.strokeStyle='rgba(140,255,170,'+(0.55+0.45*pul)+')'; ctx.lineWidth=2;
    ctx.strokeRect(selBuilding.tx*TILE-3, selBuilding.ty*TILE-3, selBuilding.w*TILE+6, selBuilding.h*TILE+6);
    ctx.fillStyle='rgba(140,255,170,'+(0.08+0.06*pul)+')';
    ctx.fillRect(selBuilding.tx*TILE-3, selBuilding.ty*TILE-3, selBuilding.w*TILE+6, selBuilding.h*TILE+6);
  }
  // 框选
  if(mouse.dragging){
    const x0=worldFromScreen(mouse.downX,mouse.downY).x, y0=worldFromScreen(mouse.downX,mouse.downY).y;
    const x1=worldFromScreen(mouse.x,mouse.y).x, y1=worldFromScreen(mouse.x,mouse.y).y;
    ctx.fillStyle='rgba(120,255,160,.15)';
    ctx.fillRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0),Math.abs(y1-y0));
    ctx.strokeStyle='rgba(120,255,160,.8)'; ctx.lineWidth=1;
    ctx.strokeRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0),Math.abs(y1-y0));
  }
}
function drawPlacing(){
  if(!placing) return;
  const mw=mouseWorld();
  const d=placing.def;
  const tx=Math.floor(mw.x/TILE-d.w/2), ty=Math.floor(mw.y/TILE-d.h/2);
  const ok=canPlaceAt(tx,ty,d,placing.team) && credits[placing.team]>=d.cost;
  ctx.fillStyle=ok?'rgba(120,255,160,.35)':'rgba(255,90,90,.4)';
  ctx.fillRect(tx*TILE,ty*TILE,d.w*TILE,d.h*TILE);
  ctx.strokeStyle=ok?'#8aff8a':'#ff5555'; ctx.lineWidth=2;
  ctx.strokeRect(tx*TILE,ty*TILE,d.w*TILE,d.h*TILE);
  ctx.fillStyle='#fff'; ctx.font='12px "Microsoft YaHei"'; ctx.textAlign='center';
  ctx.fillText(d.name+' $'+d.cost, tx*TILE+d.w*TILE/2, ty*TILE-8);
}
function drawSelling(){
  if(!selling) return;
  ctx.font='10px "Microsoft YaHei"'; ctx.textAlign='center';
  for(const b of buildings){
    if(!b.alive || b.team!==TEAM_A || b.defName==='command') continue;
    const x=b.tx*TILE, y=b.ty*TILE, w=b.w*TILE, h=b.h*TILE;
    const refund=Math.floor(b.def.cost*(b.constructing?0.5:0.75));
    ctx.fillStyle='rgba(255,80,80,.15)'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#ff6a6a'; ctx.lineWidth=2; ctx.strokeRect(x-2,y-2,w+4,h+4);
    ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(b.x-18, y-18, 36, 14);
    ctx.fillStyle='#ffd0a0'; ctx.fillText('$'+refund, b.x, y-7);
  }
}
function drawHudOverlay(){
  // 放置模式提示
  // 文字特效已在世界坐标渲染
}
function drawMinimap(){
  const mmw=mmCv.width, mmh=mmCv.height;
  const s=mmw/W;
  mmCtx.fillStyle='#1a241a';
  mmCtx.fillRect(0,0,mmw,mmh);
  // 地形
  for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++){
    const t=terrain[x][y];
    mmCtx.fillStyle = t==='water' ? '#22486e' : (t==='tree' ? '#1c3a24' : '#273a29');
    mmCtx.fillRect(x*s,y*s,s+0.4,s+0.4);
  }
  // 矿
  mmCtx.fillStyle='#d8b840';
  for(const o of oreFields) if(o.amount>0) mmCtx.fillRect(o.x*s-2,o.y*s-2,4,4);
  // 建筑
  for(const b of buildings){
    if(!b.alive) continue;
    mmCtx.fillStyle=teamCol(b.team);
    mmCtx.fillRect((b.x-b.w*TILE/2)*s,(b.y-b.h*TILE/2)*s,Math.max(3,b.w*TILE*s),Math.max(3,b.h*TILE*s));
  }
  // 单位
  for(const u of units){
    mmCtx.fillStyle=teamCol(u.team);
    mmCtx.fillRect(u.x*s-1,u.y*s-1,2,2);
  }
  // 视野框
  mmCtx.strokeStyle='#ffffff';
  mmCtx.lineWidth=1.5;
  mmCtx.strokeRect(cam.x*s, cam.y*s, canvas.width*s, canvas.height*s);
}
