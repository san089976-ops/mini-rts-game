"use strict";
/* ============ missions.js: 任务模式(选图/出波/重指派目标/胜负) ============ */
let missionState = null;
let missionDirHandle = null;
let missionLoadSeq = 0;
let missionScriptNodes = [];

// 任务模式切换时使尚未完成的动态脚本加载失效,避免旧任务地图回调污染新模式。
function invalidateMissionLoads(clearMaps){
  missionLoadSeq++;
  for(const node of missionScriptNodes){
    if(node && node.parentNode) node.parentNode.removeChild(node);
  }
  missionScriptNodes = [];
  if(clearMaps) window.MISSION_MAPS = [];
}

// 离开任务面板 / 回到主菜单 / 进入遭遇战之前统一清掉任务残留,
// 确保下一次 buildGameSetup()/startGame() 只能读到遭遇战菜单当前选择。
function clearMissionMode(){
  invalidateMissionLoads(true);
  missionState = null;
  gameSetup = null;
}

// 没有写 waves 的任务地图使用这套默认波次:苏军 T54 -> T54B -> T55AM
const MISSION_DEFAULT_WAVES = [
  { at:10,  units:[{ type:'tank', branch:0, count:4 }] },
  { at:60,  units:[{ type:'tank', branch:1, count:5 }] },
  { at:115, units:[{ type:'tank', branch:2, count:6 }] },
];

/* ============ 面板:打开/关闭/加载/刷新 ============ */
function openMissionPanel(){
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('missionPanel').classList.remove('hidden');
  document.getElementById('missionPanel').classList.add('show');
  renderMissionPanel();
  setMissionStatus('正在加载任务地图...');
  loadMissionMaps(()=>{
    const seq = missionLoadSeq;
    autoScanMissionStored(()=>{
      if(seq !== missionLoadSeq) return;
      renderMissionPanel();
      setMissionStatus('');
    }, seq);
  });
}
function closeMissionPanel(){
  clearMissionMode();
  document.getElementById('missionPanel').classList.remove('show');
  document.getElementById('missionPanel').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}
function setMissionStatus(s){
  const el = document.getElementById('missionStatus');
  if(el) el.textContent = s;
}

function loadMissionMaps(done){
  invalidateMissionLoads(true);
  const seq = missionLoadSeq;
  window.MISSION_MAPS = [];
  const idx = window.MISSION_MAPS_INDEX || [];
  if(!idx.length){ if(done) done(); return; }
  let cursor = 0;
  const next = ()=>{
    if(seq !== missionLoadSeq) return;
    if(cursor >= idx.length){ if(done) done(); return; }
    const name = idx[cursor++];
    // 在隐藏 iframe 中执行任务文件,让过期脚本只能写入自己的 window。
    // 这样即使用户在脚本执行前切换模式,旧文件也不会污染主页面的任务列表。
    const frame = document.createElement('iframe');
    frame.hidden = true;
    missionScriptNodes.push(frame);
    const finish = (maps)=>{
      missionScriptNodes = missionScriptNodes.filter(v=>v!==frame);
      if(frame.parentNode) frame.parentNode.removeChild(frame);
      if(seq !== missionLoadSeq) return;
      if(maps && maps.length) window.MISSION_MAPS.push(...maps);
      next();
    };
    frame.onload = ()=>{
      if(seq !== missionLoadSeq){ finish([]); return; }
      const s = frame.contentDocument.createElement('script');
      s.src = new URL('任务文件夹/' + name, document.baseURI).href;
      s.onload = ()=>finish(frame.contentWindow.MISSION_MAPS || []);
      s.onerror = ()=>finish([]);
      frame.contentDocument.head.appendChild(s);
    };
    frame.src = 'about:blank';
    document.body.appendChild(frame);
  };
  next();
}
function refreshMissionMaps(){
  loadMissionMaps(()=>{
    const seq = missionLoadSeq;
    renderMissionPanel();
    if(seq === missionLoadSeq) setMissionStatus('已刷新任务地图');
  });
}

/* ============ 面板:下拉选择与任务信息 ============ */
function missionUnitName(type, branch){
  if(type === 'tank') return (T54_BRANCHES[branch] && T54_BRANCHES[branch].name) || 'T54';
  const names = {
    infantry:'步兵', t90:'T90坦克', exo:'外骨骼大兵', magnet:'磁暴步兵',
    b11:'B11步战车', t72:'T72坦克', t62:'T62坦克', harvester:'采矿车',
  };
  return names[type] || type;
}
function missionWaves(m){
  return (m && Array.isArray(m.waves)) ? m.waves : MISSION_DEFAULT_WAVES;
}
function missionWaveLabel(m){
  const waves = missionWaves(m);
  if(m && m.enemyGroups && m.enemyGroups.length && !waves.length) return m.enemyGroups.length + ' 个据点';
  return waves.length + ' 波';
}
function selectedMission(){
  const sel = document.getElementById('missionSelect');
  if(!sel || !sel.value) return null;
  return (window.MISSION_MAPS || []).find(m => m && m.id === sel.value) || null;
}
function onMissionSelect(id){ renderMissionInfo(); }

