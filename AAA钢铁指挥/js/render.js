"use strict";
/* ============ render.js: 渲染 ============ */
let mmTerrainCache = null;
let mmTerrainKey = '';
let terrainCache = null;
let terrainCacheKey = '';
function onView(x,y,m){ return x>cam.x-m && x<cam.x+viewW()+m && y>cam.y-m && y<cam.y+viewH()+m; }
function render(){
  ctx.clearRect(0,0,viewW(),viewH());
  ctx.save();
  const shx=(Math.random()-0.5)*shake, shy=(Math.random()-0.5)*shake;
  ctx.translate(-cam.x+shx,-cam.y+shy);
  drawTerrain();
  drawCloudShadows();
  drawOre();
  drawTrackMarks();
  for(const b of buildings){ if(b.alive && onView(b.x,b.y,180)) drawBuilding(b); }
  for(const u of units){ if(!u.fly && onView(u.x,u.y,180)) drawUnit(u); }
  for(const u of units){ if(u.fly && onView(u.x,u.y,180)) drawUnit(u); }   // 飞机享有最高显示权:最后绘制,覆盖所有单位/建筑
  drawProjectiles();
  drawMissiles();
  drawInterceptors();
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
/* ============ 水域过渡(海岸线):陆地格邻水时选"陆地+水缘"过渡图 ============ */
// 邻水方向/足迹表/突出判定共用 config.js 的 COAST_NEIGH/COAST_FOOT/coastWaterDirs/isCoastProtruding
// 返回该陆地格的过渡图(无水邻接/无素材→null,走原草地)。确定性:只用 terrain 邻域 + v。
function coastTileFor(x, y, v){
  const water=coastWaterDirs(x,y);
  if(!water.length) return null;
  // 足迹匹配:覆盖的水方向越多越好、图里"含水但实际是陆地"的方向越少越好。
  // 关键门槛:必须"盖全"所有邻水方向(缺任何一处=陆地格向水内突出/复杂海岸,
  // 单张过渡图盖不全 → 用纯草地那 16 张,不硬贴过渡图)。
  let best=null, bestScore=-1e9;
  for(const dir of COAST_DIRS){
    const foot=COAST_FOOT[dir];
    let covered=0, extra=0, missing=0;
    for(const d of foot){ if(water.includes(d)) covered++; else extra++; }
    for(const d of water){ if(!foot.includes(d)) missing++; }
    if(missing>0) continue;
    const score=covered*10 - extra;
    if(score>bestScore){ bestScore=score; best=dir; }
  }
  if(bestScore<0 || !best) return null;   // 没有能盖全的过渡图 → 走纯草地
  const group=coastTiles[best];
  if(!group || !group.length) return null;
  return group[group[1] ? (v%2) : 0] || group[0] || null;   // 角有变体,按 v 定选(不闪烁)
}
// 单个地形格绘制(被 buildTerrainCache 全量调用,也被 patchTerrainTile 局部调用)
function drawTerrainTileTo(g, x, y){
  const px=x*TILE, py=y*TILE;
  const v=tileVariation(x,y);
  const t=terrain[x][y];
  if(t==='water'){
    const wtile=waterTiles[(x*11+y*7+v)%WATER_TILE_COUNT];
    if(wtile){ g.drawImage(wtile, px, py, TILE, TILE); }
    else { g.fillStyle='#2a5a8a'; g.fillRect(px,py,TILE,TILE); g.fillStyle='#2f6396'; g.fillRect(px,py,TILE,TILE*0.5); }
  } else if(t==='tree'){
    const tile=imgs['tree'];
    if(tile){ const s=Math.min(TILE/tile.width, TILE/tile.height); const dw=tile.width*s, dh=tile.height*s; g.drawImage(tile, px+(TILE-dw)/2, py+(TILE-dh)/2, dw, dh); }
    else {
      g.fillStyle=((x+y)%2===0)?'#4a9a5a':'#3f8a4e'; g.fillRect(px,py,TILE,TILE);
      const cx=px+16, cy=py+16;
      g.fillStyle='#4a3018'; g.fillRect(cx-2,cy+2,5,9);
      g.fillStyle='#2f7a3a'; g.beginPath(); g.arc(cx,cy-2,9,0,Math.PI*2); g.fill();
      g.fillStyle='#3f8f4e'; g.beginPath(); g.arc(cx-4,cy-6,6.5,0,Math.PI*2); g.fill();
      g.fillStyle='#347f42'; g.beginPath(); g.arc(cx+4,cy-5,6,0,Math.PI*2); g.fill();
      g.fillStyle='rgba(255,255,255,.12)'; g.beginPath(); g.arc(cx-3,cy-8,3,0,Math.PI*2); g.fill();
    }
  } else {
    // 水域过渡:邻水的陆地格优先画"陆地+水缘"过渡图(无水邻接走原草地)
    const coast=coastTileFor(x,y,v);
    if(coast){ g.drawImage(coast, px, py, TILE, TILE); }
    else {
      const tile=terrainTiles[(x*7+y*13+v)%TERRAIN_TILE_COUNT];
      if(tile){ g.drawImage(tile, px, py, TILE, TILE); }
      else {
        const base=(x+y)%2===0?'#4a9a5a':'#3f8a4e';
        g.fillStyle=base; g.fillRect(px,py,TILE,TILE);
        if(v%5===0){ g.fillStyle='rgba(0,0,0,.05)'; g.fillRect(px,py,TILE,TILE); }
        else if(v%7===0){ g.fillStyle='rgba(255,255,255,.05)'; g.fillRect(px,py,TILE,TILE); }
        const d=v%100;
        if(d<14){
          g.strokeStyle='#2f7a3a'; g.lineWidth=1.2;
          const gx=px+(v%28)+3, gy=py+10+((v>>2)%14);
          g.beginPath(); g.moveTo(gx,gy); g.lineTo(gx-3,gy-6); g.moveTo(gx,gy); g.lineTo(gx+1,gy-7); g.moveTo(gx,gy); g.lineTo(gx+4,gy-5); g.stroke();
        } else if(d<18){
          const fx=px+(v%28)+6, fy=py+14+((v>>3)%12);
          g.fillStyle='#e8e8e8'; g.beginPath(); g.arc(fx,fy,1.8,0,Math.PI*2); g.fill();
          g.fillStyle='#ffe27a'; g.beginPath(); g.arc(fx,fy,0.9,0,Math.PI*2); g.fill();
        } else if(d>=97){
          g.fillStyle='#6a7468'; g.beginPath(); g.ellipse(px+16,py+18,5,3.5,0.3,0,Math.PI*2); g.fill();
          g.fillStyle='#7d8778'; g.beginPath(); g.ellipse(px+14,py+17,2.5,1.6,0.3,0,Math.PI*2); g.fill();
        }
      }
    }
  }
}
function buildTerrainCache(){
  if(!terrainCache) terrainCache=document.createElement('canvas');
  terrainCache.width=W; terrainCache.height=H;
  const g=terrainCache.getContext('2d');
  for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++) drawTerrainTileTo(g, x, y);
}
// 碾树等局部地形变化:只重绘受影响的一格,避免整图 4096 格重画(地图重建才走全量)
function patchTerrainTile(tx, ty){
  if(!terrainCache || terrainCacheKey!==MAP_W+'x'+MAP_H+':'+terrainVersion) return;
  drawTerrainTileTo(terrainCache.getContext('2d'), tx, ty);
}

