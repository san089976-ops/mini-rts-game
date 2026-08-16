"use strict";
/* ============ mapdata.js: 自制地图 JSON 解析与校验 ============ */
const MAPDATA_LIMITS = {
  minSize: 4,
  maxSize: 220,
  maxBuildings: 2000,
  maxUnits: 2000,
  maxOres: 2000,
  maxSpawns: 8,
  maxNameLen: 64,
  maxIdLen: 64,
  maxDefLen: 48,
};
const KNOWN_UNIT_TYPES = new Set(['infantry','tank','harvester','mcv','airfield_car','exo','magnet','abrams','t90','destroyer','transport','bradley','b11','marder','leclerc','leopard','challenger','puma','leopard1a5','chieftain','namer','f16','su35','f15','f18','su35h','t84bm','t72','t62','t80','merkava','littlebird','abramsx','t14','drone','uh60','mi17','ford','kuznetsov']);

function mapdataInt(v){ return (typeof v === 'number' && Number.isFinite(v)) ? Math.trunc(v) : NaN; }
function mapdataText(v, maxLen){
  if(v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen);
}
function validMapFileName(name){
  return typeof name === 'string'
    && /^[^/\\]+\.json$/i.test(name)
    && name.toLowerCase() !== 'index.json'
    && !name.includes('..');
}
async function fetchMapIndex(){
  try{
    const res = await fetch('map/index.json', { cache:'no-store' });
    if(!res.ok) return [];
    const idx = await res.json();
    if(!Array.isArray(idx)) return [];
    return idx.filter(validMapFileName);
  }catch(e){ return []; }
}
function sanitizeMapData(raw){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const w = mapdataInt(raw.width), h = mapdataInt(raw.height);
  if(!(w >= MAPDATA_LIMITS.minSize && w <= MAPDATA_LIMITS.maxSize
    && h >= MAPDATA_LIMITS.minSize && h <= MAPDATA_LIMITS.maxSize)) return null;
  const id = mapdataText(raw.id, MAPDATA_LIMITS.maxIdLen) || ('map_' + w + 'x' + h);
  const name = mapdataText(raw.name, MAPDATA_LIMITS.maxNameLen) || '未命名地图';
  const out = { id, name, width:w, height:h, custom:'edited', terrain:[], ores:[], buildings:[], units:[], spawns:[] };
  const rawT = Array.isArray(raw.terrain) ? raw.terrain : [];
  for(let x=0; x<w; x++){
    const col = Array.isArray(rawT[x]) ? rawT[x] : [];
    const row = [];
    for(let y=0; y<h; y++){
      const c = col[y];
      row[y] = (c === 'tree' || c === 'water') ? c : 'grass';
    }
    out.terrain.push(row);
  }
  if(Array.isArray(raw.ores)){
    for(const o of raw.ores){
      if(out.ores.length >= MAPDATA_LIMITS.maxOres) break;
      if(!Array.isArray(o) || o.length < 2) continue;
      const ox = mapdataInt(o[0]), oy = mapdataInt(o[1]);
      if(ox >= 0 && oy >= 0 && ox < w && oy < h) out.ores.push([ox, oy]);
    }
  }
  const knownB = (typeof BLD_DEFS === 'object' && BLD_DEFS) ? BLD_DEFS : null;
  if(Array.isArray(raw.buildings)){
    for(const b of raw.buildings){
      if(out.buildings.length >= MAPDATA_LIMITS.maxBuildings) break;
      if(!b || typeof b !== 'object') continue;
      const def = mapdataText(b.def, MAPDATA_LIMITS.maxDefLen);
      if(!def || (knownB && !Object.prototype.hasOwnProperty.call(knownB, def))) continue;
      const team = mapdataInt(b.team === undefined ? -1 : b.team);
      const tx = mapdataInt(b.tx), ty = mapdataInt(b.ty);
      if(!(team >= -1 && team <= 7) || !(tx >= 0 && ty >= 0 && tx < w && ty < h)) continue;
      out.buildings.push({ def, team, tx, ty });
    }
  }
  if(Array.isArray(raw.units)){
    for(const u of raw.units){
      if(out.units.length >= MAPDATA_LIMITS.maxUnits) break;
      if(!u || typeof u !== 'object') continue;
      const type = mapdataText(u.type, MAPDATA_LIMITS.maxDefLen);
      if(!type || !KNOWN_UNIT_TYPES.has(type)) continue;
      const team = mapdataInt(u.team === undefined ? -1 : u.team);
      const x = mapdataInt(u.x), y = mapdataInt(u.y);
      if(!(team >= -1 && team <= 7) || !(x >= 0 && y >= 0 && x < w && y < h)) continue;
      out.units.push({ type, team, x, y });
    }
  }
  if(Array.isArray(raw.spawns)){
    for(const s of raw.spawns){
      if(out.spawns.length >= MAPDATA_LIMITS.maxSpawns) break;
      if(!Array.isArray(s) || s.length < 2) continue;
      const sx = mapdataInt(s[0]), sy = mapdataInt(s[1]);
      if(sx >= 0 && sy >= 0 && sx < w && sy < h) out.spawns.push([sx, sy]);
    }
  }
  return out;
}
function loadMapJSON(text){
  if(typeof text !== 'string') return null;
  let raw = null;
  try{ raw = JSON.parse(text); }catch(e){ return null; }
  return sanitizeMapData(raw);
}