function renderMissionPanel(){
  const sel = document.getElementById('missionSelect');
  if(!sel) return;
  const list = window.MISSION_MAPS || [];
  const prev = sel.value;
  sel.innerHTML = '';
  if(!list.length){
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '任务文件夹中暂无任务地图';
    sel.appendChild(o);
  } else {
    for(const m of list){
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = (m.name || m.id || '未命名任务') + ' · ' + missionWaveLabel(m);
      sel.appendChild(o);
    }
    if(prev && list.some(m => m.id === prev)) sel.value = prev;
    else sel.value = list[0].id;
  }
  renderMissionInfo();
}
function renderMissionInfo(){
  const info = document.getElementById('missionInfo');
  if(!info) return;
  const m = selectedMission();
  if(!m){
    info.innerHTML = '<div class="mpEmpty">任务文件夹为空。请点击「扫描任务文件夹」选择本机任务目录，或把任务地图 .js 文件放进任务文件夹后点击「刷新」。</div>';
    return;
  }
  const waves = missionWaves(m);
  const fixedBattle = !!(m.enemyGroups && m.enemyGroups.length && !waves.length);
  const waveLines = fixedBattle
    ? '固定部署：' + m.enemyGroups.length + ' 个敌军据点散落在地图各处，敌军不会主动出击。'
    : waves.map((w,i)=>{
        const unitDesc = (w.units || []).map(u => (u.count || 1) + '×' + missionUnitName(u.type, u.branch)).join('、');
        return '第 ' + (i+1) + ' 波（' + w.at + ' 秒）：' + (unitDesc || '未知部队');
      }).join('<br>');
  info.innerHTML =
    '<div class="mpName">' + esc(m.name || '未命名任务') + '</div>' +
    '<div class="mpStat">初始资金：' + esc(String(m.money !== undefined ? m.money : 3000)) + '　波数：' + missionWaveLabel(m) + '　敌方：' + esc(factionName(m.enemyFaction || 'soviet')) + '</div>' +
    '<div class="mpDesc">' + esc(m.desc || '') + '</div>' +
    '<div class="mpWaves">' + waveLines + '</div>';
}

function startSelectedMission(){
  const m = selectedMission();
  if(m) startMission(m.id);
  else setMissionStatus('请先选择一张任务地图');
}
function startMission(id){
  const m = (window.MISSION_MAPS || []).find(x => x && x.id === id);
  if(!m){ setMissionStatus('找不到任务地图: ' + id); return; }
  const pSpawn = (m.spawns && m.spawns[0]) || [4,28];
  const eSpawn = (m.spawns && m.spawns[1]) || [43,7];
  gameTeams = [
    { name:'玩家', faction:m.playerFaction || 'usa',    group:0, ai:false, color:6, startMoney:(m.money !== undefined ? m.money : 3000), spawn:pSpawn },
    { name:'敌军', faction:m.enemyFaction || 'soviet',  group:1, ai:false, color:3, startMoney:0, spawn:eSpawn },
  ];
  gameSetup = { mode:'mission', map:m, teams:gameTeams };
  missionState = { nextWave:0, retargetT:1.2, fixedSpawned:false };
  document.getElementById('missionPanel').classList.remove('show');
  document.getElementById('missionPanel').classList.add('hidden');
  setupGame();
}

