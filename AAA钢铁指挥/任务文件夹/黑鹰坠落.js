"use strict";
/* ============ 任务地图:黑鹰坠落 ============ */
(function(){
  const MW = 180, MH = 150;
  const terrain = [];
  for(let x = 0; x < MW; x++){
    const col = [];
    for(let y = 0; y < MH; y++) col.push('grass');
    terrain.push(col);
  }
  // 城市公园/水域点缀(不挡出生点与敌军据点)
  const patches = [
    { type:'tree',  x0:18,  y0:18,  x1:23,  y1:23 },
    { type:'tree',  x0:98,  y0:58,  x1:104, y1:64 },
    { type:'water', x0:152, y0:16,  x1:158, y1:22 },
    { type:'tree',  x0:28,  y0:88,  x1:34,  y1:94 },
    { type:'water', x0:118, y0:108, x1:124, y1:114 },
  ];
  for(const p of patches){
    for(let x = p.x0; x <= p.x1; x++) for(let y = p.y0; y <= p.y1; y++){
      if(x >= 0 && y >= 0 && x < MW && y < MH) terrain[x][y] = p.type;
    }
  }
  // 敌军五个兵力堆
  const GROUP_CENTERS = [
    { x:36,  y:34 },
    { x:62,  y:22 },
    { x:118, y:36 },
    { x:150, y:96 },
    { x:84,  y:122 },
  ];
  const PLAYER = { x:14, y:136 };
  const buildings = [];
  const used = new Set();
  const key = (tx, ty) => tx + ',' + ty;
  function freeCell(tx, ty){
    if(tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1) return false;
    if(terrain[tx] && terrain[tx][ty] !== 'grass') return false;
    if(used.has(key(tx, ty))) return false;
    if(Math.abs(tx - PLAYER.x) < 7 && Math.abs(ty - PLAYER.y) < 7) return false;
    for(const g of GROUP_CENTERS){
      if(Math.abs(tx - g.x) < 4 && Math.abs(ty - g.y) < 4) return false;
    }
    return true;
  }
  function addHouse(tx, ty){
    if(!freeCell(tx, ty)) return false;
    used.add(key(tx, ty));
    const def = ((tx + ty) % 3 === 0) ? 'house_jp1' : (((tx + ty) % 3 === 1) ? 'house_jp2' : 'house_us');
    buildings.push({ def, team:-1, tx, ty });
    return true;
  }
  // 每个敌军据点周围一圈房屋
  const ring = [[5,0],[-5,0],[0,5],[0,-5],[4,4],[-4,4],[4,-4],[-4,-4],[6,2],[-6,2],[2,6],[-2,6],[2,-6],[-2,-6]];
  for(const g of GROUP_CENTERS){
    for(const [dx, dy] of ring) addHouse(g.x + dx, g.y + dy);
  }
  // 城市街区:多片 3x3 民房
  const blocks = [
    { cx:70, cy:60 }, { cx:105, cy:20 }, { cx:160, cy:60 },
    { cx:60, cy:95 }, { cx:145, cy:125 },
  ];
  for(const b of blocks){
    for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++){
      addHouse(b.cx + dx, b.cy + dy);
    }
  }
  // 零星民房补足城市地图感
  let scatter = 0;
  for(let ty = 4; ty < MH - 4 && scatter < 36; ty += 13){
    for(let tx = 4; tx < MW - 4 && scatter < 36; tx += 17){
      const sx = ((tx * 7 + ty * 11) % 5) - 2;
      const sy = ((tx * 13 + ty * 5) % 5) - 2;
      if(addHouse(tx + sx, ty + sy)) scatter++;
    }
  }
  const groupUnits = [
    { type:'infantry', count:8 },
    { type:'tank', branch:1, count:1 },   // T54B
    { type:'tank', branch:2, count:1 },   // T55AM
  ];
  // 玩家后方小型支援基地:资金可用于补充兵力(兵营产兵 / 工厂产坦克)
  const BASE_BUILDINGS = [
    { def:'barracks', team:0, tx:6,  ty:131 },
    { def:'factory',  team:0, tx:9,  ty:131 },
    { def:'power',    team:0, tx:13, ty:131 },
    { def:'power',    team:0, tx:16, ty:131 },
  ];
  (window.MISSION_MAPS = window.MISSION_MAPS || []).push({
    id:'mission_black_hawk_down',
    name:'黑鹰坠落',
    width:MW, height:MH, custom:'edited',
    terrain,
    ores:[],
    buildings: buildings.concat(BASE_BUILDINGS),
    units:[
      { type:'uh60',  team:0, x:14, y:136 },
      { type:'abrams',team:0, x:17, y:136 },
    ],
    startCargo:[{ type:'exo', count:12 }],
    enemyGroups:GROUP_CENTERS.map(g => ({ x:g.x, y:g.y, units:groupUnits })),
    spawns:[[14,136],[36,34]],
    money:1000,
    desc:'UH-60 黑鹰载着 12 名外骨骼大兵深入城市，肃清散落于 5 个据点附近的 40 名动员兵、5 辆 T54B 与 5 辆 T55AM。敌军不会主动出击，但每处据点都有房屋掩护。',
    waves:[],
    playerFaction:'usa',
    enemyFaction:'soviet',
    passiveEnemy:true,
    loseOnSoldiersLost:true,
    winText:'已消灭全部敌军部队，任务完成!',
    loseText:'我方士兵已全部阵亡，任务失败',
  });
})();
