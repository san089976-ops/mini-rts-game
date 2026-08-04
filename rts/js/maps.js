"use strict";
/* ============ maps.js: 地图预设与出生点 ============ */
const MAPS = [
  { id:'classic', name:'标准战场', desc:'地形均衡,适合各种战术',
    clusters:20, waterProb:0.42, treeProb:0.5, ore:12, clearW:12, clearH:7 },
  { id:'rich',    name:'富饶之地', desc:'金矿众多,经济滚雪球',
    clusters:14, waterProb:0.28, treeProb:0.36, ore:22, clearW:12, clearH:7 },
  { id:'canyon',  name:'峡谷纵横', desc:'水域树林密集,易守难攻',
    clusters:34, waterProb:0.55, treeProb:0.6, ore:10, clearW:12, clearH:7 },
  { id:'open',    name:'开阔平原', desc:'地形平坦,适合坦克突袭',
    clusters:8,  waterProb:0.12, treeProb:0.2, ore:14, clearW:12, clearH:7 },
  { id:'naval',   name:'海上争霸', desc:'四岛环海,海军争霸(更大海图)',
    clusters:0, waterProb:0, treeProb:0, ore:0, clearW:6, clearH:5,
    width:80, height:56, custom:'naval',
    islands:[[20,15],[60,15],[20,41],[60,41]],
    spawns:{
      2:[[20,15],[60,41]],
      3:[[20,15],[60,15],[20,41]],
      4:[[20,15],[60,15],[20,41],[60,41]],
    } },
];

// 当前选中地图的出生点(海战图用岛屿出生点,其余回退到通用出生点)
function getSpawns(n){
  const m = MAPS[menuState ? menuState.mapIdx : 0];
  if(m && m.spawns && m.spawns[n]) return m.spawns[n];
  return SPAWN_POINTS[n] || SPAWN_POINTS[2];
}

// 各队伍数的出生点(格子坐标,单位为格)
const SPAWN_POINTS = {
  2: [[8,31],[54,31]],
  3: [[8,31],[54,31],[31,7]],
  4: [[8,8],[54,8],[8,40],[54,40]],
};