/* ============ 出波与战斗逻辑 ============ */
function makeMissionUnit(type, team, x, y, branch){
  const u = new Unit(type, team, x, y);
  u.order = { kind:'none' };
  if(type === 'tank' && unitFactionOf(team) === 'soviet' && branch){
    u.t54Branch = branch | 0;
    applyMissionT54Branch(u);
  }
  return u;
}
function applyMissionT54Branch(u){
  const br = t54Branch(u);
  if(!br) return;
  const base = getUnitDefs(unitFactionOf(u.team)).tank;
  u._def = Object.assign({}, base, {
    name:   br.name  || base.name,
    hp:     br.hp    || base.hp,
    damage: br.damage || base.damage,
    range:  br.range || base.range,
    speed:  br.speed || base.speed,
  });
  u.maxHp = u._def.hp;
  u.hp = u._def.hp;
  u.speed = u._def.speed;
  u.shield = br.shield || 0;
}
function loadMissionStartCargo(m){
  if(!m || !Array.isArray(m.startCargo) || !m.startCargo.length) return;
  const carrier = units.find(u => u.team === TEAM_A && u.hp > 0 && u.chopper && u.capacity > 0);
  if(!carrier) return;
  let total = 0;
  for(const s of m.startCargo){
    if(!s || !s.type) continue;
    const count = Math.max(0, s.count | 0) || 1;
    for(let i = 0; i < count; i++){
      const c = new Unit(s.type, TEAM_A, carrier.x, carrier.y);
      c.order = { kind:'none' };
      carrier.cargoUnits.push(c);
      total += transportCostIn(carrier, c);
    }
  }
  if(total > carrier.capacity) carrier.capacity = total;
}
function spawnMissionGroups(m){
  if(!m || !Array.isArray(m.enemyGroups)) return;
  const enemyTeam = gameTeams.length > 1 ? 1 : 0;
  for(const g of m.enemyGroups){
    if(!g || !Array.isArray(g.units)) continue;
    const cx = g.x * TILE + TILE / 2;
    const cy = g.y * TILE + TILE / 2;
    let idx = 0;
    for(const gu of g.units){
      if(!gu || !gu.type) continue;
      const count = Math.max(0, gu.count | 0) || 1;
      for(let i = 0; i < count; i++){
        const px = cx + ((idx % 4) - 1.5) * TILE * 0.7;
        const py = cy + Math.floor(idx / 4) * TILE * 0.75;
        idx++;
        units.push(makeMissionUnit(gu.type, enemyTeam, px, py, gu.branch));
      }
    }
  }
}
function setupMissionPlacements(m){
  if(!m || !missionState) return;
  loadMissionStartCargo(m);
  spawnMissionGroups(m);
  missionState.fixedSpawned = true;
}
function missionSoldiersAlive(team){
  const soldier = u => !!u && u.hp > 0 && (u.type === 'infantry' || u.type === 'exo' || u.type === 'magnet');
  for(const u of units){
    if(u.team !== team) continue;
    if(soldier(u)) return true;
    if(u.cargoUnits && u.cargoUnits.some(soldier)) return true;
  }
  for(const b of buildings){
    if(b.team !== team) continue;
    if(b.garrison && b.garrison.some(soldier)) return true;
  }
  return false;
}
function spawnMissionWave(m, wave, waveIdx){
  const enemyTeam = gameTeams.length > 1 ? 1 : 0;
  const sp = (m.spawns && m.spawns[1]) || [43,7];
  const sx = sp[0], sy = sp[1];
  const spawned = [];
  for(const wu of (wave.units || [])){
    const count = Math.max(0, wu.count | 0) || 1;
    for(let i = 0; i < count; i++){
      const px = sx * TILE + TILE / 2 + ((i % 4) - 1.5) * TILE * 0.7;
      const py = sy * TILE + TILE / 2 + Math.floor(i / 4) * TILE * 0.75;
      const u = makeMissionUnit(wu.type, enemyTeam, px, py, wu.branch);
      units.push(u);
      spawned.push(u);
    }
  }
  textPopup(sx * TILE, sy * TILE - 16, '第 ' + (waveIdx + 1) + ' 波 敌军来袭!', '#ff9090');
  missionAssignTarget(enemyTeam, spawned);
}
function missionAssignTarget(enemyTeam, only){
  const enemies = (only && only.length)
    ? only.filter(u => u.hp > 0)
    : units.filter(u => u.team === enemyTeam && u.hp > 0);
  if(!enemies.length) return;
  const targets = [];
  for(const b of buildings){
    if(b.alive && b.team === TEAM_A) targets.push(b);
  }
  for(const u of units){
    if(u.team === TEAM_A && u.hp > 0 && u.def && u.def.range > 0) targets.push(u);
  }
  if(!targets.length){
    const pSpawn = gameSetup.map.spawns && gameSetup.map.spawns[0];
    if(pSpawn) orderAttackMove(enemies, pSpawn[0] * TILE + TILE / 2, pSpawn[1] * TILE + TILE / 2);
    return;
  }
  for(const u of enemies){
    let best = null, bd = Infinity;
    for(const t of targets){
      const d = dist(u, t);
      if(d < bd){ bd = d; best = t; }
    }
    if(best) orderAttack([u], best, true);
  }
}
function updateMission(dt){
  const m = gameSetup && gameSetup.map;
  if(!m || !missionState) return;
  const waves = missionWaves(m);
  const enemyTeam = gameTeams.length > 1 ? 1 : 0;
  while(missionState.nextWave < waves.length && time >= waves[missionState.nextWave].at){
    spawnMissionWave(m, waves[missionState.nextWave], missionState.nextWave);
    missionState.nextWave++;
  }
  if(!m.passiveEnemy){
    missionState.retargetT -= dt;
    if(missionState.retargetT <= 0){
      missionState.retargetT = 2;
      missionAssignTarget(enemyTeam);
    }
  }
  if(m.loseOnSoldiersLost){
    if(!missionSoldiersAlive(TEAM_A)){ finishMission('lose'); return; }
  } else {
    const pAlive = buildings.some(b => b.team === TEAM_A && b.alive);
    if(!pAlive){ finishMission('lose'); return; }
  }
  const wavesDone = !waves.length || missionState.nextWave >= waves.length;
  const enemyAlive = units.some(u => u.team === enemyTeam && u.hp > 0);
  if(wavesDone && !enemyAlive) finishMission('win');
}
function finishMission(result){
  if(gameOver) return;
  gameOver = result;
  const m = gameSetup && gameSetup.map;
  const ov = document.getElementById('overlay');
  ov.classList.add('show');
  document.getElementById('ovTitle').textContent = result === 'win' ? '任务完成!' : '任务失败';
  document.getElementById('ovSub').textContent = result === 'win'
    ? ((m && m.winText) || '已消灭全部来犯之敌')
    : ((m && m.loseText) || '我方所有建筑已被摧毁');
}

