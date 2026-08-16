"use strict";
/* ============================================================
   单位素材预处理脚本 (tools/process-sprite.js)

   把"带纯黑/纯白背景"的单位照片处理成游戏可用的贴图:
   1. 自动识别背景颜色(黑/白),用洪泛填充只剔除"与图片边缘相连"的背景
      —— 绝不会动坦克内部的深色/高光内容(之前按亮度阈值会误删履带等)
   2. 按内容自动裁切
   3. 内容质心对齐画布中心(游戏里围绕中心旋转/放大)

   用法:
     node tools/process-sprite.js <输入图.png> <输出名> [输出目录] [最大尺寸] [旋转角度]
   例:
     node tools/process-sprite.js "我的驱逐舰.png" destroyer
     node tools/process-sprite.js "我的建造厂.png" command img 512
     node tools/process-sprite.js "采矿车.png" harvester_field img 512 90
   输出:
     img/units/destroyer.png  (背景透明、内容居中、无内容缺失)
     img/command.png          (输出目录参数=img 时)

   注意事项:
   - 只支持 PNG 输入(8bit, RGBA/RGB)。
   - [输出目录] 默认 img/units;建筑贴图请传 img(直接覆盖对应 IMAGES 映射文件)。
   - [最大尺寸] 默认 512:超过则等比缩小,避免运行时每帧 drawImage 大图卡顿。
   - [旋转角度] 90/180/270:顺时针旋转,用于把照片"车头朝上"等摆正朝向。
   - 纯白/纯黑背景按"与边缘相连"洪泛剔除,不伤贴图内容;
     另加一轮边缘羽化,清掉贴图轮廓外围残留的半透明白/黑边。
   - 处理后请记得在 js/config.js 的 IMAGES 里添加映射,
     并在 SPRITE_ROT 里填写该单位贴图的"炮管/车头"自然朝向角度。
   ============================================================ */
const fs=require('fs'), path=require('path'), zlib=require('zlib');

/* ---------- PNG 解码 ---------- */
function decodePNG(file){
  const buf=fs.readFileSync(file);
  let off=8; let width,height,bitDepth,colorType; const idat=[];
  while(off<buf.length){
    const len=buf.readUInt32BE(off); const type=buf.toString('ascii',off+4,off+8);
    if(type==='IHDR'){ width=buf.readUInt32BE(off+8); height=buf.readUInt32BE(off+12); bitDepth=buf[off+16]; colorType=buf[off+17]; }
    else if(type==='IDAT'){ idat.push(buf.slice(off+8,off+8+len)); }
    off+=12+len;
  }
  if(bitDepth!==8) throw new Error('仅支持 8bit PNG: '+file);
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const bpp={0:1,2:3,3:1,4:2,6:4}[colorType];
  const stride=width*bpp;
  const out=Buffer.alloc(stride*height);
  let prev=Buffer.alloc(stride);
  for(let y=0;y<height;y++){
    const f=raw[y*(stride+1)]; const line=raw.slice(y*(stride+1)+1,(y+1)*(stride+1));
    const cur=Buffer.from(line);
    for(let x=0;x<stride;x++){
      const a=x>=bpp?cur[x-bpp]:0, b2=prev[x], c=x>=bpp?prev[x-bpp]:0;
      let val=cur[x];
      const pa=Math.abs(b2-c), pb=Math.abs(a-c), pc=Math.abs(a+b2-2*c);
      const pr=(pa<=pb&&pa<=pc)?a:(pb<=pc?b2:c);
      if(f===1) val+=a; else if(f===2) val+=b2; else if(f===3) val+=((a+b2)>>1); else if(f===4) val+=pr;
      cur[x]=val&255;
    }
    cur.copy(out,y*stride); prev=cur;
  }
  return {width,height,colorType,data:out};
}

/* ---------- PNG 编码 (RGBA 8bit) ---------- */
const CRC_T=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
function crc32(buf){ let c=0xFFFFFFFF; for(let i=0;i<buf.length;i++) c=CRC_T[(c^buf[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function chunk(type,data){
  const out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length,0); out.write(type,4,'ascii');
  data.copy(out,8);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type,'ascii'),data])),0);
  crc.copy(out,8+data.length);
  return out;
}
function encodePNG(w,h,rgba){
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const stride=w*4;
  const raw=Buffer.alloc((stride+1)*h);
  for(let y=0;y<h;y++){ raw[y*(stride+1)]=0; rgba.copy(raw,y*(stride+1)+1, y*stride, (y+1)*stride); }
  const idat=zlib.deflateSync(raw,{level:9});
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))
  ]);
}

