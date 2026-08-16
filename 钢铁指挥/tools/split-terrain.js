"use strict";
/* ============================================================
   地形贴图切分脚本 (tools/split-terrain.js)

   把一张大图切成 cols x rows 个子块,并等比缩小到目标尺寸,
   作为随机平铺的地形地块。例如把草地照片切成 4x4=16 块,
   游戏里每个草地格随机取一块绘制,形成"碎而不重"的陆地纹理。

   用法:
     node tools/split-terrain.js <输入图.png> <输出名> [列数] [行数] [目标尺寸]
   例:
     node tools/split-terrain.js "草地.png" grass 4 4 128
   输出:
     img/terrain/grass_00.png ... grass_15.png  (每块 128x128)

   注意事项:
   - 只支持 8bit PNG (RGB/RGBA)。源图不必是整数倍分割,会按比例切分。
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

/* ---------- 切块 + 盒式降采样 ---------- */
function cropDown(src, sx0, sy0, sw, sh, tw, th){
  const {width:w, height:h, colorType:ct, data}=src;
  const bpp={2:3,6:4}[ct];
  const out=Buffer.alloc(tw*th*4);
  const xs=sw/tw, ys=sh/th;
  for(let ty=0;ty<th;ty++){
    const y0=Math.floor(sy0+ty*ys), y1=Math.min(h, Math.ceil(sy0+(ty+1)*ys));
    for(let tx=0;tx<tw;tx++){
      const x0=Math.floor(sx0+tx*xs), x1=Math.min(w, Math.ceil(sx0+(tx+1)*xs));
      let r=0,g=0,b=0,a=0,n=0;
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
        const i=(y*w+x)*bpp;
        r+=data[i]; g+=data[i+1]; b+=data[i+2];
        if(ct===6){ a+=data[i+3]; } else { a+=255; }
        n++;
      }
      const oi=(ty*tw+tx)*4;
      if(n){ out[oi]=Math.round(r/n); out[oi+1]=Math.round(g/n); out[oi+2]=Math.round(b/n); out[oi+3]=Math.round(a/n); }
      else { out[oi]=0; out[oi+1]=0; out[oi+2]=0; out[oi+3]=0; }
    }
  }
  return out;
}

const input=process.argv[2], name=process.argv[3];
const cols=parseInt(process.argv[4]||'4',10), rows=parseInt(process.argv[5]||'4',10);
const size=parseInt(process.argv[6]||'128',10);
if(!input || !name){ console.error('用法: node tools/split-terrain.js <输入图.png> <输出名> [列数] [行数] [目标尺寸]'); process.exit(1); }

const src=decodePNG(input);
const outDir=path.join(__dirname,'..','img','terrain');
fs.mkdirSync(outDir,{recursive:true});
for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
  const sx0=Math.floor(c*src.width/cols), sx1=Math.floor((c+1)*src.width/cols);
  const sy0=Math.floor(r*src.height/rows), sy1=Math.floor((r+1)*src.height/rows);
  const sw=sx1-sx0, sh=sy1-sy0;
  const tile=cropDown(src, sx0, sy0, sw, sh, size, size);
  const idx=String(r*cols+c).padStart(2,'0');
  const outPath=path.join(outDir, name+'_'+idx+'.png');
  fs.writeFileSync(outPath, encodePNG(size,size,tile));
  console.log('已生成:', outPath);
}
console.log('共 '+cols*rows+' 块,每块 '+size+'x'+size);
console.log('接下来: 在 js/config.js 添加地形块加载,并在 js/render.js 的草地格绘制里随机取块');