/* ============ 扫描任务文件夹(File System Access,Chrome/Edge) ============ */
async function readMissionMapsFromHandle(h){
  const maps = [];
  for await (const [name, fh] of h.entries()){
    if(!name.endsWith('.js') || name === 'index.js') continue;
    try{
      const file = await fh.getFile();
      const text = await file.text();
      const prev = window.MISSION_MAPS || [];
      window.MISSION_MAPS = [];
      (0,eval)(text);
      const m = window.MISSION_MAPS && window.MISSION_MAPS[0];
      window.MISSION_MAPS = prev;
      if(m){ m._file = name; maps.push(m); }
    }catch(e){}
  }
  maps.sort((a,b) => String(a._file).localeCompare(String(b._file)));
  return maps;
}
async function writeMissionMapIndex(h, names){
  try{
    names = names.filter(n => n && n.endsWith('.js') && n !== 'index.js').sort();
    const fh = await h.getFileHandle('index.js', { create:true });
    const w = await fh.createWritable();
    await w.write('window.MISSION_MAPS_INDEX=' + JSON.stringify(names) + ';\n');
    await w.close();
  }catch(e){}
}
async function scanMissionFolder(){
  if(!('showDirectoryPicker' in window)){
    alert('当前浏览器不支持直接读取文件夹，请使用 Chrome/Edge。也可以手动把任务地图 .js 文件放入任务文件夹后点击「刷新」。');
    return;
  }
  // 扫描也是异步任务:开始新的扫描时先让旧的加载链失效,离开面板后不再回写任务列表。
  invalidateMissionLoads(true);
  const seq = missionLoadSeq;
  try{
    const h = await window.showDirectoryPicker();
    if(seq !== missionLoadSeq) return;
    missionDirHandle = h;
    const maps = await readMissionMapsFromHandle(h);
    if(seq !== missionLoadSeq) return;
    window.MISSION_MAPS = maps.length ? maps : [];
    await writeMissionMapIndex(h, maps.map(m => m._file));
    await idbSet('missionDirHandle', h);
    if(seq !== missionLoadSeq) return;
    renderMissionPanel();
    setMissionStatus('已扫描任务文件夹: ' + maps.length + ' 张任务地图');
  }catch(e){
    if(seq !== missionLoadSeq) return;
    if(e && e.name !== 'AbortError') setMissionStatus('扫描失败: ' + e.message);
  }
}
async function autoScanMissionStored(done, seq){
  const h = await idbGet('missionDirHandle');
  if(seq !== undefined && seq !== missionLoadSeq) return;
  if(!h){ if(done) done(); return; }
  missionDirHandle = h;
  try{
    if(h.queryPermission && (await h.queryPermission({ mode:'read' })) !== 'granted'){
      if(h.requestPermission){ try{ await h.requestPermission({ mode:'read' }); }catch(e){} }
    }
    const maps = await readMissionMapsFromHandle(h);
    if(seq !== undefined && seq !== missionLoadSeq) return;
    if(maps.length) window.MISSION_MAPS = maps;
  }catch(e){}
  if(seq === undefined || seq === missionLoadSeq){ if(done) done(); }
}