/* ---------- 洪泛填充去背景 + 裁切居中 ---------- */
function preprocess(src){
  const img=decodePNG(src);
  const {width:w,height:h,colorType:ct}=img;
  const bpp={2:3,6:4}[ct];
  const rgba=Buffer.alloc(w*h*4);
  const lumA=new Uint8Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x, bi=i*bpp, oi=i*4;
    let r,g,b,a=255;
    if(ct===2){ r=img.data[bi];g=img.data[bi+1];b=img.data[bi+2]; }
    else if(ct===6){ r=img.data[bi];g=img.data[bi+1];b=img.data[bi+2];a=img.data[bi+3]; }
    rgba[oi]=r; rgba[oi+1]=g; rgba[oi+2]=b; rgba[oi+3]=a;
    lumA[i]=((r+g+b)/3)|0;
  }
  // 识别背景:统计边缘像素平均亮度,判定黑/白背景
  let sL=0, cnt=0;
  for(let x=0;x<w;x+=2){ if(rgba[x*4+3]>0){ sL+=lumA[x]; cnt++; sL+=lumA[(h-1)*w+x]; cnt++; } }
  for(let y=0;y<h;y+=2){ if(rgba[y*w*4+3]>0){ sL+=lumA[y*w]; cnt++; sL+=lumA[y*w+(w-1)]; cnt++; } }
  const avgLum=sL/cnt;
  const bgIsWhite = avgLum>=128;
  let isBg;
  if(bgIsWhite){
    // 白背景:min 通道 >= 阈值。阈值按背景亮度自适应并适度放宽,
    // 把"不纯白"的渐变浅色残边也纳入洪泛剔除(车辆内部白色因被车体包围不受影响)。
    const T=Math.max(200, Math.min(222, Math.round(avgLum-28)));
    isBg=(i)=> rgba[i*4+3]>0 && Math.min(rgba[i*4],rgba[i*4+1],rgba[i*4+2])>=T;
  } else {
    const T=Math.max(15, Math.min(45, Math.round(avgLum+20)));      // 黑背景:max通道
    isBg=(i)=> rgba[i*4+3]>0 && Math.max(rgba[i*4],rgba[i*4+1],rgba[i*4+2])<=T;
  }
  // 洪泛填充:从边缘连通区域剔除背景
  const visited=new Uint8Array(w*h), q=[];
  const push=(x,y)=>{ const i=y*w+x; if(!visited[i] && isBg(i)){ visited[i]=1; q.push(i); } };
  for(let x=0;x<w;x++){ push(x,0); push(x,h-1); }
  for(let y=0;y<h;y++){ push(0,y); push(w-1,y); }
  let qi=0;
  while(qi<q.length){
    const i=q[qi++]; const x=i%w, y=(i/w)|0;
    if(x>0) push(x-1,y); if(x<w-1) push(x+1,y);
    if(y>0) push(x,y-1); if(y<h-1) push(x,y+1);
  }
  let removed=0;
  for(let i=0;i<w*h;i++){ if(visited[i]){ rgba[i*4+3]=0; removed++; } }
  // 内容包围盒 + 质心
  let minX=w,minY=h,maxX=-1,maxY=-1,sumX=0,sumY=0,n=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x;
    if(rgba[i*4+3]===0) continue;
    if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y;
    sumX+=x; sumY+=y; n++;
  }
  if(maxX<minX || n===0){ console.error('未找到有效内容(图片可能是纯背景)'); process.exit(1); }
  const cx=sumX/n, cy=sumY/n;
  const left=cx-minX, right=maxX-cx, top=cy-minY, bottom=maxY-cy;
  const W2=Math.max(2,Math.ceil(Math.max(left,right)*2)), H2=Math.max(2,Math.ceil(Math.max(top,bottom)*2));
  const offX=Math.round(W2/2-left), offY=Math.round(H2/2-top);
  const out=Buffer.alloc(W2*H2*4);
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++){
    const si=(y*w+x)*4; if(rgba[si+3]===0) continue;
    const dx=offX+(x-minX), dy=offY+(y-minY);
    if(dx<0||dy<0||dx>=W2||dy>=H2) continue;
    const di=(dy*W2+dx)*4;
    out[di]=rgba[si]; out[di+1]=rgba[si+1]; out[di+2]=rgba[si+2]; out[di+3]=255;
  }
  // 边缘去残:多轮侵蚀,把"紧邻透明区域且接近背景色"的浅色残边逐步变透明,
  // 彻底清掉贴图轮廓外围残留的白/灰光晕(白底照片常见:背景不纯白 + 抗锯齿过渡)。
  // 只影响与透明相邻的像素,车辆内部的白色(车窗/条纹/反光)被车体包围,不会被误删。
  {
    const bgRef = bgIsWhite ? 255 : 0;
    for(let pass=0;pass<12;pass++){
      const rem=[];
      for(let y=0;y<H2;y++) for(let x=0;x<W2;x++){
        const i=y*W2+x, oi=i*4;
        if(out[oi+3]===0) continue;
        const near = (x>0&&out[(i-1)*4+3]===0)||(x<W2-1&&out[(i+1)*4+3]===0)||
                     (y>0&&out[(i-W2)*4+3]===0)||(y<H2-1&&out[(i+W2)*4+3]===0);
        if(!near) continue;
        const d=Math.abs(out[oi]-bgRef)+Math.abs(out[oi+1]-bgRef)+Math.abs(out[oi+2]-bgRef);
        if(d<=200) rem.push(i);
      }
      if(!rem.length) break;
      for(const i of rem) out[i*4+3]=0;
    }
    // 收紧包围盒:按清除残边后的内容重新裁切并对齐质心,
    // 避免贴图四周留一圈透明余白导致旋转时"晃动"或内容偏心。
    let mnX=W2,mnY=H2,mxX=-1,mxY=-1,sumX=0,sumY=0,nn=0;
    for(let y=0;y<H2;y++) for(let x=0;x<W2;x++){
      const i=y*W2+x, oi=i*4;
      if(out[oi+3]===0) continue;
      if(x<mnX)mnX=x; if(y<mnY)mnY=y; if(x>mxX)mxX=x; if(y>mxY)mxY=y;
      sumX+=x; sumY+=y; nn++;
    }
    if(nn>0){
      const nw=mxX-mnX+1, nh=mxY-mnY+1, pad=2;
      const finW=nw+pad*2, finH=nh+pad*2;
      const out2=Buffer.alloc(finW*finH*4);
      for(let y=mnY;y<=mxY;y++) for(let x=mnX;x<=mxX;x++){
        const i=(y*W2+x)*4, di=((y-mnY+pad)*finW+(x-mnX+pad))*4;
        out2[di]=out[i]; out2[di+1]=out[i+1]; out2[di+2]=out[i+2]; out2[di+3]=out[i+3];
      }
      return { w:finW, h:finH, rgba:out2, contentPx:nn, removed, bgIsWhite };
    }
  }
  return { w:W2, h:H2, rgba:out, contentPx:n, removed, bgIsWhite };
}

