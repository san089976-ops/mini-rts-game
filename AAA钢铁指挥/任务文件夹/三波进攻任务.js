"use strict";
/* ============ 任务地图:三波进攻任务 ============ */
(function(){
  const MW = 48, MH = 36;
  const terrain = [];
  for(let x = 0; x < MW; x++){
    const col = [];
    for(let y = 0; y < MH; y++) col.push('grass');
    terrain.push(col);
  }
  // 战场中间点缀林地与水面,不堵死出生点和通往玩家基地的主路
  const patches = [
    { type:'tree',  x0:12, y0:8,  x1:17, y1:13 },
    { type:'tree',  x0:26, y0:16, x1:31, y1:21 },
    { type:'water', x0:20, y0:26, x1:24, y1:30 },
    { type:'tree',  x0:33, y0:24, x1:38, y1:29 },
  ];
  for(const p of patches){
    for(let x = p.x0; x <= p.x1; x++) for(let y = p.y0; y <= p.y1; y++){
      if(x >= 0 && y >= 0 && x < MW && y < MH) terrain[x][y] = p.type;
    }
  }
  (window.MISSION_MAPS = window.MISSION_MAPS || []).push({
    id:'mission_three_waves',
    name:'三波进攻任务',
    width:MW, height:MH, custom:'edited',
    terrain,
    ores:[[10,25],[11,25],[12,25],[10,26],[11,26],[12,26],[9,33],[10,33]],
    buildings:[
      { def:'power',   team:0, tx:5,  ty:25 },
      { def:'power',   team:0, tx:7,  ty:25 },
      { def:'barracks',team:0, tx:5,  ty:28 },
      { def:'factory', team:0, tx:8,  ty:28 },
      { def:'refinery',team:0, tx:6,  ty:32 },
      { def:'turret',  team:0, tx:4,  ty:31 },
      { def:'repair',  team:0, tx:10, ty:31 },
    ],
    units:[
      { type:'infantry', team:0, x:4, y:27 },
      { type:'infantry', team:0, x:4, y:29 },
      { type:'infantry', team:0, x:5, y:30 },
      { type:'tank',     team:0, x:3, y:26 },
      { type:'tank',     team:0, x:3, y:28 },
      { type:'harvester',team:0, x:9, y:33 },
    ],
    spawns:[[4,28],[43,7]],
    money:5000,
    desc:'苏军将从东北方发动三波进攻:先是步兵与犀牛坦克试探,随后是 T54B 装甲集群,最后以 T55AM 重装部队总攻。坚守基地并消灭全部来犯之敌。',
    waves:[
      { at:10,  units:[{ type:'infantry', count:6 }, { type:'tank', branch:0, count:3 }] },
      { at:75,  units:[{ type:'tank', branch:1, count:5 }, { type:'t90', count:2 }] },
      { at:150, units:[{ type:'tank', branch:2, count:7 }] },
    ],
    playerFaction:'usa',
    enemyFaction:'soviet',
  });
})();