function drawTerrain(){
  const cacheKey = MAP_W+'x'+MAP_H+':'+terrainVersion;   // 地形渲染缓存:仅地图重建时失效(碾树走 patchTerrainTile)
  if(W*H <= 4096*4096){
    if(!terrainCache || terrainCache.width!==W || terrainCache.height!==H || terrainCacheKey!==cacheKey){
      buildTerrainCache();
      terrainCacheKey=cacheKey;
    }
    ctx.drawImage(terrainCache, cam.x, cam.y, viewW(), viewH(), cam.x, cam.y, viewW(), viewH());
    for(const b of buildings){ if(b.alive && b.defName==='command') drawOwnZone(b); }
    return;
  }
  const x0=Math.max(0,Math.floor(cam.x/TILE)-1), x1=Math.min(MAP_W,Math.ceil((cam.x+viewW())/TILE)+1);
  const y0=Math.max(0,Math.floor(cam.y/TILE)-1), y1=Math.min(MAP_H,Math.ceil((cam.y+viewH())/TILE)+1);
  for(let x=x0;x<x1;x++) for(let y=y0;y<y1;y++){
    const px=x*TILE, py=y*TILE;
    const v=tileVariation(x,y);
    const t=terrain[x][y];
    if(t==='water'){
      // 水域:照片水块随机平铺(每格固定一块);加载失败回退纯色水面
      const wtile=waterTiles[(x*11+y*7+v)%WATER_TILE_COUNT];
      if(wtile){
        ctx.drawImage(wtile, px, py, TILE, TILE);
      } else {
        ctx.fillStyle='#2a5a8a'; ctx.fillRect(px,py,TILE,TILE);
        ctx.fillStyle='#2f6396'; ctx.fillRect(px,py,TILE,TILE*0.5);
      }
    } else if(t==='tree'){
      // 树林:整张树林贴图(压缩后,未切块)按比例放进格子;加载失败回退程序化树木
      const tile=imgs['tree'];
      if(tile){
        const s=Math.min(TILE/tile.width, TILE/tile.height);
        const dw=tile.width*s, dh=tile.height*s;
        ctx.drawImage(tile, px+(TILE-dw)/2, py+(TILE-dh)/2, dw, dh);
      } else {
        ctx.fillStyle=((x+y)%2===0)?'#4a9a5a':'#3f8a4e'; ctx.fillRect(px,py,TILE,TILE);
        const cx=px+16, cy=py+16;
        ctx.fillStyle='#4a3018'; ctx.fillRect(cx-2,cy+2,5,9);
        ctx.fillStyle='#2f7a3a'; ctx.beginPath(); ctx.arc(cx,cy-2,9,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#3f8f4e'; ctx.beginPath(); ctx.arc(cx-4,cy-6,6.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#347f42'; ctx.beginPath(); ctx.arc(cx+4,cy-5,6,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(cx-3,cy-8,3,0,Math.PI*2); ctx.fill();
      }
    } else {
      // 水域过渡:邻水的陆地格优先画"陆地+水缘"过渡图
      const coast=coastTileFor(x,y,v);
      if(coast){
        ctx.drawImage(coast, px, py, TILE, TILE);
      } else {
      // 草地:照片草块随机平铺(每格固定一块,不闪烁);加载失败回退程序化草地
      const tile=terrainTiles[(x*7+y*13+v)%TERRAIN_TILE_COUNT];
      if(tile){
        ctx.drawImage(tile, px, py, TILE, TILE);
      } else {
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
  const img = imgs['goldmine'];
  for(const o of oreFields){
    if(o.amount<=0) continue;   // 采完即消失
    const tx=o.tx, ty=o.ty, px=tx*TILE, py=ty*TILE;
    if(img){
      // 金矿照片贴图(已去白底)按比例放进单格,不拉伸
      const s=Math.min(TILE/img.width, TILE/img.height);
      const dw=img.width*s, dh=img.height*s;
      ctx.drawImage(img, px+(TILE-dw)/2, py+(TILE-dh)/2, dw, dh);
    } else {
      // 回退:程序化金色晶体
      const pct=o.amount/o.max;
      const r=TILE*0.55*Math.max(0.45, pct);
      const cx=o.x, cy=o.y;
      const grd=ctx.createRadialGradient(cx,cy,2,cx,cy,r*1.7);
      grd.addColorStop(0,'rgba(255,226,120,.32)');
      grd.addColorStop(1,'rgba(255,226,120,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r*1.7,0,Math.PI*2); ctx.fill();
      for(let i=0;i<10;i++){
        const a=i/10*Math.PI*2;
        const dx=cx+Math.cos(a)*r*0.5, dy=cy+Math.sin(a)*r*0.5;
        const s2=r*0.17;
        ctx.fillStyle=(i%2===0)?'#e8c84a':'#d3ad38';
        ctx.beginPath(); ctx.moveTo(dx,dy-s2); ctx.lineTo(dx+s2*0.72,dy+s2*0.6); ctx.lineTo(dx-s2*0.72,dy+s2*0.6); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle='#f4e070';
      ctx.beginPath(); ctx.moveTo(cx,cy-r*0.85); ctx.lineTo(cx+r*0.5,cy+1); ctx.lineTo(cx-r*0.5,cy+1); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.moveTo(cx,cy-r*0.85); ctx.lineTo(cx+r*0.15,cy-r*0.1); ctx.lineTo(cx-r*0.1,cy-r*0.2); ctx.closePath(); ctx.fill();
    }
  }
}
function roundRectPath(x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
/* ============ 建筑四层渲染架构 ============ */
// 层0:地基/水泥扩展层 —— 略大于建筑的暗色泥土/碎石底座,羽化边缘,破除"直接插在草地上"
function drawBuildingPad(x, y, w, h, cx, cy, cAlpha){
  const pad = BUILDING_PAD_EXTRA;
  const px = x-pad, py = y-pad, pw = w+pad*2, ph = h+pad*2;
  ctx.save();
  ctx.globalAlpha = BUILDING_PAD_ALPHA * (cAlpha||1);
  // 径向渐变:中心深、边缘全透明,形成羽化的泥土底座
  const g = ctx.createRadialGradient(cx, cy, Math.min(w,h)*0.25, cx, cy, Math.max(pw,ph)*0.62);
  g.addColorStop(0, 'rgba(64,52,34,0.9)');
  g.addColorStop(0.55, 'rgba(64,52,34,0.55)');
  g.addColorStop(1, 'rgba(64,52,34,0)');
  ctx.fillStyle = g;
  roundRectPath(px, py, pw, ph, 7);
  ctx.fill();
  ctx.restore();
}
// 层1:方向性建筑长阴影 —— 右下偏移的平行四边形,线性渐变软边,模拟日光立体长阴影
function drawBuildingShadow(x, y, w, h, cAlpha){
  const o = BUILDING_SHADOW_OFFSET, sc = BUILDING_SHADOW_SCALE;
  const sx = o.x, sy = o.y;
  const sw = w*sc.x, sh = h*sc.y;
  ctx.save();
  ctx.globalAlpha = BUILDING_SHADOW_ALPHA * (cAlpha||1);
  const g = ctx.createLinearGradient(x, y, x+sx+sw, y+sy+sh);
  g.addColorStop(0, 'rgba(15,20,15,0.85)');
  g.addColorStop(0.6, 'rgba(15,20,15,0.35)');
  g.addColorStop(1, 'rgba(15,20,15,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + sx*0.4, y + sy*0.4);
  ctx.lineTo(x + sx + sw, y + sy*0.4);
  ctx.lineTo(x + sx + sw, y + sy + sh);
  ctx.lineTo(x + sx*0.4, y + sy + sh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
// 层2:墙根接触阴影 AO —— 建筑底部一条极窄极暗的遮挡线,把建筑"压实"在地面
function drawWallAO(x, y, w, h, cAlpha){
  const ao = BUILDING_AO_HEIGHT;
  ctx.save();
  ctx.globalAlpha = cAlpha||1;
  const g = ctx.createLinearGradient(0, y+h-ao, 0, y+h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,'+BUILDING_AO_ALPHA+')');
  ctx.fillStyle = g;
  ctx.fillRect(x, y+h-ao, w, ao);
  ctx.restore();
}
// 水上建筑(船坞):不做泥土底座,只留淡的水面投影,避免"黑影+泥地"出现在水里
function drawWaterBuildingBase(cx, cy, w, h){
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#0e1c2c';
  ctx.beginPath(); ctx.ellipse(cx, cy+h*0.55, w*0.62, h*0.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.08;
  ctx.beginPath(); ctx.ellipse(cx, cy+h*0.6, w*0.85, h*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawBuilding(b){
  if(!b.alive) return;
  const x=b.tx*TILE, y=b.ty*TILE, w=b.w*TILE, h=b.h*TILE;
  const tc = b.team<0 ? '#c9b58a' : teamCol(b.team);
  const cx=b.x, cy=b.y;
  // 建造厂/战车工厂:使用照片贴图(已去纯白背景),加载失败自动回退程序化绘制
  // 发电站:按升级等级 powerLevel(0/1/2) 选对应贴图 power_0/1/2,不替换建造栏图标 power
  // 兵营/精炼厂:用独立的战场贴图 barracks_field/refinery_field,不碰建造栏图标
  let img;
  if(b.defName==='power') img = imgs['power'+(b.powerLevel||0)] || imgs['power'];
  else if(b.defName==='barracks') img = imgs['barracks_field'];
  else if(b.defName==='refinery') img = imgs['refinery_field'];
  else if(b.defName==='lab') img = imgs['lab_field'];
  else if(b.defName==='turret') img = imgs['turret_field'];
  else if(b.defName==='dock') img = imgs['dock_field'];
  else if(b.defName==='repair') img = imgs['repair_field'];
  else img = imgs[b.defName];
  const useImg = !!img;
  // 建造中:地基/阴影按进度淡出(全息投影阶段不投浓影)
  const cAlpha = b.constructing ? 0.35 : 1;
  // ===== 层0:地基/水泥扩展层 =====
  if(b.def.water) drawWaterBuildingBase(cx, cy, w, h);
  else drawBuildingPad(x, y, w, h, cx, cy, cAlpha);
  // ===== 层1:方向性建筑长阴影(建造中不投长影) =====
  if(!b.constructing) drawBuildingShadow(x, y, w, h, cAlpha);
  // ===== 层2:墙根接触阴影 AO =====
  if(!b.constructing && !b.def.water) drawWallAO(x, y, w, h, cAlpha);
  if(useImg){
    // 层3:建筑主体贴图(按比例放进占地,不拉伸变形;建造中半透明显示)
    const iw=img.width, ih=img.height;
    const s=Math.min(w/iw, h/ih);
    const dw=iw*s, dh=ih*s;
    ctx.save();
    if(b.constructing) ctx.globalAlpha=0.35;
    ctx.drawImage(img, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
    ctx.restore();
  } else if(b.defName==='dock'){
    drawDockBody(b, x, y, w, h, cx, cy, tc);
  } else {
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
  // 屋顶边框(去队色)
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
  }

  if(b.defName==='command' && !useImg){
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
  } else if(b.defName==='power' && !useImg){
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
  } else if(b.defName==='barracks' && !useImg){
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
  } else if(b.defName==='factory' && !useImg){
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
  } else if(b.defName==='refinery' && !useImg){
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
    if(!useImg){
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
    }
    // 旋转机枪(贴图中心/程序化底座上都画,朝目标转动,发射原有机炮)
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
  } else if(b.defName==='repair' && !useImg){
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
  // 战车工厂/兵营/建造厂升级进度
  if(b.upgrading){
    const uTime = b.defName==='command' ? COMMAND_UPGRADE_TIME : (b.defName==='barracks' ? BARRAX_UPGRADE_TIME : FACTORY_UPGRADE_TIME);
    ctx.fillStyle='rgba(255,226,122,.14)'; ctx.fillRect(x+2,y+2,w-4,h-4);
    const pct=clamp(b.upgradeProg/uTime,0,1);
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
      const qd=getUnitDefs(unitFactionOf(b.team))[it.type];
      ctx.fillText(qd ? qd.name[0] : '?', qx+7.5, y-5);
      qx+=18;
    }
  }
  // 机场停机位(4 格):只显示"停驻中"的飞机占格;飞出去的飞机对应格子消除
  if(b.defName==='airfield' && !b.constructing){
    let used=0;
    for(const u of units){ if(u.hp>0 && u.fly && u.parked && u.homeBase===b) used++; }
    const pipW=(w-16)/AIRFIELD_CAPACITY;
    for(let i=0;i<AIRFIELD_CAPACITY;i++){
      const px=x+8+i*pipW+(pipW-8)/2;
      ctx.fillStyle = i<used ? 'rgba(120,255,160,.85)' : 'rgba(10,14,12,.55)';
      ctx.fillRect(px, y+h-14, 8, 6);
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1;
      ctx.strokeRect(px+0.5, y+h-13.5, 7, 5);
    }
  }
  // 建造厂升级星标(金色,区别于战车工厂的程序化星标)
  if(b.defName==='command' && b.upgraded){
    ctx.save(); ctx.translate(x+w*0.14, y+h*0.16);
    ctx.fillStyle='#ffd24a';
    ctx.beginPath();
    for(let i=0;i<5;i++){ const a=-Math.PI/2+i*2*Math.PI/5, a2=a+Math.PI/5;
      ctx.lineTo(Math.cos(a)*7,Math.sin(a)*7); ctx.lineTo(Math.cos(a2)*3,Math.sin(a2)*3); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(120,80,0,.6)'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }
  // 队伍颜色角标(右上角小方块,区分同阵营的不同队伍)
  ctx.fillStyle=teamColor(b.team);
  ctx.fillRect(x+w-11, y+8, 8, 8);
  ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
  ctx.strokeRect(x+w-11.5, y+7.5, 9, 9);
}
function drawDockBody(b, x, y, w, h, cx, cy, tc){
  // ===== 船坞:木质浮台 + 仓库 + 龙门吊 + 干船坞斜坡 =====
  // 浮台
  ctx.fillStyle='#4a5246'; ctx.fillRect(x-4,y-4,w+8,h+8);
  ctx.fillStyle='#5a6450'; ctx.fillRect(x-2,y-2,w+4,h+4);
  // 甲板木条纹
  ctx.strokeStyle='rgba(0,0,0,.22)'; ctx.lineWidth=1;
  for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(x-2,y+i*h/4); ctx.lineTo(x+w+2,y+i*h/4); ctx.stroke(); }
  // 系船墩
  ctx.fillStyle='#3a4248';
  for(const px of [x+5, x+w-6]){ ctx.beginPath(); ctx.arc(px, y+h-7, 3, 0, Math.PI*2); ctx.fill(); }
  // 仓库(左侧厂房)
  ctx.fillStyle='#5b6b7a'; ctx.fillRect(x+4,y+4,w*0.5,h*0.56);
  ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.strokeRect(x+4,y+4,w*0.5,h*0.56);
  // 仓库人字屋顶
  ctx.fillStyle='#8a4a3a';
  ctx.beginPath(); ctx.moveTo(x+2,y+5); ctx.lineTo(x+3+w*0.25,y-5); ctx.lineTo(x+4+w*0.5,y+5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.3)'; ctx.stroke();
  // 仓库大门
  ctx.fillStyle='#20242a'; ctx.fillRect(x+9,y+h*0.3,11,9);
  ctx.strokeStyle='#3a4148'; ctx.strokeRect(x+9,y+h*0.3,11,9);
  // 龙门吊(右侧,面向水面)
  const gx0=x+w*0.62;
  ctx.fillStyle='#4a5258'; ctx.fillRect(gx0-3, cy-h*0.42, 4, h*0.42);
  ctx.fillStyle='#4a5258'; ctx.fillRect(gx0+14, cy-h*0.42, 4, h*0.42);
  ctx.fillStyle='#3a4248'; ctx.fillRect(gx0-3, cy-h*0.46, 21, 4);
  // 吊臂 + 吊钩(可上下微动)
  const hook=Math.sin(time*2)*2;
  ctx.strokeStyle='#6a7670'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(gx0+11, cy-h*0.42); ctx.lineTo(gx0+11, cy-h*0.12+hook); ctx.stroke();
  ctx.fillStyle='#8a4a3a'; ctx.beginPath(); ctx.arc(gx0+11, cy-h*0.08+hook, 2.6, 0, Math.PI*2); ctx.fill();
  // 滑道/干船坞(朝水延伸)
  ctx.fillStyle='#3a4238'; ctx.fillRect(x+w-18, y+h-11, 18, 7);
  ctx.fillStyle='#2f3730'; ctx.fillRect(x+w-18, y+h-11, 18, 3);
  // 停泊的舰艇剪影(水中)
  ctx.fillStyle='#5a6268';
  ctx.beginPath(); ctx.ellipse(cx+w*0.2, cy+h*0.62, 15, 4.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle='#4c545a';
  ctx.beginPath(); ctx.ellipse(cx+w*0.24, cy+h*0.6, 9, 3.2, 0, 0, Math.PI*2); ctx.fill();
  // 水波拍岸
  const wa=(Math.sin(time*2.4+x*0.1)*0.5+0.5);
  ctx.fillStyle='rgba(180,220,255,'+(0.10+0.12*wa)+')';
  ctx.fillRect(x-4, y+h+3, w+8, 2.5);
}
function drawHPBar(cx, y, w, pct, isConstruct){  if(pct>1)pct=1; if(pct<0)pct=0;
  ctx.fillStyle='rgba(0,0,0,.85)'; ctx.fillRect(cx-1,y-1,w+2,7);
  ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(cx,y,w,5);
  const col=isConstruct?'#ffe27a':(pct>0.5?'#4fdc7a':(pct>0.25?'#ffcf3a':'#ff5555'));
  ctx.fillStyle=col; ctx.fillRect(cx,y,w*pct,5);
  ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(cx,y,w*pct,1.5);
}
/* ============ 履带/轮子压痕(接地细节) ============ */
// 坦克/车辆移动时在身后生成的低透明度地面残影,随时间淡出,增强"与地面的互动感"
function drawTrackMarks(){
  for(const m of trackMarks){
    if(!onView(m.x,m.y,48)) continue;
    const k=m.life/m.maxLife;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.a);
    ctx.globalAlpha = 0.14 + 0.32*k;   // 泥土灰压痕,随时间淡出
    ctx.fillStyle = '#2c3428';
    ctx.fillRect(-m.l/2, -m.w/2, m.l, m.w);
    ctx.restore();
  }
}
// 照片单位的战场贴图:坦克/艾布拉姆/T90 用本体图,其余用 *_field
function unitPhotoImg(u){
  const t=u.type;
  // 独立炮塔载具:阴影剪影用车身图(车身/炮塔分两张,按阵营/type 取键)
  if(isTurretUnit(u)){
    const tk=turretKeys(u);
    if(imgs[tk[0]] && imgs[tk[0]].width) return imgs[tk[0]];
  }
  if(t==='tank') return (unitFactionOf(u.team)==='soviet') ? imgs['tank_soviet_field'] : imgs['tank_allies_field'];
  if(t==='abrams' || t==='t90') return imgs[t+'_body'];   // 车身+炮塔结构:阴影用车身
  if(t==='bradley' || t==='b11' || t==='marder' || t==='leclerc' || t==='leopard' || t==='challenger') return imgs[t+'_field'];
  if(t==='harvester' || t==='destroyer' || t==='transport') return imgs[t+'_field'];
  if(t==='mcv' || t==='airfield_car') return imgs[t+'_field'];
  if(t==='puma') return imgs['puma_body'];
  if(t==='f16' || t==='su35') return imgs[t+'_field'];   // 战斗机
  if(t==='infantry') return (unitFactionOf(u.team)==='soviet') ? imgs['infantry_soviet_field'] : imgs['infantry_allies_field'];
  if(t==='exo' || t==='magnet') return imgs[t+'_field'];
  return null;
}
/* ---- 预烘焙缓存:滤镜 / 阴影都在第一次用到时烘焙到离屏 Canvas,运行期零 filter 开销 ---- */
const BAKE_MAX = 384;                 // 烘焙最大边长(屏幕上的坦克才 ~68px,足够清晰还省显存)
const _toneCache = {};                // img.src -> 色调对齐版
const _shadowCache = {};              // img.src -> 模糊黑色剪影
function bakeSize(w,h){ const k=Math.min(1, BAKE_MAX/Math.max(w,h)); return [Math.max(1,Math.round(w*k)), Math.max(1,Math.round(h*k))]; }
// 等价 PixiJS ColorMatrixFilter:按 UNIT_TONE_FILTER(饱和度/对比度/亮度/色相)烘焙一次
function bakedTone(img){
  if(!UNIT_TONE_FILTER) return img;
  const key = img.src || (img.width+'x'+img.height);
  if(_toneCache[key]) return _toneCache[key];
  try{
    const [tw,th]=bakeSize(img.width,img.height);
    const c=document.createElement('canvas'); c.width=tw; c.height=th;
    const g=c.getContext('2d');
    g.filter = UNIT_TONE_FILTER;
    g.drawImage(img, 0, 0, tw, th);
    g.filter = 'none';
    _toneCache[key] = c;
    return c;
  }catch(e){ _toneCache[key] = img; return img; }
}
// 等价 PixiJS DropShadow/BlurFilter:黑色剪影(source-in) + 高斯模糊,烘焙一次
function bakedShadow(img){
  const key = img.src || (img.width+'x'+img.height);
  if(_shadowCache[key]) return _shadowCache[key];
  try{
    const [tw,th]=bakeSize(img.width,img.height);
    // 1) 黑色剪影(保留贴图 alpha,颜色压黑)
    const sil=document.createElement('canvas'); sil.width=tw; sil.height=th;
    const g1=sil.getContext('2d');
    g1.drawImage(img, 0, 0, tw, th);
    g1.globalCompositeOperation='source-in';
    g1.fillStyle='#000';
    g1.fillRect(0, 0, tw, th);
    g1.globalCompositeOperation='source-over';
    // 2) 对剪影做一次高斯模糊
    const c=document.createElement('canvas'); c.width=tw; c.height=th;
    const g2=c.getContext('2d');
    g2.filter = 'blur('+UNIT_SHADOW_BLUR+'px)';
    g2.drawImage(sil, 0, 0);
    g2.filter = 'none';
    _shadowCache[key] = c;
    return c;
  }catch(e){ _shadowCache[key] = null; return null; }
}
const _rectShadowCache = {};
// 剪影 L 形投影烘焙:把车体贴图压成黑色剪影,再按"渲染尺寸×16%"的高斯模糊一次。
// 相对车体只偏移一点点(UNIT_SHADOW_L_OFFSET),露出右下 L 形黑边;模糊+低不透明度=淡化纯黑。
const _lShadowCache = {};
function bakedLSilhouette(img, dw, dh){
  const key=(img.src||'')+'@'+Math.round(dw)+'x'+Math.round(dh);
  if(_lShadowCache[key]) return _lShadowCache[key];
  try{
    const W=Math.max(1,Math.round(dw)), H=Math.max(1,Math.round(dh));
    const sil=document.createElement('canvas'); sil.width=W; sil.height=H;
    const g1=sil.getContext('2d');
    g1.drawImage(img,0,0,W,H);
    g1.globalCompositeOperation='source-in';
    g1.fillStyle='#000';
    g1.fillRect(0,0,W,H);
    g1.globalCompositeOperation='source-over';
    const blur=Math.max(1,Math.round(Math.min(W,H)*0.16));
    const c=document.createElement('canvas'); c.width=W+blur*2; c.height=H+blur*2;
    const g2=c.getContext('2d');
    g2.filter='blur('+blur+'px)';
    g2.drawImage(sil,blur,blur);
    g2.filter='none';
    _lShadowCache[key]=c;
    return c;
  }catch(e){ _lShadowCache[key]=null; return null; }
}
// 长方形阴影(预烘焙):车体足迹同尺寸的实心黑色矩形 + 高斯模糊,边缘柔和,
// 一次性烘焙缓存,运行期零 filter 开销(与剪影阴影同思路)
function bakedRectShadow(w, h, blurPx){
  const key = Math.round(w)+'x'+Math.round(h)+'_'+blurPx;
  if(_rectShadowCache[key]) return _rectShadowCache[key];
  try{
    const pad = Math.max(2, Math.ceil(blurPx*2));
    const cw = Math.ceil(w + pad*2), ch = Math.ceil(h + pad*2);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.filter = 'blur('+blurPx+'px)';
    g.fillStyle = '#000';
    g.fillRect(pad, pad, w, h);
    g.filter = 'none';
    _rectShadowCache[key] = c;
    return c;
  }catch(e){ _rectShadowCache[key] = null; return null; }
}
// 方向性矩形阴影 + 接地接触阴影(AO)。坦克/步兵战车等长条形车辆:
// 阴影是"与车体足迹同尺寸的长方形"整体向右下偏移,边缘高斯模糊,
// 形成长方体落到地面的方形投影;AO 负责贴地防悬浮。
function drawShadowSprite(u, img){
  // 美洲狮贴图 0.8×(×1.1)² ≈ 0.968,阴影跟随同比例,保持"贴图多大阴影多大"
  const vs = (u.type==='puma') ? 0.968 : 1;
  // 车体贴图同尺寸的"剪影阴影":大小≈贴图,只偏移一点点露出右下 L 形黑边,
  // 边缘高斯模糊、黑色淡化(非纯黑),让坦克"压在地面上"而不是贴一张方片。
  const sc = unitSpriteScale(u) * unitBodyScale(u);   // 车身阴影跟车身实际大小
  const s = (u.r*2.9*1.8*sc)/Math.max(1, Math.max(img.width, img.height));
  const dw = img.width*s*vs, dh = img.height*s*vs;
  const rot = unitRotOff(u);
  const sh = bakedLSilhouette(img, dw, dh);
  if(!sh) return;
  const pad = (sh.width - dw)/2;
  // ① 方向性 L 形投影:相对车体只偏移一点点(光在左上,影落右下),露出 L 形边
  ctx.save();
  ctx.globalAlpha = UNIT_SHADOW_ALPHA;
  ctx.translate(UNIT_SHADOW_L_OFFSET.x, UNIT_SHADOW_L_OFFSET.y);
  ctx.rotate(u.facing + rot);
  ctx.drawImage(sh, -dw/2-pad, -dh/2-pad);
  ctx.restore();
  // ② 车底接触投影:同尺寸、几乎不偏移,极淡,压实地面(不产生明显边)
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.rotate(u.facing + rot);
  ctx.drawImage(sh, -dw/2-pad, -dh/2-pad);
  ctx.restore();
}
// 水上单位(驱逐舰/运输艇):不做陆地阴影,只留一个很淡的椭圆投影,避免"黑影贴在水面上"
function drawNavalShadow(u){
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#0e1c2c';
  ctx.beginPath(); ctx.ellipse(0, 4, u.r*1.25, u.r*0.55, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.08;
  ctx.beginPath(); ctx.ellipse(0, 4, u.r*1.6, u.r*0.75, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
// 飞机地面投影:径向渐变模糊椭圆(边缘柔和),画在地面(u 逻辑坐标处),飞机本体向上偏移 AIR_ALTITUDE
function drawAircraftShadow(u){
  const sx=3, sy=6;   // 光在左上,投影偏右下
  ctx.save();
  const g=ctx.createRadialGradient(sx,sy,u.r*0.3, sx,sy,u.r*1.45);
  g.addColorStop(0,'rgba(12,18,15,'+AIR_SHADOW_ALPHA+')');
  g.addColorStop(0.55,'rgba(12,18,15,'+AIR_SHADOW_ALPHA*0.55+')');
  g.addColorStop(1,'rgba(12,18,15,0)');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(sx,sy,u.r*1.4,u.r*0.72,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
// 飞机尾焰:喷口在机身尾部(本地 -x 方向,机头朝上贴图旋转后尾部朝 -x),向后喷射,
// 长度随时间抖动,外焰橙黄 / 内焰亮白,让飞机看起来在"飞行"而不是贴图
function drawAircraftFlame(dh, phase){
  const len = Math.max(10, dh*0.30);
  const fl = 0.72 + 0.28*Math.sin(time*34 + (phase||0));
  const lenF = len*(0.8 + 0.35*fl);
  const tx = -dh/2 - 2;   // 喷口位置(机尾尖端再往里一点)
  // 外焰(橙黄)
  ctx.fillStyle='rgba(255,150,50,'+(0.5+0.2*fl)+')';
  ctx.beginPath();
  ctx.moveTo(tx, -4.5);
  ctx.lineTo(tx-lenF, -1);
  ctx.lineTo(tx-lenF, 1);
  ctx.lineTo(tx, 4.5);
  ctx.closePath(); ctx.fill();
  // 内焰(亮白黄,更短更窄)
  ctx.fillStyle='rgba(255,242,190,'+(0.85+0.15*fl)+')';
  ctx.beginPath();
  ctx.moveTo(tx, -2.2);
  ctx.lineTo(tx-lenF*0.55, 0);
  ctx.lineTo(tx, 2.2);
  ctx.closePath(); ctx.fill();
}
// 坦克照片贴图(已预处理:背景透明 + 内容居中),直接在战场绘制为单位的本体
function drawUnitImg(u, img){
  const rot=SPRITE_ROT[u.type] || 0;
  ctx.rotate(rot);
  const sc=unitSpriteScale(u);   // 每类照片的额外缩放(采矿车 0.7)
  const s=(u.r*2.9*1.8*sc)/Math.max(img.width, img.height);
  const dw=img.width*s, dh=img.height*s;
  // 色调对齐:使用预烘焙的"颜色滤镜版"绘制(饱和度/对比度/亮度微调),无缝融入草地
  ctx.drawImage(bakedTone(img), -dw/2, -dh/2, dw, dh);
  // 开火炮口闪光:画在贴图"炮口/车头"那一侧(按 SPRITE_FRONT 方向)
  if(u.fireT>u.def.rof-0.1 && u.target){
    const f=SPRITE_FRONT[u.type] || [-1,0];
    const fx=f[0]*(dw/2+3), fy=f[1]*(dh/2+3);
    ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(fx,fy,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(fx,fy,2,0,Math.PI*2); ctx.fill();
  }
  return { dw, dh };
}
// 采矿车照片四角(默认是轮子):画旋转辐条的俯视轮子,做出"轮子滚动"感
function drawHarvesterWheels(u, img){
  const sc=SPRITE_SCALE[u.type] || 1;
  const s=(u.r*2.9*1.8*sc)/Math.max(img.width, img.height);
  const dw=img.width*s, dh=img.height*s;
  const wa=time*3;
  const r=Math.max(2.5, Math.min(dw,dh)*0.13);
  const cx=[-dw/2+dw*0.14, dw/2-dw*0.14];
  const cy=[-dh/2+dh*0.14, dh/2-dh*0.14];
  for(const wx of cx) for(const wy of cy){
    ctx.fillStyle='#14161a'; ctx.beginPath(); ctx.arc(wx,wy,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3a3f45'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(wx,wy,r,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#555'; ctx.lineWidth=1;
    for(let k=0;k<4;k++){
      const a=wa+k*Math.PI/2;
      ctx.beginPath(); ctx.moveTo(wx-Math.cos(a)*(r-1),wy-Math.sin(a)*(r-1)); ctx.lineTo(wx+Math.cos(a)*(r-1),wy+Math.sin(a)*(r-1)); ctx.stroke();
    }
    ctx.fillStyle='#6a7076'; ctx.beginPath(); ctx.arc(wx,wy,1.2,0,Math.PI*2); ctx.fill();
  }
}
/* ============ 车身 + 独立旋转炮塔(仿美洲狮;艾布拉姆/T90/豹2A4/布拉德利/勒克莱尔/
   挑战者/M60/T54/B11 通用) ============
   车身/炮塔两张贴图都已用 process-sprite 挖掉白底。rotOff 用于把贴图"自然朝向"
   对齐到朝向前方(facing=0 为 +x):车头朝上贴图=π/2,水平向左贴图=π,车头朝下=-π/2。
   旋转中心(座圈)在车身中心沿车头偏移 turretRotCenter(u,tw) 处;炮塔绕该点独立旋转,
   并按 2/3 法则把"距正方向端 2/3 处"的点落在旋转中心,长炮管转向不会甩大圈。
   tip=[tx,ty](相对中心比例)是炮口/炮塔前端,用于开火闪光。 */
function drawHullTurretUnit(u, body, tur, rotOff, sc, tip){
  const sBase = Math.max(1, (body&&body.width) ? Math.max(body.width, body.height) : 1);
  const s = (u.r*2.9*1.8*sc)/sBase;
  const bodyScale = unitBodyScale(u);   // 仅车身缩放(炮塔保持原大);t72 按档位
  ctx.rotate(u.facing);
  // 车身
  if(body && body.width){
    const dw=body.width*s*bodyScale, dh=body.height*s*bodyScale;
    ctx.save();
    ctx.rotate(rotOff);
    ctx.drawImage(bakedTone(body), -dw/2, -dh/2, dw, dh);
    ctx.restore();
  }
  // 炮塔:旋转中心=车身中心向车头偏移 turretRotCenter(u,tw),绕它朝 turretAng 独立旋转。
  if(tur && tur.width){
    const ts = turretScale(u);                            // 炮塔额外缩放(仅炮塔,车身不动)
    const tw=tur.width*s*ts, th=tur.height*s*ts;
    // 旋转法则 turretPivotK(u):旋转点距炮口的距离 = 贴图长轴 × k(默认 2/3,布拉德利/美洲狮 1/2,T54 3/5)。
    // 旋转点相对贴图中心沿长轴的偏移 = (k-1/2)×长轴:水平炮塔(朝左/朝右)沿宽(x),垂直炮塔(朝上/朝下)沿高(y)。
    // 偏移在 drawImage 里与旋转同帧,座圈始终落在旋转中心,长炮管转向不会甩大圈。
    const pivHalf = turretPivotK(u) - 0.5;
    let pivX=0, pivY=0;
    if(pivHalf !== 0){
      if(rotOff===Math.PI) pivX = pivHalf*tw;         // 水平朝左
      else if(rotOff===0) pivX = -pivHalf*tw;         // 水平朝右
      else if(rotOff===Math.PI/2) pivY = pivHalf*th;  // 车头朝上
      else pivY = -pivHalf*th;                        // 车头朝下
    }
    const turOff = turretRotCenter(u, tw);       // 旋转中心沿车头偏移(px)
    ctx.save();
    ctx.translate(turOff, 0);
    ctx.rotate((u.turretAng - u.facing) + rotOff);
    ctx.drawImage(bakedTone(tur), -tw/2-pivX, -th/2-pivY, tw, th);
    // 开火闪光(炮口=炮塔图前端,相对旋转中心)
    if(u.fireT>u.def.rof-0.1 && u.target){
      const fx=tip[0]*tw-pivX, fy=tip[1]*th-pivY;
      ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(fx,fy,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(fx,fy,2,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}
function drawUnit(u){
  if(u.parked) return;   // 停驻在机场内的飞机不渲染(占停机位,释放后才出现)
  const d=u.def;
  const tc=teamCol(u.team);
  ctx.save();
  ctx.translate(u.x,u.y);
  // 接地阴影:照片单位用"形状继承的方向性剪影阴影 + AO";其余(步兵/基地车)用椭圆接地阴影
  const pImg = unitPhotoImg(u);
  if(pImg && pImg.width){
    if(u.naval) drawNavalShadow(u);          // 水上:只留淡投影
    else if(u.fly) drawAircraftShadow(u);    // 飞机:地面模糊椭圆投影(本体悬空)
    else drawShadowSprite(u, pImg);          // 陆地:接触阴影 + 方向性剪影
  }
  else {
    ctx.fillStyle='rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(2,3,u.r+2,u.r+1,0,0,Math.PI*2); ctx.fill();
  }
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
  // 车体渲染偏移(起步/刹车俯仰 + 开火后坐力):阴影/选中圈保持接地,车体位移
  if(u.renderOx || u.renderOy) ctx.translate(u.renderOx, u.renderOy);
  const turK = turretKeys(u);
  if(u.fly){
    // ===== 战斗机(照片机头朝上,SPRITE_ROT 对齐):本体向上偏移悬停,投影画在地面 =====
    if(pImg && pImg.width){
      const sc=unitSpriteScale(u);
      const s=(u.r*2.9*1.8*sc)/Math.max(pImg.width, pImg.height);
      const dh=pImg.height*s;
      ctx.save();
      ctx.translate(0, -AIR_ALTITUDE);
      ctx.rotate(u.facing);
      drawAircraftFlame(dh, u.x);   // 尾焰:画在机身下面(先画,被机身盖住根部)
      drawUnitImg(u, pImg);
      ctx.restore();
    }
  } else if(isTurretUnit(u) && imgs[turK[0]] && imgs[turK[0]].width){
    // 车身 + 独立旋转炮塔(美洲狮/艾布拉姆/T90/豹2A4/布拉德利/勒克莱尔/挑战者/M60/T54/B11)
    // 朝向(unitRotOff)、炮口(tip)、旋转中心(turretRotCenter)都按各车照片朝向/需求配置
    drawHullTurretUnit(u, imgs[turK[0]], imgs[turK[1]], unitRotOff(u), unitSpriteScale(u), unitTip(u));
  } else if(u.type==='tank'||u.type==='abrams'||u.type==='t90'){
    const heavy = unitFactionOf(u.team)==='soviet';
    ctx.rotate(u.facing);
    // 灰熊(盟军)/犀牛(苏军)照片贴图按阵营选,照片车头朝上(SPRITE_ROT 对齐)
    const tImg = u.type==='tank' ? (heavy?imgs['tank_soviet_field']:imgs['tank_allies_field']) : imgs[u.type];
    if(tImg){
      drawUnitImg(u, tImg);
    } else if(u.type==='abrams'){
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
  } else if(u.type==='puma'){
    // ===== 美洲狮步战车:车身 + 独立旋转炮塔(360°) =====
    // 车身/炮台照片都已用 tools/process-sprite.js 挖掉白底并旋转为"车头朝上";
    // 车身与炮台共用一个缩放系数 s(以车身图为准),保持相对大小贴合原照片。
    const body=imgs['puma_body'], tur=imgs['puma_turret'];
    const sBase=Math.max(1,(body&&body.width)?Math.max(body.width,body.height):1);
    const s=(u.r*2.9*1.8*(SPRITE_SCALE.puma||1))/sBase;
    ctx.rotate(u.facing);
    // 车身(照片车头朝上 -> 旋转 +90° 对齐到车头朝向前方)
    if(body && body.width){
      const dw=body.width*s, dh=body.height*s;
      ctx.save();
      ctx.rotate(Math.PI/2);
      ctx.drawImage(bakedTone(body), -dw/2, -dh/2, dw, dh);
      ctx.restore();
    }
    // 炮塔:完全放在车体的长中间/宽中间(即车体正中心),独立朝 turretAng 旋转
    if(tur && tur.width){
      const tw=tur.width*s, th=tur.height*s;
      ctx.save();
      ctx.rotate((u.turretAng - u.facing) + Math.PI/2);
      ctx.drawImage(bakedTone(tur), -tw/2, -th/2, tw, th);
      // 开火闪光(炮口=炮塔图最前端)
      if(u.fireT>u.def.rof-0.1 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(0,-th/2,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(0,-th/2,2,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  } else if(u.type==='harvester'){
    if(imgs['harvester_field']){
      // 采矿车照片本体贴图(已旋转使车头朝上,SPRITE_ROT 对齐到朝向前方)
      ctx.rotate(u.facing);
      drawUnitImg(u, imgs['harvester_field']);
      // 四角轮子:叠加旋转辐条的俯视轮子动画(照片四角默认是轮子)
      drawHarvesterWheels(u, imgs['harvester_field']);
    } else {
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
    }
  } else if(u.type==='mcv'){
    if(imgs['mcv_field']){
      // 基地车照片本体贴图(照片车头朝下,SPRITE_ROT 对齐到朝向前方)
      ctx.rotate(u.facing);
      drawUnitImg(u, imgs['mcv_field']);
    } else {
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
    }
  } else if(u.type==='airfield_car'){
    if(imgs['airfield_car_field']){
      // 机场建筑车照片本体贴图(照片车头朝上,SPRITE_ROT 对齐到朝向前方)
      ctx.rotate(u.facing);
      drawUnitImg(u, imgs['airfield_car_field']);
    } else {
      // ===== 机场建筑车(可展开成机场的工程车)程序化兜底 =====
      const trackA=time*3;
      const L=-u.r, R=u.r;
      ctx.rotate(u.facing);
      // 车轮(旋转辐条)
      for(let i=L+4;i<=R-2;i+=5){
        for(const s of [-1,1]){
          const cy = s>0 ? u.r*0.7 : -u.r*0.7;
          ctx.fillStyle='#333a42'; ctx.beginPath(); ctx.arc(i,cy,2.6,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#555'; ctx.lineWidth=0.8;
          ctx.beginPath(); ctx.moveTo(i-Math.cos(trackA)*1.9, cy-Math.sin(trackA)*1.9); ctx.lineTo(i+Math.cos(trackA)*1.9, cy+Math.sin(trackA)*1.9); ctx.stroke();
        }
      }
      // 底盘
      ctx.fillStyle='#16181c'; ctx.fillRect(L, -u.r*0.85, R*2, u.r*1.7);
      // 货箱
      ctx.fillStyle='#6a7a8a'; ctx.fillRect(L+1, -u.r*0.55, R*1.5, u.r*1.1);
      ctx.strokeStyle='#222'; ctx.lineWidth=1.2; ctx.strokeRect(L+1, -u.r*0.55, R*1.5, u.r*1.1);
      // 驾驶室(车头朝前 +x)
      ctx.fillStyle='#3f4a55'; ctx.fillRect(R-5, -u.r*0.5, 7, u.r*1.0);
      ctx.fillStyle='#9cc0e0'; ctx.fillRect(R-4, -u.r*0.42, 2.5, u.r*0.84);
      // 塔吊
      ctx.strokeStyle='#8a9a8a'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(-u.r*0.4, -u.r*0.3); ctx.lineTo(2, -u.r*1.05); ctx.lineTo(9, -u.r*1.05); ctx.stroke();
      ctx.fillStyle='#1c2024'; ctx.fillRect(3, -u.r*1.1, 8, 4);
      // 队色条
      ctx.fillStyle=tc; ctx.fillRect(L+3, -u.r*0.7, u.r*1.2, 3);
      // 小机枪(车头)
      ctx.fillStyle='#2c3036'; ctx.fillRect(R-4, -1.6, 12, 3.2);
      ctx.fillStyle='#1e2226'; ctx.fillRect(R+7, -2, 2.5, 4);
      if(u.fireT>u.def.rof-0.12 && u.target){
        ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(R+10,0,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(R+10,0,1.5,0,Math.PI*2); ctx.fill();
      }
    }
  } else if(u.type==='destroyer'){
    if(imgs['destroyer_field']){
      // 驱逐舰照片本体贴图(照片车头朝上,SPRITE_ROT 对齐朝向前方;放大)
      ctx.rotate(u.facing);
      drawUnitImg(u, imgs['destroyer_field']);
    } else {
    // ===== 驱逐舰(海军主力,灰色舰体 + 前主炮 + 舰桥雷达) =====
    const R=u.r*1.35;
    ctx.rotate(u.facing);
    // 舰体
    ctx.fillStyle='#5a6268';
    ctx.beginPath();
    ctx.moveTo(R*1.0,0); ctx.lineTo(R*0.3,-R*0.42); ctx.lineTo(-R,-R*0.34); ctx.lineTo(-R*0.9,R*0.3); ctx.lineTo(R*0.3,R*0.42);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#2c3238'; ctx.lineWidth=1.2; ctx.stroke();
    // 水线
    ctx.fillStyle='#3a4146'; ctx.fillRect(-R, R*0.18, R*2, R*0.22);
    // 甲板
    ctx.fillStyle='#4c545a'; ctx.fillRect(-R*0.8, -R*0.16, R*1.55, R*0.32);
    // 前主炮塔(舰艏方向)
    ctx.fillStyle='#3a4146'; ctx.fillRect(R*0.4, -R*0.2, R*0.24, R*0.4);
    ctx.fillStyle='#2c3238'; ctx.fillRect(R*0.62, -R*0.07, R*0.52, R*0.14);
    // 舰桥
    ctx.fillStyle='#3f464c'; ctx.fillRect(-R*0.6, -R*0.3, R*0.36, R*0.3);
    ctx.fillStyle='rgba(170,210,230,.5)'; ctx.fillRect(-R*0.54, -R*0.26, R*0.24, R*0.08);
    // 雷达桅杆
    ctx.strokeStyle='#2c3238'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(-R*0.42, -R*0.3); ctx.lineTo(-R*0.42, -R*0.72); ctx.stroke();
    // 旋转雷达
    const ra=time*1.2;
    ctx.save(); ctx.translate(-R*0.42, -R*0.72);
    ctx.fillStyle='#1c2024'; ctx.beginPath(); ctx.arc(0,0,3.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(140,255,180,.9)'; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,3.4,ra,ra+1.4); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 队标
    ctx.fillStyle=tc; ctx.beginPath(); ctx.arc(-R*0.12, 0, 2.4, 0, Math.PI*2); ctx.fill();
    // 开火闪光
    if(u.fireT>u.def.rof-0.12 && u.target){
      ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(R*1.18,0,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(R*1.18,0,2,0,Math.PI*2); ctx.fill();
    }
    }
  } else if(u.type==='transport'){
    if(imgs['transport_field']){
      // 登陆艇照片本体贴图(照片车头朝上,SPRITE_ROT 对齐朝向前方)
      ctx.rotate(u.facing);
      drawUnitImg(u, imgs['transport_field']);
    } else {
    // ===== 运输艇(两栖登陆艇,前开舱门) =====
    const R=u.r*1.3;
    ctx.rotate(u.facing);
    // 船体
    ctx.fillStyle='#6a5a44';
    ctx.beginPath();
    ctx.moveTo(R*1.05,-R*0.38); ctx.lineTo(-R,-R*0.42); ctx.lineTo(-R,R*0.42); ctx.lineTo(R*1.05,R*0.38);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#2a2418'; ctx.lineWidth=1.2; ctx.stroke();
    // 水线
    ctx.fillStyle='#4a3f30'; ctx.fillRect(-R, R*0.2, R*2.1, R*0.2);
    // 中央货舱
    ctx.fillStyle='#7a6a4e'; ctx.fillRect(-R*0.72, -R*0.26, R*1.35, R*0.52);
    ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.strokeRect(-R*0.72, -R*0.26, R*1.35, R*0.52);
    // 舱内装货示意
    if(u.cargoUnits && u.cargoUnits.length){
      ctx.fillStyle='rgba(0,0,0,.28)'; ctx.fillRect(-R*0.66, -R*0.2, R*1.23, R*0.4);
      ctx.fillStyle='#c0c8c0';
      const n=Math.min(3,u.cargoUnits.length);
      for(let i=0;i<n;i++){ ctx.fillRect(-R*0.6+i*R*0.45, -R*0.14, R*0.28, R*0.24); }
    }
    // 前部跳板舱口(舰艏)
    ctx.fillStyle='#3a3228'; ctx.fillRect(R*0.25, -R*0.16, R*0.42, R*0.32);
    // 舰桥
    ctx.fillStyle='#5a4e3a'; ctx.fillRect(-R*0.62, -R*0.3, R*0.34, R*0.22);
    ctx.fillStyle='rgba(170,210,230,.5)'; ctx.fillRect(-R*0.56, -R*0.26, R*0.22, R*0.07);
    // 小机枪(舰艏)
    ctx.fillStyle='#2c3238'; ctx.fillRect(R*0.5, -R*0.09, R*0.45, R*0.18);
    // 队标
    ctx.fillStyle=tc; ctx.beginPath(); ctx.arc(-R*0.2, 0, 2.3, 0, Math.PI*2); ctx.fill();
    if(u.fireT>u.def.rof-0.12 && u.target){
      ctx.fillStyle='rgba(255,220,120,.9)'; ctx.beginPath(); ctx.arc(R*1.0,0,2.5,0,Math.PI*2); ctx.fill();
    }
    }
  } else {
    // 步兵(面向行进/射击方向;有照片贴图则用贴图,否则程序化)
    if(pImg && pImg.width){
      ctx.rotate(u.facing);
      drawUnitImg(u, pImg);
    } else {
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
  }
  ctx.restore();
  // 飞机:血条/角标跟随悬停高度(画在机身上方/机身旁边,而不是地面)
  const gy = u.fly ? (u.y - AIR_ALTITUDE - 40) : u.y;
  // HP条
  if(u.hp<u.maxHp){ drawHPBar(u.x-u.r, gy-u.r*0.5-8, u.r*2, u.hp/u.maxHp,false); }
  // 反应装甲护盾条(血条上方)
  if(u.shield>0){
    const smax = unitShieldMax(u) || REACTIVE_SHIELD;
    ctx.fillStyle='rgba(0,0,0,.85)'; ctx.fillRect(u.x-u.r, u.y-u.r-12, u.r*2, 3);
    ctx.fillStyle='#4fb8ff';
    ctx.fillRect(u.x-u.r, u.y-u.r-12, u.r*2*Math.min(1, u.shield/smax), 3);
  }
  // 队伍颜色角标(右下角小方块,区分同阵营的不同队伍)
  ctx.fillStyle=teamColor(u.team);
  const badgeY = u.fly ? (u.y - AIR_ALTITUDE + 42) : (u.y+u.r+1);   // 飞机:角标画在机身下方
  ctx.fillRect(u.x+u.r*0.6, badgeY, 7, 7);
  ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
  ctx.strokeRect(u.x+u.r*0.6-0.5, badgeY-0.5, 8, 8);
  // 运输艇/步兵战车:下方显示装载量(如 10/12)
  if(isCarrier(u)){
    const used=usedCapacity(u);
    const full=used>=u.capacity;
    const txt=used+'/'+u.capacity;
    ctx.font='bold 10px "Microsoft YaHei"'; ctx.textAlign='center';
    ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.7)'; ctx.strokeText(txt, u.x, u.y+u.r+15);
    ctx.fillStyle=full?'#ffb0b0':'#8aff8a';
    ctx.fillText(txt, u.x, u.y+u.r+15);
  }
  // 挑战者升级等级标记(金色方块,位于队伍角标下方)
  if(u.type==='challenger' && u.upgradeLvl>0){
    ctx.fillStyle='#ffd24a';
    for(let i=0;i<u.upgradeLvl;i++) ctx.fillRect(u.x+u.r*0.6 + i*5, u.y+u.r+11, 4, 4);
  }
}
function drawProjectiles(){
  for(const p of projectiles){
    if(!onView(p.x,p.y,64)) continue;
    const dx=p.tx-p.x, dy=p.ty-p.y; const d=Math.hypot(dx,dy)||1;
    if(p.tankShell){
      // 坦克炮弹(125mm 贴图,车头朝左):贴图 + 曳光拖尾,从发射起匀速飞行
      const img=imgs['shell_125mm'];
      if(img && img.width){
        const sc=TANK_SHELL_LEN/Math.max(1,img.width);   // 横向贴图:长度=宽
        const dw=img.width*sc, dh=img.height*sc;
        const ang=Math.atan2(dy,dx);
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.rotate(ang+Math.PI);   // 车头朝左 -> 旋转到飞行方向
        // 曳光拖尾:弹尾向后渐隐(泛光 + 亮芯),体现高速运动
        ctx.lineCap='round';
        ctx.strokeStyle='rgba(255,180,90,.28)'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(dw*0.5,0); ctx.lineTo(dw*0.5+20,0); ctx.stroke();
        ctx.strokeStyle='rgba(255,240,200,.85)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(dw*0.5,0); ctx.lineTo(dw*0.5+12,0); ctx.stroke();
        // 弹体
        ctx.drawImage(bakedTone(img), -dw/2, -dh/2, dw, dh);
        ctx.restore();
      }
      continue;
    }
    if(p.ifvBullet){
      // 25mm 机炮弹(步兵战车) + 士兵子弹(0.5×):贴图弹丸 + 曳光拖尾。贴图车头朝上,旋转对齐飞行方向
      const img=imgs['bullet_25mm'];
      if(img && img.width){
        const len=p.bulletLen||BULLET_25MM_LEN;
        const sc=len/Math.max(1,img.height);
        const dw=img.width*sc, dh=img.height*sc;
        const ang=Math.atan2(dy,dx);
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.rotate(ang+Math.PI/2);
        // 曳光拖尾:弹尾向后渐隐(亮芯 + 泛光)
        ctx.lineCap='round';
        ctx.strokeStyle='rgba(255,220,120,.30)'; ctx.lineWidth=2.4;
        ctx.beginPath(); ctx.moveTo(0,dh*0.5); ctx.lineTo(0,dh*0.5+16); ctx.stroke();
        ctx.strokeStyle='rgba(255,255,220,.85)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(0,dh*0.5); ctx.lineTo(0,dh*0.5+9); ctx.stroke();
        // 弹体
        ctx.drawImage(bakedTone(img), -dw/2, -dh/2, dw, dh);
        ctx.restore();
      }
      continue;
    }
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
/* ============ 导弹渲染(TOW/长钉 横向;A-120c/A-174b/R-37m/Kh-29 机头朝上) ============ */
function drawMissiles(){
  for(const m of missiles){
    if(!onView(m.x,m.y,80)) continue;
    let img, len, up=false;
    if(m.spriteType==='a120c'){ img=imgs['aim120c_field']; len=AA_SPRITE_LEN; up=true; }
    else if(m.spriteType==='a174b'){ img=imgs['aim174b_field']; len=AG_SPRITE_LEN; up=true; }
    else if(m.spriteType==='r37m'){ img=imgs['r37m_field']; len=R37M_SPRITE_LEN; up=true; }
    else if(m.spriteType==='kh29'){ img=imgs['kh29_field']; len=KH29_SPRITE_LEN; up=true; }
    else if(m.spriteType==='spike'){ img=imgs['spike_missile']; len=SPIKE_MISSILE_LEN; up=false; }
    else { img=imgs['tow_missile']; len=TOW_MISSILE_LEN; up=false; }
    if(!img || !img.width) continue;
    // 等比缩放:横向贴图按宽、机头朝上贴图按高对齐到目标长度
    const sc = len/Math.max(1, up ? img.height : img.width);
    const dw = img.width*sc, dh = img.height*sc;
    ctx.save();
    ctx.translate(m.x,m.y);
    ctx.rotate(m.ang + (up ? Math.PI/2 : 0));
    // 尾焰/曳光(朝弹尾方向)
    ctx.lineCap='round';
    if(up){
      ctx.strokeStyle='rgba(255,200,110,.30)'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(0,dh*0.5); ctx.lineTo(0,dh*0.5+16); ctx.stroke();
      ctx.strokeStyle='rgba(255,245,220,.85)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,dh*0.5); ctx.lineTo(0,dh*0.5+9); ctx.stroke();
    } else {
      ctx.strokeStyle='rgba(255,200,110,.30)'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(-dw/2,0); ctx.lineTo(-dw/2-16,0); ctx.stroke();
      ctx.strokeStyle='rgba(255,245,220,.85)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-dw/2,0); ctx.lineTo(-dw/2-9,0); ctx.stroke();
    }
    // 弹体
    ctx.drawImage(bakedTone(img), -dw/2, -dh/2, dw, dh);
    ctx.restore();
  }
}
/* ============ 自主防御反导弹渲染(贴图用 25mm 子弹,车头朝上) ============ */
function drawInterceptors(){
  for(const it of interceptors){
    if(!onView(it.x,it.y,64)) continue;
    const img=imgs['bullet_25mm'];
    if(!img || !img.width) continue;
    const sc=APS_COUNTER_LEN/Math.max(1,img.height);   // 25mm 子弹贴图车头朝上,长轴=高
    const dw=img.width*sc, dh=img.height*sc;
    ctx.save();
    ctx.translate(it.x,it.y);
    ctx.rotate(it.ang+Math.PI/2);                       // 车头朝上 -> 对齐飞行方向
    ctx.lineCap='round';
    ctx.strokeStyle='rgba(140,255,190,.35)'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(0,dh*0.5); ctx.lineTo(0,dh*0.5+14); ctx.stroke();
    ctx.strokeStyle='rgba(220,255,235,.9)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,dh*0.5); ctx.lineTo(0,dh*0.5+8); ctx.stroke();
    ctx.drawImage(bakedTone(img), -dw/2, -dh/2, dw, dh);
    ctx.restore();
  }
}
function drawEffects(){
  for(const e of effects){
    if(!onView(e.x,e.y,220)) continue;
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
    } else if(e.type==='dust'){
      // 履带扬尘:淡黄色尘土颗粒,随生命周期缩小淡出
      ctx.fillStyle='rgba(214,206,184,'+(0.30*k)+')';
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*k,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,'+(0.12*k)+')';
      ctx.beginPath(); ctx.arc(e.x-1,e.y-1,e.r*0.6*k,0,Math.PI*2); ctx.fill();
    } else if(e.type==='treefall'){
      // 树木倒下:该格的树林贴图从竖直缓缓倒向水平(以树底部为轴),同时淡出
      const img=e.img;
      if(img){
        const p = 1 - clamp(e.life/e.maxLife,0,1);     // 0(站立)→1(倒下)
        const s = Math.min(TILE/img.width, TILE/img.height);
        const dw=img.width*s, dh=img.height*s;
        ctx.save();
        ctx.translate(e.x, e.y + TILE/2);              // 树底部为旋转轴
        ctx.rotate((e.dir||0) * p);
        ctx.globalAlpha = 1 - p*0.55;
        ctx.drawImage(img, -dw/2, -dh, dw, dh);
        ctx.restore();
      }
    } else if(e.type==='treelog'){
      // 断木残迹:树被碾倒后留在原地的深色木段,随时间淡出
      const lk = clamp(e.life/e.maxLife,0,1);
      ctx.save();
      ctx.translate(e.x, e.y+4);
      ctx.rotate(e.dir||0);
      ctx.globalAlpha = 0.20*lk;
      ctx.fillStyle='#3a3f2e';
      ctx.beginPath(); ctx.ellipse(0,0,11,4,0,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 0.16*lk;
      ctx.fillStyle='#20241a';
      ctx.beginPath(); ctx.ellipse(1,1,10,3.5,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
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
    if(!onView(t.x,t.y,32)) continue;
    const a=clamp(t.life/0.4,0,1);
    ctx.globalAlpha=a;
    ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.65)'; ctx.strokeText(t.str, t.x, t.y);
    ctx.fillStyle=t.color; ctx.fillText(t.str, t.x, t.y);
    ctx.globalAlpha=1;
  }
}
function drawSel(){
  // 红外干扰装置(T84BM):选中装有 IR 且开启的坦克,画前方 120° 干扰扇形(炮塔朝向)
  for(const u of selected){
    if(u.type==='t84bm' && u.ir && u.irOn){
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.turretAng);
      ctx.fillStyle='rgba(255,120,80,.06)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,IR_RANGE,-IR_ANGLE/2,IR_ANGLE/2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(255,140,90,.25)'; ctx.lineWidth=1.5; ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,IR_RANGE,-IR_ANGLE/2,IR_ANGLE/2); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  // 雷达火控:选中装有雷达且任一武器处于自动/倾泻模式的飞机,画该武器的探测圈
  for(const u of selected){
    if(!u.fly || !u.radar) continue;
    const rAA = (u.aa && u.modeAA>0) ? airMissileEffRange(u, AA_RANGE, null) : 0;
    const rAG = (u.ag && u.modeAG>0) ? airMissileEffRange(u, AG_RANGE, null) : 0;
    if(!rAA && !rAG) continue;
    ctx.strokeStyle='rgba(140,220,255,.28)'; ctx.lineWidth=1.5; ctx.setLineDash([5,5]);
    if(rAA){ ctx.beginPath(); ctx.arc(u.x,u.y,rAA,0,Math.PI*2); ctx.stroke(); }
    if(rAG){ ctx.beginPath(); ctx.arc(u.x,u.y,rAG,0,Math.PI*2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // 自主防御反应圈:选中装有 APS 且开启的艾布拉姆时,显示 270px 反导圈
  for(const u of selected){
    if((u.type==='abrams' || u.type==='t72') && u.aps && u.apsOn){
      ctx.strokeStyle='rgba(140,220,255,.22)'; ctx.lineWidth=1.5; ctx.setLineDash([6,5]);
      ctx.beginPath(); ctx.arc(u.x,u.y,APS_RANGE,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // 选中单位的移动点 + 从单位到目标点的连线(陆/海单位都显示;不再画选中圆圈)
  for(const u of selected){
    if(u.fly){
      // 战斗机:右键移动=改盘旋中心,选中期间持续显示 飞机→盘旋中心 的绿色虚线 + 准星
      if(u.patrol){
        ctx.strokeStyle='rgba(140,255,180,.45)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(u.x,u.y); ctx.lineTo(u.patrol.x,u.patrol.y); ctx.stroke();
        ctx.setLineDash([]);
        drawMoveMarker(u.patrol.x, u.patrol.y);
      }
      continue;
    }
    const o=u.order;
    if(o && o.kind==='move' && o.x!==undefined){
      ctx.strokeStyle='rgba(140,255,180,.45)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(u.x,u.y); ctx.lineTo(o.x,o.y); ctx.stroke();
      ctx.setLineDash([]);
      drawMoveMarker(o.x, o.y);
    }
  }
  // 攻击指示红线(不依赖选中):本方刚下达攻击指令的单位显示到目标的红线,
  // 由 _lineT 计时短暂显示后自动消失(不影响单位继续攻击)
  for(const u of units){
    if(u.team!==TEAM_A) continue;
    if(!(u.order && u.order.kind==='attack')) continue;
    if(!u.target || u.target.hp<=0) continue;
    if(!(u._lineT>0)) continue;
    const k = Math.min(1, u._lineT / (RED_LINE_TIME*0.6));   // 最后0.6秒淡出
    const alpha = 0.25 + 0.7*k;
    ctx.strokeStyle='rgba(255,60,60,'+alpha+')'; ctx.lineWidth=3; ctx.setLineDash([7,4]);
    ctx.beginPath(); ctx.moveTo(u.x,u.y); ctx.lineTo(u.target.x,u.target.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle='rgba(255,200,120,'+(0.5*k)+')'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(u.x,u.y); ctx.lineTo(u.target.x,u.target.y); ctx.stroke();
    const tx=u.target.x, ty=u.target.y;
    ctx.strokeStyle='rgba(255,60,60,'+alpha+')'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(tx,ty,6,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx-10,ty); ctx.lineTo(tx+10,ty); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx,ty-10); ctx.lineTo(tx,ty+10); ctx.stroke();
  }
  if(selBuilding && selBuilding.alive){
    const pul=0.5+0.5*Math.sin(time*6);
    const bx=selBuilding.tx*TILE-3, by=selBuilding.ty*TILE-3;
    const bw=selBuilding.w*TILE+6, bh=selBuilding.h*TILE+6;
    // 选中框:圆角贴地轮廓(代替生硬正方形),底部压一条接地亮线
    ctx.strokeStyle='rgba(140,255,170,'+(0.55+0.45*pul)+')'; ctx.lineWidth=2;
    roundRectPath(bx, by, bw, bh, 5); ctx.stroke();
    ctx.fillStyle='rgba(140,255,170,'+(0.06+0.05*pul)+')';
    roundRectPath(bx, by, bw, bh, 5); ctx.fill();
    // 墙根接地亮线(贴合层2 AO,强调"立在地面上")
    ctx.fillStyle='rgba(140,255,170,'+(0.5+0.4*pul)+')';
    ctx.fillRect(bx+2, by+bh-2.5, bw-4, 2);
  }
  // 移动目标点标记(小旗/准星)
  function drawMoveMarker(x,y){
    ctx.strokeStyle='#8aff8a'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,y-7); ctx.lineTo(x,y+7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-7,y); ctx.lineTo(x+7,y); ctx.stroke();
    ctx.fillStyle='rgba(140,255,180,.5)';
    ctx.beginPath(); ctx.arc(x,y,1.5,0,Math.PI*2); ctx.fill();
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
  // 等比包含缩放(每世界像素),长或宽任一边贴边即停,并居中
  const s=Math.min(mmw/W, mmh/H);
  const ox=(mmw-W*s)/2, oy=(mmh-H*s)/2;
  const cacheKey = mmw+'x'+mmh+':'+MAP_W+'x'+MAP_H+':'+mapVersion;
  if(!mmTerrainCache || mmTerrainCache.width!==mmw || mmTerrainCache.height!==mmh || mmTerrainKey!==cacheKey){
    if(!mmTerrainCache) mmTerrainCache=document.createElement('canvas');
    mmTerrainCache.width=mmw; mmTerrainCache.height=mmh;
    const g=mmTerrainCache.getContext('2d');
    g.fillStyle='#1a241a'; g.fillRect(0,0,mmw,mmh);
    for(let x=0;x<MAP_W;x++) for(let y=0;y<MAP_H;y++){
      const t=terrain[x][y];
      g.fillStyle = t==='water' ? '#22486e' : (t==='tree' ? '#1c3a24' : '#273a29');
      g.fillRect(ox+x*TILE*s, oy+y*TILE*s, TILE*s+0.4, TILE*s+0.4);
    }
    mmTerrainKey=cacheKey;
  }
  // 地形
  mmCtx.drawImage(mmTerrainCache,0,0);
  // 矿
  mmCtx.fillStyle='#d8b840';
  for(const o of oreFields) if(o.amount>0) mmCtx.fillRect(ox+o.x*s-2, oy+o.y*s-2, 4, 4);
  // 建筑
  for(const b of buildings){
    if(!b.alive) continue;
    mmCtx.fillStyle = b.team<0 ? '#8a8a8a' : teamCol(b.team);
    mmCtx.fillRect(ox+(b.x-b.w*TILE/2)*s, oy+(b.y-b.h*TILE/2)*s, Math.max(3,b.w*TILE*s), Math.max(3,b.h*TILE*s));
  }
  // 单位
  for(const u of units){
    if(u.parked) continue;   // 停驻飞机不上小地图
    mmCtx.fillStyle=teamCol(u.team);
    mmCtx.fillRect(ox+u.x*s-1, oy+u.y*s-1, 2, 2);
  }
  // 视野框
  mmCtx.strokeStyle='#ffffff';
  mmCtx.lineWidth=1.5;
  mmCtx.strokeRect(ox+cam.x*s, oy+cam.y*s, viewW()*s, viewH()*s);
}