/* ---------- 简单盒式降采样 ---------- */
function downscale(rgba, w, h, tw, th){
  const out=Buffer.alloc(tw*th*4);
  const xs=w/tw, ys=h/th;
  for(let ty=0;ty<th;ty++){
    const y0=Math.floor(ty*ys), y1=Math.min(h, Math.ceil((ty+1)*ys));
    for(let tx=0;tx<tw;tx++){
      const x0=Math.floor(tx*xs), x1=Math.min(w, Math.ceil((tx+1)*xs));
      let r=0,g=0,b=0,a=0,n=0;
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
        const i=(y*w+x)*4;
        if(rgba[i+3]===0) continue;
        r+=rgba[i]; g+=rgba[i+1]; b+=rgba[i+2]; a+=rgba[i+3]; n++;
      }
      const oi=(ty*tw+tx)*4;
      if(n){ out[oi]=Math.round(r/n); out[oi+1]=Math.round(g/n); out[oi+2]=Math.round(b/n); out[oi+3]=Math.round(a/n); }
      else { out[oi]=0; out[oi+1]=0; out[oi+2]=0; out[oi+3]=0; }
    }
  }
  return out;
}

/* ---------- 最终边缘去白(defringe):在成品分辨率上清除残留的浅色描边 ---------- */
// 白底照片在下采样/抗锯齿后,轮廓四周常残留一圈浅色(白/灰)像素,叠到游戏里像没挖干净。
// 做法:从透明边界向内逐层清除"紧邻透明且颜色偏白"的像素(min 通道 >= tol)。
// 只影响轮廓边缘,车辆内部的白色部件(车窗/条纹/反光)被车体包围不会误删。
function defringe(rgba, w, h, tol){
  for(let pass=0;pass<8;pass++){
    const rem=[];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i=y*w+x, oi=i*4;
      if(rgba[oi+3]===0) continue;
      const near = (x>0&&rgba[(i-1)*4+3]===0)||(x<w-1&&rgba[(i+1)*4+3]===0)||
                   (y>0&&rgba[(i-w)*4+3]===0)||(y<h-1&&rgba[(i+w)*4+3]===0);
      if(!near) continue;
      if(Math.min(rgba[oi],rgba[oi+1],rgba[oi+2]) >= tol) rem.push(i);
    }
    if(!rem.length) break;
    for(const i of rem) rgba[i*4+3]=0;
  }
}
// 按内容重新收紧包围盒并居中(去掉 defringe 清出的余白)
function trimContent(rgba, w, h){
  let mnX=w,mnY=h,mxX=-1,mxY=-1,sumX=0,sumY=0,nn=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x; if(rgba[i*4+3]===0) continue;
    if(x<mnX)mnX=x; if(y<mnY)mnY=y; if(x>mxX)mxX=x; if(y>mxY)mxY=y;
    sumX+=x; sumY+=y; nn++;
  }
  if(nn===0) return null;
  const nw=mxX-mnX+1, nh=mxY-mnY+1, pad=2;
  const fw=nw+pad*2, fh=nh+pad*2;
  const out=Buffer.alloc(fw*fh*4);
  for(let y=mnY;y<=mxY;y++) for(let x=mnX;x<=mxX;x++){
    const i=(y*w+x)*4, di=((y-mnY+pad)*fw+(x-mnX+pad))*4;
    out[di]=rgba[i]; out[di+1]=rgba[i+1]; out[di+2]=rgba[i+2]; out[di+3]=rgba[i+3];
  }
  return { w:fw, h:fh, rgba:out };
}

