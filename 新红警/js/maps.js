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
];

// 各队伍数的出生点(格子坐标,单位为格)
const SPAWN_POINTS = {
  2: [[8,31],[54,31]],
  3: [[8,31],[54,31],[31,7]],
  4: [[8,8],[54,8],[8,40],[54,40]],
};