/* ---------- 旋转(angleDeg:90=顺时针90°,180,270) ---------- */
function rotateCW(rgba, w, h){
  const out=Buffer.alloc(w*h*4);   // 新尺寸 h x w
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const si=(y*w+x)*4;
    const nx=h-1-y, ny=x;          // 顺时针90°
    const di=(ny*h+nx)*4;
    out[di]=rgba[si]; out[di+1]=rgba[si+1]; out[di+2]=rgba[si+2]; out[di+3]=rgba[si+3];
  }
  return { w:h, h:w, rgba:out };
}
function rotateImage(rgba, w, h, angle){
  if(angle===90){ return rotateCW(rgba,w,h); }
  if(angle===180){
    const r=rotateCW(rgba,w,h); return rotateCW(r.rgba,r.w,r.h);
  }
  if(angle===270){
    const r=rotateCW(rgba,w,h), r2=rotateCW(r.rgba,r.w,r.h); return rotateCW(r2.rgba,r2.w,r2.h);
  }
  return { w, h, rgba };
}

const input=process.argv[2], name=process.argv[3];
const outDir=process.argv[4] || 'img/units';
const maxDim=parseInt(process.argv[5]||'512',10);
const rotDeg=parseInt(process.argv[6]||'0',10);
if(!input || !name){
  console.error('用法: node tools/process-sprite.js <输入图.png> <输出名> [输出目录] [最大尺寸] [旋转角度90/180/270]');
  process.exit(1);
}
const result=preprocess(input);
let { w, h, rgba } = result;
if(maxDim>0 && Math.max(w,h)>maxDim){
  const k=maxDim/Math.max(w,h);
  const tw=Math.max(1,Math.round(w*k)), th=Math.max(1,Math.round(h*k));
  rgba=downscale(rgba,w,h,tw,th); w=tw; h=th;
  console.log('已等比缩放至', w+'x'+h);
}
if(rotDeg){
  const r=rotateImage(rgba,w,h,rotDeg); w=r.w; h=r.h; rgba=r.rgba;
  console.log('已顺时针旋转', rotDeg+'°');
}
// 最终边缘去白:清掉下采样/旋转后轮廓四周残留的浅色描边,并重新收紧包围盒
defringe(rgba, w, h, 175);
{
  const t=trimContent(rgba, w, h);
  if(t){ w=t.w; h=t.h; rgba=t.rgba; }
}
const outPath=path.join(__dirname, '..', outDir, name+'.png');
fs.mkdirSync(path.dirname(outPath), {recursive:true});
fs.writeFileSync(outPath, encodePNG(w, h, rgba));
console.log('已生成:', outPath, w+'x'+h, '| 背景', result.bgIsWhite?'白':'黑', '| 剔除背景像素:', result.removed, '| 保留内容像素:', result.contentPx);
console.log('接下来: 1) 在 js/config.js 的 IMAGES 添加 '+name+':\''+outDir+'/'+name+'.png\'');
